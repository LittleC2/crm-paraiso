import { json, error } from '@sveltejs/kit';
import { removeSubscription } from '$lib/server/push.js';

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	if (!body?.endpoint) throw error(400, 'endpoint é obrigatório');
	await removeSubscription(body.endpoint);
	return json({ unsubscribed: true });
}
