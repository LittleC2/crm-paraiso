// Inicia uma conversa de WhatsApp pelo CRM (ver startConversation).
// 200 { ok, conversationId } | 200 { needsConfirm, contactName } | 400/404 { error }
import { error, json } from '@sveltejs/kit';
import { startConversation } from '$lib/server/whatsapp/conversations.js';

export const POST = async ({ request, locals, url }) => {
	// Só do próprio CRM: formulário de outro site não passa.
	if (request.headers.get('origin') !== url.origin) throw error(403, 'Origem inválida.');
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Pedido inválido.' }, { status: 400 });
	}
	if (!body || typeof body !== 'object') return json({ error: 'Pedido inválido.' }, { status: 400 });
	const result = await startConversation(locals.user, {
		contactId: body.contactId || null,
		phone: body.phone,
		name: body.name,
		channelId: body.channelId,
		text: body.text,
		confirmNoOptIn: body.confirmNoOptIn === true
	});
	if (result.needsConfirm) return json(result);
	if (result.error) return json({ error: result.error }, { status: result.notFound ? 404 : 400 });
	return json(result);
};
