import { json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db.js';
import { ingest } from '$lib/server/whatsapp/inbound.js';

function sameSecret(received, expected) {
	const a = Buffer.from(received ?? '');
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

// A uazapi chama esta URL: /api/whatsapp/webhook?canal=<id>&chave=<segredo>.
// Responde rápido; o evento é gravado antes de ser processado.
export async function POST({ request, url }) {
	const secret = env.WHATSAPP_WEBHOOK_SECRET;
	if (!secret) return json({ error: 'Webhook não configurado.' }, { status: 503 });
	if (!sameSecret(url.searchParams.get('chave'), secret)) return json({ error: 'unauthorized' }, { status: 401 });

	const channel = await db.whatsappChannel.findFirst({
		where: { id: url.searchParams.get('canal') ?? '', active: true }
	});
	if (!channel) return json({ error: 'canal desconhecido' }, { status: 404 });

	const body = await request.json().catch(() => null);

	// Segunda checagem: se o corpo traz o token da instância, tem que ser o do canal.
	const instanceToken = env[channel.tokenEnv];
	if (instanceToken && typeof body?.token === 'string' && !sameSecret(body.token, instanceToken)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	await ingest(channel, body);
	return json({ ok: true });
}
