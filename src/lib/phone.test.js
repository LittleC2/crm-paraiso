import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone, waLink } from './phone.js';
import { parseContactsCsv, parseCsvRows } from './csv.js';

describe('telefone', () => {
	it('normaliza formatos brasileiros', () => {
		expect(normalizePhone('(21) 96408-8063')).toBe('5521964088063');
		expect(normalizePhone('+55 21 96408-8063')).toBe('5521964088063');
		expect(normalizePhone('21 3642-1234')).toBe('552136421234');
	});
	it('rejeita lixo', () => {
		expect(normalizePhone('abc')).toBeNull();
		expect(normalizePhone('123')).toBeNull();
		expect(normalizePhone(null)).toBeNull();
	});
	it('aceita número estrangeiro com DDI (turista)', () => {
		expect(normalizePhone('+1 415 555 2671')).toBe('14155552671');
	});
	it('formata e monta link', () => {
		expect(formatPhone('5521964088063')).toBe('+55 (21) 96408-8063');
		expect(waLink('5521964088063')).toBe('https://wa.me/5521964088063');
		expect(waLink(null)).toBeNull();
	});
});

describe('csv', () => {
	it('lê ponto e vírgula, aspas e BOM', () => {
		const csv = '﻿Nome;Telefone;Observações\r\n"Silva; João";21964088063;"linha1\nlinha2"\r\n';
		const rows = parseCsvRows(csv);
		expect(rows[1][0]).toBe('Silva; João');
		expect(rows[1][2]).toBe('linha1\nlinha2');
	});
	it('mapeia cabeçalhos para campos', () => {
		const out = parseContactsCsv('Nome,Celular,Bairro\nAna,21 99999-1111,Alto\n,,\n');
		expect(out).toEqual([{ name: 'Ana', phone: '21 99999-1111', neighborhood: 'Alto' }]);
	});
});
