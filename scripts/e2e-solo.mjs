// Teste de integração do modo solo (CRM só do João), mídia do WhatsApp e leads por planilha.
// Precisa de banco LOCAL descartável migrado e servidor com SOLO_MODE ausente (padrão solo):
//   CRON_SECRET=testsecret UAZAPI_URL=http://localhost:5198 UAZAPI_TOKEN_JARDIM=tokjardim
//   WHATSAPP_WEBHOOK_SECRET=whsecret SUPABASE_URL=http://localhost:5198 SUPABASE_SERVICE_ROLE_KEY=svc
//   vite dev --port 5199
// A uazapi e o Supabase Storage são simulados na porta 5198. Rodar: node scripts/e2e-solo.mjs
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHash, randomBytes, scrypt } from 'node:crypto';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
const sc = promisify(scrypt);
const hash = async (p) => { const s = randomBytes(16).toString('hex'); return `${s}:${(await sc(p, s, 64)).toString('hex')}`; };
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const B = process.env.BASE_URL ?? 'http://localhost:5199';
if (/supabase\.co|pooler/.test(process.env.DATABASE_URL ?? '')) throw new Error('Recusado: use só banco local descartável.');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

// ---- simulação de uazapi + Storage -------------------------------------------------
const calls = [];
const objects = new Map();
let failPtt = false;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const fake = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    const url = req.url.split('?')[0];
    if (url.startsWith('/files/')) { res.setHeader('content-type', url.endsWith('.ogg') ? 'audio/ogg' : url.endsWith('.pdf') ? 'application/pdf' : 'image/png'); return res.end(PNG); }
    if (url.startsWith('/storage/v1/object/sign/')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ signedURL: `${url.replace('/storage/v1', '')}?token=tok123` })); }
    if (url.startsWith('/storage/v1/object/') && req.method === 'POST') { objects.set(url.replace('/storage/v1/object/', ''), { bytes: buf.length, type: req.headers['content-type'] }); res.setHeader('content-type', 'application/json'); return res.end('{"Key":"ok"}'); }
    const body = buf.length && req.headers['content-type']?.includes('json') ? JSON.parse(buf.toString()) : {};
    calls.push({ path: url, token: req.headers.token, body });
    res.setHeader('content-type', 'application/json');
    if (url === '/message/download') return res.end(JSON.stringify({ fileURL: `http://localhost:5198/files/${body.id}.${body.id.startsWith('AUD') ? 'ogg' : body.id.startsWith('DOC') ? 'pdf' : 'jpg'}`, mimetype: body.id.startsWith('AUD') ? 'audio/ogg' : body.id.startsWith('DOC') ? 'application/pdf' : 'image/jpeg' }));
    if (url === '/send/media') {
      if (failPtt && body.type === 'ptt') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'formato não aceito' })); }
      return res.end(JSON.stringify({ messageid: `out-${calls.length}` }));
    }
    if (url === '/send/text') return res.end(JSON.stringify({ messageid: `txt-${calls.length}` }));
    res.end('{}');
  });
});
await new Promise((r) => fake.listen(5198, r));

// ---- preparo -----------------------------------------------------------------------
await db.leadIntake.deleteMany(); await db.leadIntegration.deleteMany(); await db.whatsappWebhookInbox.deleteMany(); await db.whatsappConversation.deleteMany(); await db.whatsappChannel.deleteMany(); await db.quickReply.deleteMany(); await db.loginAttempt.deleteMany(); await db.interaction.deleteMany(); await db.task.deleteMany(); await db.deal.deleteMany(); await db.contact.deleteMany();
await db.user.deleteMany({ where: { email: 'loja@paraiso.local' } });
await db.user.create({ data: { email: 'loja@paraiso.local', name: 'Maria Loja', passwordHash: await hash('senha-loja'), role: 'LOJA', active: false } });
await db.user.updateMany({ where: { email: 'joao@paraiso.local' }, data: { active: true, mustChangePassword: false } });

async function login(email, password) {
  const r = await fetch(`${B}/login`, { method: 'POST', redirect: 'manual', headers: { origin: B, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password }) });
  return { status: r.status, cookie: (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).join('; ') };
}
const get = (path, cookie) => fetch(B + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const act = (path, cookie, data) => fetch(B + path, { method: 'POST', redirect: 'manual', headers: { origin: B, cookie, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(data) });
const tick = () => fetch(B + '/api/cron/tick', { method: 'POST', headers: { authorization: 'Bearer testsecret' } }).then((r) => r.json());

const adm = await login('joao@paraiso.local', 'mude-esta-senha-1');
ok(adm.cookie.includes('paraiso_crm_session'), 'João loga');
ok(!(await login('loja@paraiso.local', 'senha-loja')).cookie.includes('paraiso_crm_session'), 'usuário da loja desativado não loga');

// ---- modo solo ---------------------------------------------------------------------
await db.contact.create({ data: { name: 'CONTATO-JARDIM-S', phone: '5521911110001', area: 'JARDIM', type: 'CLIENTE_JARDIM' } });
await db.contact.create({ data: { name: 'CONTATO-LOJA-S', phone: '5521911110002', area: 'LOJA', type: 'CLIENTE_LOJA' } });
const lista = await (await get('/contatos', adm.cookie)).text();
ok(lista.includes('CONTATO-JARDIM-S') && !lista.includes('CONTATO-LOJA-S'), 'solo: lista de contatos só mostra o jardim');
ok((await get('/pedidos', adm.cookie)).status === 404 && (await get('/usuarios', adm.cookie)).status === 404, 'solo: /pedidos e /usuarios dão 404');
ok((await get('/funil', adm.cookie)).status === 200 && (await get('/metas', adm.cookie)).status === 200, 'solo: funil e metas abrem');
const home = await (await get('/', adm.cookie)).text();
ok(!home.includes('Pedidos da loja') && !home.includes('Usuários'), 'solo: menu sem Pedidos da loja e Usuários');
await act('/contatos?/criar', adm.cookie, { name: 'SOLO-FORCA-JARDIM', phone: '(21) 97000-0001', area: 'LOJA' });
ok((await db.contact.findFirst({ where: { name: 'SOLO-FORCA-JARDIM' } }))?.area === 'JARDIM', 'solo: contato criado sempre em JARDIM, mesmo pedindo LOJA');

// ---- mídia recebida -----------------------------------------------------------------
const ch = await db.whatsappChannel.create({ data: { name: 'Número do João', area: 'JARDIM', tokenEnv: 'UAZAPI_TOKEN_JARDIM', state: 'CONECTADO' } });
const wh = (body) => fetch(`${B}/api/whatsapp/webhook?canal=${ch.id}&chave=whsecret`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const msg = (id, over = {}) => ({ EventType: 'messages', message: { messageid: id, chatid: '5521900000001@s.whatsapp.net', text: '', senderName: 'Cliente Foto', fromMe: false, messageTimestamp: Math.floor(Date.now() / 1000), ...over } });
await wh(msg('IMG1', { messageType: 'ImageMessage', text: 'olha a planta', content: { mimetype: 'image/jpeg', fileLength: 70 } }));
await wh(msg('AUD1', { messageType: 'AudioMessage', mediaType: 'ptt', content: { mimetype: 'audio/ogg; codecs=opus', seconds: 12 } }));
await wh(msg('DOC1', { messageType: 'DocumentMessage', fileName: 'orcamento.pdf', content: { mimetype: 'application/pdf' } }));
await wh(msg('LOC1', { messageType: 'LocationMessage' }));
await wh(msg('TXT1', { text: 'e aí?', messageType: 'ExtendedTextMessage' }));
const m = (id) => db.whatsappMessage.findUnique({ where: { externalId: id } });
const img = await m('IMG1');
ok(img?.kind === 'MIDIA' && img.mediaType === 'image' && img.body === 'olha a planta' && img.mediaState === 'PENDENTE', 'imagem com legenda: tipo normalizado, legenda no corpo, estado pendente');
ok((await m('AUD1'))?.mediaType === 'ptt' && (await m('AUD1')).mediaSeconds === 12, 'voz: tipo ptt e duração');
ok((await m('LOC1'))?.mediaState === 'NENHUMA' && (await m('TXT1'))?.kind === 'TEXTO', 'localização não baixa nada; texto continua texto');

const t1 = await tick();
ok(t1.whatsapp?.media?.saved === 3, `cron baixa e guarda as 3 mídias (salvas: ${t1.whatsapp?.media?.saved})`);
const img2 = await m('IMG1');
ok(img2.mediaState === 'SALVA' && img2.mediaPath?.endsWith('.jpg') && objects.has(`whatsapp-media/${img2.mediaPath}`), 'imagem guardada no Storage com extensão certa');
ok((await m('AUD1')).mediaPath?.endsWith('.ogg'), 'áudio ogg guardado como .ogg');
ok(calls.some((c) => c.path === '/message/download' && c.token === 'tokjardim'), 'download usa o token do canal');

const mediaRes = await get(`/api/midia/${img2.id}`, adm.cookie);
ok(mediaRes.status === 302 && (mediaRes.headers.get('location') ?? '').includes('token=tok123'), 'rota de mídia redireciona para a URL assinada');
ok((await get(`/api/midia/${img2.id}`)).status === 303, 'rota de mídia sem sessão: redireciona ao login');
ok((await get('/api/midia/nao-existe', adm.cookie)).status === 404, 'mídia inexistente: 404');
const conv = await db.whatsappConversation.findFirst({ where: { phone: '5521900000001' } });
const html = await (await get(`/conversas?c=${conv.id}`, adm.cookie)).text();
ok(html.includes('olha a planta') && html.includes(`/api/midia/${img2.id}`), 'janela renderiza a foto com a legenda');
ok(!html.includes('mediaPath') && !html.includes(img2.mediaPath), 'caminho do Storage não vai ao navegador');

// mídia pendente é baixada na hora em que alguém abre
await db.whatsappMessage.update({ where: { id: img2.id }, data: { mediaState: 'PENDENTE', mediaPath: null } });
ok((await get(`/api/midia/${img2.id}`, adm.cookie)).status === 302 && (await m('IMG1')).mediaState === 'SALVA', 'abrir mídia pendente baixa na hora');

// ---- envio de mídia ----------------------------------------------------------------
const send = (name, type, data, extra = {}) => {
  const fd = new FormData();
  fd.set('conversationId', conv.id);
  fd.set('file', new File([data], name, { type }));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fetch(B + '/api/midia/enviar', { method: 'POST', headers: { cookie: adm.cookie, origin: B }, body: fd }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
};
let r = await send('foto.png', 'image/png', PNG, { caption: 'segue a foto' });
const call = calls.findLast((c) => c.path === '/send/media');
ok(r.json?.ok && call?.body.type === 'image' && call.body.text === 'segue a foto' && String(call.body.file).includes('token=tok123'), 'envio de imagem: tipo, legenda e URL assinada chegam à uazapi');
const out = await db.whatsappMessage.findFirst({ where: { conversationId: conv.id, direction: 'SAIDA', kind: 'MIDIA' }, orderBy: { sentAt: 'desc' } });
ok(out?.status === 'ENVIADA' && out.mediaState === 'SALVA' && out.mediaType === 'image', 'mensagem enviada gravada como mídia salva');
r = await send('voz.webm', 'audio/webm;codecs=opus', PNG, { voz: '1', seconds: '5' });
ok(r.json?.ok && calls.findLast((c) => c.path === '/send/media').body.type === 'ptt', 'voz gravada vai como ptt');
failPtt = true;
r = await send('voz2.webm', 'audio/webm', PNG, { voz: '1', seconds: '3' });
const lastTwo = calls.filter((c) => c.path === '/send/media').slice(-2).map((c) => c.body.type);
ok(r.json?.ok && lastTwo[0] === 'ptt' && lastTwo[1] === 'audio', 'voz recusada como ptt é reenviada como áudio comum');
failPtt = false;
r = await send('mal.exe', 'application/x-msdownload', PNG);
ok(r.status === 415, 'tipo de arquivo não aceito: 415');
r = await send('grande.pdf', 'application/pdf', Buffer.alloc(17 * 1024 * 1024));
ok(r.status === 413, 'arquivo acima de 16 MB: 413');
const semSessao = await fetch(B + '/api/midia/enviar', { method: 'POST', redirect: 'manual', body: new FormData() });
ok(semSessao.status === 303 || semSessao.status === 401, 'envio de mídia sem sessão é recusado');
await db.whatsappConversation.update({ where: { id: conv.id }, data: { optOutAt: new Date() } });
r = await send('foto2.png', 'image/png', PNG);
ok(r.status === 400 && /não receber/.test(r.json?.error ?? ''), 'contato com opt-out: envio de mídia bloqueado');
await db.whatsappConversation.update({ where: { id: conv.id }, data: { optOutAt: null } });

// ---- nota interna vai para o perfil do cliente ----------------------------------------
await act('/conversas?/nota', adm.cookie, { id: conv.id, text: 'NOTA-PARA-O-PERFIL' });
ok((await db.interaction.count({ where: { contactId: conv.contactId, kind: 'NOTA', body: 'NOTA-PARA-O-PERFIL' } })) === 1, 'nota interna do WhatsApp vira histórico do contato');
ok((await (await get(`/contatos/${conv.contactId}`, adm.cookie)).text()).includes('NOTA-PARA-O-PERFIL'), 'nota aparece na ficha do cliente');
ok(!calls.some((c) => JSON.stringify(c.body).includes('NOTA-PARA-O-PERFIL')), 'nota nunca vai ao provedor');

// ---- leads por planilha --------------------------------------------------------------
const KEY = 'crm_chave-de-teste-123';
const integ = await db.leadIntegration.create({ data: { name: 'Planilha Instagram', secretHash: createHash('sha256').update(KEY).digest('hex'), ownerId: (await db.user.findFirst({ where: { email: 'joao@paraiso.local' } })).id } });
const post = (rows, key = KEY, id = integ.id) => fetch(`${B}/api/leads/sheets?i=${id}`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ rows }) });
ok((await post([{ row: 2, data: { Nome: 'X', WhatsApp: '21 98888-1111' } }], 'errada')).status === 401, 'planilha: chave errada 401');
ok((await post([{ row: 2, data: { Nome: 'X' } }], KEY, 'inexistente')).status === 401, 'planilha: integração inexistente 401 (mesma resposta)');
ok((await post([{ row: 2, data: { Nome: 'X', WhatsApp: '21 98888-1111' } }])).status === 403, 'planilha: integração desligada 403');
await db.leadIntegration.update({ where: { id: integ.id }, data: { active: true } });
let resp = await (await post([
  { row: 2, data: { 'Nome completo': 'Ana da Planilha', WhatsApp: '(21) 98888-1111', Bairro: 'Alto', Mensagem: 'quero um jardim vertical', 'E-mail': 'ana@x.com' } },
  { row: 3, data: { 'Nome completo': 'Sem Contato' } },
  { row: 4, data: { Nome: 'Bia', Telefone: '21 97777-2222', campanha: 'Black' } }
])).json();
ok(resp.results[0].status === 'CRIADO' && resp.results[1].status === 'INVALIDO' && resp.results[2].status === 'CRIADO', 'planilha: cria os válidos e recusa a linha sem telefone nem e-mail');
const ana = await db.deal.findFirst({ where: { contact: { phone: '5521988881111' } }, include: { stage: true, contact: true } });
ok(ana?.stage.key === 'novo' && ana.area === 'JARDIM' && ana.contact.email === 'ana@x.com' && ana.contact.neighborhood === 'Alto' && ana.title === 'quero um jardim vertical' && ana.source === 'Planilha: Planilha Instagram', 'planilha: lead na primeira etapa com dados mapeados');
resp = await (await post([{ row: 2, data: { 'Nome completo': 'Ana da Planilha', WhatsApp: '(21) 98888-1111', Bairro: 'Alto', Mensagem: 'quero um jardim vertical', 'E-mail': 'ana@x.com' } }])).json();
ok(resp.results[0].status === 'DUPLICADO' && (await db.deal.count({ where: { contact: { phone: '5521988881111' } } })) === 1, 'planilha: reenviar a mesma linha não duplica');
resp = await (await post([{ row: 9, data: { Nome: 'Ana de novo', WhatsApp: '21988881111', Mensagem: 'mais uma dúvida' } }])).json();
ok(resp.results[0].status === 'DUPLICADO' && (await db.deal.count({ where: { contact: { phone: '5521988881111' } } })) === 1 && (await db.interaction.count({ where: { contact: { phone: '5521988881111' }, body: { contains: 'mais uma dúvida' } } })) === 1, 'planilha: cliente com lead aberto não ganha outro lead, a mensagem vira nota');
await db.contact.create({ data: { name: 'Fone da Loja', phone: '5521966660000', area: 'LOJA', type: 'CLIENTE_LOJA' } });
resp = await (await post([{ row: 10, data: { Nome: 'Conflito', WhatsApp: '21966660000' } }])).json();
ok(resp.results[0].status === 'ERRO' && !(await db.deal.findFirst({ where: { contact: { phone: '5521966660000' } } })), 'planilha: telefone que já é da loja não vira lead (erro explicado)');
ok((await fetch(`${B}/api/leads/sheets?i=${integ.id}`, { method: 'POST', headers: { authorization: `Bearer ${KEY}` }, body: 'x'.repeat(70 * 1024) })).status === 413, 'planilha: corpo acima de 64 KB: 413');
ok((await fetch(`${B}/api/leads/sheets?i=${integ.id}`, { method: 'POST', headers: { authorization: `Bearer ${KEY}` }, body: 'não é json' })).status === 400, 'planilha: JSON inválido: 400');
ok((await db.leadIntake.count({ where: { integrationId: integ.id } })) >= 5, 'cada chegada fica registrada');

// ---- tela de integrações ---------------------------------------------------------------
const aj = await (await get('/ajustes', adm.cookie)).text();
ok(aj.includes('Integrações'), 'Ajustes mostra a aba Integrações (admin)');
ok(!aj.includes('secretHash') && !aj.includes(createHash('sha256').update(KEY).digest('hex')), 'hash da chave não vai ao navegador');
await db.leadIntegration.update({ where: { id: integ.id }, data: { active: false } });
await act('/ajustes?/leadAtivo', adm.cookie, { id: integ.id, active: '1' });
ok((await db.leadIntegration.findUnique({ where: { id: integ.id } })).active === true, 'ligar integração com lead já criado funciona');
await act('/ajustes?/leadTeste', adm.cookie, { id: integ.id });
const teste = await db.contact.findFirst({ where: { tags: { has: 'teste-planilha' } } });
ok(Boolean(teste), 'lead de teste criado e marcado com a tag');
await act('/ajustes?/leadApagarTestes', adm.cookie, {});
ok(!(await db.contact.findFirst({ where: { tags: { has: 'teste-planilha' } } })), 'leads de teste apagados');
const novaChave = await act('/ajustes?/leadChave', adm.cookie, { id: integ.id });
ok(novaChave.status === 200 && (await post([{ row: 30, data: { Nome: 'Z', WhatsApp: '21955554444' } }])).status === 401, 'gerar nova chave invalida a antiga');

fake.close();
await db.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
process.exit(fails ? 1 : 0);
