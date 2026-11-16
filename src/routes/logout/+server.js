import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, clearSessionCookie, deleteSession } from '$lib/server/auth.js';

export const POST = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	await deleteSession(token);
	clearSessionCookie(cookies);
	throw redirect(303, '/login');
};
