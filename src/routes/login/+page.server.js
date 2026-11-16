import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import {
	attemptKey,
	clearAttempts,
	createSession,
	recordFailedAttempt,
	setSessionCookie,
	tooManyAttempts,
	verifyPassword
} from '$lib/server/auth.js';

export const load = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/');
	return {};
};

export const actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { error: 'Preencha e-mail e senha.' });
		}

		const key = attemptKey(email, getClientAddress());
		if (await tooManyAttempts(key)) {
			return fail(429, { error: 'Muitas tentativas. Tente de novo em alguns minutos.' });
		}

		const user = await db.user.findUnique({ where: { email } });
		const valid = user && user.active && (await verifyPassword(password, user.passwordHash));
		if (!valid) {
			await recordFailedAttempt(key);
			return fail(400, { error: 'E-mail ou senha incorretos.' });
		}

		await clearAttempts(key);
		const { token, expiresAt } = await createSession(user.id);
		setSessionCookie(cookies, token, expiresAt);

		const next = url.searchParams.get('next');
		// Só caminho interno ("/x"); "//host" e "/\host" viram redirect aberto.
		const safe = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\');
		throw redirect(303, safe ? next : '/');
	}
};
