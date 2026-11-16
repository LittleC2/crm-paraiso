import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { contactScope, eventScope, isAdmin } from '$lib/server/access.js';
import { deleteEvent, updateEvent } from '$lib/server/events.js';

export const load = async ({ params, locals }) => {
	const user = locals.user;
	const event = await db.event.findFirst({
		where: { id: params.id, ...eventScope(user) },
		include: { participants: { select: { id: true, name: true } } }
	});
	if (!event) throw error(404, 'Evento não encontrado.');
	const [users, contacts] = await Promise.all([
		db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
		db.contact.findMany({ where: contactScope(user), select: { id: true, name: true }, orderBy: { name: 'asc' } })
	]);
	return { event, users, contacts, isAdmin: isAdmin(user) };
};

export const actions = {
	salvar: async ({ request, params, locals }) => {
		const form = await request.formData();
		const input = Object.fromEntries(form);
		input.participantIds = form.getAll('participantIds');
		const result = await updateEvent(locals.user, params.id, input);
		if (result.error) return fail(result.notFound ? 404 : 400, { error: result.error });
		return { saved: true };
	},

	excluir: async ({ params, locals }) => {
		await deleteEvent(locals.user, params.id);
		throw redirect(303, '/agenda');
	}
};
