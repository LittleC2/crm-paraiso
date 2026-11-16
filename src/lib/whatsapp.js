// Funções puras do WhatsApp (sem banco, sem rede): leitura do webhook da
// uazapi, opt-out e modelos de resposta. Forma dos eventos conferida contra a
// documentação da uazapi 2.6 e contra um adaptador em produção.

/** "5521973046853@s.whatsapp.net" -> "5521973046853". */
export function jidToPhone(jid) {
	return String(jid ?? '')
		.split('@')[0]
		.split(':')[0]
		.replace(/\D/g, '');
}

const STATES = {
	connected: 'CONECTADO',
	connecting: 'CONECTANDO',
	disconnected: 'DESCONECTADO',
	hibernated: 'DESCONECTADO'
};

const RECEIPTS = {
	sent: 'ENVIADA',
	delivered: 'ENTREGUE',
	read: 'LIDA',
	played: 'LIDA',
	failed: 'FALHOU',
	error: 'FALHOU'
};

export function mapState(raw) {
	return STATES[String(raw ?? '').toLowerCase()] ?? 'DESCONECTADO';
}

const MEDIA_TYPES = ['image', 'video', 'ptt', 'audio', 'document', 'sticker', 'location', 'contact'];

/**
 * Tipo normalizado da mensagem de mídia (ou null se for texto). A uazapi manda
 * `mediaType` ("image", "ptt"...) e `messageType` ("ImageMessage", "AudioMessage"...);
 * lê os dois, o primeiro que reconhecer.
 */
export function normalizeMediaType(m) {
	const raw = [m?.mediaType, m?.messageType, m?.type].map((x) => String(x ?? '').toLowerCase());
	for (const r of raw) {
		if (!r) continue;
		if (r.includes('ptt') || r.includes('voice')) return 'ptt';
		if (r.includes('sticker')) return 'sticker';
		const hit = MEDIA_TYPES.find((k) => r.includes(k));
		if (hit) return hit;
		if (r.includes('livelocation')) return 'location';
		if (r.includes('vcard') || r.includes('contactsarray')) return 'contact';
	}
	return null;
}

const num = (v) => {
	const n = Number(v);
	return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** Dados do arquivo (mime, nome, tamanho, duração) do objeto da mensagem, tolerante a variações. */
export function mediaDetails(m) {
	const c = m?.content && typeof m.content === 'object' ? m.content : {};
	const name = m?.fileName ?? c.fileName ?? c.title ?? c.name;
	return {
		mime: String(c.mimetype ?? m?.mimetype ?? '').slice(0, 100) || null,
		name: name ? String(name).slice(0, 200) : null,
		size: num(c.fileLength ?? m?.fileLength ?? c.size),
		seconds: num(c.seconds ?? c.duration ?? m?.seconds)
	};
}

/** Uma mensagem do WhatsApp no formato do CRM; null se não tiver id. */
function parseMessageObject(raw) {
	const m = raw && typeof raw.message === 'object' && raw.message && !raw.messageid && !raw.id ? raw.message : raw;
	if (!m || typeof m !== 'object') return null;
	const id = String(m.messageid ?? m.id ?? '');
	if (!id) return null;
	const chat = String(m.chatid ?? m.sender ?? '');
	const ts = Number(m.messageTimestamp);
	const text = typeof m.text === 'string' ? m.text.trim() : '';
	return {
		externalId: id,
		phone: jidToPhone(chat),
		name: m.senderName ? String(m.senderName).trim().slice(0, 120) : null,
		text,
		// legenda (text) pode acompanhar a mídia; sem tipo reconhecido e sem texto vira "other"
		mediaType: normalizeMediaType(m) ?? (text ? null : 'other'),
		media: mediaDetails(m),
		fromMe: Boolean(m.fromMe),
		sentByApi: Boolean(m.wasSentByApi),
		isGroup: Boolean(m.isGroup) || chat.endsWith('@g.us'),
		// a doc diz milissegundos; se vier em segundos (10 dígitos), converte
		at: Number.isFinite(ts) && ts > 0 ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(),
		hasTimestamp: Number.isFinite(ts) && ts > 0
	};
}

/**
 * Traduz o corpo do webhook para um evento do CRM. Nunca lança: payload
 * estranho vira { type: 'ignored' }.
 * @returns {{type:'message', message:object} | {type:'history', messages:object[]} | {type:'status', ids:string[], status:string} | {type:'connection', state:string} | {type:'ignored', reason:string}}
 */
export function parseWebhook(body) {
	const b = body && typeof body === 'object' ? body : {};
	const eventType = String(b.EventType ?? '');

	if (eventType === 'messages') {
		const m = b.message;
		if (!m || typeof m !== 'object') return { type: 'ignored', reason: 'messages sem message' };
		const message = parseMessageObject(m);
		if (!message) return { type: 'ignored', reason: 'mensagem sem id' };
		return { type: 'message', message };
	}

	// Histórico pedido ao celular (POST /message/history-sync) ou enviado na conexão.
	// O formato exato não está na documentação: o leitor aceita lista ou item único
	// em qualquer um dos campos usuais, com os mesmos campos de uma mensagem normal.
	if (eventType === 'history') {
		const pool = [b.messages, b.history, b.message, b.data, b.event?.messages, b.event?.history];
		const list = pool.flatMap((x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? [x] : []));
		// Histórico sem data válida seria gravado como "agora": descarta.
		const messages = list.map(parseMessageObject).filter((m) => m && m.hasTimestamp);
		if (!messages.length) return { type: 'ignored', reason: 'history sem mensagens' };
		return { type: 'history', messages };
	}

	if (eventType === 'messages_update') {
		const e = b.event && typeof b.event === 'object' ? b.event : {};
		const ids = Array.isArray(e.MessageIDs) ? e.MessageIDs.map(String).filter(Boolean) : [];
		const raw = String(b.state ?? e.Type ?? '').toLowerCase();
		const status = RECEIPTS[raw];
		if (!ids.length || !status) return { type: 'ignored', reason: `recibo sem id ou estado (${raw || 'vazio'})` };
		return { type: 'status', ids, status };
	}

	if (eventType === 'connection') {
		const raw = b.instance?.status ?? b.status ?? b.state;
		// Evento sem estado reconhecível não derruba o número como desconectado.
		if (raw == null || raw === '') return { type: 'ignored', reason: 'connection sem estado' };
		return { type: 'connection', state: mapState(raw) };
	}

	return { type: 'ignored', reason: `evento ${eventType || 'sem EventType'}` };
}

const STATUS_RANK = { RECEBIDA: 0, ENVIANDO: 1, ENVIADA: 2, ENTREGUE: 3, LIDA: 4 };

/** Recibos chegam fora de ordem: só avança; FALHOU só vale antes de entregar. */
export function nextStatus(current, incoming) {
	if (incoming === 'FALHOU') return STATUS_RANK[current] !== undefined && STATUS_RANK[current] < STATUS_RANK.ENTREGUE ? 'FALHOU' : current;
	if (current === 'FALHOU') return incoming;
	return (STATUS_RANK[incoming] ?? -1) > (STATUS_RANK[current] ?? -1) ? incoming : current;
}

/** "PARAR", "sair", "cancelar"... como mensagem inteira: o contato não quer mais receber. */
export function isOptOut(text) {
	return /^\s*(parar|pare|sair|cancelar|descadastrar|stop)\s*[.!]*\s*$/i.test(String(text ?? ''));
}

/** Preenche {nome} e {atendente} em respostas rápidas. */
export function renderTemplate(body, { nome = '', atendente = '' } = {}) {
	const first = String(nome).trim().split(/\s+/)[0] ?? '';
	return String(body)
		.replaceAll('{nome}', first)
		.replaceAll('{atendente}', String(atendente).trim().split(/\s+/)[0] ?? '');
}
