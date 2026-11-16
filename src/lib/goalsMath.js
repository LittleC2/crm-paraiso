// Contas puras das metas (mês, ritmo esperado, situação). Sem banco: testável.

/** "2026-11" válido, senão o mês atual (Brasília). */
export function currentPeriod(now = new Date()) {
	const [y, m] = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split('-');
	return `${y}-${m}`;
}
export function normalizePeriod(raw) {
	return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(raw ?? '')) ? raw : currentPeriod();
}
export function shiftPeriod(period, delta) {
	const [y, m] = period.split('-').map(Number);
	const d = new Date(Date.UTC(y, m - 1 + delta, 1));
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** [início, fim) do mês em Brasília (UTC-3, sem horário de verão). */
export function periodBounds(period) {
	const next = shiftPeriod(period, 1);
	return [new Date(`${period}-01T00:00:00-03:00`), new Date(`${next}-01T00:00:00-03:00`)];
}

/** Fração do mês já decorrida (0 a 1) em Brasília: base do "ritmo esperado". */
export function elapsedFraction(period, now = new Date()) {
	const [start, end] = periodBounds(period);
	if (now >= end) return 1;
	if (now <= start) return 0;
	return (now - start) / (end - start);
}

/** Situação em relação ao ritmo: ok, atras, muito_atras, ou sem_meta. */
export function paceStatus({ value, target, better }, fraction) {
	if (!target) return 'sem_meta';
	if (value == null) return 'sem_dado';
	if (better === 'down') return value <= target ? 'ok' : value <= target * 1.25 ? 'atras' : 'muito_atras';
	const ratio = value / target;
	if (ratio >= 1) return 'ok';
	const expected = fraction;
	if (ratio >= expected * 0.9) return 'ok';
	if (ratio >= expected * 0.6) return 'atras';
	return 'muito_atras';
}

export function median(values) {
	if (!values.length) return null;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

