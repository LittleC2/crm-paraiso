import { describe, expect, it } from 'vitest';
import { detectMapping, extractFields, norm } from './leadMapping.js';

describe('leadMapping', () => {
	it('normaliza nomes de coluna', () => {
		expect(norm('Nome Completo')).toBe('nomecompleto');
		expect(norm('E-mail')).toBe('email');
		expect(norm('Observação')).toBe('observacao');
	});

	it('detecta colunas de formulário do Google e do Meta', () => {
		const m = detectMapping(['Carimbo de data/hora', 'Nome completo', 'WhatsApp', 'E-mail', 'Bairro', 'Mensagem']);
		expect(m).toMatchObject({ name: 'Nome completo', phone: 'WhatsApp', email: 'E-mail', neighborhood: 'Bairro', message: 'Mensagem' });
		const meta = detectMapping(['full_name', 'phone_number', 'campaign_name']);
		expect(meta).toMatchObject({ name: 'full_name', phone: 'phone_number', campaign: 'campaign_name' });
	});

	it('mapeamento explícito vence a detecção', () => {
		const row = { Nome: 'A', Contato: '21999990000', 'Telefone fixo': '2133334444' };
		expect(extractFields(row, { phone: 'Contato' }).phone).toBe('21999990000');
		expect(extractFields(row).name).toBe('A');
	});

	it('campo ausente vira vazio', () => {
		expect(extractFields({ Nome: 'A' }).email).toBe('');
	});
});
