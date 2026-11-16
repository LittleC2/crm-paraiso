// Carregamento e ações compartilhados entre /funil (JARDIM) e /pedidos (LOJA).
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from './db.js';
import { isAdmin } from './access.js';
import { CARD_FIELDS, normalizePrefs } from '../boardPrefs.js';
import {
	addInteraction,
	assignToMe,
	boardAllowed,
	createDeal,
	deleteDeal,
	deleteDealsInStage,
	loadBoard,
	loadDeal,
	loseDeal,
	moveDealToStage,
	placeDeals,
	scheduleVisit,
	updateDeal
} from './deals.js';
import { isInRoute, scoreDeal, staleLevel } from '../qualification.js';
import { fromSaoPauloInputValue } from '../timezone.js';
import { loadLists } from './funnelConfig.js';

function respond(result, ok = { ok: true }) {
	return result?.error ? fail(result.notFound ? 404 : 400, { error: result.error }) : ok;
}

export function boardLoad(area) {
	return async ({ locals }) => {
		const board = await loadBoard(locals.user, area);
		if (!board) throw error(403, 'Sem permissão.');
		const stageById = new Map(board.stages.map((s) => [s.id, s]));
		const deals = board.deals.map((d) => {
			const kind = stageById.get(d.stageId)?.kind ?? 'ABERTA';
			const inRoute = area === 'JARDIM' ? isInRoute(d.neighborhood, board.routes) : null;
			return {
				...d,
				stale: staleLevel(d.enteredStageAt, kind),
				level: area === 'JARDIM' ? scoreDeal(d, { inRoute }).level : null,
				outOfRoute: inRoute === false
			};
		});
		return {
			area,
			stages: board.stages,
			deals,
			users: board.users,
			lists: board.lists,
			me: { id: locals.user.id },
			canConfig: isAdmin(locals.user),
			prefs: normalizePrefs(locals.user.boardPrefs)
		};
	};
}

export function boardActions(area) {
	return {
		criar: async ({ request, locals }) => {
			const form = await request.formData();
			return respond(await createDeal(locals.user, area, Object.fromEntries(form)), { created: true });
		},
		prefs: async ({ request, locals }) => {
			const form = await request.formData();
			const prefs = Object.fromEntries(CARD_FIELDS.map((f) => [f.key, form.get(f.key) === 'on']));
			await db.user.update({ where: { id: locals.user.id }, data: { boardPrefs: prefs } });
			return { ok: true };
		},
		excluirEtapa: async ({ request, locals }) => {
			const form = await request.formData();
			return respond(await deleteDealsInStage(locals.user, String(form.get('stageId'))));
		},
		posicionar: async ({ request, locals }) => {
			const form = await request.formData();
			return respond(await placeDeals(locals.user, String(form.get('stageId')), form.getAll('dealIds').map(String)));
		}
	};
}

export function detailLoad(area) {
	return async ({ params, locals }) => {
		if (!boardAllowed(locals.user, area)) throw error(403, 'Sem permissão.');
		const deal = await loadDeal(locals.user, params.id);
		if (!deal || deal.area !== area) throw error(404, 'Negócio não encontrado.');
		const [stages, users, routes, lists] = await Promise.all([
			db.pipelineStage.findMany({ where: { area }, orderBy: { order: 'asc' } }),
			db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
			area === 'JARDIM' ? db.serviceRoute.findMany() : [],
			loadLists()
		]);
		const inRoute = area === 'JARDIM' ? isInRoute(deal.neighborhood, routes) : null;
		return {
			area,
			deal,
			lists,
			stages,
			users,
			inRoute,
			quality: area === 'JARDIM' ? scoreDeal(deal, { inRoute }) : null
		};
	};
}

export const detailActions = {
	salvar: async ({ request, params, locals }) => {
		const form = await request.formData();
		return respond(await updateDeal(locals.user, params.id, Object.fromEntries(form)), { saved: true });
	},
	mover: async ({ request, params, locals }) => {
		const form = await request.formData();
		return respond(await moveDealToStage(locals.user, params.id, String(form.get('stageId'))));
	},
	perder: async ({ request, params, locals }) => {
		const form = await request.formData();
		return respond(await loseDeal(locals.user, params.id, String(form.get('reason')), form.get('note')));
	},
	excluir: async ({ params, locals }) => {
		const r = await deleteDeal(locals.user, params.id);
		if (r.error) return respond(r);
		throw redirect(303, r.area === 'JARDIM' ? '/funil' : '/pedidos');
	},
	assumir: async ({ params, locals }) => respond(await assignToMe(locals.user, params.id)),
	nota: async ({ request, params, locals }) => {
		const form = await request.formData();
		return respond(await addInteraction(locals.user, params.id, String(form.get('kind')), form.get('body')), { noted: true });
	},
	visita: async ({ request, params, locals }) => {
		const form = await request.formData();
		const raw = String(form.get('startsAt') ?? '');
		if (!raw) return fail(400, { error: 'Informe data e hora da visita.' });
		return respond(
			await scheduleVisit(locals.user, params.id, { startsAt: fromSaoPauloInputValue(raw), location: form.get('location') }),
			{ visited: true }
		);
	}
};
