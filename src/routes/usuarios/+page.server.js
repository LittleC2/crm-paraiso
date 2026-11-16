import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { createUser, resetPassword, setActive, setRole } from '$lib/server/users.js';

export const load = async () => {
	const users = await db.user.findMany({
		select: { id: true, name: true, email: true, role: true, active: true, phone: true, mustChangePassword: true },
		orderBy: [{ active: 'desc' }, { name: 'asc' }]
	});
	return { users };
};

function respond(result) {
	return result.error ? fail(400, { error: result.error }) : { ok: true };
}

export const actions = {
	criar: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await createUser(locals.user, Object.fromEntries(form)));
	},
	senha: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await resetPassword(locals.user, String(form.get('id')), String(form.get('password') ?? '')));
	},
	ativo: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await setActive(locals.user, String(form.get('id')), form.get('active') === '1'));
	},
	papel: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await setRole(locals.user, String(form.get('id')), String(form.get('role'))));
	}
};
