import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { allowedArea, contactScope, isAdmin, taskScope } from '$lib/server/access.js';
import { createTask, setTaskStatus, deleteTask, reorderColumn } from '$lib/server/tasks.js';
import { fromSaoPauloInputValue } from '$lib/timezone.js';

export const load = async ({ url, locals }) => {
	const user = locals.user;
	const contactFilter = url.searchParams.get('contato');
	const assigneeFilter = url.searchParams.get('responsavel');

	const [tasks, contacts, users] = await Promise.all([
		db.task.findMany({
			where: {
				AND: [
					taskScope(user),
					contactFilter ? { contactId: contactFilter } : {},
					assigneeFilter ? { assigneeId: assigneeFilter } : {}
				]
			},
			include: { contact: { select: { id: true, name: true } }, assignee: true },
			orderBy: [{ order: 'asc' }, { createdAt: 'desc' }]
		}),
		db.contact.findMany({
			where: contactScope(user),
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		}),
		// Equipe da loja só precisa enxergar pessoas para atribuir; nunca e-mail/telefone.
		db.user.findMany({
			where: { active: true },
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		})
	]);

	return { tasks, contacts, users, contactFilter, assigneeFilter, isAdmin: isAdmin(user) };
};

export const actions = {
	criar: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Título é obrigatório.' });

		const dueDateRaw = String(form.get('dueDate') ?? '');
		await createTask(locals.user, {
			title,
			description: String(form.get('description') ?? '').trim(),
			priority: String(form.get('priority') ?? 'NORMAL'),
			dueDate: dueDateRaw ? fromSaoPauloInputValue(dueDateRaw) : null,
			contactId: String(form.get('contactId') ?? '') || null,
			assigneeId: String(form.get('assigneeId') ?? '') || null,
			area: allowedArea(locals.user, String(form.get('area') ?? 'LOJA')),
			recurrence: String(form.get('recurrence') ?? 'NENHUMA')
		});
		return { created: true };
	},

	mudarStatus: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const status = String(form.get('status') ?? '');
		if (!id || !status) return fail(400, { error: 'Tarefa ou status ausente.' });
		const updated = await setTaskStatus(locals.user, id, status);
		if (!updated) return fail(404, { error: 'Tarefa não encontrada.' });
		return { statusChanged: true };
	},

	reordenar: async ({ request, locals }) => {
		const form = await request.formData();
		const status = String(form.get('status') ?? '');
		const taskIds = form.getAll('taskIds').map(String);
		if (!status || taskIds.length === 0) {
			return fail(400, { error: 'status e taskIds são obrigatórios.' });
		}
		await reorderColumn(locals.user, status, taskIds);
		return { reordered: true };
	},

	excluir: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'id ausente.' });
		const removed = await deleteTask(locals.user, id);
		if (!removed) return fail(404, { error: 'Tarefa não encontrada.' });
		return { removed: true };
	}
};
