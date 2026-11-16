// Qualificação do negócio de jardim por sinais com pontos (não é "score
// inventado": cada ponto vem de um fato registrado). Pesos fixos aqui por
// enquanto; ficam em um lugar só para virarem editáveis depois.
import { addDays, dayKey, dayStart } from './agenda.js';

export const SIGNAL_POINTS = {
	squareMeters: 30,
	hasPhotos: 20,
	address: 15,
	askedQuote: 20,
	inRoute: 15
};
export const HOT_FROM = 70;
export const WARM_FROM = 40;

export const SIGNAL_LABEL = {
	squareMeters: 'Informou a metragem',
	hasPhotos: 'Enviou fotos do espaço',
	address: 'Deixou o endereço',
	askedQuote: 'Pediu orçamento específico',
	inRoute: 'Bairro dentro da rota'
};

function normalize(text) {
	return String(text ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toLowerCase();
}

/**
 * true/false se o bairro está em alguma rota; null quando não dá para saber
 * (sem rotas cadastradas ou sem bairro): nesse caso não há aviso nem ponto.
 */
export function isInRoute(neighborhood, routes) {
	if (!routes?.length || !normalize(neighborhood)) return null;
	const wanted = normalize(neighborhood);
	return routes.some((r) => r.neighborhoods.some((n) => normalize(n) === wanted));
}

export function scoreDeal(deal, { inRoute = null } = {}) {
	const got = [];
	if (deal.squareMeters) got.push('squareMeters');
	if (deal.hasPhotos) got.push('hasPhotos');
	if (normalize(deal.address)) got.push('address');
	if (deal.askedQuote) got.push('askedQuote');
	if (inRoute === true) got.push('inRoute');
	const score = got.reduce((sum, key) => sum + SIGNAL_POINTS[key], 0);
	const level = score >= HOT_FROM ? 'QUENTE' : score >= WARM_FROM ? 'MORNO' : 'FRIO';
	return { score, level, signals: got.map((k) => SIGNAL_LABEL[k]) };
}

/** 0 = em dia, 1 = amarelo (1 dia na etapa), 2 = vermelho (2 dias ou mais). Só etapa aberta. */
export function staleLevel(enteredStageAt, kind, now = new Date()) {
	if (kind !== 'ABERTA') return 0;
	const days = (now - new Date(enteredStageAt)) / (24 * 60 * 60 * 1000);
	return days >= 2 ? 2 : days >= 1 ? 1 : 0;
}

/** Horas entre dois instantes contando só a janela comercial (padrão 8h às 20h, Brasília). */
export function businessHoursBetween(from, to, { start = 8, end = 20 } = {}) {
	const a = new Date(from).getTime();
	const b = new Date(to).getTime();
	if (!(b > a)) return 0;
	let total = 0;
	for (let key = dayKey(a); key <= dayKey(b); key = addDays(key, 1)) {
		const open = dayStart(key).getTime() + start * 3600_000;
		const close = dayStart(key).getTime() + end * 3600_000;
		const overlap = Math.min(b, close) - Math.max(a, open);
		if (overlap > 0) total += overlap;
	}
	return total / 3600_000;
}

export const LOST_REASON_LABEL = {
	CARO: 'Achou caro',
	LONGE: 'Longe demais',
	SEM_EQUIPE: 'Sem equipe disponível',
	DESISTIU: 'Desistiu',
	SEM_RESPOSTA: 'Parou de responder',
	OUTRO: 'Outro'
};
