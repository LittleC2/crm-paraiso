// Só pra validar a integração de ponta a ponta pela tela de Ajustes, sem
// precisar esperar um lembrete de verdade disparar.
import { json, error } from '@sveltejs/kit';
import { sendPushToUser } from '$lib/server/push.js';

export async function POST({ locals }) {
	try {
		await sendPushToUser(locals.user.id, {
			title: 'Athenum Hub',
			body: 'Notificação de teste: se você viu isso, tá funcionando.',
			url: '/ajustes'
		});
	} catch (err) {
		throw error(500, err.message);
	}
	return json({ sent: true });
}
