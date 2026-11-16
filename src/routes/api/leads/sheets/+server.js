// Recebe linhas da planilha (Apps Script): POST /api/leads/sheets?i=<id da integração>
// com "Authorization: Bearer <chave>". A chave nunca vai na URL. Fica fora das rotas
// de sessão: a proteção é a chave (hash + comparação em tempo constante).
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { keyMatches, processBatch } from '$lib/server/leadIntake.js';

const MAX_BODY = 64 * 1024;

export async function POST({ request, url }) {
	const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
	const integration = await db.leadIntegration.findUnique({ where: { id: url.searchParams.get('i') ?? '' } });
	// Mesma resposta para integração inexistente e chave errada: não revela qual dos dois falhou.
	if (!integration || !bearer || !keyMatches(integration, bearer)) return json({ error: 'unauthorized' }, { status: 401 });
	if (!integration.active) return json({ error: 'Integração desligada.' }, { status: 403 });

	const text = await request.text();
	if (text.length > MAX_BODY) return json({ error: 'Corpo grande demais.' }, { status: 413 });
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		return json({ error: 'JSON inválido.' }, { status: 400 });
	}
	const rows = Array.isArray(body?.rows) ? body.rows : body?.data ? [body] : [];
	if (!rows.length) return json({ error: 'Nenhuma linha enviada.' }, { status: 400 });

	const out = await processBatch(integration, rows);
	if (out.error) return json({ error: out.error }, { status: out.status });
	return json({ ok: true, results: out.results });
}
