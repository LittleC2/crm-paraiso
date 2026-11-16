// Conversa de WhatsApp de um negócio, para o painel lateral do quadro.
// O escopo é o mesmo das telas: negócio por dealScope, conversa por
// conversationScope (via openConversation).
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { dealScope, conversationScope } from '$lib/server/access.js';
import { storageConfigured } from '$lib/server/storage.js';
import { listQuickReplies, openConversation } from '$lib/server/whatsapp/conversations.js';

export const GET = async ({ params, locals }) => {
	const deal = await db.deal.findFirst({
		where: { id: params.id, ...dealScope(locals.user) },
		select: { area: true, contact: { select: { id: true, name: true, phone: true } } }
	});
	if (!deal) throw error(404, 'Negócio não encontrado.');

	const found = await db.whatsappConversation.findFirst({
		where: { contactId: deal.contact.id, area: deal.area, ...conversationScope(locals.user) },
		orderBy: { lastMessageAt: 'desc' },
		select: { id: true }
	});
	if (!found) return json({ contact: deal.contact, conversation: null, replies: [] });

	const [conversation, replies] = await Promise.all([
		openConversation(locals.user, found.id),
		listQuickReplies(locals.user)
	]);
	return json({
		contact: deal.contact,
		me: { name: locals.user.name },
		mediaEnabled: storageConfigured(),
		conversation: {
			id: conversation.id,
			phone: conversation.phone,
			status: conversation.status,
			optOutAt: conversation.optOutAt,
			channel: conversation.channel,
			messages: conversation.messages.map((m) => ({
				id: m.id,
				direction: m.direction,
				kind: m.kind,
				body: m.body,
				mediaType: m.mediaType,
				mediaState: m.mediaState,
				mediaMime: m.mediaMime,
				mediaName: m.mediaName,
				mediaSize: m.mediaSize,
				mediaSeconds: m.mediaSeconds,
				status: m.status,
				sentAt: m.sentAt
			}))
		},
		replies: replies.filter((r) => r.area === deal.area).map((r) => ({ id: r.id, title: r.title, body: r.body }))
	});
};
