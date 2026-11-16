// Link antigo (push, atalhos): a conversa agora abre na janela de WhatsApp.
import { redirect } from '@sveltejs/kit';

export const load = ({ params }) => {
	throw redirect(308, `/conversas?c=${encodeURIComponent(params.id)}`);
};
