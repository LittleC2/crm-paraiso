// Configuração editável do funil: etapas e listas (motivos de perda, origens,
// tipos de serviço). Só equipe interna (can 'funil').
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { can } from './access.js';

const AREAS = ['JARDIM', 'LOJA'];
export const LIST_KINDS = ['MOTIVO_PERDA', 'ORIGEM', 'SERVICO'];
// Etapas que o código usa por chave (visita agendada e retorno de proposta):
// podem ser renomeadas e recoloridas, mas não apagadas.
const PROTECTED_KEYS = ['visita', 'proposta'];

const denied = () => ({ error: 'Sem permissão.' });
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const hexColor = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v ?? '')) ? String(v).toLowerCase() : null);

function slug(name) {
	const base = name
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 30);
	return base || 'item';
}

// ---- etapas ---------------------------------------------------------------

export async function loadStageConfig() {
	const stages = await db.pipelineStage.findMany({
		orderBy: [{ area: 'asc' }, { order: 'asc' }],
		include: { _count: { select: { deals: true } } }
	});
	return stages.map((s) => ({
		id: s.id,
		area: s.area,
		key: s.key,
		name: s.name,
		kind: s.kind,
		color: s.color,
		order: s.order,
		deals: s._count.deals,
		canDelete: s.kind === 'ABERTA' && !PROTECTED_KEYS.includes(s.key)
	}));
}

export async function saveStage(user, { id, name, color }) {
	if (!can(user, 'funil')) return denied();
	const n = text(name, 60);
	if (!n) return { error: 'Informe o nome da etapa.' };
	const { count } = await db.pipelineStage.updateMany({ where: { id }, data: { name: n, color: hexColor(color) } });
	return count ? { ok: true } : { error: 'Etapa não encontrada.' };
}

/** Nova etapa aberta, logo antes da primeira etapa de fechamento (Fechado/Perdido). */
export async function createStage(user, { area, name, color }) {
	if (!can(user, 'funil')) return denied();
	if (!AREAS.includes(area)) return { error: 'Quadro inválido.' };
	const n = text(name, 60);
	if (!n) return { error: 'Informe o nome da etapa.' };
	const stages = await db.pipelineStage.findMany({ where: { area }, orderBy: { order: 'asc' } });
	const firstClosing = stages.findIndex((s) => s.kind !== 'ABERTA');
	const at = firstClosing === -1 ? stages.length : firstClosing;
	const key = `${slug(n)}-${randomBytes(2).toString('hex')}`;
	await db.$transaction([
		...stages.slice(at).map((s, i) => db.pipelineStage.update({ where: { id: s.id }, data: { order: at + i + 2 } })),
		db.pipelineStage.create({ data: { area, key, name: n, kind: 'ABERTA', order: at + 1, color: hexColor(color) } })
	]);
	return { ok: true };
}

/** Sobe ou desce uma etapa (troca de lugar com a vizinha, dentro do mesmo quadro). */
export async function moveStage(user, id, direction) {
	if (!can(user, 'funil')) return denied();
	const stage = await db.pipelineStage.findUnique({ where: { id } });
	if (!stage) return { error: 'Etapa não encontrada.' };
	const list = await db.pipelineStage.findMany({ where: { area: stage.area }, orderBy: { order: 'asc' } });
	const i = list.findIndex((s) => s.id === id);
	const j = direction === 'up' ? i - 1 : i + 1;
	if (j < 0 || j >= list.length) return { ok: true };
	const next = [...list];
	[next[i], next[j]] = [next[j], next[i]];
	await db.$transaction(next.map((s, idx) => db.pipelineStage.update({ where: { id: s.id }, data: { order: idx + 1 } })));
	return { ok: true };
}

/** Apaga uma etapa aberta; os negócios dela vão para `targetId` (mesmo quadro, aberta). */
export async function deleteStage(user, id, targetId) {
	if (!can(user, 'funil')) return denied();
	const stage = await db.pipelineStage.findUnique({ where: { id } });
	if (!stage) return { error: 'Etapa não encontrada.' };
	if (stage.kind !== 'ABERTA' || PROTECTED_KEYS.includes(stage.key)) {
		return { error: 'Esta etapa é usada pelo sistema e não pode ser apagada. Você pode renomeá-la.' };
	}
	const target = await db.pipelineStage.findUnique({ where: { id: String(targetId ?? '') } });
	if (!target || target.area !== stage.area || target.kind !== 'ABERTA' || target.id === stage.id) {
		return { error: 'Escolha outra etapa aberta para receber os negócios.' };
	}
	await db.$transaction([
		db.deal.updateMany({ where: { stageId: id }, data: { stageId: target.id, enteredStageAt: new Date() } }),
		db.stageRule.deleteMany({ where: { stageId: id } }),
		db.pipelineStage.delete({ where: { id } })
	]);
	// fecha o buraco na ordem
	const rest = await db.pipelineStage.findMany({ where: { area: stage.area }, orderBy: { order: 'asc' } });
	await db.$transaction(rest.map((s, idx) => db.pipelineStage.update({ where: { id: s.id }, data: { order: idx + 1 } })));
	return { ok: true };
}

// ---- listas ---------------------------------------------------------------

/**
 * Opções ativas, na ordem, para formulários e seletores. `lostLabels` inclui as
 * desativadas: negócio antigo continua mostrando o motivo que usou.
 */
export async function loadLists() {
	const rows = await db.listOption.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] });
	const pick = (kind) => rows.filter((r) => r.kind === kind && r.active).map((r) => ({ key: r.key, label: r.label }));
	const lostLabels = Object.fromEntries(rows.filter((r) => r.kind === 'MOTIVO_PERDA').map((r) => [r.key, r.label]));
	return { lostReasons: pick('MOTIVO_PERDA'), sources: pick('ORIGEM'), services: pick('SERVICO'), lostLabels };
}

export async function activeKeys(kind) {
	const rows = await db.listOption.findMany({ where: { kind, active: true }, select: { key: true } });
	return rows.map((r) => r.key);
}

export async function loadAllOptions() {
	return db.listOption.findMany({ orderBy: [{ kind: 'asc' }, { order: 'asc' }, { label: 'asc' }] });
}

export async function saveOption(user, { id, kind, label }) {
	if (!can(user, 'funil')) return denied();
	const l = text(label, 60);
	if (!l) return { error: 'Informe o nome.' };
	if (id) {
		const { count } = await db.listOption.updateMany({ where: { id }, data: { label: l } });
		return count ? { ok: true } : { error: 'Item não encontrado.' };
	}
	if (!LIST_KINDS.includes(kind)) return { error: 'Lista inválida.' };
	const last = await db.listOption.findFirst({ where: { kind }, orderBy: { order: 'desc' }, select: { order: true } });
	// Origem é guardada pelo rótulo no negócio; os demais por chave estável.
	const key = kind === 'ORIGEM' ? slug(l) : `${slug(l).toUpperCase().replace(/-/g, '_')}_${randomBytes(2).toString('hex').toUpperCase()}`;
	const exists = await db.listOption.findUnique({ where: { kind_key: { kind, key } } });
	if (exists) {
		await db.listOption.update({ where: { id: exists.id }, data: { label: l, active: true } });
		return { ok: true };
	}
	await db.listOption.create({ data: { kind, key, label: l, order: (last?.order ?? 0) + 1 } });
	return { ok: true };
}

export async function setOptionActive(user, id, active) {
	if (!can(user, 'funil')) return denied();
	const opt = await db.listOption.findUnique({ where: { id } });
	if (!opt) return { error: 'Item não encontrado.' };
	if (!active) {
		// Nunca deixar a lista sem nenhuma opção ativa: o formulário precisaria de pelo menos uma.
		const others = await db.listOption.count({ where: { kind: opt.kind, active: true, id: { not: id } } });
		if (others === 0) return { error: 'A lista precisa ter pelo menos um item ativo.' };
	}
	await db.listOption.update({ where: { id }, data: { active: !!active } });
	return { ok: true };
}

export async function moveOption(user, id, direction) {
	if (!can(user, 'funil')) return denied();
	const opt = await db.listOption.findUnique({ where: { id } });
	if (!opt) return { error: 'Item não encontrado.' };
	const list = await db.listOption.findMany({ where: { kind: opt.kind }, orderBy: [{ order: 'asc' }, { label: 'asc' }] });
	const i = list.findIndex((o) => o.id === id);
	const j = direction === 'up' ? i - 1 : i + 1;
	if (j < 0 || j >= list.length) return { ok: true };
	const next = [...list];
	[next[i], next[j]] = [next[j], next[i]];
	await db.$transaction(next.map((o, idx) => db.listOption.update({ where: { id: o.id }, data: { order: idx + 1 } })));
	return { ok: true };
}
