// Mídia das conversas: baixa da uazapi (que só guarda 2 dias), guarda no Supabase
// Storage e serve ao navegador por URL assinada. Quem baixa: o cron (lote por
// minuto) e a própria rota de mídia quando alguém abre uma mensagem ainda pendente.
import { env } from '$env/dynamic/private';
import { db } from '../db.js';
import { MAX_FILE_BYTES, mediaKey, putObject, storageConfigured } from '../storage.js';
import { getProvider } from './provider.js';

const MAX_TRIES = 5;

// Tipos aceitos (entrada e saída) e a extensão de cada um. Fora da lista: recusa.
export const MIME_EXT = {
	'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
	'video/mp4': 'mp4', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
	'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a',
	'audio/aac': 'aac', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/amr': 'amr',
	'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv', 'application/zip': 'zip',
	'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
};

/** "audio/ogg; codecs=opus" -> "audio/ogg". */
export const baseMime = (mime) => String(mime ?? '').split(';')[0].trim().toLowerCase();

// A uazapi devolve um link; só segue https (ou o próprio host dela, em teste local).
function safeUrl(raw) {
	const url = new URL(raw);
	const own = env.UAZAPI_URL ? new URL(env.UAZAPI_URL).host : null;
	if (url.protocol !== 'https:' && url.host !== own) throw new Error('link de mídia não permitido');
	return url;
}

async function fetchBytes(rawUrl) {
	const res = await fetch(safeUrl(rawUrl), { signal: AbortSignal.timeout(30_000) });
	if (!res.ok) throw new Error(`download ${res.status}`);
	const declared = Number(res.headers.get('content-length') ?? 0);
	if (declared > MAX_FILE_BYTES) throw new Error('arquivo acima de 16 MB');
	const bytes = Buffer.from(await res.arrayBuffer());
	if (bytes.length > MAX_FILE_BYTES) throw new Error('arquivo acima de 16 MB');
	return { bytes, mime: baseMime(res.headers.get('content-type')) };
}

/** Garante que a mídia da mensagem esteja no Storage. Devolve { ok } ou { error }. */
export async function saveMessageMedia(messageId) {
	if (!storageConfigured()) return { error: 'Armazenamento de mídia não configurado.' };
	const message = await db.whatsappMessage.findUnique({
		where: { id: messageId },
		include: { conversation: { include: { channel: true } } }
	});
	if (!message || !message.mediaType || !message.externalId) return { error: 'Mensagem sem mídia.' };
	if (message.mediaState === 'SALVA' && message.mediaPath) return { ok: true };
	if (message.mediaTries >= MAX_TRIES) return { error: 'Não foi possível baixar esta mídia.' };

	try {
		const { url, mime: providerMime } = await getProvider(message.conversation.channel).downloadMedia(message.externalId);
		const file = await fetchBytes(url);
		const mime = [baseMime(providerMime), file.mime, baseMime(message.mediaMime)].find((m) => MIME_EXT[m]);
		if (!mime) throw new Error(`tipo de arquivo não aceito (${file.mime || providerMime || 'desconhecido'})`);
		const path = mediaKey(message.conversation.channelId, message.conversationId, message.id, MIME_EXT[mime]);
		await putObject(path, file.bytes, mime);
		await db.whatsappMessage.update({
			where: { id: message.id },
			data: { mediaState: 'SALVA', mediaPath: path, mediaMime: mime, mediaSize: file.bytes.length }
		});
		return { ok: true };
	} catch (err) {
		const tries = message.mediaTries + 1;
		console.error('[midia]', messageId, String(err?.message ?? err).slice(0, 200));
		await db.whatsappMessage.update({
			where: { id: message.id },
			data: { mediaTries: tries, mediaState: tries >= MAX_TRIES ? 'FALHOU' : 'PENDENTE' }
		});
		return { error: 'Não foi possível baixar esta mídia agora.' };
	}
}

/** Cron: baixa um lote de mídias pendentes (mais antigas primeiro, a uazapi expira em 2 dias). */
export async function processMediaQueue(limit = 10) {
	if (!storageConfigured()) return { skipped: 'storage não configurado' };
	const pending = await db.whatsappMessage.findMany({
		where: { mediaState: 'PENDENTE' },
		orderBy: { sentAt: 'asc' },
		take: limit,
		select: { id: true }
	});
	let saved = 0;
	for (const { id } of pending) if ((await saveMessageMedia(id)).ok) saved++;
	return { pending: pending.length, saved };
}

/** Botão "Tentar de novo": zera as tentativas e baixa na hora. */
export async function retryMessageMedia(messageId) {
	await db.whatsappMessage.update({ where: { id: messageId }, data: { mediaState: 'PENDENTE', mediaTries: 0 } });
	return saveMessageMedia(messageId);
}
