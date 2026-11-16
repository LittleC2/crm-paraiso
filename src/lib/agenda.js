// Calendário em horário de Brasília. Dias são strings "YYYY-MM-DD"; a conta
// de datas usa meio-dia UTC para nunca cair num dia errado (o Brasil não
// tem horário de verão desde 2019, offset fixo -03:00).
const TZ = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OCCURRENCES = 1000;

export function dayKey(date) {
	return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(date));
}

export function addDays(key, n) {
	const d = new Date(`${key}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** 0 = domingo. */
export function weekday(key) {
	return new Date(`${key}T12:00:00Z`).getUTCDay();
}

export function dayStart(key) {
	return new Date(`${key}T00:00:00-03:00`);
}

export function dayEnd(key) {
	return new Date(dayStart(key).getTime() + DAY_MS);
}

/** Semanas (domingo a sábado) que cobrem o mês `YYYY-MM`. */
export function monthGrid(monthKey) {
	const first = `${monthKey}-01`;
	let cursor = addDays(first, -weekday(first));
	const weeks = [];
	do {
		weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
		cursor = addDays(cursor, 7);
	} while (cursor.slice(0, 7) <= monthKey);
	return weeks;
}

export function weekOf(key) {
	const start = addDays(key, -weekday(key));
	return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function advance(date, recurrence) {
	const d = new Date(date);
	if (recurrence === 'DIARIA') d.setUTCDate(d.getUTCDate() + 1);
	else if (recurrence === 'SEMANAL') d.setUTCDate(d.getUTCDate() + 7);
	else d.setUTCMonth(d.getUTCMonth() + 1);
	return d;
}

/**
 * Ocorrências de um evento que tocam o intervalo [fromKey, toKey]. Evento
 * com fim em outro dia aparece em cada dia que cobre (viagens, workshops).
 * Devolve { ...evento, occurrenceStart, occurrenceEnd }.
 */
export function expandOccurrences(event, fromKey, toKey) {
	const out = [];
	const duration = event.endsAt ? new Date(event.endsAt) - new Date(event.startsAt) : 0;
	let start = new Date(event.startsAt);

	for (let i = 0; i < MAX_OCCURRENCES; i++) {
		const startKey = dayKey(start);
		if (startKey > toKey) break;
		const end = new Date(start.getTime() + duration);
		if (dayKey(end) >= fromKey) {
			out.push({ ...event, occurrenceStart: start, occurrenceEnd: end });
		}
		if (event.recurrence === 'NENHUMA') break;
		start = advance(start, event.recurrence);
	}
	return out;
}

/** Agrupa ocorrências por dia dentro de [fromKey, toKey]. */
export function groupByDay(occurrences, fromKey, toKey) {
	const days = {};
	for (const occ of occurrences) {
		const first = dayKey(occ.occurrenceStart);
		const last = dayKey(occ.occurrenceEnd);
		for (let k = first < fromKey ? fromKey : first; k <= last && k <= toKey; k = addDays(k, 1)) {
			(days[k] ??= []).push(occ);
		}
	}
	return days;
}
