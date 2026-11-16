// Provedor de WhatsApp: uazapi (não oficial, conexão por QR). Uma instância por
// número; o token da instância vem de uma variável de ambiente (channel.tokenEnv),
// nunca do banco. Interface única para poder trocar de provedor (ex: API
// oficial da Meta) sem mexer no resto do CRM:
//   sendText(phone, text) -> { externalId }
//   sendMedia(phone, { type, fileUrl, caption, docName }) -> { externalId }
//   downloadMedia(externalId) -> { url, mime }
//   status() -> { state, phone }
//   connect() -> { state, qrcode }
//   requestHistory(phone, count)
//   disconnect()
//   configureWebhook(url)
import { env } from '$env/dynamic/private';
import { jidToPhone, mapState } from '../../whatsapp.js';

export class ProviderError extends Error {}

export function getProvider(channel) {
	const base = (env.UAZAPI_URL ?? '').replace(/\/+$/, '');
	const token = env[channel.tokenEnv];
	if (!base || !token) {
		throw new ProviderError(`Canal "${channel.name}" sem configuração: defina UAZAPI_URL e ${channel.tokenEnv}.`);
	}

	async function call(path, init = {}) {
		const res = await fetch(base + path, {
			...init,
			headers: { 'Content-Type': 'application/json', token, ...(init.headers ?? {}) },
			signal: AbortSignal.timeout(15_000)
		});
		const text = await res.text();
		let json = null;
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			/* resposta não é JSON */
		}
		// O token nunca entra na mensagem de erro.
		if (!res.ok) {
			throw new ProviderError(`uazapi ${path} ${res.status}: ${json?.error ?? json?.message ?? text.slice(0, 160)}`);
		}
		return json;
	}

	return {
		async sendText(phone, text) {
			const j = await call('/send/text', { method: 'POST', body: JSON.stringify({ number: phone, text }) });
			return { externalId: j?.messageid ?? j?.id ?? j?.key?.id ?? null };
		},
		// Mídia: type = image | video | document | audio | ptt (voz). `fileUrl` é uma URL
		// que a uazapi consegue abrir (assinada, de curta duração).
		async sendMedia(phone, { type, fileUrl, caption, docName }) {
			const body = { number: phone, type, file: fileUrl };
			if (caption) body.text = caption;
			if (docName && type === 'document') body.docName = docName;
			const j = await call('/send/media', { method: 'POST', body: JSON.stringify(body) });
			return { externalId: j?.messageid ?? j?.id ?? j?.key?.id ?? null };
		},
		// Pede à uazapi o arquivo de uma mensagem recebida (fica 2 dias no CDN dela).
		async downloadMedia(externalId) {
			const j = await call('/message/download', { method: 'POST', body: JSON.stringify({ id: externalId, return_link: true }) });
			const url = j?.fileURL ?? j?.fileUrl;
			if (!url) throw new ProviderError('uazapi /message/download sem fileURL');
			return { url: String(url), mime: j?.mimetype ? String(j.mimetype) : null };
		},
		async status() {
			const j = await call('/instance/status');
			const inst = j?.instance ?? j ?? {};
			const raw = inst.status ?? (j?.status?.connected || j?.connected ? 'connected' : 'disconnected');
			return { state: mapState(raw), phone: jidToPhone(j?.status?.jid ?? j?.jid ?? inst.owner) || null };
		},
		async connect() {
			const j = await call('/instance/connect', { method: 'POST', body: '{}' });
			return { state: j?.connected ? 'CONECTADO' : 'CONECTANDO', qrcode: j?.instance?.qrcode ?? null };
		},
		// Pede ao celular as últimas mensagens de uma conversa. Assíncrono e sem garantia:
		// o resultado chega depois pelo webhook, no evento "history".
		async requestHistory(phone, count = 50) {
			await call('/message/history-sync', { method: 'POST', body: JSON.stringify({ number: phone, count }) });
		},
		// Derruba a sessão do WhatsApp (o celular some de "Aparelhos conectados").
		async disconnect() {
			await call('/instance/disconnect', { method: 'POST', body: '{}' });
		},
		async configureWebhook(url) {
			await call('/webhook', {
				method: 'POST',
				body: JSON.stringify({ enabled: true, url, events: ['messages', 'messages_update', 'connection', 'history'] })
			});
		}
	};
}
