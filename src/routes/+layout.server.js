import { soloMode } from '$lib/server/access.js';
import { unreadTotal } from '$lib/server/whatsapp/conversations.js';

// Só pra decidir se o layout raiz mostra a sidebar (não em /login), quais
// itens de menu e o contador de conversas não lidas. Nunca expõe o hash de
// senha: só os campos usados na UI.
export const load = async ({ locals }) => {
	const u = locals.user;
	if (!u) return { user: null, unread: 0, solo: soloMode() };
	return { user: { id: u.id, name: u.name, role: u.role }, unread: await unreadTotal(u), solo: soloMode() };
};
