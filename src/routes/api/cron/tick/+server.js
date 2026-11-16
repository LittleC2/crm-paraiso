import { json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { dispatchDueReminders } from '$lib/server/reminderScheduler.js';
import { dispatchEventAlerts } from '$lib/server/events.js';
import { maintainInbox } from '$lib/server/whatsapp/inbound.js';
import { dispatchWaitingAlerts } from '$lib/server/whatsapp/conversations.js';
import { processHistoryQueue } from '$lib/server/whatsapp/history.js';
import { processMediaQueue } from '$lib/server/whatsapp/media.js';

// Chamada a cada minuto por um agendador externo (Supabase pg_cron + pg_net,
// ou Vercel Cron em plano que permita). Protegida por CRON_SECRET no header
// "Authorization: Bearer <segredo>" (formato que a Vercel Cron já envia).
function authorized(request) {
	const secret = env.CRON_SECRET;
	if (!secret) return false;
	const header = request.headers.get('authorization') ?? '';
	const expected = Buffer.from(`Bearer ${secret}`);
	const received = Buffer.from(header);
	return expected.length === received.length && timingSafeEqual(expected, received);
}

async function run({ request }) {
	if (!authorized(request)) return json({ error: 'unauthorized' }, { status: 401 });
	// Um job com erro não derruba os outros: cada um devolve o seu resultado ou { error }.
	const job = async (name, fn) => {
		try {
			return await fn();
		} catch (err) {
			console.error(`[cron] ${name}:`, err?.message ?? err);
			return { error: String(err?.message ?? err).slice(0, 120) };
		}
	};
	const reminders = await job('lembretes', dispatchDueReminders);
	const events = await job('eventos', dispatchEventAlerts);
	const whatsapp = {
		inbox: await job('caixa de entrada', maintainInbox),
		waiting: await job('alerta de espera', () => dispatchWaitingAlerts(env.WHATSAPP_WAIT_ALERT_HOURS)),
		history: await job('histórico', processHistoryQueue),
		media: await job('mídia', processMediaQueue)
	};
	return json({ ok: true, reminders, events, whatsapp });
}

export const GET = run;
export const POST = run;
