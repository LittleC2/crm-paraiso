// O que aparece no cartão do quadro. Cada pessoa escolhe o seu; padrão: tudo ligado.
export const CARD_FIELDS = [
	{ key: 'preview', label: 'Prévia da conversa' },
	{ key: 'place', label: 'Bairro e metragem' },
	{ key: 'value', label: 'Valor' },
	{ key: 'badges', label: 'Selos de alerta' },
	{ key: 'assignee', label: 'Responsável' },
	{ key: 'next', label: 'Próxima ação' }
];

export function normalizePrefs(raw) {
	const stored = raw && typeof raw === 'object' ? raw : {};
	return Object.fromEntries(CARD_FIELDS.map((f) => [f.key, stored[f.key] !== false]));
}
