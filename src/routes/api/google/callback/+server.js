import { redirect, error } from '@sveltejs/kit';
import { exchangeCodeForTokens, saveConnection } from '$lib/server/googleCalendar.js';

export async function GET({ url, locals, cookies }) {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const oauthError = url.searchParams.get('error');
	const expected = cookies.get('google_oauth_state');
	cookies.delete('google_oauth_state', { path: '/api/google' });

	if (oauthError) {
		throw redirect(303, `/ajustes?googleError=${encodeURIComponent(oauthError)}`);
	}
	if (!code || !state || !expected || state !== expected) {
		throw error(400, 'Resposta do Google inválida ou sessão trocada durante o login.');
	}

	try {
		const tokens = await exchangeCodeForTokens(code);
		await saveConnection(locals.user.id, tokens);
	} catch (err) {
		throw redirect(303, `/ajustes?googleError=${encodeURIComponent(err.message)}`);
	}

	throw redirect(303, '/ajustes?googleConnected=1');
}
