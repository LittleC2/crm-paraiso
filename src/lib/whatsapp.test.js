import { describe, expect, it } from 'vitest';
import { isOptOut, jidToPhone, nextStatus, parseWebhook, renderTemplate } from './whatsapp.js';

describe('webhook uazapi', () => {
	const msg = (over = {}) => ({
		EventType: 'messages',
		message: { messageid: 'ABC', chatid: '5521964088063@s.whatsapp.net', text: ' Oi, tem samambaia? ', senderName: 'Ana', fromMe: false, messageTimestamp: 1_760_000_000, ...over }
	});

	it('lê mensagem recebida', () => {
		const ev = parseWebhook(msg());
		expect(ev.type).toBe('message');
		expect(ev.message).toMatchObject({ externalId: 'ABC', phone: '5521964088063', text: 'Oi, tem samambaia?', fromMe: false, isGroup: false, mediaType: null });
		expect(ev.message.at.getFullYear()).toBeGreaterThan(2024); // segundos viram ms
	});
	it('mensagem sem texto é mídia', () => {
		const ev = parseWebhook(msg({ text: '', messageType: 'imageMessage' }));
		expect(ev.message.mediaType).toBe('image');
	});
	it('reconhece cada tipo de mídia e os detalhes do arquivo', () => {
		const tipos = { AudioMessage: 'audio', PttMessage: 'ptt', VideoMessage: 'video', DocumentMessage: 'document', StickerMessage: 'sticker', LocationMessage: 'location', ContactMessage: 'contact' };
		for (const [messageType, esperado] of Object.entries(tipos)) {
			expect(parseWebhook(msg({ text: '', messageType })).message.mediaType).toBe(esperado);
		}
		// mediaType da uazapi tem prioridade; voz vem como ptt
		expect(parseWebhook(msg({ text: '', messageType: 'AudioMessage', mediaType: 'ptt' })).message.mediaType).toBe('ptt');
		const ev = parseWebhook(msg({ text: 'olha a planta', messageType: 'ImageMessage', content: { mimetype: 'image/jpeg', fileLength: 2048, seconds: 0 } }));
		expect(ev.message).toMatchObject({ text: 'olha a planta', mediaType: 'image', media: { mime: 'image/jpeg', size: 2048 } });
		const doc = parseWebhook(msg({ text: '', messageType: 'DocumentMessage', fileName: 'orcamento.pdf' }));
		expect(doc.message.media.name).toBe('orcamento.pdf');
	});
	it('texto comum não vira mídia', () => {
		expect(parseWebhook(msg({ messageType: 'ExtendedTextMessage' })).message.mediaType).toBeNull();
	});
	it('detecta grupo pelo JID', () => {
		expect(parseWebhook(msg({ chatid: '120363-1@g.us' })).message.isGroup).toBe(true);
	});
	it('marca mensagem enviada pela API', () => {
		expect(parseWebhook(msg({ fromMe: true, wasSentByApi: true })).message.sentByApi).toBe(true);
	});
	it('recibo vira status', () => {
		const ev = parseWebhook({ EventType: 'messages_update', state: 'Read', event: { MessageIDs: ['A', 'B'] } });
		expect(ev).toEqual({ type: 'status', ids: ['A', 'B'], status: 'LIDA' });
	});
	it('conexão', () => {
		expect(parseWebhook({ EventType: 'connection', instance: { status: 'connected' } })).toEqual({ type: 'connection', state: 'CONECTADO' });
		expect(parseWebhook({ EventType: 'connection', status: 'xyz' }).state).toBe('DESCONECTADO');
	});
	it('lixo vira ignorado, nunca lança', () => {
		for (const bad of [null, undefined, 'x', {}, { EventType: 'messages' }, { EventType: 'messages', message: {} }]) {
			expect(parseWebhook(bad).type).toBe('ignored');
		}
	});
	it('jid', () => {
		expect(jidToPhone('5521973046853:12@s.whatsapp.net')).toBe('5521973046853');
	});
});

describe('status e opt-out', () => {
	it('recibo fora de ordem não retrocede', () => {
		expect(nextStatus('LIDA', 'ENTREGUE')).toBe('LIDA');
		expect(nextStatus('ENVIADA', 'ENTREGUE')).toBe('ENTREGUE');
	});
	it('falha só antes de entregar', () => {
		expect(nextStatus('ENVIADA', 'FALHOU')).toBe('FALHOU');
		expect(nextStatus('ENTREGUE', 'FALHOU')).toBe('ENTREGUE');
	});
	it('opt-out só com a palavra sozinha', () => {
		expect(isOptOut('PARAR')).toBe(true);
		expect(isOptOut(' sair! ')).toBe(true);
		expect(isOptOut('não quero parar de receber')).toBe(false);
		expect(isOptOut('quero sair às 18h')).toBe(false);
	});
});

describe('modelos', () => {
	it('preenche variáveis com o primeiro nome', () => {
		expect(renderTemplate('Oi {nome}, aqui é {atendente}.', { nome: 'Ana Souza', atendente: 'João Silva' })).toBe('Oi Ana, aqui é João.');
	});
});

describe('parseWebhook: history', () => {
	const msg = (id) => ({ messageid: id, chatid: '5521999990001@s.whatsapp.net', text: 'oi', fromMe: false, messageTimestamp: 1_700_000_000_000 });
	it('lista de mensagens', () => {
		const ev = parseWebhook({ EventType: 'history', messages: [msg('a'), msg('b')] });
		expect(ev.type).toBe('history');
		expect(ev.messages.map((m) => m.externalId)).toEqual(['a', 'b']);
		expect(ev.messages[0].phone).toBe('5521999990001');
	});
	it('item único e mensagem aninhada', () => {
		expect(parseWebhook({ EventType: 'history', message: msg('c') }).messages).toHaveLength(1);
		expect(parseWebhook({ EventType: 'history', message: { message: msg('d') } }).messages[0].externalId).toBe('d');
	});
	it('sem mensagens vira ignorado', () => {
		expect(parseWebhook({ EventType: 'history', messages: [] }).type).toBe('ignored');
		expect(parseWebhook({ EventType: 'history' }).type).toBe('ignored');
	});
});
