import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	allowedArea,
	can,
	contactScope,
	conversationScope,
	dealScope,
	eventScope,
	reminderScope,
	taskScope
} from './access.js';

// Os testes abaixo cobrem as duas equipes; o modo solo tem bloco próprio no fim.
beforeAll(() => (process.env.SOLO_MODE = 'false'));
afterAll(() => delete process.env.SOLO_MODE);

const admin = { id: 'a1', role: 'ADMIN', active: true };
const loja = { id: 'l1', role: 'LOJA', active: true };

describe('escopo por papel', () => {
	it('admin não tem filtro', () => {
		expect(contactScope(admin)).toEqual({});
		expect(taskScope(admin)).toEqual({});
		expect(eventScope(admin)).toEqual({});
		expect(reminderScope(admin)).toEqual({});
	});

	it('loja só enxerga a área LOJA', () => {
		expect(contactScope(loja)).toEqual({ area: 'LOJA' });
		expect(taskScope(loja)).toEqual({ OR: [{ area: 'LOJA' }, { assigneeId: 'l1' }] });
		expect(eventScope(loja).OR[0]).toEqual({ area: 'LOJA' });
		expect(reminderScope(loja)).toEqual({ userId: 'l1' });
	});

	it('loja só vê conversas da área LOJA', () => {
		expect(conversationScope(loja)).toEqual({ area: 'LOJA' });
		expect(conversationScope(admin)).toEqual({});
		expect(conversationScope(null)).toEqual({ id: '__nenhum__' });
	});

	it('loja só vê negócios da área LOJA', () => {
		expect(dealScope(loja)).toEqual({ area: 'LOJA' });
		expect(dealScope(admin)).toEqual({});
	});

	it('sem usuário nada é visível', () => {
		for (const scope of [contactScope, taskScope, eventScope, reminderScope, dealScope]) {
			expect(scope(null)).toEqual({ id: '__nenhum__' });
		}
	});
});

describe('allowedArea', () => {
	it('loja nunca cria em JARDIM', () => {
		expect(allowedArea(loja, 'JARDIM')).toBe('LOJA');
	});
	it('admin escolhe', () => {
		expect(allowedArea(admin, 'JARDIM')).toBe('JARDIM');
		expect(allowedArea(admin, 'qualquer')).toBe('LOJA');
	});
});

describe('can', () => {
	it('loja não acessa funil nem usuários', () => {
		expect(can(loja, 'funil')).toBe(false);
		expect(can(loja, 'usuarios')).toBe(false);
		expect(can(loja, 'tarefas')).toBe(true);
	});
	it('admin acessa tudo', () => {
		expect(can(admin, 'funil')).toBe(true);
	});
	it('usuário inativo não acessa nada', () => {
		expect(can({ ...admin, active: false }, 'tarefas')).toBe(false);
	});
});

describe('modo solo (CRM só do João)', () => {
	beforeAll(() => delete process.env.SOLO_MODE);
	afterAll(() => (process.env.SOLO_MODE = 'false'));

	it('admin só enxerga a área JARDIM em tudo', () => {
		for (const scope of [contactScope, taskScope, eventScope, dealScope, conversationScope]) {
			expect(scope(admin)).toEqual({ area: 'JARDIM' });
		}
		expect(allowedArea(admin, 'LOJA')).toBe('JARDIM');
	});

	it('pedidos e usuários ficam bloqueados', () => {
		expect(can(admin, 'pedidos')).toBe(false);
		expect(can(admin, 'usuarios')).toBe(false);
		expect(can(admin, 'funil')).toBe(true);
	});
});
