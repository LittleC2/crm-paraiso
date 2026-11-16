// Dinheiro em centavos (inteiro): evita Decimal, que não serializa no SvelteKit.

/** "1.234,56", "R$ 1500", "1234.56" -> centavos; null se vazio ou inválido. */
export function parseMoneyToCents(raw) {
	let text = String(raw ?? '').replace(/[^\d.,]/g, '');
	if (!text) return null;
	if (text.includes(',')) {
		// vírgula = decimal, pontos = milhar
		text = text.replace(/\./g, '').replace(',', '.');
	} else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
		text = text.replace(/\./g, ''); // "1.500" = mil e quinhentos
	}
	const value = Number(text);
	if (!Number.isFinite(value) || value < 0) return null;
	return Math.round(value * 100);
}

export function formatBRL(cents) {
	if (cents == null) return '';
	return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
