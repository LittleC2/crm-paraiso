// Números e respostas rápidas que o usuário pode usar ao iniciar uma conversa.
import { json } from '@sveltejs/kit';
import { listQuickReplies, listUsableChannels } from '$lib/server/whatsapp/conversations.js';

export const GET = async ({ locals }) => {
	const [channels, replies] = await Promise.all([listUsableChannels(locals.user), listQuickReplies(locals.user)]);
	return json({
		channels,
		replies: replies.map((r) => ({ id: r.id, area: r.area, title: r.title, body: r.body })),
		me: { name: locals.user.name }
	});
};
