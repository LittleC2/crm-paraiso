// Serve a mídia de uma mensagem ao navegador: confere o escopo da conversa e
// redireciona para uma URL assinada do Storage (válida por minutos). Fica fora de
// /api/whatsapp/ porque esse prefixo é público (webhook).
import { error, json, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { conversationScope } from '$lib/server/access.js';
import { signedUrl } from '$lib/server/storage.js';
import { retryMessageMedia, saveMessageMedia } from '$lib/server/whatsapp/media.js';

async function find(locals, id) {
	return db.whatsappMessage.findFirst({
		where: { id, kind: 'MIDIA', conversation: conversationScope(locals.user) },
		select: { id: true, mediaState: true, mediaPath: true, mediaMime: true }
	});
}

export async function GET({ params, locals, url }) {
	if (!locals.user) throw error(401, 'Entre para ver a mídia.');
	let message = await find(locals, params.id);
	if (!message) throw error(404, 'Mídia não encontrada.');

	if (message.mediaState !== 'SALVA') {
		const result = await saveMessageMedia(message.id);
		if (result.error) throw error(502, result.error);
		message = await find(locals, params.id);
	}
	if (!message?.mediaPath) throw error(404, 'Mídia não encontrada.');

	const link = await signedUrl(message.mediaPath, 600);
	// ?baixar=1 força o download com o nome do arquivo (parâmetro aceito pelo Supabase).
	const target = url.searchParams.get('baixar') ? `${link}${link.includes('?') ? '&' : '?'}download=` : link;
	throw redirect(302, target);
}

/** "Tentar de novo" de uma mídia que falhou. */
export async function POST({ params, locals }) {
	if (!locals.user) throw error(401, 'Entre para continuar.');
	const message = await find(locals, params.id);
	if (!message) throw error(404, 'Mídia não encontrada.');
	const result = await retryMessageMedia(message.id);
	return json(result.error ? { ok: false, error: result.error } : { ok: true });
}
