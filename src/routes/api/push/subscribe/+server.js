// Salva a PushSubscription do navegador logado. Chamada do próprio front
// (mesmo padrão de autenticação por sessão do chat do Jarvis — não é API
// externa, hooks.server.js já exige login pra chegar aqui).
import { json, error } from '@sveltejs/kit';
import { saveSubscription } from '$lib/server/push.js';

export async function POST({ request, locals }) {
	const body = await request.json().catch(() => null);
	const { endpoint, keys, deviceLabel } = body ?? {};
	if (!endpoint || !keys?.p256dh || !keys?.auth) {
		throw error(400, 'endpoint e keys.p256dh/keys.auth são obrigatórios');
	}

	await saveSubscription({
		userId: locals.user.id,
		endpoint,
		p256dh: keys.p256dh,
		auth: keys.auth,
		deviceLabel
	});

	return json({ subscribed: true });
}
