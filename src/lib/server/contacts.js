// Base de dados de contatos. Toda leitura e escrita passa por contactScope:
// equipe da loja só enxerga e altera a área LOJA.
import { db } from './db.js';
import { allowedArea, contactScope, isAdmin } from './access.js';
import { normalizePhone } from '../phone.js';

export const CONTACT_TYPES = ['CLIENTE_LOJA', 'CLIENTE_JARDIM', 'PARCEIRO', 'FORNECEDOR'];
export const TYPE_LABEL = {
	CLIENTE_LOJA: 'Cliente da loja',
	CLIENTE_JARDIM: 'Cliente de jardim',
	PARCEIRO: 'Parceiro',
	FORNECEDOR: 'Fornecedor'
};
const MAX_IMPORT_ROWS = 2000;

function clean(value, max) {
	const v = String(value ?? '').trim();
	return v ? v.slice(0, max) : null;
}

function parseTags(raw) {
	const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,;|]/);
	const tags = list.map((t) => String(t).trim().toLowerCase().slice(0, 30)).filter(Boolean);
	return [...new Set(tags)].slice(0, 10);
}

/** Valida e normaliza a entrada de formulário/CSV. Devolve { data } ou { error }. */
export function sanitizeContactInput(user, input) {
	const name = clean(input.name, 120);
	if (!name) return { error: 'Nome é obrigatório.' };

	let phone = null;
	if (clean(input.phone, 40)) {
		phone = normalizePhone(input.phone);
		if (!phone) return { error: 'Telefone inválido.' };
	}

	const area = allowedArea(user, input.area);
	let type = CONTACT_TYPES.includes(input.type)
		? input.type
		: area === 'JARDIM'
			? 'CLIENTE_JARDIM'
			: 'CLIENTE_LOJA';
	// Equipe da loja não cria cliente de jardim.
	if (!isAdmin(user) && type === 'CLIENTE_JARDIM') type = 'CLIENTE_LOJA';

	return {
		data: {
			name,
			phone,
			email: clean(input.email, 120),
			area,
			type,
			neighborhood: clean(input.neighborhood, 80),
			city: clean(input.city, 80),
			source: clean(input.source, 60),
			tags: parseTags(input.tags),
			notes: clean(input.notes, 2000),
			optInWhatsapp: input.optInWhatsapp === true || input.optInWhatsapp === 'on'
		}
	};
}

/** Procura outro contato com o mesmo telefone, só dentro do escopo do usuário. */
export function findByPhone(user, phone, excludeId) {
	if (!phone) return null;
	return db.contact.findFirst({
		where: { AND: [contactScope(user), { phone }, excludeId ? { id: { not: excludeId } } : {}] },
		select: { id: true, name: true }
	});
}

export async function createContact(user, input) {
	const parsed = sanitizeContactInput(user, input);
	if (parsed.error) return parsed;
	const dup = await findByPhone(user, parsed.data.phone);
	if (dup) return { error: `Já existe um contato com esse telefone: ${dup.name}.`, duplicateId: dup.id };
	const contact = await db.contact.create({ data: { ...parsed.data, createdById: user.id } });
	return { contact };
}

export async function updateContact(user, id, input) {
	const existing = await db.contact.findFirst({ where: { id, ...contactScope(user) } });
	if (!existing) return { error: 'Contato não encontrado.', notFound: true };
	// Área só muda pelo admin; sanitize já força LOJA para a equipe da loja,
	// então mantemos a área original quando quem edita não é admin.
	const parsed = sanitizeContactInput(user, { ...input, area: isAdmin(user) ? input.area : existing.area });
	if (parsed.error) return parsed;
	const dup = await findByPhone(user, parsed.data.phone, id);
	if (dup) return { error: `Já existe um contato com esse telefone: ${dup.name}.` };
	const contact = await db.contact.update({ where: { id }, data: parsed.data });
	return { contact };
}

export async function deleteContact(user, id) {
	try {
		const { count } = await db.contact.deleteMany({ where: { id, ...contactScope(user) } });
		return { count };
	} catch (err) {
		// P2003: contato com negócios (relação Restrict). Não apaga histórico comercial.
		if (err?.code === 'P2003' || /foreign key/i.test(String(err?.message))) {
			return { error: 'Este contato tem negócios no funil. Exclua ou conclua os negócios antes.' };
		}
		throw err;
	}
}

/**
 * Importa linhas de CSV. Pula linhas sem nome, telefone inválido e duplicatas
 * (no banco, dentro do escopo, e dentro do próprio arquivo).
 */
export async function importContacts(user, rows, { area, dryRun = false } = {}) {
	const limited = rows.slice(0, MAX_IMPORT_ROWS);
	const report = { created: 0, duplicates: 0, invalid: 0, truncated: rows.length > MAX_IMPORT_ROWS, problems: [], samples: [], dryRun };

	const existing = await db.contact.findMany({
		where: { AND: [contactScope(user), { phone: { not: null } }] },
		select: { phone: true }
	});
	const seen = new Set(existing.map((c) => c.phone));
	const toCreate = [];

	limited.forEach((row, i) => {
		// A área escolhida na tela vale para o arquivo todo (a equipe da loja é forçada para LOJA).
		const parsed = sanitizeContactInput(user, area ? { ...row, area } : row);
		if (parsed.error) {
			report.invalid++;
			if (report.problems.length < 10) report.problems.push(`Linha ${i + 2}: ${parsed.error}`);
			return;
		}
		const { phone } = parsed.data;
		if (phone && seen.has(phone)) {
			report.duplicates++;
			return;
		}
		if (phone) seen.add(phone);
		toCreate.push({ ...parsed.data, createdById: user.id });
		if (report.samples.length < 5) report.samples.push({ name: parsed.data.name, phone: parsed.data.phone, neighborhood: parsed.data.neighborhood });
	});

	if (dryRun) {
		report.created = toCreate.length; // quantos seriam criados
	} else if (toCreate.length) {
		await db.contact.createMany({ data: toCreate });
		report.created = toCreate.length;
	}
	return report;
}
