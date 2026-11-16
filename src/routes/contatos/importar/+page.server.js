import { fail } from '@sveltejs/kit';
import { parseContactsFile } from '$lib/csv.js';
import { isAdmin } from '$lib/server/access.js';
import { importContacts } from '$lib/server/contacts.js';

const MAX_CHARS = 1_500_000;

export const load = ({ locals }) => ({ isAdmin: isAdmin(locals.user) });

// A prévia e a importação leem o mesmo texto: o navegador lê o arquivo uma vez e manda nos dois passos.
async function run(request, locals, dryRun) {
	const form = await request.formData();
	const texto = String(form.get('texto') ?? '');
	const filename = String(form.get('nome') ?? '');
	if (!texto.trim()) return fail(400, { error: 'Escolha um arquivo primeiro.' });
	if (texto.length > MAX_CHARS) return fail(400, { error: 'Arquivo grande demais (máximo 1 MB). Divida em partes.' });
	const rows = parseContactsFile(filename, texto);
	if (rows.length === 0) {
		return fail(400, { error: 'Nenhum contato encontrado. Confira se a primeira linha tem os títulos (Nome, Telefone...) ou use o modelo.' });
	}
	const area = String(form.get('area') ?? '');
	const report = await importContacts(locals.user, rows, { area: area === 'JARDIM' || area === 'LOJA' ? area : undefined, dryRun });
	return dryRun ? { preview: report, total: rows.length } : { done: report };
}

export const actions = {
	previa: ({ request, locals }) => run(request, locals, true),
	importar: ({ request, locals }) => run(request, locals, false)
};
