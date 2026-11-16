// Supabase Storage por REST (sem SDK). Bucket privado: nada é público, o navegador
// só recebe URL assinada de curta duração. A chave service role vive só no servidor
// (variável de ambiente) e nunca vai a log, resposta ou cliente.
import { env } from '$env/dynamic/private';

export const BUCKET = 'whatsapp-media';
export const MAX_FILE_BYTES = 16 * 1024 * 1024;

export class StorageError extends Error {}

export function storageConfigured() {
	return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function api(path, init = {}) {
	if (!storageConfigured()) throw new StorageError('Armazenamento de mídia sem configuração: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
	const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/storage/v1';
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	return fetch(base + path, {
		...init,
		headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
		signal: AbortSignal.timeout(30_000)
	}).then(async (res) => {
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new StorageError(`storage ${path.split('?')[0].split('/').slice(0, 3).join('/')} ${res.status}: ${text.slice(0, 160)}`);
		}
		return res;
	});
}

/** Caminho seguro dentro do bucket: só ids do banco (cuid) e extensão da lista. */
export function mediaKey(channelId, conversationId, messageId, ext) {
	const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '');
	return `${safe(channelId)}/${safe(conversationId)}/${safe(messageId)}.${String(ext).replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'}`;
}

export async function putObject(path, bytes, mime) {
	await api(`/object/${BUCKET}/${path}`, {
		method: 'POST',
		headers: { 'Content-Type': mime || 'application/octet-stream', 'x-upsert': 'true' },
		body: bytes
	});
}

/** URL assinada (padrão 10 min) para o navegador ou a uazapi buscarem o arquivo. */
export async function signedUrl(path, seconds = 600) {
	const res = await api(`/object/sign/${BUCKET}/${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ expiresIn: seconds })
	});
	const j = await res.json();
	const rel = j.signedURL ?? j.signedUrl;
	if (!rel) throw new StorageError('storage: resposta sem URL assinada');
	return env.SUPABASE_URL.replace(/\/+$/, '') + '/storage/v1' + (rel.startsWith('/') ? rel : `/${rel}`);
}

export async function removeObject(path) {
	await api(`/object/${BUCKET}/${path}`, { method: 'DELETE' });
}

/** Cria o bucket privado se ainda não existir. Idempotente. */
export async function ensureBucket() {
	try {
		await api('/bucket', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_FILE_BYTES })
		});
		return { created: true };
	} catch (err) {
		if (/already exists|Duplicate|409/i.test(String(err?.message))) return { created: false };
		throw err;
	}
}
