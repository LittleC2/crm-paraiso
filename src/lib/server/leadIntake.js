// Entrada de leads vindos de fora (planilha do Google): valida a chave, aplica o
// mapeamento de colunas e cria contato + lead no funil do jardim, sem duplicar.
// Reaproveita createContact/createDeal, então as regras de etapa e o escopo são os mesmos
// do formulário "Novo lead". Nada é enviado ao cliente por aqui.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { createContact } from './contacts.js';
import { createDeal } from './deals.js';
import { extractFields } from '../leadMapping.js';
import { normalizePhone } from '../phone.js';

const MAX_ROWS = 50;
const PER_MINUTE = 120;
const TEST_TAG = 'teste-planilha';

export const hashKey = (key) => createHash('sha256').update(String(key)).digest('hex');
export const newKey = () => `crm_${randomBytes(24).toString('base64url')}`;

export function keyMatches(integration, key) {
	const a = Buffer.from(hashKey(key ?? ''), 'hex');
	const b = Buffer.from(integration.secretHash, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}

const cut = (s, n) => String(s ?? '').trim().slice(0, n);

export const dedupeKey = (row, data) =>
	`${row ?? ''}:${createHash('sha1').update(JSON.stringify(Object.entries(data ?? {}).sort())).digest('hex').slice(0, 16)}`;

async function serviceKey(raw, fallback) {
	const options = await db.listOption.findMany({ where: { kind: 'SERVICO', active: true }, select: { key: true, label: true } });
	const n = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
	const hit = options.find((o) => n(o.key) === n(raw) || n(o.label) === n(raw));
	return hit?.key ?? fallback ?? options[0]?.key ?? 'CONSTRUCAO';
}

/** Grava o registro da chegada (e atualiza a última entrada). */
async function record(integration, key, status, extra = {}) {
	const data = { integrationId: integration.id, dedupeKey: key, status, ...extra };
	await db.leadIntake.upsert({ where: { integrationId_dedupeKey: { integrationId: integration.id, dedupeKey: key } }, create: data, update: { status, ...extra } });
	await db.leadIntegration.update({ where: { id: integration.id }, data: { lastEventAt: new Date() } });
}

/**
 * Processa uma linha. Devolve { status, reason? } com status
 * CRIADO | DUPLICADO | INVALIDO | ERRO. Reenviar a mesma linha devolve DUPLICADO.
 */
export async function processRow(integration, owner, row, data, { test = false } = {}) {
	const key = dedupeKey(row, data);
	const payload = JSON.parse(JSON.stringify(data ?? {}).slice(0, 4000) || '{}');
	const seen = await db.leadIntake.findUnique({ where: { integrationId_dedupeKey: { integrationId: integration.id, dedupeKey: key } } });
	if (seen && seen.status !== 'ERRO') return { status: 'DUPLICADO', reason: 'linha já enviada' };

	try {
		const f = extractFields(data, integration.mapping ?? {});
		const phone = f.phone ? normalizePhone(f.phone) : null;
		if (!phone && !f.email) {
			await record(integration, key, 'INVALIDO', { reason: 'sem telefone nem e-mail válidos', name: cut(f.name, 120), payload });
			return { status: 'INVALIDO', reason: 'sem telefone nem e-mail válidos' };
		}
		const name = cut(f.name, 120) || (phone ? `Lead ${phone.slice(-4)}` : cut(f.email, 120));
		const source = cut(f.source, 60) || integration.defaultSource || `Planilha: ${integration.name}`;
		const note = [f.message, f.campaign ? `Campanha: ${f.campaign}` : ''].filter(Boolean).join('\n').slice(0, 2000);

		let contact = phone ? await db.contact.findFirst({ where: { phone, area: 'JARDIM' } }) : null;
		if (!contact && phone && (await db.contact.findFirst({ where: { phone }, select: { id: true } }))) {
			await record(integration, key, 'ERRO', { reason: 'telefone já existe em outra área', name, phone, payload });
			return { status: 'ERRO', reason: 'telefone já existe em outra área' };
		}
		if (contact) {
			// Contato conhecido: só completa o que estiver vazio, nunca sobrescreve.
			const fill = {};
			if (!contact.email && f.email) fill.email = cut(f.email, 120);
			if (!contact.neighborhood && f.neighborhood) fill.neighborhood = cut(f.neighborhood, 80);
			if (!contact.source && source) fill.source = source;
			if (Object.keys(fill).length) contact = await db.contact.update({ where: { id: contact.id }, data: fill });
			const open = await db.deal.findFirst({ where: { contactId: contact.id, area: 'JARDIM', stage: { kind: 'ABERTA' } }, select: { id: true } });
			if (open) {
				if (note) await db.interaction.create({ data: { contactId: contact.id, dealId: open.id, authorId: owner.id, kind: 'NOTA', body: `Novo contato pela planilha "${integration.name}": ${note}`.slice(0, 2000) } });
				await record(integration, key, 'DUPLICADO', { reason: 'cliente já tem lead aberto', name: contact.name, phone, contactId: contact.id, dealId: open.id, payload });
				return { status: 'DUPLICADO', reason: 'cliente já tem lead aberto' };
			}
		} else {
			const created = await createContact(owner, {
				name,
				phone,
				email: f.email,
				area: 'JARDIM',
				type: 'CLIENTE_JARDIM',
				source,
				neighborhood: f.neighborhood,
				tags: test ? TEST_TAG : ''
			});
			if (created.error) {
				await record(integration, key, 'ERRO', { reason: created.error.slice(0, 160), name, phone, payload });
				return { status: 'ERRO', reason: created.error.slice(0, 160) };
			}
			contact = created.contact;
		}

		const stage = integration.stageId ? await db.pipelineStage.findFirst({ where: { id: integration.stageId, area: 'JARDIM' } }) : null;
		const made = await createDeal(owner, 'JARDIM', {
			contactId: contact.id,
			title: cut(f.message, 120) || cut(f.campaign, 120) || null,
			serviceType: await serviceKey(f.service, integration.defaultService),
			neighborhood: f.neighborhood || contact.neighborhood,
			source,
			notes: note,
			value: f.value,
			assigneeId: owner.id,
			stageId: stage?.id
		});
		if (made.error) {
			await record(integration, key, 'ERRO', { reason: made.error.slice(0, 160), name, phone, contactId: contact.id, payload });
			return { status: 'ERRO', reason: made.error.slice(0, 160) };
		}
		await record(integration, key, 'CRIADO', { name, phone, contactId: contact.id, dealId: made.deal.id, payload });
		return { status: 'CRIADO' };
	} catch (err) {
		console.error('[leads] linha', row, String(err?.message ?? err).slice(0, 200));
		await record(integration, key, 'ERRO', { reason: 'falha interna', payload }).catch(() => {});
		return { status: 'ERRO', reason: 'falha interna' };
	}
}

/** Lote de até 50 linhas; limite de 120 por minuto por integração. */
export async function processBatch(integration, rows) {
	const recent = await db.leadIntake.count({ where: { integrationId: integration.id, createdAt: { gte: new Date(Date.now() - 60_000) } } });
	if (recent >= PER_MINUTE) return { error: 'Muitas linhas em pouco tempo. Aguarde um minuto.', status: 429 };
	const owner = await db.user.findFirst({ where: { id: integration.ownerId, active: true, role: 'ADMIN' } });
	if (!owner) return { error: 'Responsável da integração não está ativo.', status: 409 };
	const results = [];
	for (const item of rows.slice(0, MAX_ROWS)) {
		const data = item?.data && typeof item.data === 'object' && !Array.isArray(item.data) ? item.data : null;
		if (!data) {
			results.push({ row: item?.row ?? null, status: 'INVALIDO', reason: 'linha sem dados' });
			continue;
		}
		const r = await processRow(integration, owner, item.row, data);
		results.push({ row: item.row ?? null, ...r });
	}
	return { results };
}

/** Lead de teste (marcado com a tag teste-planilha, apagável). */
export async function sendTest(integration) {
	const owner = await db.user.findFirst({ where: { id: integration.ownerId, active: true, role: 'ADMIN' } });
	if (!owner) return { status: 'ERRO', reason: 'Responsável da integração não está ativo.' };
	const data = { Nome: 'Lead de teste (pode apagar)', WhatsApp: '21900000000', Mensagem: 'Teste da integração com a planilha.' };
	return processRow(integration, owner, `teste-${Date.now()}`, data, { test: true });
}

/** Apaga os leads e contatos de teste (e o registro das chegadas deles). */
export async function deleteTests() {
	const contacts = await db.contact.findMany({ where: { tags: { has: TEST_TAG } }, select: { id: true } });
	const ids = contacts.map((c) => c.id);
	if (!ids.length) return { removed: 0 };
	await db.interaction.deleteMany({ where: { contactId: { in: ids } } });
	await db.task.deleteMany({ where: { contactId: { in: ids } } });
	await db.deal.deleteMany({ where: { contactId: { in: ids } } });
	await db.leadIntake.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
	return { removed: ids.length };
}
