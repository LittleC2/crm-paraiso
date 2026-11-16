// Caixa de entrada: listar, abrir, responder, anotar, atribuir. Toda leitura
// e escrita por id passa por conversationScope (equipe da loja só vê as
// conversas dos números da loja).
import { db } from '../db.js';
import { allowedArea, can, contactScope, conversationScope, isAdmin } from '../access.js';
import { createContact } from '../contacts.js';
import { normalizePhone } from '../../phone.js';
import { createDeal } from '../deals.js';
import { signedUrl } from '../storage.js';
import { getProvider } from './provider.js';
import { notifyConversation } from './notify.js';

const SEND_LIMIT_PER_MINUTE = 20;
const MAX_TEXT = 4000;

export async function listConversations(user, { status, assignee, channelId, q } = {}) {
	const filters = [conversationScope(user)];
	if (['ABERTA', 'PENDENTE', 'FECHADA'].includes(status)) filters.push({ status });
	else filters.push({ status: { not: 'FECHADA' } });
	if (assignee === 'mim') filters.push({ assigneeId: user.id });
	if (assignee === 'sem') filters.push({ assigneeId: null });
	if (channelId) filters.push({ channelId });
	if (q) {
		const digits = q.replace(/\D/g, '');
		filters.push({
			OR: [
				{ contact: { name: { contains: q, mode: 'insensitive' } } },
				...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])
			]
		});
	}
	return db.whatsappConversation.findMany({
		where: { AND: filters },
		include: {
			contact: { select: { id: true, name: true } },
			channel: { select: { id: true, name: true } },
			assignee: { select: { id: true, name: true } },
			messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { body: true, mediaType: true, mediaSeconds: true, direction: true, kind: true, status: true } }
		},
		orderBy: { lastMessageAt: 'desc' },
		take: 100
	});
}

export async function unreadTotal(user) {
	const r = await db.whatsappConversation.aggregate({
		where: { AND: [conversationScope(user), { status: { not: 'FECHADA' } }] },
		_sum: { unread: true }
	});
	return r._sum.unread ?? 0;
}

/** Abre a conversa (e zera o contador de não lidas). */
export async function openConversation(user, id) {
	const conversation = await db.whatsappConversation.findFirst({
		where: { id, ...conversationScope(user) },
		include: {
			contact: true,
			channel: { select: { id: true, name: true, state: true, area: true } },
			assignee: { select: { id: true, name: true } },
			// O detalhe técnico do provedor (nomes de variáveis, resposta crua) é só para o admin.
			// as 300 mais recentes (a ordem cronológica é refeita abaixo)
			messages: { orderBy: { sentAt: 'desc' }, take: 300, omit: { error: !isAdmin(user), mediaPath: true, mediaTries: true } }
		}
	});
	if (!conversation) return null;
	conversation.messages.reverse();
	if (conversation.unread > 0) {
		await db.whatsappConversation.update({ where: { id }, data: { unread: 0 } });
	}
	return conversation;
}

async function scoped(user, id) {
	return db.whatsappConversation.findFirst({ where: { id, ...conversationScope(user) }, include: { contact: true, channel: true } });
}

/**
 * Envia texto ou mídia. `media` (opcional) = arquivo já guardado no Storage:
 * { path, type: image|video|audio|ptt|document, mime, name, size, seconds }; o texto vira legenda.
 */
export async function sendMessage(user, id, rawText, media = null) {
	const text = String(rawText ?? '').trim().slice(0, media ? 1000 : MAX_TEXT);
	if (!text && !media) return { error: 'Escreva a mensagem.' };
	const conversation = await scoped(user, id);
	if (!conversation) return { error: 'Conversa não encontrada.', notFound: true };
	if (conversation.optOutAt) return { error: 'Este contato pediu para não receber mensagens. Envio bloqueado.' };
	if (!conversation.channel.active) return { error: 'Este número está desativado.' };

	const recent = await db.whatsappMessage.count({
		where: { authorId: user.id, direction: 'SAIDA', kind: { in: ['TEXTO', 'MIDIA'] }, sentAt: { gte: new Date(Date.now() - 60_000) } }
	});
	if (recent >= SEND_LIMIT_PER_MINUTE) return { error: 'Muitas mensagens em pouco tempo. Aguarde um minuto.' };

	// Grava antes de enviar: se a rede cair, a mensagem aparece como falha, não some.
	const message = await db.whatsappMessage.create({
		data: {
			conversationId: id,
			direction: 'SAIDA',
			kind: media ? 'MIDIA' : 'TEXTO',
			body: text || null,
			status: 'ENVIANDO',
			authorId: user.id,
			...(media
				? { mediaType: media.type, mediaPath: media.path, mediaMime: media.mime, mediaName: media.name, mediaSize: media.size, mediaSeconds: media.seconds ?? null, mediaState: 'SALVA' }
				: {})
		}
	});
	try {
		const provider = getProvider(conversation.channel);
		let sent;
		if (!media) sent = await provider.sendText(conversation.phone, text);
		else {
			const fileUrl = await signedUrl(media.path, 3600);
			const args = { type: media.type, fileUrl, caption: text, docName: media.name };
			try {
				sent = await provider.sendMedia(conversation.phone, args);
			} catch (err) {
				// Voz gravada no navegador pode vir num formato que a uazapi só aceita como áudio comum.
				if (media.type !== 'ptt') throw err;
				sent = await provider.sendMedia(conversation.phone, { ...args, type: 'audio' });
			}
		}
		await db.whatsappMessage.update({ where: { id: message.id }, data: { status: 'ENVIADA', externalId: sent.externalId } });
	} catch (err) {
		await db.whatsappMessage.update({ where: { id: message.id }, data: { status: 'FALHOU', error: String(err?.message ?? err).slice(0, 300) } });
		return { error: 'Não foi possível enviar. A mensagem ficou marcada como falha.' };
	}

	const now = new Date();
	await db.whatsappConversation.update({
		where: { id },
		data: { lastOutboundAt: now, lastMessageAt: now, status: 'PENDENTE', waitingAlertedAt: null, assigneeId: conversation.assigneeId ?? user.id, unread: 0 }
	});
	const deal = await db.deal.findFirst({
		where: { contactId: conversation.contactId, area: conversation.area, stage: { kind: 'ABERTA' } },
		orderBy: { createdAt: 'desc' },
		select: { id: true, firstContactAt: true }
	});
	await db.interaction.create({
		data: { contactId: conversation.contactId, dealId: deal?.id ?? null, authorId: user.id, kind: 'WHATSAPP', body: `Enviada: ${text ? text.slice(0, 500) : '[mídia]'}` }
	});
	if (deal && !deal.firstContactAt) await db.deal.update({ where: { id: deal.id }, data: { firstContactAt: now } });
	return { ok: true };
}

/** Números que o usuário pode usar para iniciar conversa (ativos, dentro do escopo). */
export function listUsableChannels(user) {
	return db.whatsappChannel.findMany({
		where: { active: true, ...conversationScope(user) },
		select: { id: true, name: true, area: true, state: true },
		orderBy: { name: 'asc' }
	});
}

/**
 * Inicia uma conversa pelo CRM: contato existente (`contactId`) ou telefone novo
 * (`phone` + `name`). Contato sem autorização de WhatsApp só recebe depois de
 * `confirmNoOptIn` (o cliente falou com a equipe antes); a confirmação fica
 * registrada como nota interna. Quem pediu "PARAR" nunca recebe. O envio em si
 * é o `sendMessage` (limite por minuto, provedor, falha registrada).
 */
export async function startConversation(user, { contactId, phone, name, channelId, text, confirmNoOptIn }) {
	const body = String(text ?? '').trim().slice(0, MAX_TEXT);
	if (!body) return { error: 'Escreva a mensagem.' };

	const channel = await db.whatsappChannel.findFirst({
		where: { id: String(channelId ?? ''), active: true, ...conversationScope(user) }
	});
	if (!channel) return { error: 'Escolha um número válido para enviar.' };
	if (channel.state !== 'CONECTADO') return { error: `O número ${channel.name} não está conectado.` };

	let contact;
	if (contactId) {
		contact = await db.contact.findFirst({ where: { id: String(contactId), ...contactScope(user) } });
		if (!contact) return { error: 'Contato não encontrado.', notFound: true };
		if (!contact.phone) return { error: 'Este contato não tem telefone.' };
		if (contact.area !== channel.area) return { error: 'Este contato é de outra área. Use um número da mesma área.' };
	} else {
		const normalized = normalizePhone(phone);
		if (!normalized) return { error: 'Telefone inválido. Use DDD e número, ex: (21) 99999-9999.' };
		// Telefone é único no CRM: se já existe em outra área, avisa em vez de duplicar.
		contact = await db.contact.findFirst({ where: { AND: [contactScope(user), { phone: normalized }] } });
		if (contact && contact.area !== channel.area) return { error: 'Este telefone já é de um contato de outra área. Use um número da mesma área.' };
		if (!contact) {
			if (!String(name ?? '').trim()) return { error: 'Informe o nome do contato.' };
			const created = await createContact(user, { name, phone: normalized, area: channel.area, source: 'WhatsApp' });
			if (created.error) return created;
			contact = created.contact;
		}
	}

	// PARAR vale para o contato em qualquer número, não só na conversa em que foi dito.
	if (await db.whatsappConversation.findFirst({ where: { contactId: contact.id, optOutAt: { not: null } }, select: { id: true } })) {
		return { error: 'Este contato pediu para não receber mensagens. Envio bloqueado.' };
	}
	if (!contact.optInWhatsapp && !confirmNoOptIn) return { needsConfirm: true, contactName: contact.name };

	const conversation = await db.whatsappConversation.upsert({
		where: { channelId_phone: { channelId: channel.id, phone: contact.phone } },
		create: { channelId: channel.id, contactId: contact.id, phone: contact.phone, area: channel.area },
		update: {}
	});
	if (conversation.optOutAt) return { error: 'Este contato pediu para não receber mensagens. Envio bloqueado.' };

	if (!contact.optInWhatsapp) {
		await db.whatsappMessage.create({
			data: {
				conversationId: conversation.id,
				direction: 'SAIDA',
				kind: 'NOTA',
				body: `Conversa iniciada pelo CRM sem autorização prévia de WhatsApp. ${user.name} confirmou que o cliente já falou com a equipe.`,
				status: 'ENVIADA',
				authorId: user.id
			}
		});
	}
	const sent = await sendMessage(user, conversation.id, body);
	if (sent.error) return sent;
	return { ok: true, conversationId: conversation.id };
}

/** Anotação interna: aparece na conversa, nunca é enviada ao cliente. */
export async function addNote(user, id, rawText) {
	const text = String(rawText ?? '').trim().slice(0, 2000);
	if (!text) return { error: 'Escreva a anotação.' };
	const conversation = await scoped(user, id);
	if (!conversation) return { error: 'Conversa não encontrada.', notFound: true };
	// A nota fica na conversa E no perfil do cliente (histórico do contato e do lead aberto).
	const deal = await db.deal.findFirst({
		where: { contactId: conversation.contactId, area: conversation.area, stage: { kind: 'ABERTA' } },
		orderBy: { createdAt: 'desc' },
		select: { id: true }
	});
	await db.$transaction([
		db.whatsappMessage.create({
			data: { conversationId: id, direction: 'SAIDA', kind: 'NOTA', body: text, status: 'ENVIADA', authorId: user.id }
		}),
		db.interaction.create({
			data: { contactId: conversation.contactId, dealId: deal?.id ?? null, authorId: user.id, kind: 'NOTA', body: text }
		})
	]);
	return { ok: true };
}

export async function assignConversation(user, id, assigneeId) {
	const conversation = await scoped(user, id);
	if (!conversation) return { error: 'Conversa não encontrada.', notFound: true };
	const target = assigneeId === 'me' ? user.id : String(assigneeId ?? '') || null;
	if (target) {
		const person = await db.user.findFirst({ where: { id: target, active: true }, select: { id: true, role: true } });
		if (!person) return { error: 'Pessoa não encontrada.' };
		// Não atribui conversa da loja... a quem não enxerga: equipe da loja só recebe conversas da loja.
		if (person.role === 'LOJA' && conversation.area !== 'LOJA') return { error: 'Essa pessoa não tem acesso a esta conversa.' };
	}
	await db.whatsappConversation.update({ where: { id }, data: { assigneeId: target } });
	if (target && target !== user.id) {
		await notifyConversation({ ...conversation, assigneeId: target }, { title: 'Conversa atribuída a você', body: conversation.contact.name, url: `/conversas/${id}` });
	}
	return { ok: true };
}

export async function setConversationStatus(user, id, status) {
	if (!['ABERTA', 'PENDENTE', 'FECHADA'].includes(status)) return { error: 'Status inválido.' };
	const { count } = await db.whatsappConversation.updateMany({ where: { id, ...conversationScope(user) }, data: { status } });
	return count ? { ok: true } : { error: 'Conversa não encontrada.', notFound: true };
}

/** Cria negócio a partir da conversa (pedido na loja, lead no jardim). Reaproveita o aberto, se houver. */
export async function dealFromConversation(user, id) {
	const conversation = await scoped(user, id);
	if (!conversation) return { error: 'Conversa não encontrada.', notFound: true };
	const existing = await db.deal.findFirst({
		where: { contactId: conversation.contactId, area: conversation.area, stage: { kind: 'ABERTA' } },
		select: { id: true }
	});
	if (existing) return { dealId: existing.id, existing: true, area: conversation.area };
	const created = await createDeal(user, conversation.area, { contactId: conversation.contactId, source: 'WhatsApp' });
	if (created.error) return created;
	return { dealId: created.deal.id, area: conversation.area };
}

// ---- respostas rápidas -------------------------------------------------------

export function listQuickReplies(user) {
	return db.quickReply.findMany({ where: conversationScope(user), orderBy: { title: 'asc' } });
}

export async function saveQuickReply(user, { area, title, body }) {
	if (!can(user, 'canais')) return { error: 'Sem permissão.' };
	const t = String(title ?? '').trim().slice(0, 60);
	const b = String(body ?? '').trim().slice(0, 1000);
	if (!t || !b) return { error: 'Título e texto são obrigatórios.' };
	await db.quickReply.create({ data: { area: allowedArea(user, area), title: t, body: b } });
	return { ok: true };
}

export async function deleteQuickReply(user, id) {
	if (!can(user, 'canais')) return { error: 'Sem permissão.' };
	await db.quickReply.deleteMany({ where: { id } });
	return { ok: true };
}

// ---- alerta de conversa sem resposta (desligado por padrão) ------------------

/** Só age se WHATSAPP_WAIT_ALERT_HOURS estiver definida. Um aviso por mensagem recebida. */
export async function dispatchWaitingAlerts(hoursRaw) {
	const hours = Number(hoursRaw);
	if (!hours || hours <= 0) return { off: true };
	const before = new Date(Date.now() - hours * 3600_000);
	const waiting = await db.whatsappConversation.findMany({
		where: { status: { not: 'FECHADA' }, lastInboundAt: { lt: before }, waitingAlertedAt: null },
		include: { contact: { select: { name: true } } },
		take: 50
	});
	let alerted = 0;
	for (const c of waiting) {
		// respondida depois da última mensagem do cliente: não está esperando
		if (c.lastOutboundAt && c.lastOutboundAt >= c.lastInboundAt) continue;
		await notifyConversation(c, { title: 'Cliente esperando resposta', body: `${c.contact.name} escreveu há mais de ${hours} h.`, url: `/conversas/${c.id}` });
		await db.whatsappConversation.update({ where: { id: c.id }, data: { waitingAlertedAt: new Date() } });
		alerted++;
	}
	return { alerted };
}
