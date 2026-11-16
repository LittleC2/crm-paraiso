// Agenda: eventos de toda a equipe. Toda mutação por id passa por eventScope.
import { db } from './db.js';
import { allowedArea, eventScope } from './access.js';
import { fromSaoPauloInputValue } from '../timezone.js';
import { sendPushToUser } from './push.js';
import { removeEvent, syncEvent } from './googleCalendar.js';

export const EVENT_TYPES = ['ENTREGA', 'REUNIAO', 'EVENTO', 'VIAGEM', 'VISITA', 'WORKSHOP', 'OUTRO'];
export const EVENT_TYPE_LABEL = {
	ENTREGA: 'Entrega',
	REUNIAO: 'Reunião',
	EVENTO: 'Evento',
	VIAGEM: 'Viagem',
	VISITA: 'Visita',
	WORKSHOP: 'Workshop',
	OUTRO: 'Outro'
};
const RECURRENCES = ['NENHUMA', 'DIARIA', 'SEMANAL', 'MENSAL'];
const ALERT_WINDOW_MS = 30 * 60 * 1000;

/** Valida a entrada do formulário. Devolve { data, participantIds } ou { error }. */
export function sanitizeEventInput(user, input) {
	const title = String(input.title ?? '').trim().slice(0, 140);
	if (!title) return { error: 'Título é obrigatório.' };
	const startRaw = String(input.startsAt ?? '');
	if (!startRaw) return { error: 'Início é obrigatório.' };

	const allDay = input.allDay === 'on' || input.allDay === true;
	// Dia inteiro: guarda 00:00 do dia (Brasília); o campo pode vir só com a data.
	const startsAt = fromSaoPauloInputValue(allDay ? `${startRaw.slice(0, 10)}T00:00` : startRaw);
	if (Number.isNaN(startsAt.getTime())) return { error: 'Início inválido.' };

	let endsAt = null;
	const endRaw = String(input.endsAt ?? '');
	if (endRaw) {
		endsAt = fromSaoPauloInputValue(allDay ? `${endRaw.slice(0, 10)}T00:00` : endRaw);
		if (Number.isNaN(endsAt.getTime())) return { error: 'Fim inválido.' };
		if (endsAt < startsAt) return { error: 'O fim não pode ser antes do início.' };
	}

	return {
		data: {
			title,
			description: String(input.description ?? '').trim().slice(0, 2000) || null,
			type: EVENT_TYPES.includes(input.type) ? input.type : 'OUTRO',
			area: allowedArea(user, input.area),
			startsAt,
			endsAt,
			allDay,
			location: String(input.location ?? '').trim().slice(0, 140) || null,
			recurrence: RECURRENCES.includes(input.recurrence) ? input.recurrence : 'NENHUMA',
			contactId: String(input.contactId ?? '') || null
		},
		participantIds: [...new Set((input.participantIds ?? []).map(String))]
	};
}

async function activeUserIds(ids) {
	if (ids.length === 0) return [];
	const users = await db.user.findMany({
		where: { id: { in: ids }, active: true },
		select: { id: true }
	});
	return users.map((u) => u.id);
}

export async function createEvent(user, input) {
	const parsed = sanitizeEventInput(user, input);
	if (parsed.error) return parsed;
	const ids = await activeUserIds(parsed.participantIds);
	const event = await db.event.create({
		data: {
			...parsed.data,
			createdById: user.id,
			participants: { connect: ids.map((id) => ({ id })) }
		}
	});
	await syncEvent(event.id);
	return { event };
}

export async function updateEvent(user, id, input) {
	const existing = await db.event.findFirst({
		where: { id, ...eventScope(user) },
		include: { participants: { select: { id: true } } }
	});
	if (!existing) return { error: 'Evento não encontrado.', notFound: true };
	const parsed = sanitizeEventInput(user, {
		...input,
		area: user.role === 'ADMIN' ? input.area : existing.area
	});
	if (parsed.error) return parsed;
	const ids = await activeUserIds(parsed.participantIds);
	const event = await db.event.update({
		where: { id },
		data: {
			...parsed.data,
			// Mudou o horário: o aviso por push vale de novo.
			notifiedAt: existing.startsAt.getTime() === parsed.data.startsAt.getTime() ? undefined : null,
			participants: { set: ids.map((uid) => ({ id: uid })) }
		}
	});
	// Quem saiu da lista de participantes perde o evento na própria agenda.
	await removeEvent(id, existing.participants.map((p) => p.id).filter((pid) => !ids.includes(pid)));
	await syncEvent(event.id);
	return { event };
}

export async function deleteEvent(user, id) {
	const existing = await db.event.findFirst({
		where: { id, ...eventScope(user) },
		select: { createdById: true, participants: { select: { id: true } } }
	});
	const { count } = await db.event.deleteMany({ where: { id, ...eventScope(user) } });
	if (count && existing) {
		const who = existing.participants.map((p) => p.id);
		await removeEvent(id, who.length ? who : existing.createdById ? [existing.createdById] : []);
	}
	return count;
}

/**
 * Push para quem participa de eventos que começam nos próximos 30 minutos
 * (só sem repetição, uma vez por evento). Sem participantes: equipe interna
 * e, para evento da loja, a equipe da loja. Chamada pela rota /api/cron/tick.
 */
export async function dispatchEventAlerts() {
	const now = new Date();
	const due = await db.event.findMany({
		where: {
			recurrence: 'NENHUMA',
			allDay: false,
			notifiedAt: null,
			startsAt: { gte: now, lte: new Date(now.getTime() + ALERT_WINDOW_MS) }
		},
		include: { participants: { where: { active: true }, select: { id: true } } }
	});
	let failed = 0;

	for (const event of due) {
		try {
			let userIds = event.participants.map((p) => p.id);
			if (userIds.length === 0) {
				const roles = event.area === 'LOJA' ? ['ADMIN', 'LOJA'] : ['ADMIN'];
				const users = await db.user.findMany({
					where: { active: true, role: { in: roles } },
					select: { id: true }
				});
				userIds = users.map((u) => u.id);
			}
			const time = event.startsAt.toLocaleTimeString('pt-BR', {
				timeZone: 'America/Sao_Paulo',
				hour: '2-digit',
				minute: '2-digit'
			});
			for (const userId of userIds) {
				await sendPushToUser(userId, {
					title: event.title,
					body: `Hoje às ${time}${event.location ? ` · ${event.location}` : ''}`,
					url: '/agenda'
				});
			}
			await db.event.update({ where: { id: event.id }, data: { notifiedAt: new Date() } });
		} catch (err) {
			failed++;
			console.error(`[events] falha ao avisar evento ${event.id}:`, err);
		}
	}
	return { due: due.length, failed };
}
