// Push para a equipe certa de uma conversa. Falha de push nunca derruba o
// processamento da mensagem.
import { db } from '../db.js';
import { sendPushToUser } from '../push.js';

export async function notifyConversation(conversation, payload) {
	try {
		let ids = [];
		if (conversation.assigneeId) ids = [conversation.assigneeId];
		else {
			const roles = conversation.area === 'LOJA' ? ['ADMIN', 'LOJA'] : ['ADMIN'];
			const users = await db.user.findMany({ where: { active: true, role: { in: roles } }, select: { id: true } });
			ids = users.map((u) => u.id);
		}
		const results = await Promise.allSettled(ids.map((id) => sendPushToUser(id, payload)));
		for (const r of results) if (r.status === 'rejected') console.error('[whatsapp] push recusado:', r.reason?.message ?? r.reason);
	} catch (err) {
		console.error('[whatsapp] falha ao notificar:', err?.message ?? err);
	}
}
