// Despacha lembretes vencidos. Na Vercel não existe processo sempre ligado,
// então não há node-cron: quem chama esta função é a rota /api/cron/tick,
// acionada a cada minuto por um agendador externo (ver README). Recorrente
// nunca "termina": reagenda o próprio remindAt e continua PENDENTE; só
// NENHUMA vira ENVIADO.
import { db } from './db.js';
import { sendPushToUser, sendPushToAll } from './push.js';

function nextOccurrence(date, recurrence) {
	const next = new Date(date);
	if (recurrence === 'DIARIA') next.setDate(next.getDate() + 1);
	else if (recurrence === 'SEMANAL') next.setDate(next.getDate() + 7);
	else if (recurrence === 'MENSAL') next.setMonth(next.getMonth() + 1);
	return next;
}

/** @returns {Promise<{ due: number, failed: number }>} */
export async function dispatchDueReminders() {
	const due = await db.reminder.findMany({
		where: { status: 'PENDENTE', remindAt: { lte: new Date() } }
	});
	let failed = 0;

	for (const reminder of due) {
		try {
			const payload = {
				title: reminder.title,
				body: reminder.description ?? '',
				url: '/lembretes'
			};
			if (reminder.userId) await sendPushToUser(reminder.userId, payload);
			else await sendPushToAll(payload);

			if (reminder.recurrence === 'NENHUMA') {
				await db.reminder.update({ where: { id: reminder.id }, data: { status: 'ENVIADO' } });
			} else {
				// Pula direto para a próxima ocorrência futura: se o agendador ficou
				// parado dias, não dispara um push por dia perdido.
				let next = nextOccurrence(reminder.remindAt, reminder.recurrence);
				while (next <= new Date()) next = nextOccurrence(next, reminder.recurrence);
				await db.reminder.update({ where: { id: reminder.id }, data: { remindAt: next } });
			}
		} catch (err) {
			failed++;
			console.error(`[reminders] falha ao despachar lembrete ${reminder.id}:`, err);
		}
	}
	return { due: due.length, failed };
}
