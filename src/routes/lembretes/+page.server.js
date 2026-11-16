import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { contactScope, isAdmin, reminderScope } from '$lib/server/access.js';
import { createReminder, setReminderStatus, deleteReminder } from '$lib/server/reminders.js';
import { fromSaoPauloInputValue } from '$lib/timezone.js';

export const load = async ({ locals }) => {
	const user = locals.user;
	const now = new Date();
	const scope = reminderScope(user);

	const [overdue, upcoming, contacts, users] = await Promise.all([
		db.reminder.findMany({
			where: { status: 'PENDENTE', remindAt: { lt: now }, ...scope },
			include: { contact: { select: { id: true, name: true } }, user: { select: { name: true } } },
			orderBy: { remindAt: 'asc' }
		}),
		db.reminder.findMany({
			where: { status: 'PENDENTE', remindAt: { gte: now }, ...scope },
			include: { contact: { select: { id: true, name: true } }, user: { select: { name: true } } },
			orderBy: { remindAt: 'asc' }
		}),
		db.contact.findMany({
			where: contactScope(user),
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		}),
		isAdmin(user)
			? db.user.findMany({
					where: { active: true },
					select: { id: true, name: true },
					orderBy: { name: 'asc' }
				})
			: []
	]);

	return { overdue, upcoming, contacts, users, isAdmin: isAdmin(user) };
};

export const actions = {
	criar: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const remindAtRaw = String(form.get('remindAt') ?? '');
		if (!title) return fail(400, { error: 'Título é obrigatório.' });
		if (!remindAtRaw) return fail(400, { error: 'Data/hora é obrigatória.' });

		// LOJA só cria lembrete para si; ADMIN escolhe (vazio = todos).
		const userId = isAdmin(locals.user)
			? String(form.get('userId') ?? '') || null
			: locals.user.id;

		await createReminder({
			title,
			description: String(form.get('description') ?? '').trim(),
			remindAt: fromSaoPauloInputValue(remindAtRaw),
			recurrence: String(form.get('recurrence') ?? 'NENHUMA'),
			userId,
			contactId: String(form.get('contactId') ?? '') || null
		});
		return { created: true };
	},

	dispensar: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'id ausente.' });
		await setReminderStatus(locals.user, id, 'DISPENSADO');
		return { dismissed: true };
	},

	excluir: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'id ausente.' });
		await deleteReminder(locals.user, id);
		return { removed: true };
	}
};
