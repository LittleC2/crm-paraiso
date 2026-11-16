// A Athenum opera em horário de Brasília (America/Sao_Paulo, UTC-3 fixo —
// o Brasil não tem mais horário de verão desde 2019, então o offset não
// varia ao longo do ano). O servidor (Railway) roda em UTC; sem isso, um
// agendamento feito às 16h pelo sócio publicaria às 16h UTC (13h em SP) ou
// interpretaria "16h" já em UTC, 3h adiantado do pretendido.
const SAO_PAULO_OFFSET = '-03:00';

/** Converte o valor de um <input type="datetime-local"> (horário de SP, sem
 * timezone) pro Date UTC correto. */
export function fromSaoPauloInputValue(value) {
	// value: "YYYY-MM-DDTHH:mm" — completa segundos e fixa o offset de SP.
	return new Date(`${value}:00${SAO_PAULO_OFFSET}`);
}

/** Converte um Date (UTC) pro formato que <input type="datetime-local">
 * espera, já convertido pro horário de SP — pra reabrir o form mostrando a
 * mesma hora que o sócio digitou. */
export function toSaoPauloInputValue(date) {
	if (!date) return '';
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Sao_Paulo',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(new Date(date));
	const get = (type) => parts.find((p) => p.type === type)?.value;
	return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
