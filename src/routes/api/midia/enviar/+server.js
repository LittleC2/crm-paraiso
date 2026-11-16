// Envio de mídia pelo CRM: recebe o arquivo (multipart), guarda no Storage e manda
// pela uazapi usando uma URL assinada. Escopo, opt-out e limite por minuto são os
// mesmos do envio de texto (sendMessage).
import { error, json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { conversationScope } from '$lib/server/access.js';
import { MAX_FILE_BYTES, mediaKey, putObject, storageConfigured } from '$lib/server/storage.js';
import { MIME_EXT, baseMime } from '$lib/server/whatsapp/media.js';
import { sendMessage } from '$lib/server/whatsapp/conversations.js';

// Tipo que a uazapi entende a partir do tipo do arquivo. Vídeo só mp4 vai como vídeo.
function whatsappType(mime, voice) {
	if (voice && mime.startsWith('audio/')) return 'ptt';
	if (mime.startsWith('image/') && mime !== 'image/gif') return 'image';
	if (mime === 'video/mp4') return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	return 'document';
}

export async function POST({ request, locals }) {
	if (!locals.user) throw error(401, 'Entre para continuar.');
	if (!storageConfigured()) return json({ ok: false, error: 'Envio de arquivos ainda não configurado.' }, { status: 503 });

	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	const conversationId = String(form?.get('conversationId') ?? '');
	if (!(file instanceof File) || !conversationId) return json({ ok: false, error: 'Escolha um arquivo.' }, { status: 400 });
	if (file.size === 0) return json({ ok: false, error: 'Arquivo vazio.' }, { status: 400 });
	if (file.size > MAX_FILE_BYTES) return json({ ok: false, error: 'O arquivo passa de 16 MB.' }, { status: 413 });

	const mime = baseMime(file.type);
	if (!MIME_EXT[mime]) return json({ ok: false, error: 'Tipo de arquivo não aceito.' }, { status: 415 });

	const conversation = await db.whatsappConversation.findFirst({
		where: { id: conversationId, ...conversationScope(locals.user) },
		select: { id: true, channelId: true }
	});
	if (!conversation) return json({ ok: false, error: 'Conversa não encontrada.' }, { status: 404 });

	const seconds = Math.min(Math.max(Math.round(Number(form.get('seconds')) || 0), 0), 3600) || null;
	const voice = form.get('voz') === '1';
	const path = mediaKey(conversation.channelId, conversation.id, `out_${crypto.randomUUID().replaceAll('-', '')}`, MIME_EXT[mime]);
	await putObject(path, Buffer.from(await file.arrayBuffer()), mime);

	const result = await sendMessage(locals.user, conversation.id, form.get('caption'), {
		path,
		type: whatsappType(mime, voice),
		mime,
		name: String(file.name ?? '').slice(0, 200) || null,
		size: file.size,
		seconds
	});
	if (result.error) return json({ ok: false, error: result.error }, { status: result.notFound ? 404 : 400 });
	return json({ ok: true });
}
