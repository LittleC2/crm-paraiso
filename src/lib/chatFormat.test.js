import { describe, expect, it } from 'vitest';
import { dayLabel, formatDuration, formatSize, groupByDay, previewText, tickState } from './chatFormat.js';

describe('chatFormat', () => {
	it('rótulos de dia', () => {
		const now = new Date('2026-11-16T15:00:00-03:00');
		expect(dayLabel('2026-11-16T09:00:00-03:00', now)).toBe('Hoje');
		expect(dayLabel('2026-11-15T22:00:00-03:00', now)).toBe('Ontem');
		expect(dayLabel('2026-10-01T10:00:00-03:00', now)).toBe('01/10/2026');
	});
	it('agrupa por dia no fuso de São Paulo', () => {
		const g = groupByDay([{ sentAt: '2026-11-16T01:00:00Z' }, { sentAt: '2026-11-16T12:00:00Z' }, { sentAt: '2026-11-17T12:00:00Z' }]);
		// 01:00Z ainda é dia 15 em São Paulo
		expect(g.map((x) => x.items.length)).toEqual([1, 1, 1]);
	});
	it('tamanho e duração', () => {
		expect(formatSize(2048)).toBe('2 KB');
		expect(formatSize(3 * 1024 * 1024)).toBe('3,0 MB');
		expect(formatDuration(75)).toBe('1:15');
	});
	it('prévia de mídia', () => {
		expect(previewText({ kind: 'MIDIA', mediaType: 'image', direction: 'ENTRADA', body: 'olha' })).toBe('Foto: olha');
		expect(previewText({ kind: 'MIDIA', mediaType: 'ptt', mediaSeconds: 12, direction: 'SAIDA' })).toBe('Você: Mensagem de voz 0:12');
		expect(previewText({ kind: 'NOTA', body: 'ligar' })).toBe('Nota: ligar');
	});
	it('tique', () => {
		expect(tickState({ direction: 'ENTRADA' })).toBeNull();
		expect(tickState({ direction: 'SAIDA', kind: 'TEXTO', status: 'LIDA' })).toBe('read');
		expect(tickState({ direction: 'SAIDA', kind: 'NOTA' })).toBeNull();
	});
});
