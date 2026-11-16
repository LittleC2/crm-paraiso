import { fail } from '@sveltejs/kit';
import { parseMoneyToCents } from '$lib/money.js';
import { AREAS, METRICS, copyPreviousGoals, currentPeriod, loadGoals, normalizePeriod, saveGoal, shiftPeriod } from '$lib/server/goals.js';

export const load = async ({ url }) => {
	const area = AREAS.includes(url.searchParams.get('area')) ? url.searchParams.get('area') : 'JARDIM';
	const period = normalizePeriod(url.searchParams.get('mes'));
	return {
		goals: await loadGoals(area, period),
		area,
		period,
		prev: shiftPeriod(period, -1),
		next: shiftPeriod(period, 1),
		isCurrent: period === currentPeriod()
	};
};

const respond = (r) => (r?.error ? fail(400, { error: r.error }) : { ok: true, copied: r.copied });

export const actions = {
	salvar: async ({ request, locals }) => {
		const f = await request.formData();
		const area = String(f.get('area'));
		const metric = String(f.get('metric'));
		const def = (METRICS[area] ?? []).find((m) => m.metric === metric);
		if (!def) return fail(400, { error: 'Meta inválida.' });
		const raw = String(f.get('value') ?? '').trim();
		// Dinheiro entra em reais e vai em centavos; horas e contagens entram como número inteiro.
		let target = def.kind === 'money' ? parseMoneyToCents(raw) : Number(raw.replace(',', '.'));
		// Valor digitado que não é número é erro, não "apagar a meta".
		if (raw !== '' && !Number.isFinite(target)) return fail(400, { error: 'Valor inválido. Use só números (ex: 20, ou 1.500,50 para dinheiro).' });
		if (def.kind === 'hours') target = Math.round(target * 60); // horas viram minutos
		return respond(await saveGoal(locals.user, { period: String(f.get('period')), area, metric, scope: String(f.get('scope') ?? 'EQUIPE'), target: raw === '' ? 0 : target }));
	},
	copiar: async ({ request, locals }) => {
		const f = await request.formData();
		return respond(await copyPreviousGoals(locals.user, { period: String(f.get('period')), area: String(f.get('area')) }));
	}
};
