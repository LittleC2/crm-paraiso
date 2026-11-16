import { describe, expect, it } from 'vitest';
import { CONTACTS_TEMPLATE_CSV, parseContactsCsv, parseContactsFile, parseVcf } from './csv.js';

describe('CSV de contatos', () => {
	it('lê o modelo da Athenum (ponto e vírgula, BOM, autorização)', () => {
		const rows = parseContactsCsv(CONTACTS_TEMPLATE_CSV);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ name: 'Maria da Silva', phone: '(21) 99999-1111', neighborhood: 'Taquara', optInWhatsapp: true });
		expect(rows[1].optInWhatsapp).toBe(false);
	});
	it('lê o CSV do Google Contatos (nome e sobrenome, vários telefones)', () => {
		const csv = 'First Name,Last Name,E-mail 1 - Value,Phone 1 - Value\nAna,Souza,ana@x.com,+55 21 98888-7777 ::: +55 21 3333-4444\n';
		expect(parseContactsCsv(csv)[0]).toMatchObject({ name: 'Ana Souza', email: 'ana@x.com', phone: '+55 21 98888-7777' });
	});
	it('aspas, vírgula dentro de campo e linha vazia', () => {
		const rows = parseContactsCsv('Nome,Telefone\n"Silva, João",21999990000\n\n');
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe('Silva, João');
	});
});

describe('vCard', () => {
	const vcf = [
		'BEGIN:VCARD', 'VERSION:3.0', 'N:Costa;Marina;;;', 'FN:Marina Costa',
		'TEL;type=CELL;type=VOICE;type=pref:+55 21 99999-0001', 'TEL;type=HOME:+55 21 3333-0000',
		'EMAIL;type=INTERNET:marina@x.com', 'END:VCARD',
		'BEGIN:VCARD', 'N:Lima;Roberto;;;', 'item1.TEL:(21) 98888-0002', 'END:VCARD'
	].join('\r\n');
	it('lê nome, primeiro telefone e e-mail', () => {
		const c = parseVcf(vcf);
		expect(c).toHaveLength(2);
		expect(c[0]).toMatchObject({ name: 'Marina Costa', phone: '+55 21 99999-0001', email: 'marina@x.com' });
	});
	it('sem FN usa o nome estruturado (N) e aceita prefixo item1.', () => {
		expect(parseVcf(vcf)[1]).toMatchObject({ name: 'Roberto Lima', phone: '(21) 98888-0002' });
	});
	it('escolhe o leitor pela extensão', () => {
		expect(parseContactsFile('contatos.VCF', vcf)).toHaveLength(2);
		expect(parseContactsFile('contatos.csv', 'Nome,Telefone\nA,21999990000\n')).toHaveLength(1);
	});
});
