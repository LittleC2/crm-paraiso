import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { contactScope } from '$lib/server/access.js';
import { completeVisit, createContract, setContractStatus } from '$lib/server/deals.js';

export const load = async ({ locals }) => {
	const [contracts, contacts] = await Promise.all([
		db.maintenanceContract.findMany({
			include: { contact: { select: { id: true, name: true } } },
			orderBy: [{ status: 'asc' }, { nextVisitAt: 'asc' }]
		}),
		db.contact.findMany({
			where: { AND: [contactScope(locals.user), { area: 'JARDIM' }] },
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		})
	]);
	const active = contracts.filter((c) => c.status === 'ATIVO');
	return {
		contracts,
		contacts,
		monthlyRecurringCents: active.reduce((sum, c) => sum + c.monthlyValueCents, 0)
	};
};

const respond = (r, ok = { ok: true }) => (r?.error ? fail(400, { error: r.error }) : ok);

export const actions = {
	criar: async ({ request, locals }) => respond(await createContract(locals.user, Object.fromEntries(await request.formData())), { created: true }),
	visitaFeita: async ({ request, locals }) => respond(await completeVisit(locals.user, String((await request.formData()).get('id')))),
	status: async ({ request, locals }) => {
		const form = await request.formData();
		return respond(await setContractStatus(locals.user, String(form.get('id')), String(form.get('status'))));
	}
};
