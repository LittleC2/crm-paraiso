import { redirect } from '@sveltejs/kit';

// A configuração dos números mudou para Ajustes.
export const load = () => {
	throw redirect(308, '/ajustes#whatsapp');
};
