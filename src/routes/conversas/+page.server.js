// Janela de WhatsApp: lista de conversas à esquerda, conversa aberta à direita
// (?c=<id>). Escopo de conversas e negócios vem das mesmas funções das outras telas.
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { storageConfigured } from '$lib/server/storage.js';
import { conversationScope, dealScope, isAdmin } from '$lib/server/access.js';
import {
	addNote,
	assignConversation,
	dealFromConversation,
	deleteConversation,
	listConversations,
	listQuickReplies,
	openConversation,
	sendMessage,
	setConversationStatus
} from '$lib/server/whatsapp/conversations.js';

export const load = async ({ url, locals }) => {
	const filters = {
		status: url.searchParams.get('status') ?? '',
		assignee: url.searchParams.get('responsavel') ?? '',
		channelId: url.searchParams.get('canal') ?? '',
		q: (url.searchParams.get('q') ?? '').trim()
	};
	const selectedId = url.searchParams.get('c') ?? '';
	const [conversations, channels] = await Promise.all([
		listConversations(locals.user, filters),
		db.whatsappChannel.findMany({
			where: { active: true, ...conversationScope(locals.user) },
			select: { id: true, name: true, state: true },
			orderBy: { name: 'asc' }
		})
	]);

	let selected = null;
	if (selectedId) {
		const conversation = await openConversation(locals.user, selectedId);
		if (conversation) {
			const [replies, users, deal] = await Promise.all([
				listQuickReplies(locals.user),
				db.user.findMany({
					where: { active: true, ...(conversation.area === 'LOJA' ? {} : { role: 'ADMIN' }) },
					select: { id: true, name: true },
					orderBy: { name: 'asc' }
				}),
				db.deal.findFirst({
					where: { contactId: conversation.contactId, area: conversation.area, ...dealScope(locals.user) },
					orderBy: { updatedAt: 'desc' },
					select: { id: true, title: true, valueCents: true, stage: { select: { name: true, color: true, kind: true } } }
				})
			]);
			selected = {
				conversation,
				replies: replies.filter((r) => r.area === conversation.area),
				users,
				deal
			};
		}
	}
	// openConversation já zerou o contador no banco; a lista foi lida antes.
	const opened = conversations.find((x) => x.id === selectedId);
	if (opened && selected) opened.unread = 0;
	return { conversations, channels, filters, isAdmin: isAdmin(locals.user), selected, me: { name: locals.user.name }, mediaEnabled: storageConfigured() };
};

const respond = (r, ok = { ok: true }) => (r?.error ? fail(r.notFound ? 404 : 400, { error: r.error }) : ok);
const field = (form, name) => String(form.get(name) ?? '');

export const actions = {
	apagar: async ({ request, locals }) => {
		const result = await deleteConversation(locals.user, field(await request.formData(), 'id'));
		if (result.error) return fail(result.notFound ? 404 : 400, { error: result.error });
		throw redirect(303, '/conversas');
	},
	enviar: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await sendMessage(locals.user, field(form, 'id'), form.get('text')), { sent: true });
	},
	nota: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await addNote(locals.user, field(form, 'id'), form.get('text')), { noted: true });
	},
	atribuir: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await assignConversation(locals.user, field(form, 'id'), field(form, 'assigneeId')));
	},
	status: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await setConversationStatus(locals.user, field(form, 'id'), field(form, 'status')));
	},
	// Cria (ou reaproveita) o negócio e abre direto a janela dele no pipeline.
	negocio: async ({ request, locals }) => {
		const form = await request.formData();
		const result = await dealFromConversation(locals.user, field(form, 'id'));
		if (result.error) return fail(result.notFound ? 404 : 400, { error: result.error });
		throw redirect(303, `${result.area === 'JARDIM' ? '/funil' : '/pedidos'}?abrir=${result.dealId}`);
	}
};
