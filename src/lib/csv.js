// Leitor de CSV mínimo (aspas, vírgula ou ponto e vírgula, BOM, quebra de
// linha dentro de campo entre aspas). Basta para planilhas exportadas do
// Excel/Google Sheets; não é um parser genérico.

function detectDelimiter(firstLine) {
	const semi = (firstLine.match(/;/g) ?? []).length;
	const comma = (firstLine.match(/,/g) ?? []).length;
	return semi > comma ? ';' : ',';
}

/** Linhas como arrays de células. */
export function parseCsvRows(text) {
	const src = String(text ?? '').replace(/^\uFEFF/, '');
	const delimiter = detectDelimiter(src.split(/\r?\n/, 1)[0] ?? '');
	const rows = [];
	let row = [];
	let cell = '';
	let quoted = false;

	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (quoted) {
			if (ch === '"' && src[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === delimiter) {
			row.push(cell);
			cell = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && src[i + 1] === '\n') i++;
			row.push(cell);
			cell = '';
			if (row.some((c) => c.trim() !== '')) rows.push(row);
			row = [];
		} else cell += ch;
	}
	row.push(cell);
	if (row.some((c) => c.trim() !== '')) rows.push(row);
	return rows;
}

const HEADER_ALIASES = {
	name: ['nome', 'name', 'cliente', 'contato', 'nome completo', 'full name'],
	firstName: ['primeiro nome', 'first name', 'given name'],
	lastName: ['sobrenome', 'last name', 'family name'],
	phone: ['telefone', 'celular', 'whatsapp', 'fone', 'phone', 'tel', 'phone 1 - value', 'mobile phone', 'telefone 1 - valor', 'telefone celular'],
	email: ['email', 'e-mail', 'e-mail 1 - value', 'email 1 - value', 'e-mail 1 - valor'],
	neighborhood: ['bairro'],
	city: ['cidade'],
	source: ['origem', 'source'],
	type: ['tipo', 'type'],
	tags: ['tags', 'etiquetas', 'labels', 'grupos'],
	notes: ['observacoes', 'observacao', 'notas', 'obs', 'notes'],
	optInWhatsapp: ['autorizou whatsapp', 'autorizacao', 'autorizou', 'opt-in', 'optin', 'autoriza whatsapp']
};

function normalizeHeader(h) {
	return h
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toLowerCase();
}

const TRUTHY = new Set(['sim', 's', 'x', '1', 'true', 'yes', 'y', 'verdadeiro']);

// Google Contatos junta vários telefones/e-mails com " ::: ": fica o primeiro.
const firstOf = (v) => String(v ?? '').split(':::')[0].trim();

/** Objetos {name, phone, email, ...} a partir da primeira linha como cabeçalho. */
export function parseContactsCsv(text) {
	const rows = parseCsvRows(text);
	if (rows.length < 2) return [];
	const index = {};
	rows[0].forEach((h, i) => {
		const key = normalizeHeader(h);
		for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
			if (aliases.includes(key) && index[field] == null) index[field] = i;
		}
	});
	return rows.slice(1).map((cells) => {
		const out = {};
		for (const [field, i] of Object.entries(index)) out[field] = (cells[i] ?? '').trim();
		// "Nome" e "Sobrenome" separados (CSV do Google) viram um nome só.
		if ('firstName' in out || 'lastName' in out) {
			if (!out.name) out.name = [out.firstName, out.lastName].filter(Boolean).join(' ');
			delete out.firstName;
			delete out.lastName;
		}
		if ('phone' in out) out.phone = firstOf(out.phone);
		if ('email' in out) out.email = firstOf(out.email);
		if ('optInWhatsapp' in out) out.optInWhatsapp = TRUTHY.has(normalizeHeader(out.optInWhatsapp));
		return out;
	});
}

/** vCard (.vcf, exportação do iPhone/iCloud e do Google): um contato por BEGIN:VCARD. */
export function parseVcf(text) {
	const lines = String(text ?? '')
		.replace(/^\uFEFF/, '')
		.replace(/\r?\n[ \t]/g, '') // linha dobrada continua na anterior
		.split(/\r?\n/);
	const out = [];
	let card = null;
	for (const raw of lines) {
		const line = raw.trim();
		if (/^BEGIN:VCARD/i.test(line)) card = {};
		else if (/^END:VCARD/i.test(line)) {
			if (card) {
				if (!card.name && card.structured) card.name = card.structured;
				delete card.structured;
				out.push(card);
			}
			card = null;
		} else if (card) {
			const i = line.indexOf(':');
			if (i < 0) continue;
			const key = line.slice(0, i).split(';')[0].replace(/^item\d+\./i, '').toUpperCase();
			const value = line.slice(i + 1).trim();
			if (key === 'FN' && value) card.name = value;
			else if (key === 'N' && value) card.structured = value.split(';').filter(Boolean).reverse().join(' ').trim();
			else if (key === 'TEL' && value && !card.phone) card.phone = value;
			else if (key === 'EMAIL' && value && !card.email) card.email = value;
			else if (key === 'NOTE' && value) card.notes = value.slice(0, 500);
		}
	}
	return out.filter((c) => c.name || c.phone);
}

/** Escolhe o leitor pelo nome do arquivo: .vcf lê vCard, o resto lê CSV. */
export function parseContactsFile(filename, text) {
	return /\.vcf$/i.test(String(filename ?? '')) ? parseVcf(text) : parseContactsCsv(text);
}

export const CONTACTS_TEMPLATE_CSV =
	'\uFEFFNome;Telefone;E-mail;Bairro;Cidade;Origem;Tipo;Etiquetas;Observacoes;Autorizou WhatsApp\n' +
	'Maria da Silva;(21) 99999-1111;maria@exemplo.com;Taquara;Rio de Janeiro;Instagram;CLIENTE_JARDIM;jardim vertical;Pediu orçamento de jardim;sim\n' +
	'João Pereira;(21) 98888-2222;;Recreio;Rio de Janeiro;Indicação;CLIENTE_LOJA;orquídeas;;nao\n';
