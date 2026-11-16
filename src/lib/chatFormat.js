// Formatação da janela de conversa (horários, dia, tamanho, duração, prévia de mídia).
const TZ = 'America/Sao_Paulo';

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));

export const clock = (d) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** "Hoje", "Ontem", dia da semana (últimos 6 dias) ou data. */
export function dayLabel(d, now = new Date()) {
	const key = dayKey(d);
	if (key === dayKey(now)) return 'Hoje';
	if (key === dayKey(new Date(now.getTime() - 86_400_000))) return 'Ontem';
	const days = (new Date(`${dayKey(now)}T12:00:00`) - new Date(`${key}T12:00:00`)) / 86_400_000;
	if (days > 0 && days < 7) return new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long' });
	return new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Agrupa mensagens por dia (em ordem). */
export function groupByDay(messages) {
	const groups = [];
	for (const m of messages) {
		const key = dayKey(m.sentAt);
		const last = groups.at(-1);
		if (last?.key === key) last.items.push(m);
		else groups.push({ key, label: dayLabel(m.sentAt), items: [m] });
	}
	return groups;
}

export function formatSize(bytes) {
	if (!bytes && bytes !== 0) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function formatDuration(seconds) {
	const s = Math.max(0, Math.round(Number(seconds) || 0));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const MEDIA_LABEL = {
	image: 'Foto',
	video: 'Vídeo',
	audio: 'Áudio',
	ptt: 'Mensagem de voz',
	document: 'Documento',
	sticker: 'Figurinha',
	location: 'Localização',
	contact: 'Contato',
	other: 'Mídia'
};

export const mediaLabel = (type) => MEDIA_LABEL[type] ?? 'Mídia';

/** Texto curto de uma mensagem para a lista de conversas e prévias. */
export function previewText(m) {
	if (!m) return '';
	const who = m.kind === 'NOTA' ? 'Nota: ' : m.direction === 'SAIDA' ? 'Você: ' : '';
	if (m.kind === 'MIDIA' && m.mediaType) {
		const label = mediaLabel(m.mediaType) + ((m.mediaType === 'audio' || m.mediaType === 'ptt') && m.mediaSeconds ? ` ${formatDuration(m.mediaSeconds)}` : '');
		return who + label + (m.body ? `: ${m.body}` : '');
	}
	return who + (m.body ?? '');
}

/** Ícone de tique: 'clock' | 'sent' | 'delivered' | 'read' | 'failed' | null (mensagem recebida). */
export function tickState(m) {
	if (m.direction !== 'SAIDA' || m.kind === 'NOTA') return null;
	return { ENVIANDO: 'clock', ENVIADA: 'sent', ENTREGUE: 'delivered', LIDA: 'read', FALHOU: 'failed' }[m.status] ?? 'sent';
}
