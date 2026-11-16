import { describe, expect, it } from 'vitest';
import { addDays, dayKey, expandOccurrences, groupByDay, monthGrid, weekOf } from './agenda.js';

describe('agenda', () => {
	it('dia em Brasília, não em UTC', () => {
		// 01:00 UTC de 15/11 ainda é 22:00 de 14/11 em Brasília.
		expect(dayKey('2026-11-15T01:00:00Z')).toBe('2026-11-14');
	});
	it('soma dias atravessando o mês', () => {
		expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
	it('grade do mês começa no domingo e tem semanas completas', () => {
		const weeks = monthGrid('2026-11');
		expect(weeks[0][0]).toBe('2026-11-01'); // 01/11/2026 é domingo
		expect(weeks.every((w) => w.length === 7)).toBe(true);
		expect(weeks.flat()).toContain('2026-11-30');
	});
	it('semana de uma data', () => {
		expect(weekOf('2026-11-18')[0]).toBe('2026-11-15');
	});
	it('evento diário aparece em cada dia do intervalo', () => {
		const ev = { startsAt: '2026-11-10T12:00:00Z', endsAt: null, recurrence: 'DIARIA' };
		const occ = expandOccurrences(ev, '2026-11-12', '2026-11-14');
		expect(occ).toHaveLength(3);
	});
	it('viagem de vários dias cobre todos os dias', () => {
		const ev = { startsAt: '2026-11-10T12:00:00Z', endsAt: '2026-11-12T12:00:00Z', recurrence: 'NENHUMA' };
		const occ = expandOccurrences(ev, '2026-11-01', '2026-11-30');
		const days = groupByDay(occ, '2026-11-01', '2026-11-30');
		expect(Object.keys(days).sort()).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
	});
	it('evento fora do intervalo não aparece', () => {
		const ev = { startsAt: '2026-10-01T12:00:00Z', endsAt: null, recurrence: 'NENHUMA' };
		expect(expandOccurrences(ev, '2026-11-01', '2026-11-30')).toHaveLength(0);
	});
});
