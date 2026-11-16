import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { contactScope, eventScope, isAdmin, taskScope } from '$lib/server/access.js';
import { createEvent } from '$lib/server/events.js';
import {
	addDays,
	dayEnd,
	dayKey,
	dayStart,
	expandOccurrences,
	groupByDay,
	monthGrid,
	weekOf
} from '$lib/agenda.js';

const VIEWS = ['mes', 'semana', 'dia'];

export const load = async ({ url, locals }) => {
	const user = locals.user;
	const today = dayKey(new Date());
	const rawDate = url.searchParams.get('data') ?? '';
	const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
	const view = VIEWS.includes(url.searchParams.get('vista')) ? url.searchParams.get('vista') : 'mes';
	const personFilter = url.searchParams.get('pessoa') ?? '';
	const areaFilter = isAdmin(user) ? (url.searchParams.get('area') ?? '') : '';

	let weeks = [];
	let from;
	let to;
	if (view === 'mes') {
		weeks = monthGrid(date.slice(0, 7));
		from = weeks[0][0];
		to = weeks[weeks.length - 1][6];
	} else if (view === 'semana') {
		weeks = [weekOf(date)];
		from = weeks[0][0];
		to = weeks[0][6];
	} else {
		from = to = date;
	}

	const eventFilters = [eventScope(user)];
	if (personFilter) eventFilters.push({ participants: { some: { id: personFilter } } });
	if (areaFilter === 'LOJA' || areaFilter === 'JARDIM') eventFilters.push({ area: areaFilter });

	const taskFilters = [
		taskScope(user),
		{ dueDate: { gte: dayStart(from), lt: dayEnd(to) } }
	];
	if (personFilter) taskFilters.push({ assigneeId: personFilter });
	if (areaFilter === 'LOJA' || areaFilter === 'JARDIM') taskFilters.push({ area: areaFilter });

	const [events, tasks, users, contacts] = await Promise.all([
		db.event.findMany({
			where: {
				AND: [
					...eventFilters,
					{ startsAt: { lt: dayEnd(to) } },
					{
						OR: [
							{ recurrence: { not: 'NENHUMA' } },
							{ startsAt: { gte: dayStart(from) } },
							{ endsAt: { gte: dayStart(from) } }
						]
					}
				]
			},
			include: { participants: { select: { id: true, name: true } } },
			orderBy: { startsAt: 'asc' }
		}),
		db.task.findMany({
			where: { AND: taskFilters },
			select: { id: true, title: true, status: true, dueDate: true, area: true },
			orderBy: { dueDate: 'asc' }
		}),
		db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
		db.contact.findMany({ where: contactScope(user), select: { id: true, name: true }, orderBy: { name: 'asc' } })
	]);

	const occurrences = events.flatMap((e) => expandOccurrences(e, from, to));
	const eventsByDay = groupByDay(occurrences, from, to);
	for (const list of Object.values(eventsByDay)) {
		list.sort((a, b) => a.occurrenceStart - b.occurrenceStart);
	}
	const tasksByDay = {};
	for (const t of tasks) (tasksByDay[dayKey(t.dueDate)] ??= []).push(t);

	return {
		view,
		date,
		today,
		weeks,
		from,
		to,
		prev: addDays(date, view === 'mes' ? -28 : view === 'semana' ? -7 : -1),
		next: addDays(date, view === 'mes' ? 31 : view === 'semana' ? 7 : 1),
		eventsByDay,
		tasksByDay,
		users,
		contacts,
		isAdmin: isAdmin(user),
		personFilter,
		areaFilter
	};
};

export const actions = {
	criar: async ({ request, locals }) => {
		const form = await request.formData();
		const input = Object.fromEntries(form);
		input.participantIds = form.getAll('participantIds');
		const result = await createEvent(locals.user, input);
		if (result.error) return fail(400, { error: result.error });
		return { created: true };
	}
};
