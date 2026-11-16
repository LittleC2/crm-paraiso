import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { contactScope, isAdmin } from '$lib/server/access.js';
import { CONTACT_TYPES, createContact, importContacts } from '$lib/server/contacts.js';
import { parseContactsCsv } from '$lib/csv.js';

const PAGE_SIZE = 50;
const MAX_FILE_BYTES = 1_000_000;

export const load = async ({ url, locals }) => {
	const user = locals.user;
	const q = (url.searchParams.get('q') ?? '').trim();
	const area = url.searchParams.get('area') ?? '';
	const type = url.searchParams.get('tipo') ?? '';
	const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase();
	const page = Math.max(1, Number(url.searchParams.get('pagina')) || 1);

	const filters = [contactScope(user)];
	if (q) {
		const digits = q.replace(/\D/g, '');
		filters.push({
			OR: [
				{ name: { contains: q, mode: 'insensitive' } },
				{ email: { contains: q, mode: 'insensitive' } },
				...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])
			]
		});
	}
	if (isAdmin(user) && (area === 'LOJA' || area === 'JARDIM')) filters.push({ area });
	if (CONTACT_TYPES.includes(type)) filters.push({ type });
	if (tag) filters.push({ tags: { has: tag } });
	const where = { AND: filters };

	const [contacts, total] = await Promise.all([
		db.contact.findMany({
			where,
			orderBy: { name: 'asc' },
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE
		}),
		db.contact.count({ where })
	]);

	return {
		contacts,
		total,
		page,
		pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		filters: { q, area, type, tag },
		isAdmin: isAdmin(user)
	};
};

export const actions = {
	criar: async ({ request, locals }) => {
		const form = await request.formData();
		const result = await createContact(locals.user, Object.fromEntries(form));
		if (result.error) return fail(400, { error: result.error });
		return { created: true };
	},

	importar: async ({ request, locals }) => {
		const form = await request.formData();
		const file = form.get('arquivo');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Escolha um arquivo CSV.' });
		}
		if (file.size > MAX_FILE_BYTES) return fail(400, { error: 'Arquivo maior que 1 MB.' });
		const rows = parseContactsCsv(await file.text());
		if (rows.length === 0) {
			return fail(400, { error: 'Nenhuma linha encontrada. A primeira linha deve ter os títulos (Nome, Telefone...).' });
		}
		const report = await importContacts(locals.user, rows);
		return { report };
	}
};
