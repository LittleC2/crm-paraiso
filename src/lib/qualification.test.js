import { describe, expect, it } from 'vitest';
import { businessHoursBetween, isInRoute, scoreDeal, staleLevel } from './qualification.js';
import { formatBRL, parseMoneyToCents } from './money.js';

describe('dinheiro', () => {
	it('lê formatos brasileiros', () => {
		expect(parseMoneyToCents('1.234,56')).toBe(123456);
		expect(parseMoneyToCents('R$ 1500')).toBe(150000);
		expect(parseMoneyToCents('1.500')).toBe(150000);
		expect(parseMoneyToCents('1234.56')).toBe(123456);
		expect(parseMoneyToCents('')).toBeNull();
		expect(parseMoneyToCents('abc')).toBeNull();
	});
	it('formata', () => {
		expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
		expect(formatBRL(null)).toBe('');
	});
});

describe('rota', () => {
	const routes = [{ neighborhoods: ['Alto', 'São Pedro'] }];
	it('ignora acento e caixa', () => {
		expect(isInRoute('sao pedro', routes)).toBe(true);
		expect(isInRoute('Várzea', routes)).toBe(false);
	});
	it('sem rotas ou sem bairro: desconhecido', () => {
		expect(isInRoute('Alto', [])).toBeNull();
		expect(isInRoute('', routes)).toBeNull();
	});
});

describe('nota do negócio', () => {
	it('soma só sinais registrados', () => {
		const r = scoreDeal({ squareMeters: 40, hasPhotos: true, address: 'Rua X', askedQuote: true }, { inRoute: true });
		expect(r.score).toBe(100);
		expect(r.level).toBe('QUENTE');
	});
	it('sem sinais é frio', () => {
		expect(scoreDeal({}).level).toBe('FRIO');
	});
	it('metragem e fotos dão morno', () => {
		expect(scoreDeal({ squareMeters: 20, hasPhotos: true }).level).toBe('MORNO');
	});
});

describe('tempo parado', () => {
	const now = new Date('2026-11-14T15:00:00Z');
	it('amarelo com 1 dia, vermelho com 2', () => {
		expect(staleLevel('2026-11-13T12:00:00Z', 'ABERTA', now)).toBe(1);
		expect(staleLevel('2026-11-12T12:00:00Z', 'ABERTA', now)).toBe(2);
		expect(staleLevel('2026-11-14T12:00:00Z', 'ABERTA', now)).toBe(0);
	});
	it('etapa fechada nunca fica parada', () => {
		expect(staleLevel('2026-01-01T00:00:00Z', 'GANHO', now)).toBe(0);
	});
});

describe('horário comercial', () => {
	it('não conta a noite', () => {
		// 19h às 9h do dia seguinte (Brasília) = 1h (19-20) + 1h (8-9) = 2h
		const h = businessHoursBetween('2026-11-10T22:00:00Z', '2026-11-11T12:00:00Z');
		expect(h).toBeCloseTo(2, 5);
	});
	it('mesmo dia dentro da janela', () => {
		expect(businessHoursBetween('2026-11-10T13:00:00Z', '2026-11-10T15:30:00Z')).toBeCloseTo(2.5, 5);
	});
	it('intervalo invertido é zero', () => {
		expect(businessHoursBetween('2026-11-11T12:00:00Z', '2026-11-10T12:00:00Z')).toBe(0);
	});
});
