import { redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { getAuthUrl, isGoogleConfigured } from '$lib/server/googleCalendar.js';

// Nunca mostra página de erro: sem configuração, volta para Ajustes com o aviso.
// O `state` é um valor aleatório guardado em cookie: só quem iniciou o fluxo neste navegador
// consegue concluí-lo (evita ligar a agenda de outra pessoa à conta de quem clicou num link).
export async function GET({ cookies, url }) {
	if (!isGoogleConfigured()) throw redirect(303, '/ajustes?googleError=nao_configurado');
	const state = randomBytes(24).toString('hex');
	cookies.set('google_oauth_state', state, { path: '/api/google', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 600 });
	throw redirect(303, getAuthUrl(state));
}
