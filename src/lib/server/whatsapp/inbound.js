// Entrada do WhatsApp: grava o evento cru (caixa de entrada durável) e depois
// processa. Se o processamento falhar, o cron reprocessa. Duplicatas são
// ignoradas por externalId.
import { db } from '../db.js';
import { formatPhone } from '../../phone.js';
import { isOptOut, nextStatus, parseWebhook } from '../../whatsapp.js';
import { notifyConversation } from './notify.js';

const MAX_ATTEMPTS = 3;
const PURGE_AFTER_DAYS = 7;

const DOWNLOADABLE = new Set(['image', 'video', 'audio', 'ptt', 'document', 'sticker']);
const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

/** Campos de mídia da linha: tipo, detalhes e se ainda dá para baixar (a uazapi guarda 2 dias). */
function mediaFields(message) {
	if (!message.mediaType) return {};
	const fresh = Date.now() - message.at.getTime() < TWO_DAYS;
	return {
		mediaType: message.mediaType,
		mediaMime: message.media?.mime ?? null,
		mediaName: message.media?.name ?? null,
		mediaSize: message.media?.size ?? null,
		mediaSeconds: message.media?.seconds ?? null,
		mediaState: DOWNLOADABLE.has(message.mediaType) && fresh ? 'PENDENTE' : 'NENHUMA'
	};
}

/** Contato da mesma área do número (nunca vaza contato de outra área). */
async function findOrCreateContact(channel, message) {
	const existing = await db.contact.findFirst({ where: { phone: message.phone, area: channel.area } });
	if (existing) return existing;
	return db.contact.create({
		data: {
			name: (!message.fromMe && message.name) || formatPhone(message.phone),
			phone: message.phone,
			area: channel.area,
			type: channel.area === 'JARDIM' ? 'CLIENTE_JARDIM' : 'CLIENTE_LOJA',
			source: 'WhatsApp',
			// Quem escreve primeiro autoriza a resposta; mensagem nossa a um desconhecido não.
			optInWhatsapp: !message.fromMe
		}
	});
}

async function handleMessage(channel, message) {
	if (message.isGroup || message.sentByApi) return { ignored: true };
	if (!/^\d{8,15}$/.test(message.phone)) return { ignored: true };
	if (await db.whatsappMessage.findUnique({ where: { externalId: message.externalId }, select: { id: true } })) {
		return { duplicate: true };
	}

	const inbound = !message.fromMe;
	const contact = await findOrCreateContact(channel, message);
	const conversation = await db.whatsappConversation.upsert({
		where: { channelId_phone: { channelId: channel.id, phone: message.phone } },
		create: { channelId: channel.id, contactId: contact.id, phone: message.phone, area: channel.area, lastMessageAt: message.at },
		update: {}
	});

	const optOut = inbound && isOptOut(message.text);
	const firstUnread = inbound && conversation.unread === 0;
	// Mensagem e estado da conversa numa transação só: se algo falhar, nada fica pela metade
	// (senão a nova tentativa veria "duplicada" e nunca atualizaria não lidas nem opt-out).
	try {
		await db.$transaction([
			db.whatsappMessage.create({
				data: {
					conversationId: conversation.id,
					direction: inbound ? 'ENTRADA' : 'SAIDA',
					kind: message.mediaType ? 'MIDIA' : 'TEXTO',
					body: message.text ? message.text.slice(0, 4000) : null,
					...mediaFields(message),
					externalId: message.externalId,
					status: inbound ? 'RECEBIDA' : 'ENVIADA',
					sentAt: message.at
				}
			}),
			db.whatsappConversation.update({
				where: { id: conversation.id },
				data: inbound
					? {
							unread: { increment: 1 },
							lastInboundAt: message.at,
							lastMessageAt: message.at > conversation.lastMessageAt ? message.at : undefined,
							// cliente respondeu: volta a precisar de atenção
							status: 'ABERTA',
							waitingAlertedAt: null,
							...(optOut ? { optOutAt: new Date() } : {})
						}
					: { lastOutboundAt: message.at, lastMessageAt: message.at > conversation.lastMessageAt ? message.at : undefined, status: 'PENDENTE' }
			})
		]);
	} catch (err) {
		if (err?.code === 'P2002') return { duplicate: true }; // corrida entre duas entregas do mesmo evento
		throw err;
	}
	if (optOut) {
		await db.contact.update({ where: { id: contact.id }, data: { optInWhatsapp: false } });
		await db.whatsappMessage.create({
			data: { conversationId: conversation.id, direction: 'ENTRADA', kind: 'NOTA', body: 'O contato pediu para não receber mais mensagens. Envio bloqueado.', status: 'RECEBIDA' }
		});
	}

	// Histórico do contato e vínculo com o negócio aberto (se houver).
	const deal = await db.deal.findFirst({
		where: { contactId: contact.id, area: channel.area, stage: { kind: 'ABERTA' } },
		orderBy: { createdAt: 'desc' },
		select: { id: true, firstContactAt: true }
	});
	await db.interaction.create({
		data: {
			contactId: contact.id,
			dealId: deal?.id ?? null,
			kind: 'WHATSAPP',
			body: `${inbound ? 'Recebida' : 'Enviada'}: ${message.text ? message.text.slice(0, 500) : '[mídia]'}`
		}
	});
	if (!inbound && deal && !deal.firstContactAt) {
		await db.deal.update({ where: { id: deal.id }, data: { firstContactAt: new Date() } });
	}

	if (firstUnread) {
		await notifyConversation(conversation, {
			title: contact.name,
			body: message.text ? message.text.slice(0, 120) : 'Enviou uma mídia',
			url: `/conversas/${conversation.id}`
		});
	}
	return { stored: true };
}

/**
 * Mensagem antiga (histórico). Só entra para contato que já existe na mesma área do
 * número: nunca cria contato. Não mexe em não lidas, não notifica, não trata
 * opt-out e não cria Interaction. Conversa nova nasce fechada para não encher a lista.
 */
async function handleHistoryMessage(channel, message) {
	if (message.isGroup) return { ignored: true };
	if (!/^\d{8,15}$/.test(message.phone)) return { ignored: true };
	if (await db.whatsappMessage.findUnique({ where: { externalId: message.externalId }, select: { id: true } })) return { duplicate: true };
	const contact = await db.contact.findFirst({ where: { phone: message.phone, area: channel.area }, select: { id: true } });
	if (!contact) return { ignored: true, reason: 'contato desconhecido' };

	const inbound = !message.fromMe;
	const conversation = await db.whatsappConversation.upsert({
		where: { channelId_phone: { channelId: channel.id, phone: message.phone } },
		create: { channelId: channel.id, contactId: contact.id, phone: message.phone, area: channel.area, status: 'FECHADA', lastMessageAt: message.at },
		update: {}
	});
	try {
		await db.whatsappMessage.create({
			data: {
				conversationId: conversation.id,
				direction: inbound ? 'ENTRADA' : 'SAIDA',
				kind: message.mediaType ? 'MIDIA' : 'TEXTO',
				body: message.text ? message.text.slice(0, 4000) : null,
				...mediaFields(message),
				externalId: message.externalId,
				status: inbound ? 'RECEBIDA' : 'ENTREGUE',
				sentAt: message.at
			}
		});
	} catch (err) {
		if (err?.code === 'P2002') return { duplicate: true };
		throw err;
	}
	const newer = (current) => (!current || message.at > current ? message.at : undefined);
	await db.whatsappConversation.update({
		where: { id: conversation.id },
		data: {
			lastMessageAt: newer(conversation.lastMessageAt),
			...(inbound ? { lastInboundAt: newer(conversation.lastInboundAt) } : { lastOutboundAt: newer(conversation.lastOutboundAt) })
		}
	});
	return { stored: true };
}

async function handleStatus(ids, status) {
	const messages = await db.whatsappMessage.findMany({ where: { externalId: { in: ids } }, select: { id: true, status: true } });
	for (const m of messages) {
		const next = nextStatus(m.status, status);
		if (next !== m.status) await db.whatsappMessage.update({ where: { id: m.id }, data: { status: next } });
	}
}

export async function processWebhookBody(channel, body) {
	const ev = parseWebhook(body);
	if (ev.type === 'message') return handleMessage(channel, ev.message);
	if (ev.type === 'history') {
		let stored = 0;
		for (const message of ev.messages) if ((await handleHistoryMessage(channel, message)).stored) stored++;
		return { history: stored, received: ev.messages.length };
	}
	if (ev.type === 'status') return handleStatus(ev.ids, ev.status);
	if (ev.type === 'connection') {
		await db.whatsappChannel.update({ where: { id: channel.id }, data: { state: ev.state, stateAt: new Date() } });
		return { connection: ev.state };
	}
	return { ignored: true, reason: ev.reason };
}

async function processRow(id) {
	const row = await db.whatsappWebhookInbox.findUnique({ where: { id }, include: { channel: true } });
	if (!row || row.processedAt) return;
	await db.whatsappWebhookInbox.update({ where: { id }, data: { attempts: { increment: 1 } } });
	try {
		await processWebhookBody(row.channel, row.payload);
		await db.whatsappWebhookInbox.update({ where: { id }, data: { processedAt: new Date(), error: null } });
	} catch (err) {
		console.error(`[whatsapp] falha ao processar evento ${id}:`, err?.message ?? err);
		await db.whatsappWebhookInbox.update({ where: { id }, data: { error: String(err?.message ?? err).slice(0, 300) } });
	}
}

/** Grava o evento cru e processa na mesma requisição. */
export async function ingest(channel, body) {
	const row = await db.whatsappWebhookInbox.create({ data: { channelId: channel.id, payload: body ?? {} } });
	await db.whatsappChannel.update({ where: { id: channel.id }, data: { lastWebhookAt: new Date() } });
	await processRow(row.id);
}

/** Cron: reprocessa o que falhou (até 3 tentativas) e apaga o que já foi processado há 7 dias. */
export async function maintainInbox() {
	const stale = await db.whatsappWebhookInbox.findMany({
		where: { processedAt: null, attempts: { lt: MAX_ATTEMPTS }, receivedAt: { lt: new Date(Date.now() - 60_000) } },
		orderBy: { receivedAt: 'asc' },
		take: 20,
		select: { id: true }
	});
	for (const { id } of stale) await processRow(id);
	const { count } = await db.whatsappWebhookInbox.deleteMany({
		// Processados há 7 dias, ou parados em falha há 30 dias: o corpo cru tem telefone, nome e texto.
		where: {
			OR: [
				{ processedAt: { lt: new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 3600_000) } },
				{ receivedAt: { lt: new Date(Date.now() - 30 * 24 * 3600_000) } }
			]
		}
	});
	return { retried: stale.length, purged: count };
}
