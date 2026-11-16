// Números do painel do funil. Cada função devolve null quando não há dado
// (a tela mostra "sem dado", nunca um zero falso). Só equipe interna.
import { db } from './db.js';
import { businessHoursBetween } from '../qualification.js';
import { loadLists } from './funnelConfig.js';

const DAY = 24 * 60 * 60 * 1000;

function median(values) {
	if (values.length === 0) return null;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function loadStats() {
	const now = new Date();
	const since30 = new Date(now - 30 * DAY);
	const since90 = new Date(now - 90 * DAY);
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

	const [stages, recent, closedWon, closedLost, proposal] = await Promise.all([
		db.pipelineStage.findMany({
			where: { area: 'JARDIM' },
			orderBy: { order: 'asc' },
			include: { _count: { select: { deals: true } } }
		}),
		db.deal.findMany({
			where: { area: 'JARDIM', createdAt: { gte: since30 } },
			select: { source: true, createdAt: true, firstContactAt: true }
		}),
		db.deal.findMany({
			where: { area: 'JARDIM', stage: { kind: 'GANHO' }, closedAt: { gte: since90 } },
			select: { valueCents: true, closedAt: true }
		}),
		db.deal.findMany({
			where: { area: 'JARDIM', stage: { kind: 'PERDIDO' }, closedAt: { gte: since90 } },
			select: { lostReason: true }
		}),
		db.deal.aggregate({
			where: { area: 'JARDIM', stage: { key: 'proposta' } },
			_sum: { valueCents: true },
			_count: true
		})
	]);

	const bySource = {};
	for (const d of recent) bySource[d.source ?? 'Sem origem'] = (bySource[d.source ?? 'Sem origem'] ?? 0) + 1;

	const lostByReason = {};
	for (const d of closedLost) lostByReason[d.lostReason ?? 'OUTRO'] = (lostByReason[d.lostReason ?? 'OUTRO'] ?? 0) + 1;

	const answered = recent.filter((d) => d.firstContactAt);
	const hours = median(answered.map((d) => businessHoursBetween(d.createdAt, d.firstContactAt)));
	const decided = closedWon.length + closedLost.length;

	return {
		stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, count: s._count.deals })),
		leads30: recent.length,
		bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]),
		lostByReason: Object.entries(lostByReason).sort((a, b) => b[1] - a[1]),
		lostLabels: (await loadLists()).lostLabels,
		conversion90: decided ? closedWon.length / decided : null,
		decided90: decided,
		wonMonthCents: closedWon.filter((d) => d.closedAt >= monthStart).reduce((s, d) => s + (d.valueCents ?? 0), 0),
		wonMonthCount: closedWon.filter((d) => d.closedAt >= monthStart).length,
		proposalCents: proposal._count ? (proposal._sum.valueCents ?? 0) : null,
		proposalCount: proposal._count,
		firstContactHours: hours,
		firstContactSample: answered.length
	};
}
