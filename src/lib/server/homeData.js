// Dados da tela inicial: o que precisa do João hoje (conversas esperando, leads parados,
// tarefas), a agenda dos próximos dias, as metas do mês e o funil por etapa.
// Tudo passa pelas funções de escopo; metas e funil são só da equipe interna.
import { db } from './db.js';
import { conversationScope, dealScope, eventScope, isAdmin, taskScope } from './access.js';
import { addDays, dayEnd, dayKey, dayStart, expandOccurrences } from '../agenda.js';
import { currentPeriod } from '../goalsMath.js';
import { loadGoals } from './goals.js';
import { EVENT_TYPE_LABEL } from './events.js';
import { previewText } from '../chatFormat.js';

const DAYS_AHEAD = 6;

async function loadAgenda(user, todayKey) {
	const to = addDays(todayKey, DAYS_AHEAD);
	const events = await db.event.findMany({
		where: {
			AND: [
				eventScope(user),
				{ startsAt: { lt: dayEnd(to) } },
				{ OR: [{ recurrence: { not: 'NENHUMA' } }, { startsAt: { gte: dayStart(todayKey) } }, { endsAt: { gte: dayStart(todayKey) } }] }
			]
		},
		include: { contact: { select: { id: true, name: true } } },
		orderBy: { startsAt: 'asc' }
	});
	return events
		.flatMap((e) => expandOccurrences(e, todayKey, to))
		.map((o) => ({
			id: o.id,
			title: o.title,
			type: EVENT_TYPE_LABEL[o.type] ?? 'Evento',
			allDay: o.allDay,
			location: o.location,
			contact: o.contact,
			start: o.occurrenceStart,
			day: dayKey(o.occurrenceStart)
		}))
		.sort((a, b) => a.start - b.start)
		.slice(0, 12);
}

async function loadAttention(user) {
	const staleBefore = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
	const [candidates, stale] = await Promise.all([
		db.whatsappConversation.findMany({
			where: { AND: [conversationScope(user), { status: { not: 'FECHADA' }, lastInboundAt: { not: null }, optOutAt: null }] },
			orderBy: { lastInboundAt: 'asc' },
			take: 100,
			select: {
				id: true,
				unread: true,
				lastInboundAt: true,
				lastOutboundAt: true,
				contact: { select: { name: true } },
				messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { body: true, kind: true, mediaType: true, mediaSeconds: true, direction: true } }
			}
		}),
		db.deal.findMany({
			where: { AND: [dealScope(user), { stage: { kind: 'ABERTA' }, enteredStageAt: { lt: staleBefore } }] },
			orderBy: { enteredStageAt: 'asc' },
			take: 6,
			select: { id: true, area: true, enteredStageAt: true, valueCents: true, contact: { select: { name: true } }, stage: { select: { name: true } } }
		})
	]);
	// Esperando = o cliente escreveu por último e ainda não houve resposta.
	const waiting = candidates
		.filter((c) => !c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt)
		.slice(0, 6)
		.map((c) => ({ id: c.id, name: c.contact.name, since: c.lastInboundAt, unread: c.unread, preview: previewText({ ...c.messages[0], direction: 'ENTRADA' }) }));
	const waitingTotal = candidates.filter((c) => !c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt).length;
	return { waiting, waitingTotal, stale: stale.map((d) => ({ id: d.id, name: d.contact.name, stage: d.stage.name, since: d.enteredStageAt, valueCents: d.valueCents })) };
}

async function loadPipeline(user) {
	const [stages, deals] = await Promise.all([
		db.pipelineStage.findMany({ where: { area: 'JARDIM', kind: 'ABERTA' }, orderBy: { order: 'asc' }, select: { id: true, name: true, color: true } }),
		db.deal.findMany({ where: { AND: [dealScope(user), { area: 'JARDIM', stage: { kind: 'ABERTA' } }] }, select: { stageId: true, valueCents: true } })
	]);
	const rows = stages.map((s) => {
		const mine = deals.filter((d) => d.stageId === s.id);
		return { ...s, count: mine.length, valueCents: mine.reduce((sum, d) => sum + (d.valueCents ?? 0), 0) };
	});
	return { stages: rows, total: deals.length, valueCents: deals.reduce((sum, d) => sum + (d.valueCents ?? 0), 0) };
}

export async function loadHome(user, todayBounds) {
	const todayKey = dayKey(new Date());
	const open = { status: { not: 'FEITO' } };
	const { start, end } = todayBounds;
	const admin = isAdmin(user);

	// Em blocos pequenos: tudo de uma vez abriria dezenas de consultas simultâneas no banco.
	const [overdue, today] = await Promise.all([
		db.task.findMany({
			where: { AND: [taskScope(user), open, { dueDate: { lt: start } }] },
			include: { contact: { select: { name: true } } },
			orderBy: { dueDate: 'asc' },
			take: 10
		}),
		db.task.findMany({
			where: { AND: [taskScope(user), open, { dueDate: { gte: start, lt: end } }] },
			include: { contact: { select: { name: true } } },
			orderBy: { dueDate: 'asc' },
			take: 20
		})
	]);
	const agenda = await loadAgenda(user, todayKey);
	const attention = admin ? await loadAttention(user) : { waiting: [], waitingTotal: 0, stale: [] };
	const pipeline = admin ? await loadPipeline(user) : null;
	const goals = admin ? await loadGoals('JARDIM', currentPeriod()) : null;
	return {
		todayKey,
		overdue,
		today,
		agenda,
		attention,
		pipeline,
		goals: goals ? { period: goals.period, fraction: goals.fraction, hasAnyGoal: goals.hasAnyGoal, cards: goals.cards.filter((c) => c.target != null).slice(0, 5) } : null
	};
}
