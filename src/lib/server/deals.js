// Funil: negócios, etapas, histórico, regras por etapa e manutenção.
// Quadro JARDIM = só equipe interna; quadro LOJA (pedidos) = visível à loja.
// Toda leitura e escrita por id passa por dealScope / contactScope.
import { db } from './db.js';
import { syncEvent } from './googleCalendar.js';
import { activeKeys, loadLists } from './funnelConfig.js';
import { previewText } from '../chatFormat.js';
import { can, contactScope, conversationScope, dealScope, isAdmin } from './access.js';
import { createContact } from './contacts.js';
import { addDays, dayKey, dayStart } from '../agenda.js';
import { parseMoneyToCents } from '../money.js';

export const SERVICE_LABEL = { CONSTRUCAO: 'Construção', MANUTENCAO: 'Manutenção', OUTRO: 'Outro' };
const FIRST_CONTACT_KINDS = ['LIGACAO', 'WHATSAPP', 'VISITA'];

function clean(value, max) {
	const v = String(value ?? '').trim();
	return v ? v.slice(0, max) : null;
}

/** Quadros que o usuário pode abrir: LOJA só o da loja. */
export function boardAllowed(user, area) {
	return isAdmin(user) || area === 'LOJA';
}

// ---- leitura --------------------------------------------------------------

export async function loadBoard(user, area) {
	if (!boardAllowed(user, area)) return null;
	const [stages, deals, routes, users] = await Promise.all([
		db.pipelineStage.findMany({ where: { area }, orderBy: { order: 'asc' }, include: { rule: true } }),
		db.deal.findMany({
			where: { AND: [dealScope(user), { area }] },
			include: {
				contact: { select: { id: true, name: true, phone: true } },
				assignee: { select: { id: true, name: true } }
			},
			orderBy: [{ order: 'asc' }, { createdAt: 'desc' }]
		}),
		area === 'JARDIM' ? db.serviceRoute.findMany() : [],
		db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
	]);
	// Resumo da conversa mais recente de cada contato (prévia, não lidas, quem espera resposta).
	const convs = await db.whatsappConversation.findMany({
		where: { AND: [conversationScope(user), { area }, { contactId: { in: deals.map((d) => d.contactId) } }] },
		orderBy: { lastMessageAt: 'desc' },
		select: {
			id: true,
			contactId: true,
			unread: true,
			lastMessageAt: true,
			lastInboundAt: true,
			lastOutboundAt: true,
			status: true,
			messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { body: true, direction: true, kind: true, mediaType: true, mediaSeconds: true } }
		}
	});
	const byContact = new Map();
	for (const c of convs) if (!byContact.has(c.contactId)) byContact.set(c.contactId, c);
	const withChat = deals.map((d) => {
		const c = byContact.get(d.contactId);
		const last = c?.messages[0];
		return {
			...d,
			chat: c
				? {
						preview: last ? previewText({ ...last, direction: 'ENTRADA' }) : '',
						fromClient: last?.direction === 'ENTRADA',
						unread: c.unread,
						lastMessageAt: c.lastMessageAt,
						// cliente escreveu por último e ainda não houve resposta
						// cliente escreveu por último, sem resposta, e a conversa não está fechada
						waiting: c.status !== 'FECHADA' && !!c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt)
					}
				: null
		};
	});
	return { stages, deals: withChat, routes, users, lists: await loadLists() };
}

export async function loadDeal(user, id) {
	return db.deal.findFirst({
		where: { id, ...dealScope(user) },
		include: {
			contact: true,
			stage: true,
			assignee: { select: { id: true, name: true } },
			tasks: { orderBy: { dueDate: 'asc' } },
			events: { orderBy: { startsAt: 'asc' } },
			interactions: { orderBy: { createdAt: 'desc' }, take: 50, include: { author: { select: { name: true } } } },
			contracts: true
		}
	});
}

// ---- automação por etapa --------------------------------------------------

async function cancelAutoTasks(dealId) {
	await db.task.deleteMany({
		where: { autoKey: { startsWith: `deal:${dealId}:` }, status: { not: 'FEITO' } }
	});
}

/** Aplica a regra da etapa (se ligada) e as paradas automáticas. */
async function onEnterStage(deal, stage, contactName) {
	// Ao mudar de etapa, os retornos da etapa anterior param (a nova pode criar os dela).
	await cancelAutoTasks(deal.id);
	// Fechou, perdeu ou já tem visita marcada: nada novo a criar.
	if (stage.kind !== 'ABERTA' || stage.key === 'visita') return;
	const rule = stage.rule ?? (await db.stageRule.findUnique({ where: { stageId: stage.id } }));
	if (!rule?.active || !rule.activatedAt || new Date() < rule.activatedAt) return;

	const today = dayKey(new Date());
	const data = rule.followUpDays.map((d) => ({
		title: `Retorno da proposta (D+${d}): ${contactName}`,
		area: deal.area,
		dealId: deal.id,
		contactId: deal.contactId,
		assigneeId: deal.assigneeId,
		priority: 'NORMAL',
		// 9h de Brasília no dia D+n
		dueDate: new Date(dayStart(addDays(today, d)).getTime() + 9 * 3600_000),
		autoKey: `deal:${deal.id}:${stage.id}:d${d}`
	}));
	if (data.length) await db.task.createMany({ data, skipDuplicates: true });
}

async function log(dealId, contactId, authorId, body, kind = 'SISTEMA') {
	await db.interaction.create({ data: { dealId, contactId, authorId, kind, body } });
}

// ---- criação e edição -----------------------------------------------------

// `services`: chaves ativas da lista de tipos de serviço; fora dela, cai na primeira.
/** Responsável precisa ser uma pessoa ativa; id inválido cai no padrão em vez de gerar erro. */
async function validAssignee(raw, fallback) {
	const id = String(raw ?? '');
	if (!id) return fallback;
	const person = await db.user.findFirst({ where: { id, active: true }, select: { id: true } });
	return person ? person.id : fallback;
}

export function sanitizeDealInput(input, services = ['CONSTRUCAO']) {
	return {
		title: clean(input.title, 120),
		serviceType: services.includes(input.serviceType) ? input.serviceType : (services[0] ?? 'CONSTRUCAO'),
		spaceType: clean(input.spaceType, 60),
		squareMeters: Number.isFinite(Number(input.squareMeters)) && Number(input.squareMeters) > 0 ? Math.round(Number(input.squareMeters)) : null,
		neighborhood: clean(input.neighborhood, 80),
		address: clean(input.address, 200),
		hasPhotos: input.hasPhotos === 'on' || input.hasPhotos === true,
		askedQuote: input.askedQuote === 'on' || input.askedQuote === true,
		valueCents: parseMoneyToCents(input.value),
		source: clean(input.source, 60),
		notes: clean(input.notes, 2000),
		nextAction: clean(input.nextAction, 160),
		nextActionAt: input.nextActionAt ? new Date(`${String(input.nextActionAt).slice(0, 10)}T12:00:00-03:00`) : null
	};
}

export async function createDeal(user, area, input) {
	if (!boardAllowed(user, area)) return { error: 'Sem permissão.' };

	// Contato existente (dentro do escopo) ou novo; telefone repetido reaproveita o existente.
	let contactId = String(input.contactId ?? '');
	if (contactId) {
		const ok = await db.contact.findFirst({ where: { id: contactId, ...contactScope(user) }, select: { id: true } });
		if (!ok) return { error: 'Contato não encontrado.' };
	} else {
		const created = await createContact(user, {
			name: input.contactName,
			phone: input.contactPhone,
			area,
			type: area === 'JARDIM' ? 'CLIENTE_JARDIM' : 'CLIENTE_LOJA',
			source: input.source,
			neighborhood: input.neighborhood
		});
		if (created.error && !created.duplicateId) return { error: created.error };
		contactId = created.contact?.id ?? created.duplicateId;
	}

	let first = input.stageId ? await db.pipelineStage.findFirst({ where: { id: String(input.stageId), area, kind: 'ABERTA' } }) : null;
	first ??= await db.pipelineStage.findFirst({ where: { area }, orderBy: { order: 'asc' } });
	if (!first) return { error: 'Quadro sem etapas.' };
	const top = await db.deal.findFirst({ where: { stageId: first.id }, orderBy: { order: 'asc' }, select: { order: true } });

	const data = sanitizeDealInput(input, await activeKeys('SERVICO'));
	const assigneeId = await validAssignee(input.assigneeId, user.id);
	const deal = await db.deal.create({
		data: {
			...data,
			area,
			contactId,
			stageId: first.id,
			order: (top?.order ?? 0) - 1,
			assigneeId,
			createdById: user.id
		}
	});
	await log(deal.id, contactId, user.id, 'Negócio criado.');
	return { deal };
}

export async function updateDeal(user, id, input) {
	const existing = await db.deal.findFirst({ where: { id, ...dealScope(user) } });
	if (!existing) return { error: 'Negócio não encontrado.', notFound: true };
	// Edição mantém o tipo de serviço atual se ele foi desativado depois.
	const services = await activeKeys('SERVICO');
	if (!services.includes(existing.serviceType)) services.push(existing.serviceType);
	const data = sanitizeDealInput(input, services);
	const deal = await db.deal.update({
		where: { id },
		data: { ...data, assigneeId: await validAssignee(input.assigneeId, null) }
	});
	return { deal };
}

// ---- movimento entre etapas -----------------------------------------------

async function applyMove(user, deal, stage, extra = {}) {
	const contact = await db.contact.findUnique({ where: { id: deal.contactId }, select: { name: true } });
	const from = await db.pipelineStage.findUnique({ where: { id: deal.stageId } });
	const updated = await db.deal.update({
		where: { id: deal.id },
		data: {
			stageId: stage.id,
			enteredStageAt: new Date(),
			closedAt: stage.kind === 'ABERTA' ? null : new Date(),
			// Voltar de perdido para etapa aberta limpa o motivo.
			...(stage.kind !== 'PERDIDO' ? { lostReason: null, lostNote: null } : {}),
			...extra
		}
	});
	await log(deal.id, deal.contactId, user.id, `Etapa: ${from?.name ?? '?'} → ${stage.name}.`);
	// Alimenta as metas (propostas, visitas, fechamentos por período e por pessoa).
	await db.dealStageLog.create({
		data: { dealId: deal.id, area: deal.area, toKey: stage.key, toKind: stage.kind, userId: user?.id ?? null }
	});
	await onEnterStage(updated, stage, contact?.name ?? '');
	return updated;
}

/**
 * Posiciona negócios numa coluna: quem veio de outra coluna é movido (com as
 * regras), e todos recebem `order` pelo índice. Perdido não aceita arrasto
 * (exige motivo): use loseDeal.
 */
export async function placeDeals(user, stageId, ids) {
	const stage = await db.pipelineStage.findUnique({ where: { id: stageId }, include: { rule: true } });
	if (!stage || !boardAllowed(user, stage.area)) return { error: 'Etapa inválida.' };
	if (stage.kind === 'PERDIDO') return { error: 'Para marcar como perdido, informe o motivo.' };

	const deals = await db.deal.findMany({ where: { id: { in: ids }, area: stage.area, ...dealScope(user) } });
	const byId = new Map(deals.map((d) => [d.id, d]));
	for (const id of ids) {
		const deal = byId.get(id);
		if (deal && deal.stageId !== stage.id) await applyMove(user, deal, stage);
	}
	const allowed = ids.filter((id) => byId.has(id));
	await db.$transaction(allowed.map((id, i) => db.deal.update({ where: { id }, data: { order: i } })));
	return { ok: true };
}

export async function moveDealToStage(user, id, stageId) {
	const deal = await db.deal.findFirst({ where: { id, ...dealScope(user) } });
	const stage = await db.pipelineStage.findUnique({ where: { id: stageId }, include: { rule: true } });
	if (!deal || !stage || stage.area !== deal.area) return { error: 'Negócio ou etapa inválidos.' };
	if (stage.kind === 'PERDIDO') return { error: 'Para marcar como perdido, informe o motivo.' };
	if (deal.stageId === stage.id) return { ok: true };
	await applyMove(user, deal, stage);
	return { ok: true };
}

export async function loseDeal(user, id, reason, note) {
	if (!(await activeKeys('MOTIVO_PERDA')).includes(reason)) return { error: 'Escolha o motivo da perda.' };
	const deal = await db.deal.findFirst({ where: { id, ...dealScope(user) } });
	if (!deal) return { error: 'Negócio não encontrado.' };
	const stage = await db.pipelineStage.findFirst({ where: { area: deal.area, kind: 'PERDIDO' }, include: { rule: true } });
	if (!stage) return { error: 'Quadro sem etapa de perda.' };
	await applyMove(user, deal, stage, { lostReason: reason, lostNote: clean(note, 500) });
	return { ok: true };
}

export async function assignToMe(user, id) {
	const { count } = await db.deal.updateMany({ where: { id, ...dealScope(user) }, data: { assigneeId: user.id } });
	return count ? { ok: true } : { error: 'Negócio não encontrado.' };
}

// ---- histórico ------------------------------------------------------------

export async function addInteraction(user, id, kind, body) {
	const text = clean(body, 2000);
	if (!text) return { error: 'Escreva a anotação.' };
	const deal = await db.deal.findFirst({ where: { id, ...dealScope(user) } });
	if (!deal) return { error: 'Negócio não encontrado.' };
	const k = ['NOTA', 'LIGACAO', 'VISITA', 'WHATSAPP'].includes(kind) ? kind : 'NOTA';
	await log(deal.id, deal.contactId, user.id, text, k);
	// Primeiro contato de verdade (não nota interna): base do "tempo até responder".
	if (!deal.firstContactAt && FIRST_CONTACT_KINDS.includes(k)) {
		await db.deal.update({ where: { id }, data: { firstContactAt: new Date() } });
	}
	return { ok: true };
}

// ---- visita ---------------------------------------------------------------

export async function scheduleVisit(user, id, { startsAt, location }) {
	const deal = await db.deal.findFirst({ where: { id, ...dealScope(user) }, include: { contact: true } });
	if (!deal) return { error: 'Negócio não encontrado.' };
	const when = new Date(startsAt);
	if (Number.isNaN(when.getTime())) return { error: 'Data inválida.' };

	const visit = await db.event.create({
		data: {
			title: `Visita: ${deal.contact.name}`,
			type: 'VISITA',
			area: deal.area,
			startsAt: when,
			location: clean(location, 140) ?? deal.address ?? deal.neighborhood,
			contactId: deal.contactId,
			dealId: deal.id,
			createdById: user.id,
			participants: deal.assigneeId ? { connect: [{ id: deal.assigneeId }] } : undefined
		}
	});
	await syncEvent(visit.id);
	const stage = await db.pipelineStage.findFirst({ where: { area: deal.area, key: 'visita' }, include: { rule: true } });
	if (stage && deal.stageId !== stage.id) await applyMove(user, deal, stage);
	return { ok: true };
}

// ---- configuração (só equipe interna) -------------------------------------

export async function setStageRule(user, stageId, { active, followUpDays }) {
	if (!can(user, 'funil')) return { error: 'Sem permissão.' };
	const days = [...new Set((followUpDays ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 90))].sort((a, b) => a - b);
	const current = await db.stageRule.findUnique({ where: { stageId } });
	const turningOn = active && !current?.active;
	await db.stageRule.upsert({
		where: { stageId },
		create: { stageId, active: !!active, activatedAt: active ? new Date() : null, followUpDays: days },
		update: { active: !!active, followUpDays: days, ...(turningOn ? { activatedAt: new Date() } : {}) }
	});
	return { ok: true };
}

export async function saveRoute(user, { id, name, weekday, neighborhoods }) {
	if (!can(user, 'funil')) return { error: 'Sem permissão.' };
	const cleanName = clean(name, 60);
	if (!cleanName) return { error: 'Dê um nome à rota.' };
	const list = String(neighborhoods ?? '')
		.split(/[,;\n]/)
		.map((n) => n.trim())
		.filter(Boolean)
		.slice(0, 50);
	const wd = weekday === '' || weekday == null ? null : Number(weekday);
	const data = { name: cleanName, weekday: Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : null, neighborhoods: list };
	if (id) await db.serviceRoute.update({ where: { id }, data });
	else await db.serviceRoute.create({ data });
	return { ok: true };
}

export async function deleteRoute(user, id) {
	if (!can(user, 'funil')) return { error: 'Sem permissão.' };
	await db.serviceRoute.deleteMany({ where: { id } });
	return { ok: true };
}

// ---- clube de manutenção ---------------------------------------------------

function visitTask(contract, contactName, when) {
	return {
		title: `Visita de manutenção: ${contactName}`,
		area: 'JARDIM',
		contactId: contract.contactId,
		dealId: contract.dealId,
		dueDate: when,
		autoKey: `maint:${contract.id}:${dayKey(when)}`
	};
}

export async function createContract(user, { contactId, monthlyValue, visitIntervalDays, firstVisitAt, notes }) {
	if (!can(user, 'funil')) return { error: 'Sem permissão.' };
	const contact = await db.contact.findFirst({ where: { id: String(contactId), ...contactScope(user) } });
	if (!contact) return { error: 'Escolha o contato.' };
	const value = parseMoneyToCents(monthlyValue);
	if (value == null) return { error: 'Informe o valor mensal.' };
	const interval = Math.min(90, Math.max(7, Number(visitIntervalDays) || 30));
	const next = firstVisitAt ? new Date(`${String(firstVisitAt).slice(0, 10)}T09:00:00-03:00`) : null;
	const contract = await db.maintenanceContract.create({
		data: { contactId: contact.id, monthlyValueCents: value, visitIntervalDays: interval, nextVisitAt: next, notes: clean(notes, 1000) }
	});
	if (next) await db.task.createMany({ data: [visitTask(contract, contact.name, next)], skipDuplicates: true });
	return { contract };
}

/** Registra visita feita: agenda a próxima (intervalo do plano) e cria a tarefa. */
export async function completeVisit(user, id) {
	if (!can(user, 'funil')) return { error: 'Sem permissão.' };
	const contract = await db.maintenanceContract.findUnique({ where: { id }, include: { contact: true } });
	if (!contract || contract.status !== 'ATIVO') return { error: 'Contrato não encontrado ou inativo.' };
	const base = contract.nextVisitAt && contract.nextVisitAt > new Date() ? contract.nextVisitAt : new Date();
	const next = new Date(dayStart(addDays(dayKey(base), contract.visitIntervalDays)).getTime() + 9 * 3600_000);
	await db.maintenanceContract.update({ where: { id }, data: { nextVisitAt: next } });
	await db.task.createMany({ data: [visitTask(contract, contract.contact.name, next)], skipDuplicates: true });
	return { ok: true };
}

export async function setContractStatus(user, id, status) {
	if (!can(user, 'funil')) return { error: 'Sem permissão.' };
	if (!['ATIVO', 'PAUSADO', 'ENCERRADO'].includes(status)) return { error: 'Status inválido.' };
	await db.maintenanceContract.updateMany({ where: { id }, data: { status } });
	return { ok: true };
}
