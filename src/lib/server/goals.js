// Metas mensais da equipe. O progresso é calculado sozinho a partir do funil
// (negócios criados e o log de entradas em cada etapa); a equipe só define o alvo.
// Só admin (can 'metas'). Cada número diz "sem dado" quando não há base, nunca um zero falso.
import { db } from './db.js';
import { can } from './access.js';
import { businessHoursBetween } from '../qualification.js';
import { currentPeriod, elapsedFraction, median, normalizePeriod, paceStatus, periodBounds, shiftPeriod } from '../goalsMath.js';

export { currentPeriod, normalizePeriod, shiftPeriod };
export const AREAS = ['JARDIM', 'LOJA'];

// kind: 'count' | 'money' | 'hours'. better: 'up' (mais é melhor) ou 'down' (menos é melhor).
export const METRICS = {
	JARDIM: [
		{ metric: 'LEADS', label: 'Leads novos', kind: 'count', better: 'up', how: 'Negócios de jardim criados no mês.' },
		{ metric: 'VISITAS', label: 'Visitas agendadas', kind: 'count', better: 'up', how: 'Negócios que entraram na etapa de visita no mês.' },
		{ metric: 'PROPOSTAS', label: 'Propostas enviadas', kind: 'count', better: 'up', how: 'Negócios que entraram na etapa "Proposta enviada" no mês.' },
		{ metric: 'FECHAMENTOS', label: 'Fechamentos', kind: 'count', better: 'up', how: 'Negócios que entraram numa etapa de ganho no mês.' },
		{ metric: 'VALOR_FECHADO', label: 'Valor fechado', kind: 'money', better: 'up', how: 'Soma do valor dos negócios fechados no mês.' },
		{ metric: 'RESPOSTA_HORAS', label: 'Tempo da 1ª resposta', kind: 'hours', better: 'down', how: 'Mediana, em horas comerciais (8h às 20h), entre a criação do lead e o primeiro contato. Meta é um teto.' }
	],
	LOJA: [
		{ metric: 'PEDIDOS_NOVOS', label: 'Pedidos novos', kind: 'count', better: 'up', how: 'Pedidos da loja criados no mês.' },
		{ metric: 'PEDIDOS_ENTREGUES', label: 'Pedidos entregues', kind: 'count', better: 'up', how: 'Pedidos que entraram numa etapa de ganho (entregue) no mês.' }
	]
};

/** Valores reais do mês: { metric: { team, byUser: Map } }. */
async function computeValues(area, period) {
	const [from, to] = periodBounds(period);
	const inMonth = { gte: from, lt: to };

	const [created, logs] = await Promise.all([
		db.deal.findMany({
			where: { area, createdAt: inMonth },
			select: { assigneeId: true, createdAt: true, firstContactAt: true }
		}),
		db.dealStageLog.findMany({
			where: { area, at: inMonth },
			orderBy: { at: 'asc' },
			select: { dealId: true, toKey: true, toKind: true, deal: { select: { assigneeId: true, valueCents: true } } }
		})
	]);

	const out = {};
	const add = (metric, userId, n) => {
		const m = (out[metric] ??= { team: 0, byUser: new Map() });
		m.team += n;
		if (userId) m.byUser.set(userId, (m.byUser.get(userId) ?? 0) + n);
	};
	const leadsMetric = area === 'JARDIM' ? 'LEADS' : 'PEDIDOS_NOVOS';
	for (const d of created) add(leadsMetric, d.assigneeId, 1);
	// Cada negócio conta uma vez por marco no mês: ir e voltar de Ganho (ou arrasto errado) não infla o número.
	const counted = new Set();
	for (const l of logs) {
		const mark = `${l.dealId}:${l.toKind === 'GANHO' ? 'GANHO' : l.toKey}`;
		if (counted.has(mark)) continue;
		counted.add(mark);
		const who = l.deal.assigneeId;
		if (area === 'JARDIM') {
			if (l.toKey === 'visita') add('VISITAS', who, 1);
			if (l.toKey === 'proposta') add('PROPOSTAS', who, 1);
			if (l.toKind === 'GANHO') {
				add('FECHAMENTOS', who, 1);
				add('VALOR_FECHADO', who, l.deal.valueCents ?? 0);
			}
		} else if (l.toKind === 'GANHO') add('PEDIDOS_ENTREGUES', who, 1);
	}

	if (area === 'JARDIM') {
		const answered = created.filter((d) => d.firstContactAt);
		const all = answered.map((d) => businessHoursBetween(d.createdAt, d.firstContactAt));
		const byUser = new Map();
		for (const id of new Set(answered.map((d) => d.assigneeId).filter(Boolean))) {
			byUser.set(id, median(answered.filter((d) => d.assigneeId === id).map((d) => businessHoursBetween(d.createdAt, d.firstContactAt))));
		}
		out.RESPOSTA_HORAS = { team: median(all), byUser, sample: answered.length };
	}
	return out;
}

/** Tudo que a tela de metas precisa para uma área e um mês. */
export async function loadGoals(area, period, now = new Date()) {
	const [values, goals, users] = await Promise.all([
		computeValues(area, period),
		db.goal.findMany({ where: { area, period } }),
		db.user.findMany({
			where: { active: true, ...(area === 'JARDIM' ? { role: 'ADMIN' } : {}) },
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		})
	]);
	const target = (metric, scope) => goals.find((g) => g.metric === metric && g.scope === scope)?.target ?? null;
	const fraction = elapsedFraction(period, now);

	const cards = METRICS[area].map((def) => {
		const v = values[def.metric];
		// Tempo de resposta sem nenhum lead respondido é "sem dado"; contagens vazias são zero de verdade.
		const teamValue = def.kind === 'hours' ? (v?.team ?? null) : (v?.team ?? 0);
		// Meta de tempo é guardada em minutos (aceita 1,5 h); a tela e a conta usam horas.
		const fromDb = (t) => (t != null && def.kind === 'hours' ? t / 60 : t);
		const teamTarget = fromDb(target(def.metric, 'EQUIPE'));
		const people = users.map((u) => {
			const value = def.kind === 'hours' ? (v?.byUser.get(u.id) ?? null) : (v?.byUser.get(u.id) ?? 0);
			const t = fromDb(target(def.metric, u.id));
			return { id: u.id, name: u.name, value, target: t, status: paceStatus({ value, target: t, better: def.better }, fraction) };
		});
		return {
			...def,
			value: teamValue,
			target: teamTarget,
			status: paceStatus({ value: teamValue, target: teamTarget, better: def.better }, fraction),
			sample: v?.sample ?? null,
			people
		};
	});
	return { area, period, fraction, cards, hasAnyGoal: goals.length > 0 };
}

export async function saveGoal(user, { period, area, metric, scope, target }) {
	if (!can(user, 'metas')) return { error: 'Sem permissão.' };
	if (!AREAS.includes(area)) return { error: 'Área inválida.' };
	if (!METRICS[area].some((m) => m.metric === metric)) return { error: 'Meta inválida.' };
	const p = normalizePeriod(period);
	const sc = String(scope ?? 'EQUIPE');
	if (sc !== 'EQUIPE' && !(await db.user.findFirst({ where: { id: sc, active: true }, select: { id: true } }))) {
		return { error: 'Pessoa não encontrada.' };
	}
	const n = Math.round(Number(target));
	const key = { period_area_metric_scope: { period: p, area, metric, scope: sc } };
	// Vazio ou zero remove a meta.
	if (!Number.isFinite(n) || n <= 0) {
		await db.goal.deleteMany({ where: { period: p, area, metric, scope: sc } });
		return { ok: true };
	}
	await db.goal.upsert({
		where: key,
		create: { period: p, area, metric, scope: sc, target: n },
		update: { target: n, updatedAt: new Date() }
	});
	return { ok: true };
}

/** Copia as metas do mês anterior para o mês escolhido (sem sobrescrever o que já existe). */
export async function copyPreviousGoals(user, { period, area }) {
	if (!can(user, 'metas')) return { error: 'Sem permissão.' };
	if (!AREAS.includes(area)) return { error: 'Área inválida.' };
	const p = normalizePeriod(period);
	const previous = await db.goal.findMany({ where: { area, period: shiftPeriod(p, -1) } });
	if (!previous.length) return { error: 'O mês anterior não tem metas para copiar.' };
	await db.goal.createMany({
		data: previous.map((g) => ({ period: p, area, metric: g.metric, scope: g.scope, target: g.target })),
		skipDuplicates: true
	});
	return { ok: true, copied: previous.length };
}
