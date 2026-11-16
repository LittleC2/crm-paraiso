// Leitura de uma linha de planilha: acha cada campo do CRM pelos nomes de coluna mais
// comuns (formulário do Google, Meta Lead Ads, planilhas manuais) ou pelo mapeamento
// que a pessoa definiu. Funções puras.

export const LEAD_FIELDS = [
	{ key: 'name', label: 'Nome', aliases: ['nome', 'nomecompleto', 'fullname', 'name', 'cliente', 'nomedocliente', 'seunome'] },
	{ key: 'phone', label: 'Telefone / WhatsApp', aliases: ['telefone', 'whatsapp', 'celular', 'phone', 'phonenumber', 'fone', 'tel', 'seuwhatsapp', 'numero', 'contato'] },
	{ key: 'email', label: 'E-mail', aliases: ['email', 'emailaddress', 'mail', 'seuemail'] },
	{ key: 'neighborhood', label: 'Bairro', aliases: ['bairro', 'neighborhood', 'regiao', 'localidade'] },
	{ key: 'source', label: 'Origem', aliases: ['origem', 'source', 'fonte', 'canal', 'utmsource', 'platform'] },
	{ key: 'service', label: 'Serviço', aliases: ['servico', 'service', 'tipodeservico', 'interesse', 'oquevocebusca'] },
	{ key: 'message', label: 'Mensagem / observação', aliases: ['mensagem', 'message', 'observacao', 'observacoes', 'obs', 'comentario', 'descricao', 'detalhes', 'duvida'] },
	{ key: 'value', label: 'Valor estimado', aliases: ['valor', 'orcamento', 'budget', 'value'] },
	{ key: 'campaign', label: 'Campanha', aliases: ['campanha', 'campaign', 'utmcampaign', 'campaignname', 'anuncio', 'adname', 'formname'] }
];

/** Minúsculas, sem acento, só letras e números: "Nome Completo" -> "nomecompleto". */
export function norm(text) {
	return String(text ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/** { campoDoCrm: "Nome da coluna" } para os cabeçalhos dados (o primeiro que combinar). */
export function detectMapping(headers) {
	const used = new Set();
	const out = {};
	for (const field of LEAD_FIELDS) {
		const header = headers.find((h) => !used.has(h) && field.aliases.includes(norm(h)));
		if (header) {
			out[field.key] = header;
			used.add(header);
		}
	}
	return out;
}

/** Extrai os campos do CRM de { coluna: valor }. Mapeamento explícito vale; o resto é detectado. */
export function extractFields(row, mapping = {}) {
	const headers = Object.keys(row ?? {});
	const auto = detectMapping(headers);
	const out = {};
	for (const field of LEAD_FIELDS) {
		const header = mapping[field.key] && headers.includes(mapping[field.key]) ? mapping[field.key] : auto[field.key];
		const raw = header ? row[header] : undefined;
		out[field.key] = raw == null ? '' : String(raw).trim();
	}
	return out;
}
