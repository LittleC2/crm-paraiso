import { describe, expect, it } from 'vitest';
import { elapsedFraction, median, normalizePeriod, paceStatus, periodBounds, shiftPeriod } from './goalsMath.js';

describe('períodos', () => {
	it('valida o formato e cai no mês atual quando inválido', () => {
		expect(normalizePeriod('2026-11')).toBe('2026-11');
		expect(normalizePeriod('2026-13')).toMatch(/^\d{4}-\d{2}$/);
		expect(normalizePeriod('lixo')).toMatch(/^\d{4}-\d{2}$/);
	});
	it('troca de mês atravessando o ano', () => {
		expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
		expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
	});
	it('limites do mês em Brasília', () => {
		const [from, to] = periodBounds('2026-11');
		expect(from.toISOString()).toBe('2026-11-01T03:00:00.000Z');
		expect(to.toISOString()).toBe('2026-12-01T03:00:00.000Z');
	});
});

describe('ritmo esperado', () => {
	it('0 antes do mês, 1 depois, proporcional dentro', () => {
		expect(elapsedFraction('2026-11', new Date('2026-10-20T12:00:00Z'))).toBe(0);
		expect(elapsedFraction('2026-11', new Date('2026-12-05T12:00:00Z'))).toBe(1);
		const meio = elapsedFraction('2026-11', new Date('2026-11-16T03:00:00Z'));
		expect(meio).toBeCloseTo(0.5, 1);
	});
});

describe('situação da meta', () => {
	const up = (value, target) => ({ value, target, better: 'up' });
	it('sem meta e sem dado', () => {
		expect(paceStatus(up(3, null), 0.5)).toBe('sem_meta');
		expect(paceStatus(up(null, 10), 0.5)).toBe('sem_dado');
	});
	it('no ritmo, atrás e bem atrás', () => {
		expect(paceStatus(up(5, 10), 0.5)).toBe('ok');
		expect(paceStatus(up(3, 10), 0.5)).toBe('atras');
		expect(paceStatus(up(1, 10), 0.5)).toBe('muito_atras');
		expect(paceStatus(up(10, 10), 0.1)).toBe('ok');
	});
	it('meta de teto (menos é melhor)', () => {
		const down = (value, target) => ({ value, target, better: 'down' });
		expect(paceStatus(down(2, 4), 0.5)).toBe('ok');
		expect(paceStatus(down(4.5, 4), 0.5)).toBe('atras');
		expect(paceStatus(down(9, 4), 0.5)).toBe('muito_atras');
	});
});

describe('mediana', () => {
	it('vazia é null; ímpar e par', () => {
		expect(median([])).toBeNull();
		expect(median([3, 1, 2])).toBe(2);
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});
});
