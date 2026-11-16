import { error, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, getSessionUser } from '$lib/server/auth.js';
import { can, soloMode } from '$lib/server/access.js';

// Rotas que não exigem sessão. "/api/cron/" tem autenticação própria (segredo
// em header); "/api/whatsapp/" (Fase 3) validará o segredo do webhook.
const PUBLIC_PATHS = ['/login', '/api/cron/', '/api/whatsapp/', '/api/leads/', '/manifest.webmanifest'];

// Áreas só da equipe interna. A UI esconde o menu, mas o bloqueio real é aqui
// (e nas queries, via access.js).
const ADMIN_PATHS = [
	['/usuarios', 'usuarios'],
	['/funil', 'funil'],
	['/conversas/canais', 'canais'],
	['/metas', 'metas']
];

// Com senha temporária, só a tela de troca (e sair) fica liberada.
const ALLOWED_WHEN_PASSWORD_PENDING = ['/senha', '/logout'];

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const path = event.url.pathname;
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? await getSessionUser(token) : null;

	const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
	if (!isPublic && !event.locals.user) {
		throw redirect(303, `/login?next=${encodeURIComponent(path)}`);
	}

	const user = event.locals.user;
	if (user?.mustChangePassword && !ALLOWED_WHEN_PASSWORD_PENDING.some((p) => path.startsWith(p))) {
		throw redirect(303, '/senha');
	}

	// Modo solo: loja e usuários não existem (404), o código fica para reativar.
	if (soloMode() && /^\/(pedidos|usuarios)(\/|$)/.test(path)) throw error(404, 'Não encontrado.');

	for (const [prefix, action] of ADMIN_PATHS) {
		if ((path === prefix || path.startsWith(`${prefix}/`)) && !can(user, action)) {
			throw error(403, 'Sem permissão.');
		}
	}

	return resolve(event);
}
