import { fail } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/access.js';
import { loadHome } from '$lib/server/homeData.js';
import { createTask, setTaskStatus } from '$lib/server/tasks.js';
import { fromSaoPauloInputValue } from '$lib/timezone.js';

// Limites do dia no horário de Brasília, não do servidor (que roda em UTC).
function todayBoundsSaoPaulo() {
	const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
		new Date()
	);
	const start = fromSaoPauloInputValue(`${day}T00:00`);
	return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export const load = async ({ locals }) => {
	const user = locals.user;
	const home = await loadHome(user, todayBoundsSaoPaulo());
	return { user: { name: user.name }, isAdmin: isAdmin(user), ...home };
};

export const actions = {
	criarTarefaRapida: async ({ request, locals }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Título é obrigatório.' });
		await createTask(locals.user, { title, assigneeId: locals.user.id });
		return { created: true };
	},

	concluir: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'id ausente.' });
		const updated = await setTaskStatus(locals.user, id, 'FEITO');
		if (!updated) return fail(404, { error: 'Tarefa não encontrada.' });
		return { done: true };
	}
};
