// Telefone: guardado só com dígitos e DDI (ex: 5521964088063). Funções puras,
// usadas no servidor (gravar/comparar) e na UI (exibir, link do WhatsApp).

/** Devolve só dígitos com DDI, ou null se não parecer um telefone. */
export function normalizePhone(raw) {
	if (raw == null) return null;
	const text = String(raw).trim();
	let digits = text.replace(/\D/g, '');
	// "+" ou "00" na frente = DDI explícito: nunca presumir Brasil.
	const international = text.startsWith('+') || digits.startsWith('00');
	if (digits.startsWith('00')) digits = digits.slice(2);
	// Número brasileiro sem DDI (DDD + 8 ou 9 dígitos): assume Brasil.
	if (!international && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
	// E.164 vai de 8 a 15 dígitos; abaixo de 12 só vale se já veio com DDI estrangeiro.
	if (digits.length < 11 || digits.length > 15) return null;
	return digits;
}

/** "+55 (21) 96408-8063" para exibição; outros países saem como "+<dígitos>". */
export function formatPhone(phone) {
	if (!phone) return '';
	const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
	if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
	return `+${phone}`;
}

export function waLink(phone, text) {
	if (!phone) return null;
	const base = `https://wa.me/${phone}`;
	return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
