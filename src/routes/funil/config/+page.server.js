import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { deleteRoute, saveRoute, setStageRule } from '$lib/server/deals.js';
import {
	createStage,
	deleteStage,
	loadAllOptions,
	loadStageConfig,
	moveOption,
	moveStage,
	saveOption,
	saveStage,
	setOptionActive
} from '$lib/server/funnelConfig.js';

export const load = async () => {
	const [stages, routes, allStages, options] = await Promise.all([
		db.pipelineStage.findMany({ where: { area: 'JARDIM', kind: 'ABERTA', key: { not: 'visita' } }, orderBy: { order: 'asc' }, include: { rule: true } }),
		db.serviceRoute.findMany({ orderBy: { name: 'asc' } }),
		loadStageConfig(),
		loadAllOptions()
	]);
	return { stages, routes, allStages, options };
};

const respond = (r) => (r?.error ? fail(400, { error: r.error }) : { ok: true });

export const actions = {
	regra: async ({ request, locals }) => {
		const form = await request.formData();
		const days = String(form.get('days') ?? '').split(/[,\s;]+/).filter(Boolean);
		return respond(await setStageRule(locals.user, String(form.get('stageId')), { active: form.get('active') === 'on', followUpDays: days }));
	},
	rota: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await saveRoute(locals.user, { id: String(form.get('id') ?? '') || null, name: form.get('name'), weekday: form.get('weekday'), neighborhoods: form.get('neighborhoods') }));
	},
	etapaSalvar: async ({ request, locals }) => {
		const f = await request.formData();
		return respond(await saveStage(locals.user, { id: String(f.get('id')), name: f.get('name'), color: f.get('color') }));
	},
	etapaCriar: async ({ request, locals }) => {
		const f = await request.formData();
		return respond(await createStage(locals.user, { area: String(f.get('area')), name: f.get('name'), color: f.get('color') }));
	},
	etapaMover: async ({ request, locals }) => {
		const f = await request.formData();
		return respond(await moveStage(locals.user, String(f.get('id')), String(f.get('direction'))));
	},
	etapaExcluir: async ({ request, locals }) => {
		const f = await request.formData();
		return respond(await deleteStage(locals.user, String(f.get('id')), String(f.get('targetId') ?? '')));
	},
	opcaoSalvar: async ({ request, locals }) => {
		const f = await request.formData();
		return respond(await saveOption(locals.user, { id: String(f.get('id') ?? '') || null, kind: String(f.get('kind') ?? ''), label: f.get('label') }));
	},
	opcaoAtivar: async ({ request, locals }) => {
		const f = await request.formData();
		return respond(await setOptionActive(locals.user, String(f.get('id')), f.get('active') === '1'));
	},
	opcaoMover: async ({ request, locals }) => {
		const f = await request.formData();
		return respond(await moveOption(locals.user, String(f.get('id')), String(f.get('direction'))));
	},
	excluirRota: async ({ request, locals }) => respond(await deleteRoute(locals.user, String((await request.formData()).get('id'))))
};
