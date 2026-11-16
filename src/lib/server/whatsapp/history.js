// Fila de pedidos de histórico de conversa (uazapi /message/history-sync).
// O botão em Ajustes enfileira os contatos do número; o cron envia um lote por minuto
// (a uazapi aceita 10 chamadas por segundo por instância; usamos bem menos).
// A resposta chega depois pelo webhook, no evento "history" (ver inbound.js).
import { db } from '../db.js';
import { can } from '../access.js';
import { getProvider } from './provider.js';

const BATCH = 15;
const MESSAGES_PER_CHAT = 50;
const PAUSE_MS = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Enfileira um pedido por contato (com telefone) da mesma área do número. Não repete pedidos antigos. */
export async function queueHistory(user, channelId) {
	if (!can(user, 'canais')) return { error: 'Sem permissão.' };
	const channel = await db.whatsappChannel.findUnique({ where: { id: String(channelId) } });
	if (!channel) return { error: 'Número não encontrado.', notFound: true };
	if (channel.state !== 'CONECTADO') return { error: 'Conecte o número antes de importar o histórico.' };
	const contacts = await db.contact.findMany({ where: { area: channel.area, phone: { not: null } }, select: { id: true } });
	if (!contacts.length) return { error: 'Não há contatos com telefone nesta área para buscar histórico.' };
	// Pedido que falhou volta para a fila (queda curta da uazapi não deve ser definitiva).
	await db.historyRequest.updateMany({ where: { channelId: channel.id, state: 'FALHOU' }, data: { state: 'PENDENTE', error: null } });
	const { count } = await db.historyRequest.createMany({
		data: contacts.map((c) => ({ channelId: channel.id, contactId: c.id })),
		skipDuplicates: true
	});
	return { ok: true, queued: count, total: contacts.length };
}

/** Cron: envia o próximo lote de pedidos. */
export async function processHistoryQueue() {
	const pending = await db.historyRequest.findMany({
		where: { state: 'PENDENTE', channel: { state: 'CONECTADO', active: true } },
		orderBy: { createdAt: 'asc' },
		take: BATCH,
		include: { channel: true, contact: { select: { phone: true } } }
	});
	let sent = 0;
	let failed = 0;
	for (const req of pending) {
		try {
			if (!req.contact.phone) throw new Error('contato sem telefone');
			await getProvider(req.channel).requestHistory(req.contact.phone, MESSAGES_PER_CHAT);
			await db.historyRequest.update({ where: { id: req.id }, data: { state: 'ENVIADO', requestedAt: new Date(), error: null } });
			sent++;
		} catch (err) {
			await db.historyRequest.update({ where: { id: req.id }, data: { state: 'FALHOU', error: String(err?.message ?? err).slice(0, 200) } });
			failed++;
		}
		await sleep(PAUSE_MS);
	}
	return { sent, failed };
}

/** { [channelId]: { PENDENTE, ENVIADO, FALHOU } } para mostrar o andamento. */
export async function historyProgress() {
	const rows = await db.historyRequest.groupBy({ by: ['channelId', 'state'], _count: { _all: true } });
	const out = {};
	for (const r of rows) (out[r.channelId] ??= { PENDENTE: 0, ENVIADO: 0, FALHOU: 0 })[r.state] = r._count._all;
	return out;
}
