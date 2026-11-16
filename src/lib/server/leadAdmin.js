// Aba Integrações de /ajustes: integrações de leads (planilha do Google). Só admin;
// cada ação confere a permissão porque a tela de Ajustes é aberta a todos.
import { fail } from '@sveltejs/kit';
import { db } from './db.js';
import { can } from './access.js';
import { buildAppsScript } from '../appsScript.js';
import { LEAD_FIELDS } from '../leadMapping.js';
import { deleteTests, hashKey, newKey, sendTest } from './leadIntake.js';

const endpoint = (origin, id) => `${origin}/api/leads/sheets?i=${id}`;

export async function loadLeadAdmin(user, url) {
	if (!can(user, 'integracoes')) return null;
	const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
	const [integrations, stages, options] = await Promise.all([
		db.leadIntegration.findMany({ orderBy: { createdAt: 'asc' }, omit: { secretHash: true } }),
		db.pipelineStage.findMany({ where: { area: 'JARDIM', kind: 'ABERTA' }, orderBy: { order: 'asc' }, select: { id: true, name: true } }),
		db.listOption.findMany({ where: { kind: { in: ['ORIGEM', 'SERVICO'] }, active: true }, orderBy: { order: 'asc' }, select: { kind: true, key: true, label: true } })
	]);
	const withStats = await Promise.all(
		integrations.map(async (i) => {
			const [byStatus, recent] = await Promise.all([
				db.leadIntake.groupBy({ by: ['status'], where: { integrationId: i.id, createdAt: { gte: monthStart } }, _count: true }),
				db.leadIntake.findMany({ where: { integrationId: i.id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, status: true, reason: true, name: true, phone: true, createdAt: true } })
			]);
			return { ...i, endpoint: endpoint(url.origin, i.id), month: Object.fromEntries(byStatus.map((s) => [s.status, s._count])), recent };
		})
	);
	return {
		integrations: withStats,
		stages,
		origins: options.filter((o) => o.kind === 'ORIGEM'),
		services: options.filter((o) => o.kind === 'SERVICO'),
		fields: LEAD_FIELDS.map((f) => ({ key: f.key, label: f.label }))
	};
}

const adminOnly = (fn) => async (event) => {
	if (!can(event.locals.user, 'integracoes')) return fail(403, { leadError: 'Sem permissão.' });
	const form = await event.request.formData();
	return fn({ ...event, form });
};
const text = (form, name, max = 120) => String(form.get(name) ?? '').trim().slice(0, max);
const find = (form) => db.leadIntegration.findUnique({ where: { id: text(form, 'id', 40) } });

export const leadActions = {
	leadCriar: adminOnly(async ({ form, locals, url }) => {
		const name = text(form, 'name', 60);
		if (!name) return fail(400, { leadError: 'Dê um nome à integração.' });
		if (await db.leadIntegration.findUnique({ where: { name } })) return fail(400, { leadError: 'Já existe uma integração com esse nome.' });
		const key = newKey();
		const created = await db.leadIntegration.create({ data: { name, secretHash: hashKey(key), ownerId: locals.user.id } });
		// A chave só aparece agora; no banco fica só o hash.
		return { leadKey: key, leadScript: buildAppsScript({ url: endpoint(url.origin, created.id), key }), leadFor: created.id };
	}),

	leadSalvar: adminOnly(async ({ form }) => {
		const integration = await find(form);
		if (!integration) return fail(404, { leadError: 'Integração não encontrada.' });
		const mapping = {};
		for (const f of LEAD_FIELDS) {
			const col = text(form, `map_${f.key}`, 80);
			if (col) mapping[f.key] = col;
		}
		const stageId = text(form, 'stageId', 40);
		const stage = stageId ? await db.pipelineStage.findFirst({ where: { id: stageId, area: 'JARDIM', kind: 'ABERTA' } }) : null;
		await db.leadIntegration.update({
			where: { id: integration.id },
			data: { mapping, stageId: stage?.id ?? null, defaultSource: text(form, 'defaultSource', 60) || null, defaultService: text(form, 'defaultService', 40) || null }
		});
		return { leadOk: 'Salvo.' };
	}),

	leadChave: adminOnly(async ({ form, url }) => {
		const integration = await find(form);
		if (!integration) return fail(404, { leadError: 'Integração não encontrada.' });
		const key = newKey();
		await db.leadIntegration.update({ where: { id: integration.id }, data: { secretHash: hashKey(key) } });
		return { leadKey: key, leadScript: buildAppsScript({ url: endpoint(url.origin, integration.id), key }), leadFor: integration.id };
	}),

	leadAtivo: adminOnly(async ({ form }) => {
		const integration = await find(form);
		if (!integration) return fail(404, { leadError: 'Integração não encontrada.' });
		const on = form.get('active') === '1';
		// Nasce desligada: só liga depois de uma chegada (teste ou linha real) ter dado certo.
		if (on && !(await db.leadIntake.findFirst({ where: { integrationId: integration.id, status: 'CRIADO' }, select: { id: true } }))) {
			return fail(400, { leadError: 'Envie um lead de teste antes de ligar.', leadFor: integration.id });
		}
		await db.leadIntegration.update({ where: { id: integration.id }, data: { active: on } });
		return { leadOk: on ? 'Integração ligada.' : 'Integração desligada.' };
	}),

	leadTeste: adminOnly(async ({ form }) => {
		const integration = await find(form);
		if (!integration) return fail(404, { leadError: 'Integração não encontrada.' });
		const r = await sendTest(integration);
		return r.status === 'CRIADO' ? { leadOk: 'Lead de teste criado no funil (veja a primeira etapa).' } : fail(400, { leadError: `Teste: ${r.status}${r.reason ? ` — ${r.reason}` : ''}`, leadFor: integration.id });
	}),

	leadApagarTestes: adminOnly(async () => {
		const { removed } = await deleteTests();
		return { leadOk: removed ? `${removed} lead(s) de teste apagado(s).` : 'Nenhum lead de teste.' };
	}),

	leadExcluir: adminOnly(async ({ form }) => {
		const integration = await find(form);
		if (!integration) return fail(404, { leadError: 'Integração não encontrada.' });
		await db.leadIntegration.delete({ where: { id: integration.id } });
		return { leadOk: 'Integração removida.' };
	})
};
