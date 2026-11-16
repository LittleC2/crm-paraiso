// Controle de acesso por papel. TODA query de contatos, tarefas, eventos e
// lembretes deve passar por uma função daqui: a UI esconde menus, mas a
// proteção real é esta (um filtro esquecido vaza dado da área JARDIM para a
// equipe da loja). Funções puras, sem banco, para poderem ser testadas.

// Modo solo: CRM só do João (jardim). Ligado por padrão; SOLO_MODE=false devolve
// o comportamento de duas equipes (interna e loja). Os dados da loja ficam no
// banco, só deixam de aparecer. Lido a cada chamada para poder ser testado.
export function soloMode() {
	return globalThis.process?.env?.SOLO_MODE !== 'false';
}

const SOLO_AREA = { area: 'JARDIM' };

/** Equipe interna (João, Eduardo). */
export function isAdmin(user) {
	return user?.role === 'ADMIN';
}

/** Filtro Prisma de contatos visíveis. LOJA só vê a área LOJA. */
export function contactScope(user) {
	if (!user) return { id: '__nenhum__' };
	if (isAdmin(user)) return soloMode() ? SOLO_AREA : {};
	return { area: 'LOJA' };
}

/** Tarefas: LOJA vê a área LOJA e o que for atribuído a ela. */
export function taskScope(user) {
	if (!user) return { id: '__nenhum__' };
	if (isAdmin(user)) return soloMode() ? SOLO_AREA : {};
	return { OR: [{ area: 'LOJA' }, { assigneeId: user.id }] };
}

/** Eventos: LOJA vê a área LOJA e eventos em que participa. */
export function eventScope(user) {
	if (!user) return { id: '__nenhum__' };
	if (isAdmin(user)) return soloMode() ? SOLO_AREA : {};
	return { OR: [{ area: 'LOJA' }, { participants: { some: { id: user.id } } }] };
}

/** Negócios: LOJA só vê o quadro de pedidos da loja. */
export function dealScope(user) {
	if (!user) return { id: '__nenhum__' };
	if (isAdmin(user)) return soloMode() ? SOLO_AREA : {};
	return { area: 'LOJA' };
}

/** Conversas de WhatsApp: LOJA só vê as dos números da loja. */
export function conversationScope(user) {
	if (!user) return { id: '__nenhum__' };
	if (isAdmin(user)) return soloMode() ? SOLO_AREA : {};
	return { area: 'LOJA' };
}

/** Interações herdam o escopo do contato. */
export function interactionScope(user) {
	return { contact: contactScope(user) };
}

/** Lembretes: ADMIN vê todos, LOJA só os próprios. */
export function reminderScope(user) {
	if (!user) return { id: '__nenhum__' };
	return isAdmin(user) ? {} : { userId: user.id };
}

/** Área que um usuário pode atribuir ao criar um registro. */
export function allowedArea(user, requested) {
	if (!isAdmin(user)) return 'LOJA';
	if (soloMode()) return 'JARDIM';
	return requested === 'JARDIM' ? 'JARDIM' : 'LOJA';
}

// Ações por papel. Funil, usuários e configurações são só da equipe interna.
const ADMIN_ONLY = new Set([
	'funil',
	'usuarios',
	'ajustes:sistema',
	'contatos:exportar',
	'contatos:excluir',
	'canais',
	'integracoes',
	'metas'
]);

// Telas que somem no modo solo (loja e gestão de usuários).
const SOLO_HIDDEN = new Set(['pedidos', 'usuarios']);

export function can(user, action) {
	if (!user || user.active === false) return false;
	if (soloMode() && SOLO_HIDDEN.has(action)) return false;
	if (isAdmin(user)) return true;
	return !ADMIN_ONLY.has(action);
}
