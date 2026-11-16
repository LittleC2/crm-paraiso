// Sincronização de prazos com a Google Agenda, uma via (Hub -> Agenda) —
// o Hub é dono do dado, a Agenda nunca escreve de volta. Cliente fino via
// fetch puro, mesmo espírito de hub/src/lib/server/meta.js: sem
// `googleapis` (pacote enorme, todas as APIs do Google juntas) nem
// `google-auth-library` só pra um OAuth2 padrão.
import { env } from '$env/dynamic/private';
import { createHash } from 'node:crypto';
import { db } from './db.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_ID = 'primary';

export function isGoogleConfigured() {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

function requireConfig() {
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
		throw new Error(
			'Google Agenda não configurada (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI). Veja docs/setup-google-calendar.md.'
		);
	}
}

/** URL de consentimento do Google — `userId` viaja no `state` pra saber
 * quem tá conectando quando o callback voltar. */
export function getAuthUrl(state) {
	requireConfig();
	const params = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID,
		redirect_uri: env.GOOGLE_REDIRECT_URI,
		response_type: 'code',
		scope: SCOPE,
		access_type: 'offline',
		prompt: 'consent',
		state
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCodeForTokens(code) {
	requireConfig();
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			redirect_uri: env.GOOGLE_REDIRECT_URI,
			grant_type: 'authorization_code'
		})
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error_description ?? data.error ?? 'Falha na troca de código');
	return data; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(refreshToken) {
	requireConfig();
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			grant_type: 'refresh_token'
		})
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error_description ?? data.error ?? 'Falha ao renovar token');
	return data; // { access_token, expires_in, ... } — sem novo refresh_token
}

/** Devolve um access token válido, renovando via refresh_token se tiver
 * expirado (e persistindo o novo token/validade). */
async function getValidAccessToken(connection) {
	if (new Date(connection.expiresAt) > new Date(Date.now() + 60_000)) {
		return connection.accessToken;
	}
	const refreshed = await refreshAccessToken(connection.refreshToken);
	const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
	await db.googleCalendarConnection.update({
		where: { id: connection.id },
		data: { accessToken: refreshed.access_token, expiresAt }
	});
	return refreshed.access_token;
}

export async function saveConnection(userId, tokens) {
	const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
	return db.googleCalendarConnection.upsert({
		where: { userId },
		update: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt },
		create: {
			userId,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt
		}
	});
}

export async function disconnectUser(userId) {
	const connection = await db.googleCalendarConnection.findUnique({ where: { userId } });
	if (!connection) return;
	await fetch(`https://oauth2.googleapis.com/revoke?token=${connection.refreshToken}`, {
		method: 'POST'
	}).catch(() => {});
	await db.googleCalendarConnection.delete({ where: { userId } });
}

/**
 * Cria ou atualiza o evento da Agenda pro prazo dessa tarefa. No-op
 * silencioso se a tarefa não tiver responsável, prazo, ou o responsável
 * ainda não tiver conectado a Agenda — não é erro, só não sincroniza.
 */
export async function upsertEventForTask(task) {
	if (!task.assigneeId || !task.dueDate) return;

	const connection = await db.googleCalendarConnection.findUnique({
		where: { userId: task.assigneeId }
	});
	if (!connection) return;

	try {
		const accessToken = await getValidAccessToken(connection);
		const dueDate = new Date(task.dueDate);
		const event = {
			summary: task.title,
			description: task.description || undefined,
			start: { dateTime: dueDate.toISOString(), timeZone: 'America/Sao_Paulo' },
			end: {
				dateTime: new Date(dueDate.getTime() + 30 * 60_000).toISOString(),
				timeZone: 'America/Sao_Paulo'
			}
		};

		const path = task.googleEventId
			? `${CALENDAR_ID}/events/${task.googleEventId}`
			: `${CALENDAR_ID}/events`;
		const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${path}`, {
			method: task.googleEventId ? 'PATCH' : 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(event)
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);

		if (data.id !== task.googleEventId) {
			await db.task.update({ where: { id: task.id }, data: { googleEventId: data.id } });
		}
	} catch (err) {
		console.error(`[googleCalendar] falha ao sincronizar tarefa ${task.id}:`, err.message);
	}
}

/** Apaga o evento correspondente, se existir. Chamar antes de apagar a
 * tarefa do banco (precisa do googleEventId, que morre junto). */
export async function deleteEventForTask(task) {
	if (!task.googleEventId || !task.assigneeId) return;

	const connection = await db.googleCalendarConnection.findUnique({
		where: { userId: task.assigneeId }
	});
	if (!connection) return;

	try {
		const accessToken = await getValidAccessToken(connection);
		const res = await fetch(
			`https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events/${task.googleEventId}`,
			{ method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
		);
		// 410 Gone = já tinha sido apagado direto na Agenda; trata como sucesso.
		if (!res.ok && res.status !== 404 && res.status !== 410) {
			const data = await res.json().catch(() => null);
			throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
		}
	} catch (err) {
		console.error(`[googleCalendar] falha ao apagar evento da tarefa ${task.id}:`, err.message);
	}
}

// ---- eventos da agenda (reuniões, visitas, entregas, viagens) -------------
// Cada participante com Google conectado recebe o evento na própria agenda.
// O id do evento no Google é derivado do id do CRM (hex em minúsculas é um id
// válido), então não precisa guardar mapa: o mesmo id serve em todas as agendas.

const RRULE = { DIARIA: 'RRULE:FREQ=DAILY', SEMANAL: 'RRULE:FREQ=WEEKLY', MENSAL: 'RRULE:FREQ=MONTHLY' };

const googleIdFor = (eventId) => 'crm' + createHash('sha1').update(eventId).digest('hex');

function toGoogleEvent(event) {
	const tz = 'America/Sao_Paulo';
	const out = {
		summary: event.title,
		description: event.description || undefined,
		location: event.location || undefined,
		recurrence: RRULE[event.recurrence] ? [RRULE[event.recurrence]] : undefined
	};
	if (event.allDay) {
		const day = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: tz });
		const end = new Date(event.endsAt ?? event.startsAt);
		end.setUTCDate(end.getUTCDate() + 1);
		out.start = { date: day(event.startsAt) };
		out.end = { date: day(end) };
	} else {
		const start = new Date(event.startsAt);
		const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + 60 * 60_000);
		out.start = { dateTime: start.toISOString(), timeZone: tz };
		out.end = { dateTime: end.toISOString(), timeZone: tz };
	}
	return out;
}

async function googleFetch(connection, method, path, body) {
	const accessToken = await getValidAccessToken(connection);
	return fetch(`https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events${path}`, {
		method,
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
}

/** Cria ou atualiza o evento na agenda de cada participante conectado. Nunca lança. */
export async function syncEvent(eventId) {
	try {
		const event = await db.event.findUnique({ where: { id: eventId }, include: { participants: { select: { id: true } } } });
		if (!event) return;
		const userIds = event.participants.length ? event.participants.map((u) => u.id) : event.createdById ? [event.createdById] : [];
		const connections = await db.googleCalendarConnection.findMany({ where: { userId: { in: userIds } } });
		const gid = googleIdFor(event.id);
		const body = toGoogleEvent(event);
		for (const connection of connections) {
			try {
				let res = await googleFetch(connection, 'PUT', `/${gid}`, body);
				// 404: ainda não existe nessa agenda; cria já com o id escolhido.
				if (res.status === 404) res = await googleFetch(connection, 'POST', '', { ...body, id: gid });
				if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`);
			} catch (err) {
				console.error(`[googleCalendar] evento ${eventId} / usuário ${connection.userId}:`, err.message);
			}
		}
	} catch (err) {
		console.error(`[googleCalendar] evento ${eventId}:`, err.message);
	}
}

/** Remove o evento das agendas dos usuários informados. Nunca lança. */
export async function removeEvent(eventId, userIds) {
	try {
		if (!userIds.length) return;
		const connections = await db.googleCalendarConnection.findMany({ where: { userId: { in: userIds } } });
		const gid = googleIdFor(eventId);
		for (const connection of connections) {
			try {
				const res = await googleFetch(connection, 'DELETE', `/${gid}`);
				if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`HTTP ${res.status}`);
			} catch (err) {
				console.error(`[googleCalendar] remover evento ${eventId} / usuário ${connection.userId}:`, err.message);
			}
		}
	} catch (err) {
		console.error(`[googleCalendar] remover evento ${eventId}:`, err.message);
	}
}
