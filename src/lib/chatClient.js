// Chamadas do navegador para envio de mídia e nova tentativa de download.
export async function sendFile(conversationId, file, { caption = '', voice = false, seconds = null } = {}) {
	const body = new FormData();
	body.set('conversationId', conversationId);
	body.set('file', file);
	if (caption) body.set('caption', caption);
	if (voice) body.set('voz', '1');
	if (seconds) body.set('seconds', String(seconds));
	try {
		const res = await fetch('/api/midia/enviar', { method: 'POST', body });
		const json = await res.json().catch(() => null);
		return json ?? { ok: false, error: 'Não foi possível enviar o arquivo.' };
	} catch (err) {
		console.error('[sendFile]', err);
		return { ok: false, error: 'Sem conexão com o servidor. Tente de novo.' };
	}
}

export async function retryMedia(messageId) {
	try {
		const res = await fetch(`/api/midia/${messageId}`, { method: 'POST' });
		return (await res.json().catch(() => null)) ?? { ok: false };
	} catch {
		return { ok: false };
	}
}
