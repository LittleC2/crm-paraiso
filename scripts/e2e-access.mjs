// Teste de integração de papéis e escopo (LOJA x ADMIN), cron, rate limit,
// funil e WhatsApp (webhook + envio contra uma uazapi falsa local).
// Precisa de: banco LOCAL descartável migrado (DATABASE_URL) e servidor rodando
// com CRON_SECRET=testsecret UAZAPI_URL=http://localhost:5198
// UAZAPI_TOKEN_LOJA=tokloja UAZAPI_TOKEN_JARDIM=tokjardim
// WHATSAPP_WEBHOOK_SECRET=whsecret (ex: vite dev --port 5199). Apaga tarefas e o
// usuário loja@paraiso.local. Rodar: node scripts/e2e-access.mjs
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
const sc = promisify(scrypt);
const hash = async (p) => { const s = randomBytes(16).toString('hex'); return `${s}:${(await sc(p, s, 64)).toString('hex')}`; };
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const B = process.env.BASE_URL ?? 'http://localhost:5199';
if (/supabase\.co|pooler/.test(process.env.DATABASE_URL ?? '')) throw new Error('Recusado: este teste apaga tarefas e usuários; use só banco local descartável.');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

await db.goal.deleteMany(); await db.historyRequest.deleteMany(); await db.whatsappWebhookInbox.deleteMany(); await db.whatsappConversation.deleteMany(); await db.whatsappChannel.deleteMany(); await db.quickReply.deleteMany(); await db.loginAttempt.deleteMany(); await db.interaction.deleteMany(); await db.task.deleteMany(); await db.event.deleteMany(); await db.deal.deleteMany(); await db.contact.deleteMany(); await db.stageRule.updateMany({ data: { active: false, activatedAt: null } }); await db.user.deleteMany({ where: { email: { in: ['loja@paraiso.local', 'novo@paraiso.local'] } } });
await db.user.create({ data: { email: 'loja@paraiso.local', name: 'Maria Loja', passwordHash: await hash('senha-loja'), role: 'LOJA' } });
await db.task.create({ data: { title: 'TAREFA-DA-LOJA', area: 'LOJA' } });
const tj = await db.task.create({ data: { title: 'TAREFA-DO-JARDIM', area: 'JARDIM' } });
const rec = await db.task.create({ data: { title: 'ROTINA-DIARIA', area: 'LOJA', recurrence: 'DIARIA' } });

async function login(email, password) {
  const r = await fetch(`${B}/login`, { method: 'POST', redirect: 'manual', headers: { origin: B, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password }) });
  const c = (r.headers.getSetCookie?.() ?? []).map((x) => x.split(';')[0]).join('; ');
  return { status: r.status, cookie: c };
}
const get = (path, cookie) => fetch(B + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const act = (path, cookie, data) => fetch(B + path, { method: 'POST', redirect: 'manual', headers: { origin: B, cookie, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(data) });

ok((await get('/')).status === 303, 'sem sessão: / redireciona para login');
const adm = await login('joao@paraiso.local', 'mude-esta-senha-1');
const loj = await login('loja@paraiso.local', 'senha-loja');
ok(adm.cookie.includes('paraiso_crm_session'), 'admin loga');
ok(loj.cookie.includes('paraiso_crm_session'), 'loja loga');

const admHtml = await (await get('/tarefas', adm.cookie)).text();
const lojHtml = await (await get('/tarefas', loj.cookie)).text();
ok(admHtml.includes('TAREFA-DO-JARDIM') && admHtml.includes('TAREFA-DA-LOJA'), 'admin vê as duas áreas');
ok(lojHtml.includes('TAREFA-DA-LOJA') && !lojHtml.includes('TAREFA-DO-JARDIM'), 'loja NÃO vê tarefa de JARDIM');

await act('/tarefas?/excluir', loj.cookie, { id: tj.id });
ok((await db.task.findUnique({ where: { id: tj.id } })) !== null, 'loja NÃO exclui tarefa de JARDIM por id');
await act('/tarefas?/mudarStatus', loj.cookie, { id: tj.id, status: 'FEITO' });
ok((await db.task.findUnique({ where: { id: tj.id } })).status === 'A_FAZER', 'loja NÃO muda status de tarefa de JARDIM');
await act('/tarefas?/criar', loj.cookie, { title: 'LOJA-TENTA-JARDIM', area: 'JARDIM' });
ok((await db.task.findFirst({ where: { title: 'LOJA-TENTA-JARDIM' } }))?.area === 'LOJA', 'loja não cria tarefa em JARDIM (área forçada para LOJA)');

await act('/tarefas?/mudarStatus', loj.cookie, { id: rec.id, status: 'FEITO' });
ok((await db.task.count({ where: { title: 'ROTINA-DIARIA' } })) === 2, 'tarefa recorrente concluída gera a próxima');

ok((await get('/api/cron/tick')).status === 401, 'cron sem segredo: 401');
ok((await fetch(B + '/api/cron/tick', { method: 'POST', headers: { authorization: 'Bearer errado' } })).status === 401, 'cron com segredo errado: 401');
const cr = await fetch(B + '/api/cron/tick', { method: 'POST', headers: { authorization: 'Bearer testsecret' } });
ok(cr.status === 200, 'cron com segredo: 200');

await db.user.update({ where: { email: 'loja@paraiso.local' }, data: { active: false } });
ok((await get('/tarefas', loj.cookie)).status === 303, 'usuário desativado perde acesso na hora');
await db.user.update({ where: { email: 'loja@paraiso.local' }, data: { active: true } });

for (let i = 0; i < 9; i++) await login('joao@paraiso.local', 'errada');
const rl = await fetch(`${B}/login`, { method: 'POST', redirect: 'manual', headers: { origin: B, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ email: 'joao@paraiso.local', password: 'mude-esta-senha-1' }) });
ok(rl.status !== 303, 'após 8 erros, login bloqueado mesmo com a senha certa');


// ---- Fase 1 restante: contatos, agenda, usuários --------------------------
const status = async (path, cookie) => (await get(path, cookie)).status;
ok((await status('/usuarios', loj.cookie)) === 403, 'loja: /usuarios bloqueado (403)');
ok((await status('/funil', loj.cookie)) === 403, 'loja: /funil bloqueado (403)');
ok((await status('/funil/painel', loj.cookie)) === 403, 'loja: /funil/painel bloqueado (403)');
ok((await status('/usuarios', adm.cookie)) === 200 && (await status('/funil', adm.cookie)) === 200, 'admin acessa /usuarios e /funil');
ok((await status('/pedidos', loj.cookie)) === 200, 'loja acessa /pedidos');

const cJ = await db.contact.create({ data: { name: 'CONTATO-JARDIM', phone: '5521911110001', area: 'JARDIM', type: 'CLIENTE_JARDIM' } });
const cL = await db.contact.create({ data: { name: 'CONTATO-LOJA', phone: '5521911110002', area: 'LOJA', type: 'CLIENTE_LOJA' } });
const lista = await (await get('/contatos', loj.cookie)).text();
ok(lista.includes('CONTATO-LOJA') && !lista.includes('CONTATO-JARDIM'), 'loja NÃO vê contato de JARDIM na lista');
ok((await status(`/contatos/${cJ.id}`, loj.cookie)) === 404, 'loja NÃO abre ficha de contato de JARDIM (404)');
ok((await status(`/contatos/${cL.id}`, loj.cookie)) === 200, 'loja abre ficha de contato da loja');
await act(`/contatos/${cJ.id}?/salvar`, loj.cookie, { name: 'HACKEADO', type: 'CLIENTE_LOJA' });
ok((await db.contact.findUnique({ where: { id: cJ.id } })).name === 'CONTATO-JARDIM', 'loja NÃO edita contato de JARDIM por id');
await act(`/contatos/${cJ.id}?/excluir`, loj.cookie, {});
ok((await db.contact.findUnique({ where: { id: cJ.id } })) !== null, 'loja NÃO exclui contato de JARDIM');
await act(`/contatos/${cL.id}?/excluir`, loj.cookie, {});
ok((await db.contact.findUnique({ where: { id: cL.id } })) !== null, 'loja NÃO exclui nem o próprio contato (só admin exclui)');

await act('/contatos?/criar', loj.cookie, { name: 'LOJA-TENTA', phone: '(21) 98888-0001', area: 'JARDIM', type: 'CLIENTE_JARDIM' });
const tentou = await db.contact.findFirst({ where: { name: 'LOJA-TENTA' } });
ok(tentou?.area === 'LOJA' && tentou?.type === 'CLIENTE_LOJA' && tentou?.phone === '5521988880001', 'loja cria contato sempre em LOJA, telefone normalizado');
await act('/contatos?/criar', loj.cookie, { name: 'DUPLICADO', phone: '21988880001' });
ok((await db.contact.count({ where: { phone: '5521988880001' } })) === 1, 'telefone repetido não duplica contato');

const fd = new FormData();
fd.set('arquivo', new File(['Nome;Telefone;Bairro\nAna Souza;21 97777-0001;Alto\nBruno;21 97777-0001;Alto\nSem Fone;;Centro\nTelefone Ruim;12;X\n'], 'c.csv', { type: 'text/csv' }));
await fetch(B + '/contatos?/importar', { method: 'POST', headers: { origin: B, cookie: adm.cookie, accept: 'application/json' }, body: fd });
ok((await db.contact.count({ where: { name: { in: ['Ana Souza', 'Sem Fone'] } } })) === 2 && !(await db.contact.findFirst({ where: { name: 'Bruno' } })) && !(await db.contact.findFirst({ where: { name: 'Telefone Ruim' } })), 'importação CSV: cria válidos, ignora duplicado e telefone inválido');

const hoje = new Date(); hoje.setHours(15, 0, 0, 0);
await db.event.create({ data: { title: 'EVENTO-DA-LOJA', area: 'LOJA', startsAt: hoje } });
const eJ = await db.event.create({ data: { title: 'EVENTO-DO-JARDIM', area: 'JARDIM', startsAt: hoje } });
const ag = await (await get('/agenda?vista=dia', loj.cookie)).text();
ok(ag.includes('EVENTO-DA-LOJA') && !ag.includes('EVENTO-DO-JARDIM'), 'loja NÃO vê evento de JARDIM na agenda');
const agA = await (await get('/agenda?vista=dia', adm.cookie)).text();
ok(agA.includes('EVENTO-DA-LOJA') && agA.includes('EVENTO-DO-JARDIM'), 'admin vê os dois eventos');
ok((await status(`/agenda/${eJ.id}`, loj.cookie)) === 404, 'loja NÃO abre evento de JARDIM (404)');
await act(`/agenda/${eJ.id}?/excluir`, loj.cookie, {});
ok((await db.event.findUnique({ where: { id: eJ.id } })) !== null, 'loja NÃO exclui evento de JARDIM');
await act('/agenda?/criar', loj.cookie, { title: 'LOJA-EVENTO-NOVO', startsAt: '2026-12-01T10:00', area: 'JARDIM' });
ok((await db.event.findFirst({ where: { title: 'LOJA-EVENTO-NOVO' } }))?.area === 'LOJA', 'loja cria evento sempre em LOJA');

// ---- Fase 2: funil ----------------------------------------------------------
await act('/funil?/criar', adm.cookie, { contactName: 'Lead Teste', contactPhone: '21 96666-0001', neighborhood: 'Alto', source: 'Instagram', squareMeters: '40', value: '1.500,00' });
const d1 = await db.deal.findFirst({ where: { contact: { name: 'Lead Teste' } }, include: { stage: true } });
ok(d1?.stage.key === 'novo' && d1.valueCents === 150000 && d1.area === 'JARDIM', 'admin cria lead de jardim na etapa Novo, valor em centavos');
await act('/funil?/criar', adm.cookie, { contactName: 'Mesmo Fone', contactPhone: '(21) 96666-0001' });
ok((await db.contact.count({ where: { phone: '5521966660001' } })) === 1, 'lead com telefone repetido reaproveita o contato');

// regra desligada: nada de tarefa automática
await act('/funil?/posicionar', adm.cookie, { stageId: 'stg_jardim_proposta', dealIds: d1.id });
ok((await db.task.count({ where: { dealId: d1.id } })) === 0, 'regra desligada: mover para Proposta NÃO cria tarefas');
await act('/funil?/posicionar', adm.cookie, { stageId: 'stg_jardim_qualificado', dealIds: d1.id });
// liga a regra: só vale para quem entrar depois
await act('/funil/config?/regra', adm.cookie, { stageId: 'stg_jardim_proposta', active: 'on', days: '1,3,7,14' });
await act('/funil?/posicionar', adm.cookie, { stageId: 'stg_jardim_proposta', dealIds: d1.id });
ok((await db.task.count({ where: { dealId: d1.id, autoKey: { startsWith: `deal:${d1.id}:` } } })) === 4, 'regra ligada: entrar em Proposta cria 4 tarefas (D+1, D+3, D+7, D+14)');
await act('/funil?/posicionar', adm.cookie, { stageId: 'stg_jardim_qualificado', dealIds: d1.id });
await act('/funil?/posicionar', adm.cookie, { stageId: 'stg_jardim_proposta', dealIds: d1.id });
ok((await db.task.count({ where: { dealId: d1.id } })) === 4, 'voltar e entrar de novo NÃO duplica as tarefas (idempotência)');

// perda exige motivo; ao perder, tarefas automáticas abertas somem
await act(`/funil/${d1.id}?/perder`, adm.cookie, { reason: '' });
ok((await db.deal.findUnique({ where: { id: d1.id } })).stageId === 'stg_jardim_proposta', 'perder sem motivo é recusado');
await act('/funil?/posicionar', adm.cookie, { stageId: 'stg_jardim_perdido', dealIds: d1.id });
ok((await db.deal.findUnique({ where: { id: d1.id } })).stageId === 'stg_jardim_proposta', 'arrastar para Perdido é recusado (exige motivo)');
await act(`/funil/${d1.id}?/perder`, adm.cookie, { reason: 'CARO', note: 'achou caro' });
const perdido = await db.deal.findUnique({ where: { id: d1.id } });
ok(perdido.stageId === 'stg_jardim_perdido' && perdido.lostReason === 'CARO', 'perda com motivo grava etapa e motivo');
ok((await db.task.count({ where: { dealId: d1.id } })) === 0, 'perder cancela as tarefas automáticas abertas');

// acesso: loja não mexe no funil de jardim, mas usa pedidos
const d2 = await db.deal.create({ data: { area: 'JARDIM', contactId: cJ.id, stageId: 'stg_jardim_novo' } });
ok((await act(`/funil/${d2.id}?/mover`, loj.cookie, { stageId: 'stg_jardim_proposta' })).status === 403, 'loja: ação do funil bloqueada (403)');
await act(`/pedidos/${d2.id}?/mover`, loj.cookie, { stageId: 'stg_jardim_proposta' });
ok((await db.deal.findUnique({ where: { id: d2.id } })).stageId === 'stg_jardim_novo', 'loja NÃO move negócio de JARDIM via /pedidos');
ok((await status(`/pedidos/${d2.id}`, loj.cookie)) === 404, 'loja NÃO abre negócio de JARDIM em /pedidos (404)');
await act('/pedidos?/criar', loj.cookie, { contactName: 'Cliente Pedido', contactPhone: '21 95555-0101', title: '2 samambaias' });
const ped = await db.deal.findFirst({ where: { title: '2 samambaias' } });
ok(ped?.area === 'LOJA' && ped?.stageId === 'stg_loja_pedido', 'loja cria pedido da loja');
await act(`/pedidos/${ped.id}?/mover`, loj.cookie, { stageId: 'stg_loja_separando' });
ok((await db.deal.findUnique({ where: { id: ped.id } })).stageId === 'stg_loja_separando', 'loja move o próprio pedido');
const pedHtml = await (await get('/pedidos', loj.cookie)).text();
ok(pedHtml.includes('Cliente Pedido') && !pedHtml.includes('CONTATO-JARDIM') && !pedHtml.includes('Lead Teste'), 'quadro de pedidos mostra só a loja');
await act(`/pedidos/${ped.id}?/mover`, loj.cookie, { stageId: 'stg_jardim_proposta' });
ok((await db.deal.findUnique({ where: { id: ped.id } })).stageId === 'stg_loja_separando', 'loja NÃO move pedido para etapa de outro quadro');

// usuários: senha temporária obriga a trocar
await act('/usuarios?/criar', adm.cookie, { name: 'Novo Func', email: 'novo@paraiso.local', role: 'LOJA', password: 'temporaria1' });
const nu = await db.user.findUnique({ where: { email: 'novo@paraiso.local' } });
ok(nu?.role === 'LOJA' && nu.mustChangePassword === true, 'admin cria usuário com senha temporária');
ok((await act('/usuarios?/criar', loj.cookie, { name: 'X', email: 'x@x.com', role: 'ADMIN', password: 'abcdefgh' })).status === 403, 'loja NÃO cria usuário (403)');
const nuLogin = await login('novo@paraiso.local', 'temporaria1');
const nuHome = await get('/tarefas', nuLogin.cookie);
ok(nuHome.status === 303 && (nuHome.headers.get('location') ?? '').includes('/senha'), 'senha temporária: qualquer rota redireciona para /senha');
await act('/senha', nuLogin.cookie, { current: 'errada', next: 'novasenha123', confirm: 'novasenha123' });
ok((await db.user.findUnique({ where: { email: 'novo@paraiso.local' } })).mustChangePassword === true, 'troca de senha com a atual errada é recusada');
await act('/senha', nuLogin.cookie, { current: 'temporaria1', next: 'novasenha123', confirm: 'novasenha123' });
ok((await db.user.findUnique({ where: { email: 'novo@paraiso.local' } })).mustChangePassword === false, 'troca de senha correta libera o acesso');
const lastAdmin = await db.user.findMany({ where: { role: 'ADMIN', active: true } });
ok(lastAdmin.length >= 2, 'base de teste tem 2+ admins para o teste de último admin');
await db.user.updateMany({ where: { email: 'eduardo@paraiso.local' }, data: { active: false } });
await act('/usuarios?/ativo', adm.cookie, { id: (await db.user.findUnique({ where: { email: 'joao@paraiso.local' } })).id, active: '0' });
ok((await db.user.findUnique({ where: { email: 'joao@paraiso.local' } })).active === true, 'admin NÃO desativa a si mesmo / último admin ativo');
await db.user.updateMany({ where: { email: 'eduardo@paraiso.local' }, data: { active: true } });

// ---- Fase 3: WhatsApp ----------------------------------------------------------
const { createServer } = await import('node:http');
const fakeCalls = [];
let fakeSeq = 0;
const fake = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    fakeCalls.push({ path: req.url, token: req.headers.token, body });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/send/text' && String(body.number).endsWith('0003')) { res.statusCode = 500; return res.end(JSON.stringify({ error: 'instância fora do ar' })); }
    if (req.url === '/send/text') return res.end(JSON.stringify({ messageid: `fake-${++fakeSeq}` }));
    res.end('{}');
  });
});
await new Promise((r) => fake.listen(5198, r));

const chL = await db.whatsappChannel.create({ data: { name: 'Loja Serra', area: 'LOJA', tokenEnv: 'UAZAPI_TOKEN_LOJA' } });
const chJ = await db.whatsappChannel.create({ data: { name: 'Número do João', area: 'JARDIM', tokenEnv: 'UAZAPI_TOKEN_JARDIM' } });
const wh = (channelId, body, chave = 'whsecret') => fetch(`${B}/api/whatsapp/webhook?canal=${channelId}&chave=${chave}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const inbound = (phone, text, id, over = {}) => ({ EventType: 'messages', message: { messageid: id, chatid: `${phone}@s.whatsapp.net`, text, senderName: 'Cliente ' + phone.slice(-4), fromMe: false, messageTimestamp: Math.floor(Date.now() / 1000), ...over } });

ok((await wh(chL.id, inbound('5521955550001', 'oi', 'X0'), 'errado')).status === 401, 'webhook com chave errada: 401');
ok((await fetch(`${B}/api/whatsapp/webhook?canal=${chL.id}`, { method: 'POST', body: '{}' })).status === 401, 'webhook sem chave: 401');
ok((await wh('nao-existe', inbound('5521955550001', 'oi', 'X1'))).status === 404, 'webhook com canal desconhecido: 404');
ok((await wh(chL.id, { ...inbound('5521955550001', 'oi', 'X2'), token: 'token-errado' })).status === 401, 'webhook com token de instância errado: 401');
ok((await db.whatsappConversation.count()) === 0, 'webhooks recusados não criam conversa');

ok((await wh(chL.id, inbound('5521955550001', 'Oi, tem orquídea?', 'M1'))).status === 200, 'webhook válido: 200');
await wh(chL.id, inbound('5521955550001', 'Oi, tem orquídea?', 'M1'));
const convL = await db.whatsappConversation.findFirst({ where: { phone: '5521955550001' }, include: { contact: true, messages: true } });
ok(convL && convL.area === 'LOJA' && convL.contact.area === 'LOJA' && convL.unread === 1 && convL.messages.length === 1, 'mensagem cria contato e conversa da loja; reentrega não duplica');
await wh(chJ.id, inbound('5521955550002', 'Quero um jardim', 'M2'));
const convJ = await db.whatsappConversation.findFirst({ where: { phone: '5521955550002' }, include: { contact: true } });
ok(convJ?.area === 'JARDIM' && convJ.contact.area === 'JARDIM', 'mensagem no número do jardim cria contato e conversa de JARDIM');
await wh(chL.id, inbound('5521955550009', 'enviada pela api', 'M3', { wasSentByApi: true, fromMe: true }));
await wh(chL.id, inbound('5521955550008', 'grupo', 'M4', { chatid: '120363-1@g.us', isGroup: true }));
ok((await db.whatsappConversation.count({ where: { phone: { in: ['5521955550009', '5521955550008'] } } })) === 0, 'mensagem da própria API e de grupo são ignoradas');
ok((await db.interaction.count({ where: { contactId: convL.contactId, kind: 'WHATSAPP' } })) === 1, 'mensagem recebida entra no histórico do contato');

const lojaList = await (await get('/conversas', loj.cookie)).text();
ok(lojaList.includes('Cliente 0001') && !lojaList.includes('Cliente 0002'), 'loja vê só conversas dos números da loja');
const admList = await (await get('/conversas', adm.cookie)).text();
ok(admList.includes('Cliente 0001') && admList.includes('Cliente 0002'), 'admin vê as conversas dos dois números');
ok(!(await (await get(`/conversas?c=${convJ.id}`, loj.cookie)).text()).includes('Cliente 0002') && (await status(`/conversas/${convJ.id}`, loj.cookie)) === 308, 'loja NÃO abre conversa de JARDIM (a janela não mostra a conversa)');
ok((await status('/conversas/canais', loj.cookie)) === 403 && (await status('/conversas/canais', adm.cookie)) === 308, '/conversas/canais só para admin (admin é redirecionado para Ajustes)');
const canaisHtml = await (await get('/conversas/canais', adm.cookie)).text();
ok(!canaisHtml.includes('tokloja') && !canaisHtml.includes('whsecret'), 'tela de números não expõe token nem segredo');
const antes = fakeCalls.length;
await act('/conversas?/enviar', loj.cookie, { id: convJ.id, text: 'tentativa indevida' });
ok(fakeCalls.length === antes && (await db.whatsappMessage.count({ where: { conversationId: convJ.id, direction: 'SAIDA' } })) === 0, 'loja NÃO envia em conversa de JARDIM (nada chega ao provedor)');

await act('/conversas?/enviar', loj.cookie, { id: convL.id, text: 'Temos sim! Passa na loja.' });
const sent = await db.whatsappMessage.findFirst({ where: { conversationId: convL.id, direction: 'SAIDA' } });
const call = fakeCalls.find((c) => c.path === '/send/text' && c.body.number === '5521955550001');
ok(sent?.status === 'ENVIADA' && sent.externalId === 'fake-1' && call?.token === 'tokloja' && call.body.text === 'Temos sim! Passa na loja.', 'envio vai ao provedor com o token do canal certo e grava o id externo');
const convAfter = await db.whatsappConversation.findUnique({ where: { id: convL.id } });
ok(convAfter.status === 'PENDENTE' && convAfter.assigneeId !== null && convAfter.unread === 0, 'responder assume a conversa e marca aguardando cliente');

await wh(chL.id, { EventType: 'messages_update', state: 'read', event: { MessageIDs: ['fake-1'] } });
await wh(chL.id, { EventType: 'messages_update', state: 'delivered', event: { MessageIDs: ['fake-1'] } });
ok((await db.whatsappMessage.findUnique({ where: { id: sent.id } })).status === 'LIDA', 'recibo fora de ordem não faz a mensagem retroceder');

await act('/conversas?/nota', loj.cookie, { id: convL.id, text: 'cliente é de Itaipava' });
ok((await db.whatsappMessage.findFirst({ where: { conversationId: convL.id, kind: 'NOTA' } })) !== null && !fakeCalls.some((c) => c.body.text === 'cliente é de Itaipava'), 'nota interna fica no CRM e nunca vai ao provedor');

await wh(chL.id, inbound('5521955550001', 'PARAR', 'M5'));
const optConv = await db.whatsappConversation.findUnique({ where: { id: convL.id }, include: { contact: true } });
ok(optConv.optOutAt !== null && optConv.contact.optInWhatsapp === false, 'PARAR registra opt-out e tira a autorização do contato');
const antesOpt = fakeCalls.length;
await act('/conversas?/enviar', loj.cookie, { id: convL.id, text: 'mesmo assim' });
ok(fakeCalls.length === antesOpt, 'contato com opt-out: envio bloqueado (nada chega ao provedor)');

await wh(chL.id, inbound('5521955550003', 'oi', 'M6'));
const conv3 = await db.whatsappConversation.findFirst({ where: { phone: '5521955550003' } });
await act('/conversas?/enviar', adm.cookie, { id: conv3.id, text: 'olá' });
const falha = await db.whatsappMessage.findFirst({ where: { conversationId: conv3.id, direction: 'SAIDA' } });
ok(falha?.status === 'FALHOU' && falha.error && !falha.error.includes('tokloja'), 'falha do provedor: mensagem fica FALHOU, sem vazar token');

await wh(chL.id, { EventType: 'connection', instance: { status: 'disconnected' } });
ok((await db.whatsappChannel.findUnique({ where: { id: chL.id } })).state === 'DESCONECTADO', 'evento de conexão atualiza o estado do número');

await db.whatsappWebhookInbox.create({ data: { channelId: chL.id, payload: inbound('5521955550004', 'pendente', 'M7'), receivedAt: new Date(Date.now() - 5 * 60_000) } });
const tick = await (await fetch(B + '/api/cron/tick', { method: 'POST', headers: { authorization: 'Bearer testsecret' } })).json();
ok((await db.whatsappConversation.count({ where: { phone: '5521955550004' } })) === 1 && tick.whatsapp.inbox.retried >= 1, 'cron reprocessa evento que ficou na caixa de entrada');
ok(tick.whatsapp.waiting.off === true, 'alerta de conversa sem resposta nasce desligado');
ok((await db.whatsappWebhookInbox.count({ where: { processedAt: null } })) === 0, 'todos os eventos válidos ficaram processados');

await act('/conversas?/negocio', adm.cookie, { id: conv3.id });
ok((await db.deal.count({ where: { contact: { phone: '5521955550003' }, area: 'LOJA' } })) === 1, 'criar pedido a partir da conversa da loja');
await act('/conversas?/negocio', adm.cookie, { id: convJ.id });
await act('/conversas?/negocio', adm.cookie, { id: convJ.id });
ok((await db.deal.count({ where: { contactId: convJ.contactId, area: 'JARDIM' } })) === 1, 'criar lead a partir da conversa de JARDIM, sem duplicar');
await act('/conversas?/negocio', loj.cookie, { id: convJ.id });
ok((await db.deal.count({ where: { contactId: convJ.contactId } })) === 1, 'loja NÃO cria negócio a partir de conversa de JARDIM');
// ---- rodada 16/11: painel do quadro, etapas e listas editáveis ----------
const dj = await db.deal.findFirst({ where: { contactId: convJ.contactId, area: 'JARDIM' } });
ok((await status(`/api/negocio/${dj.id}/conversa`, loj.cookie)) === 404, 'loja NÃO lê conversa de lead de JARDIM pelo painel (404)');
const painel = await get(`/api/negocio/${dj.id}/conversa`, adm.cookie);
ok(painel.status === 200 && (await painel.json()).conversation?.id === convJ.id, 'admin lê a conversa do lead pelo painel');
ok((await status('/funil/config', loj.cookie)) !== 200, 'loja NÃO abre a configuração do funil');

const novoNome = 'ETAPA-E2E';
await act('/funil/config?/etapaCriar', loj.cookie, { area: 'JARDIM', name: 'ETAPA-DA-LOJA-TENTANDO' });
ok((await db.pipelineStage.count({ where: { name: 'ETAPA-DA-LOJA-TENTANDO' } })) === 0, 'loja NÃO cria etapa');
await act('/funil/config?/etapaCriar', adm.cookie, { area: 'JARDIM', name: novoNome, color: '#336699' });
const etapa = await db.pipelineStage.findFirst({ where: { name: novoNome } });
const fechado = await db.pipelineStage.findFirst({ where: { area: 'JARDIM', kind: 'GANHO' } });
ok(etapa && etapa.order < fechado.order && etapa.color === '#336699', 'admin cria etapa aberta antes de Fechado, com cor');
await db.deal.update({ where: { id: dj.id }, data: { stageId: etapa.id } });
const novo = await db.pipelineStage.findFirst({ where: { area: 'JARDIM', key: 'novo' } });
await act('/funil/config?/etapaExcluir', adm.cookie, { id: etapa.id, targetId: '' });
ok((await db.pipelineStage.findUnique({ where: { id: etapa.id } })) !== null, 'apagar etapa sem destino é recusado');
await act('/funil/config?/etapaExcluir', adm.cookie, { id: etapa.id, targetId: novo.id });
ok((await db.pipelineStage.findUnique({ where: { id: etapa.id } })) === null && (await db.deal.findUnique({ where: { id: dj.id } })).stageId === novo.id, 'apagar etapa move os negócios para o destino');
const fixa = await db.pipelineStage.findFirst({ where: { area: 'JARDIM', key: 'proposta' } });
await act('/funil/config?/etapaExcluir', adm.cookie, { id: fixa.id, targetId: novo.id });
ok((await db.pipelineStage.findUnique({ where: { id: fixa.id } })) !== null, 'etapa usada pelo sistema não é apagada');
await act('/funil/config?/etapaExcluir', adm.cookie, { id: fechado.id, targetId: novo.id });
ok((await db.pipelineStage.findUnique({ where: { id: fechado.id } })) !== null, 'etapa de ganho não é apagada');

const caro = await db.listOption.findFirst({ where: { kind: 'MOTIVO_PERDA', key: 'CARO' } });
await act('/funil/config?/opcaoAtivar', adm.cookie, { id: caro.id, active: '0' });
await act(`/funil/${dj.id}?/perder`, adm.cookie, { reason: 'CARO' });
ok((await db.deal.findUnique({ where: { id: dj.id } })).lostReason === null, 'motivo de perda desativado não é aceito');
await act('/funil/config?/opcaoAtivar', adm.cookie, { id: caro.id, active: '1' });
await act('/funil/config?/opcaoSalvar', adm.cookie, { kind: 'MOTIVO_PERDA', label: 'MOTIVO-E2E' });
const meu = await db.listOption.findFirst({ where: { label: 'MOTIVO-E2E' } });
await act(`/funil/${dj.id}?/perder`, adm.cookie, { reason: meu.key });
ok((await db.deal.findUnique({ where: { id: dj.id } })).lostReason === meu.key, 'motivo de perda criado pela equipe é aceito');
await db.listOption.delete({ where: { id: meu.id } });
await db.deal.update({ where: { id: dj.id }, data: { stageId: novo.id, lostReason: null, lostNote: null, closedAt: null } });

// ---- rodada da noite: iniciar conversa, Ajustes, metas, importação, histórico ----
await db.whatsappChannel.update({ where: { id: chL.id }, data: { state: 'CONECTADO' } });
await db.whatsappChannel.update({ where: { id: chJ.id }, data: { state: 'CONECTADO' } });
const startReq = (cookie, body, origin = B) => fetch(`${B}/api/conversas/iniciar`, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const novoTel = { channelId: chJ.id, phone: '21 97777-1234', name: 'Novo Cliente', text: 'Olá! Aqui é do Paraíso das Plantas.' };
let r = await (await startReq(adm.cookie, novoTel)).json();
ok(r.needsConfirm === true, 'iniciar conversa com contato sem autorização pede confirmação');
ok(!(await db.whatsappConversation.findFirst({ where: { phone: '5521977771234' } })), 'sem confirmação nada é criado nem enviado');
const callsBefore = fakeCalls.filter((c) => c.path === '/send/text').length;
r = await (await startReq(adm.cookie, { ...novoTel, confirmNoOptIn: true })).json();
ok(r.ok === true && r.conversationId, 'com confirmação a conversa é iniciada');
const iniciada = await db.whatsappConversation.findUnique({ where: { id: r.conversationId }, include: { messages: true } });
ok(iniciada.messages.some((m) => m.kind === 'NOTA' && /sem autorização/.test(m.body)) && iniciada.messages.some((m) => m.kind === 'TEXTO' && m.status === 'ENVIADA'), 'confirmação fica registrada em nota e a mensagem sai');
ok(fakeCalls.filter((c) => c.path === '/send/text').length === callsBefore + 1, 'a primeira mensagem chega ao provedor');
ok((await startReq(loj.cookie, { ...novoTel, confirmNoOptIn: true })).status === 400, 'loja NÃO inicia conversa por número de JARDIM');
ok((await startReq(adm.cookie, { ...novoTel, confirmNoOptIn: true }, 'https://evil.example')).status === 403, 'iniciar conversa recusa origem de outro site');
await db.whatsappConversation.update({ where: { id: iniciada.id }, data: { optOutAt: new Date() } });
const bloq = await startReq(adm.cookie, { ...novoTel, confirmNoOptIn: true });
ok(bloq.status === 400 && /bloqueado/.test((await bloq.json()).error), 'contato que pediu PARAR continua bloqueado');
ok((await startReq(adm.cookie, { ...novoTel, phone: '21 95555-0101', confirmNoOptIn: true })).status === 400, 'telefone que já é de outra área não duplica contato');
await db.whatsappChannel.update({ where: { id: chJ.id }, data: { state: 'DESCONECTADO' } });
ok((await startReq(adm.cookie, { ...novoTel, phone: '21 97777-0009', confirmNoOptIn: true })).status === 400, 'número desconectado não envia');
await db.whatsappChannel.update({ where: { id: chJ.id }, data: { state: 'CONECTADO' } });

// busca de contatos respeita o escopo
const buscaLoja = await (await get('/api/contatos/buscar?q=CONTATO', loj.cookie)).json();
ok(!buscaLoja.contacts.some((c) => c.area === 'JARDIM'), 'busca de contatos: loja NÃO vê contato de JARDIM');
const buscaAdm = await (await get('/api/contatos/buscar?q=CONTATO', adm.cookie)).json();
ok(buscaAdm.contacts.some((c) => c.name === 'CONTATO-JARDIM'), 'busca de contatos: admin vê');

// Ajustes > WhatsApp só admin
const ajLoja = await (await get('/ajustes', loj.cookie)).text();
const ajAdm = await (await get('/ajustes', adm.cookie)).text();
ok(!ajLoja.includes('Reaplicar webhook') && !ajLoja.includes('Integrações') && ajAdm.includes('>WhatsApp<'), 'Ajustes: seção WhatsApp só para admin');
ok(!ajAdm.includes('tok') || !/UAZAPI_TOKEN_JARDIM["']?\s*[:=]\s*["']?tokjardim/.test(ajAdm), 'Ajustes não expõe o valor do token');
// ação recusada devolve 200 com {type:'failure'}: confere pelo efeito (nada chegou ao provedor nem à fila)
const conectarAntes = fakeCalls.filter((c) => c.path === '/instance/connect').length;
await act('/ajustes?/zapConectar', loj.cookie, { id: chJ.id });
ok(fakeCalls.filter((c) => c.path === '/instance/connect').length === conectarAntes, 'Ajustes: loja NÃO conecta número');
await act('/ajustes?/zapHistorico', loj.cookie, { id: chJ.id });
ok((await db.historyRequest.count()) === 0, 'Ajustes: loja NÃO importa histórico');
ok((await get('/conversas/canais', adm.cookie)).status === 308, '/conversas/canais redireciona para Ajustes');

// metas: só admin; log de etapas
ok((await get('/metas', loj.cookie)).status !== 200, 'metas: loja NÃO abre');
ok((await get('/metas', adm.cookie)).status === 200, 'metas: admin abre');
await act('/metas?/salvar', loj.cookie, { period: '2026-11', area: 'JARDIM', metric: 'LEADS', scope: 'EQUIPE', value: '5' });
ok((await db.goal.count()) === 0, 'metas: loja NÃO grava meta');
await act('/metas?/salvar', adm.cookie, { period: '2026-11', area: 'JARDIM', metric: 'LEADS', scope: 'EQUIPE', value: '20' });
await act('/metas?/salvar', adm.cookie, { period: '2026-11', area: 'JARDIM', metric: 'VALOR_FECHADO', scope: 'EQUIPE', value: '1.500,50' });
const gl = await db.goal.findFirst({ where: { metric: 'VALOR_FECHADO' } });
ok((await db.goal.count()) === 2 && gl.target === 150050, 'metas: admin grava (dinheiro em reais vira centavos)');
await act('/metas?/salvar', adm.cookie, { period: '2026-11', area: 'JARDIM', metric: 'LEADS', scope: 'EQUIPE', value: '' });
ok((await db.goal.count()) === 1, 'metas: valor vazio remove a meta');
await act('/metas?/salvar', adm.cookie, { period: '2026-11', area: 'JARDIM', metric: 'PEDIDOS_NOVOS', scope: 'EQUIPE', value: '3' });
ok((await db.goal.count()) === 1, 'metas: métrica de outra área é recusada');
const logsAntes = await db.dealStageLog.count();
const dealMeta = await db.deal.findFirst({ where: { area: 'JARDIM', stage: { kind: 'ABERTA' } } });
await act(`/funil/${dealMeta.id}?/mover`, adm.cookie, { stageId: 'stg_jardim_proposta' });
ok((await db.dealStageLog.count()) === logsAntes + 1 && (await db.dealStageLog.findFirst({ where: { dealId: dealMeta.id }, orderBy: { at: 'desc' } })).toKey === 'proposta', 'mover negócio grava o log de etapa');

// importação de contatos: prévia não grava, importar grava
const csv = 'Nome,Telefone\nImp A,21977770101\nImp B,21977770102\nImp B repetido,21977770102\nSem Tel Valido,123\n';
await act('/contatos/importar?/previa', adm.cookie, { texto: csv, nome: 'x.csv', area: 'JARDIM' });
ok((await db.contact.count({ where: { name: { startsWith: 'Imp ' } } })) === 0, 'importação: a prévia NÃO grava nada');
await act('/contatos/importar?/importar', adm.cookie, { texto: csv, nome: 'x.csv', area: 'JARDIM' });
const imp = await db.contact.findMany({ where: { name: { startsWith: 'Imp ' } } });
ok(imp.length === 2 && imp.every((c) => c.area === 'JARDIM'), 'importação: grava só os válidos e sem repetir telefone, na área escolhida');
await act('/contatos/importar?/importar', loj.cookie, { texto: 'Nome,Telefone\nImp Loja,21977770103\n', nome: 'x.csv', area: 'JARDIM' });
ok((await db.contact.findFirst({ where: { name: 'Imp Loja' } }))?.area === 'LOJA', 'importação: loja é forçada para a área LOJA');
const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Imp Vcard\r\nTEL:(21) 97777-0104\r\nEND:VCARD\r\n';
await act('/contatos/importar?/importar', adm.cookie, { texto: vcf, nome: 'contatos.vcf', area: 'JARDIM' });
ok(!!(await db.contact.findFirst({ where: { name: 'Imp Vcard', phone: '5521977770104' } })), 'importação: lê vCard (.vcf)');
ok((await get('/contatos/modelo.csv', adm.cookie)).headers.get('content-disposition')?.includes('modelo'), 'modelo de planilha para download');

// histórico: só de contato já cadastrado, sem notificar nem contar como não lida
const histPhone = convJ.phone;
const unreadAntes = (await db.whatsappConversation.findUnique({ where: { id: convJ.id } })).unread;
const histBody = (id, chat, text) => ({ EventType: 'history', messages: [{ messageid: id, chatid: `${chat}@s.whatsapp.net`, text, fromMe: false, messageTimestamp: Date.now() - 86400_000 * 5 }] });
await wh(chJ.id, histBody('hist-1', histPhone, 'mensagem antiga do cliente'));
await wh(chJ.id, histBody('hist-1', histPhone, 'mensagem antiga do cliente'));
ok((await db.whatsappMessage.count({ where: { externalId: 'hist-1' } })) === 1, 'histórico: mensagem entra uma vez só (sem duplicar)');
ok((await db.whatsappConversation.findUnique({ where: { id: convJ.id } })).unread === unreadAntes, 'histórico: não mexe em não lidas');
await wh(chJ.id, histBody('hist-2', '5521900009999', 'de quem não é cliente'));
ok(!(await db.contact.findFirst({ where: { phone: '5521900009999' } })) && (await db.whatsappMessage.count({ where: { externalId: 'hist-2' } })) === 0, 'histórico: NÃO cria contato desconhecido');
await wh(chJ.id, { EventType: 'history', message: { id: 'hist-3', chatid: `${histPhone}@s.whatsapp.net`, text: 'formato aninhado', fromMe: true, messageTimestamp: Date.now() - 86400_000 * 4 } });
ok((await db.whatsappMessage.count({ where: { externalId: 'hist-3', direction: 'SAIDA' } })) === 1, 'histórico: aceita item único');

// fila de histórico: pedido sai pelo cron, uma vez por contato
await act('/ajustes?/zapHistorico', adm.cookie, { id: chJ.id });
const fila = await db.historyRequest.count({ where: { channelId: chJ.id } });
ok(fila > 0, 'histórico: admin enfileira os contatos da área');
await act('/ajustes?/zapHistorico', adm.cookie, { id: chJ.id });
ok((await db.historyRequest.count({ where: { channelId: chJ.id } })) === fila, 'histórico: enfileirar de novo não repete pedidos');
await fetch(B + '/api/cron/tick', { method: 'POST', headers: { authorization: 'Bearer testsecret' } });
ok(fakeCalls.some((c) => c.path === '/message/history-sync' && c.token === 'tokjardim' && c.body.count === 50), 'histórico: o cron envia o pedido ao provedor com o token certo');
ok((await db.historyRequest.count({ where: { channelId: chJ.id, state: 'ENVIADO' } })) > 0, 'histórico: pedido marcado como enviado');

// ---- correções da revisão de segurança ----
const cPed = await db.contact.findFirst({ where: { name: 'Cliente Pedido' } });
const stJ = await db.pipelineStage.findFirst({ where: { area: 'JARDIM', key: 'novo' } });
await db.deal.create({ data: { area: 'JARDIM', contactId: cPed.id, stageId: stJ.id, address: 'ENDERECO-SECRETO-JARDIM', squareMeters: 99 } });
const vaza = await (await get('/api/contatos/buscar?q=Cliente%20Pedido', loj.cookie)).text();
ok(!vaza.includes('ENDERECO-SECRETO-JARDIM'), 'busca de contatos: loja NÃO recebe dados de negócio de JARDIM');
const nulo = await fetch(`${B}/api/conversas/iniciar`, { method: 'POST', headers: { origin: B, cookie: adm.cookie, 'content-type': 'application/json' }, body: 'null' });
ok(nulo.status === 400, 'iniciar conversa com corpo null: 400 (não 500)');
await act('/ajustes?/zapCriar', adm.cookie, { name: 'Canal Mau', tokenEnv: 'DATABASE_URL', area: 'LOJA' });
ok(!(await db.whatsappChannel.findFirst({ where: { name: 'Canal Mau' } })), 'canal: tokenEnv fora do padrão UAZAPI_TOKEN_ é recusado');
ok((await get('/api/google/callback?code=abc&state=forjado', adm.cookie)).status === 400, 'OAuth Google: state sem o cookie do fluxo é recusado');
const respErro = await db.whatsappConversation.findFirst({ where: { phone: '5521955550003' } });
if (respErro) {
  const lojaConv = await (await get(`/conversas?c=${respErro.id}`, loj.cookie)).text();
  ok(!lojaConv.includes('instância fora do ar'), 'detalhe de erro do provedor não aparece para a loja');
}

fake.close();

await db.$disconnect();
console.log(fails ? `\n${fails} FALHA(S)` : '\nTODOS OS TESTES PASSARAM');
process.exit(fails ? 1 : 0);
