// Busca leve de contatos para formulários (novo lead, nova conversa).
// Escopo por contactScope; devolve também o que o negócio mais recente do
// contato (mesma área) já sabe, para pré-preencher o formulário.
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { contactScope, dealScope } from '$lib/server/access.js';

export const GET = async ({ url, locals }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const area = url.searchParams.get('area');
	if (q.length < 2) return json({ contacts: [] });
	const digits = q.replace(/\D/g, '');

	const contacts = await db.contact.findMany({
		where: {
			AND: [
				contactScope(locals.user),
				area === 'JARDIM' || area === 'LOJA' ? { area } : {},
				{
					OR: [
						{ name: { contains: q, mode: 'insensitive' } },
						...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])
					]
				}
			]
		},
		select: { id: true, name: true, phone: true, neighborhood: true, source: true, area: true, optInWhatsapp: true },
		orderBy: { name: 'asc' },
		take: 8
	});

	const deals = contacts.length
		? await db.deal.findMany({
				where: { AND: [dealScope(locals.user), { contactId: { in: contacts.map((c) => c.id) } }, area ? { area } : {}] },
				orderBy: { createdAt: 'desc' },
				select: { contactId: true, serviceType: true, spaceType: true, address: true, squareMeters: true, neighborhood: true, source: true }
			})
		: [];
	const latest = new Map();
	for (const d of deals) if (!latest.has(d.contactId)) latest.set(d.contactId, d);

	return json({
		contacts: contacts.map((c) => {
			const d = latest.get(c.id);
			return {
				...c,
				neighborhood: c.neighborhood ?? d?.neighborhood ?? '',
				source: c.source ?? d?.source ?? '',
				serviceType: d?.serviceType ?? '',
				spaceType: d?.spaceType ?? '',
				address: d?.address ?? '',
				squareMeters: d?.squareMeters ?? ''
			};
		})
	});
};
