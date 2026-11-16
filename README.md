# CRM Paraíso das Plantas

Tarefas, agenda, contatos e funil de serviços de jardim para a equipe do
Paraíso das Plantas. PWA instalável no iPhone. Plano completo, fases e
decisões: `~/.claude/plans/preciso-montar-uma-reuni-o-snappy-sundae.md`.

## Stack

SvelteKit 2 + Svelte 5 (JavaScript), Prisma 7, Postgres no **Supabase**
(somente o banco; a autenticação é própria), deploy na **Vercel**
(`adapter-vercel`, região `gru1`). WhatsApp (Fase 3) pela **uazapi**.

## Papéis

- `ADMIN`: equipe interna (João, Eduardo). Vê tudo.
- `LOJA`: equipe externa (funcionários das lojas). Vê só a área `LOJA`.

O escopo é aplicado no servidor em `src/lib/server/access.js`. Toda query de
contatos, tarefas, eventos e lembretes passa por ele. Testes: `npm test`.

## Rodando localmente

1. `npm install` (roda `prisma generate`).
2. `cp .env.example .env` e preencha (use um projeto Supabase de
   **desenvolvimento**, nunca o de produção).
3. `npm run db:deploy` (aplica as migrations) e `npm run db:seed`.
4. `npm run db:check-rls` (deve dizer que todas as tabelas têm RLS).
5. `npm run dev`.

## Supabase

- `DATABASE_URL`: pooler (porta 6543, `?pgbouncer=true`), usada pelo app.
- `DIRECT_URL`: conexão direta (porta 5432), usada por migrations e seed.
- Use sempre o usuário `postgres` (tem `BYPASSRLS`).
- **RLS está ligado em todas as tabelas, sem nenhuma policy, de propósito**:
  a API pública do Supabase (chave anon) não lê nada, só o servidor. A
  migration `enable_rls` também cria um gatilho que liga RLS em tabelas novas.
  Se uma migration futura criar tabela, rode `npm run db:check-rls`.

## Vercel

1. Importe o repositório, framework SvelteKit, região `gru1`.
2. Cadastre as variáveis do `.env.example` no painel (Production e Preview).
3. Produção só com OK do Carlos; a cada entrega, confira o deploy de prévia.

## Agendador (lembretes)

A Vercel não tem processo sempre ligado, então o `node-cron` do Hub original
saiu. A rota `POST /api/cron/tick` (header `Authorization: Bearer
$CRON_SECRET`) despacha os lembretes vencidos. Chame a cada minuto:

- **Supabase** (`pg_cron` + `pg_net`, sem custo extra):
  ```sql
  select cron.schedule('crm-tick', '* * * * *', $$
    select net.http_post(
      url := 'https://SEU-DOMINIO/api/cron/tick',
      headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET')
    );
  $$);
  ```
- ou **Vercel Cron**, mas o plano Hobby só permite execução diária e o Hobby
  é de uso pessoal e não comercial; para cliente, plano Pro.

## Estrutura

- `src/routes/`: telas e rotas (`+page.svelte` = UI, `+page.server.js` = backend).
- `src/lib/server/`: `access.js` (papéis), `auth.js`, `tasks.js`, `reminders.js`,
  `push.js`, `googleCalendar.js`, `db.js`.
- `prisma/schema.prisma` e `prisma/migrations/`: nunca edite uma migration já aplicada.
- `static/`: PWA (`manifest.webmanifest`, ícones, `sw.js`).

## Identidade visual

Verde-mata `#16241B`, creme `#F7F5EF`, dourado `#F0B429` (texto dourado sobre
claro `#A06F09`), Figtree. Fonte da verdade:
`clientes/Paraíso-das-Plantas/identidade/design-guide.md`.

## WhatsApp (uazapi)

Um número = uma instância da uazapi. Em **Conversas > Números** (só admin):
cadastre o número, informe o nome da variável de ambiente com o token, use
"Conectar (QR)" e "Configurar webhook". O webhook chega em
`/api/whatsapp/webhook?canal=<id>&chave=<WHATSAPP_WEBHOOK_SECRET>`; o evento é
gravado na caixa de entrada (`WhatsappWebhookInbox`) antes de ser processado, e
o cron reprocessa o que falhar (3 tentativas) e apaga o já processado após 7 dias.

- Equipe da loja só enxerga conversas de números com área `LOJA`.
- Mensagem da própria API e de grupos é ignorada. Duplicatas por `externalId`.
- "PARAR" bloqueia qualquer envio ao contato.
- Limite de 20 envios por minuto por usuário.
- Risco do serviço não oficial: a Meta pode bloquear o número, e a sessão por QR
  pode cair. A camada `src/lib/server/whatsapp/provider.js` tem interface única,
  então trocar por outro provedor não mexe no resto do CRM.

## Testes

- `npm test`: unitários (papéis, telefone, CSV, agenda, funil, WhatsApp).
- `node scripts/e2e-access.mjs`: integração contra um banco **local descartável**
  e o servidor em `vite dev`. As variáveis necessárias estão no topo do script.
  Recusa rodar contra Supabase. Sobe sozinho uma uazapi falsa na porta 5198.

## Status

Fase 0, Fase 1 (papéis, tarefas, lembretes, contatos com CSV, agenda, usuários),
Fase 2 (funil de jardins, pedidos da loja, regras por etapa, rotas, manutenção,
painel) e Fase 3 (WhatsApp) implementadas e testadas localmente. Nada foi
publicado: faltam projeto Supabase, projeto Vercel, número real na uazapi e
revisão de segurança antes de produção.
