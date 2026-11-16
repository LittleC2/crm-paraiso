import { fail, redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth.js';
import { changeOwnPassword } from '$lib/server/users.js';

export const load = async ({ locals }) => ({ forced: locals.user.mustChangePassword });

export const actions = {
	default: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const next = String(form.get('next') ?? '');
		if (next !== String(form.get('confirm') ?? '')) {
			return fail(400, { error: 'A confirmação não confere com a nova senha.' });
		}
		const result = await changeOwnPassword(
			locals.user,
			cookies.get(SESSION_COOKIE),
			String(form.get('current') ?? ''),
			next
		);
		if (result.error) return fail(400, { error: result.error });
		throw redirect(303, '/');
	}
};
