import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { can, contactScope, eventScope, isAdmin, taskScope } from '$lib/server/access.js';
import { deleteContact, updateContact } from '$lib/server/contacts.js';

export const load = async ({ params, locals }) => {
	const user = locals.user;
	const contact = await db.contact.findFirst({ where: { id: params.id, ...contactScope(user) } });
	if (!contact) throw error(404, 'Contato não encontrado.');

	const [tasks, events, history] = await Promise.all([
		db.task.findMany({
			where: { AND: [taskScope(user), { contactId: contact.id }] },
			orderBy: { createdAt: 'desc' },
			take: 20
		}),
		db.event.findMany({
			where: { AND: [eventScope(user), { contactId: contact.id }] },
			orderBy: { startsAt: 'desc' },
			take: 20
		}),
		// Notas, ligações e visitas (as mensagens de WhatsApp ficam na própria conversa).
		db.interaction.findMany({
			where: { contactId: contact.id, kind: { not: 'WHATSAPP' } },
			include: { author: { select: { name: true } } },
			orderBy: { createdAt: 'desc' },
			take: 50
		})
	]);
	return { contact, tasks, events, history, isAdmin: isAdmin(user), canDelete: can(user, 'contatos:excluir') };
};

export const actions = {
	salvar: async ({ request, params, locals }) => {
		const form = await request.formData();
		const result = await updateContact(locals.user, params.id, Object.fromEntries(form));
		if (result.error) return fail(result.notFound ? 404 : 400, { error: result.error });
		return { saved: true };
	},

	excluir: async ({ params, locals }) => {
		if (!can(locals.user, 'contatos:excluir')) return fail(403, { error: 'Sem permissão.' });
		const result = await deleteContact(locals.user, params.id);
		if (result.error) return fail(400, { error: result.error });
		throw redirect(303, '/contatos');
	}
};
