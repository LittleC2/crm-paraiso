// Mutações de Reminder usadas pela tela /lembretes. Mutação por id sempre
// passa por reminderScope: LOJA só mexe nos próprios lembretes.
import { db } from './db.js';
import { reminderScope } from './access.js';

export async function createReminder({
	title,
	description,
	remindAt,
	recurrence,
	userId,
	contactId,
	relatedTaskId
}) {
	return db.reminder.create({
		data: {
			title,
			description: description || null,
			remindAt,
			recurrence: recurrence || 'NENHUMA',
			userId: userId || null,
			contactId: contactId || null,
			relatedTaskId: relatedTaskId || null
		}
	});
}

export async function setReminderStatus(user, id, status) {
	const { count } = await db.reminder.updateMany({
		where: { id, ...reminderScope(user) },
		data: { status }
	});
	return count;
}

export async function deleteReminder(user, id) {
	const { count } = await db.reminder.deleteMany({ where: { id, ...reminderScope(user) } });
	return count;
}
