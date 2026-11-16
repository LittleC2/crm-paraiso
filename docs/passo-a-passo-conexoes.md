# Passo a passo: ligar o CRM do Paraíso das Plantas

O deploy já está na Vercel (projeto `crm-paraiso`, time ATHENUM, produção em
**https://crm-paraiso.vercel.app**, feito em 15/11/2026), mas **sem
nenhuma conexão**: sem banco, sem WhatsApp, sem agendador. Sem as variáveis
abaixo, a tela de login abre e qualquer ação que use o banco dá erro. Siga na
ordem.

## 1. Supabase (banco)

1. Crie um projeto em supabase.com, região **South America (São Paulo)**.
   Guarde a senha do banco. Para uso real, plano **Pro** (o gratuito pausa
   projeto parado e não tem backup diário).
2. Em **Project Settings > Database > Connection string**, copie duas strings:
   - **Transaction pooler** (porta 6543): vira `DATABASE_URL`. Acrescente
     `?pgbouncer=true` no final.
   - **Session pooler** (porta 5432, IPv4): vira `DIRECT_URL`. Não use a "Direct connection": ela só tem IPv6 e muitas redes não alcançam. O usuário no pooler é `postgres.<ref-do-projeto>`.
   - Use sempre o usuário `postgres` (tem BYPASSRLS).
3. Em **Database > Extensions**, ative `pg_cron` e `pg_net` (para o agendador,
   passo 5).

## 2. Criar as tabelas e os usuários (na sua máquina)

Na pasta `crm-paraiso/`, crie um `.env` (nunca vai para o git) com:

```
DATABASE_URL="..."          # pooler, com ?pgbouncer=true
DIRECT_URL="..."            # direto
SEED_JOAO_EMAIL="..."
SEED_JOAO_PASSWORD="..."    # mínimo 8 caracteres
SEED_EDUARDO_EMAIL="..."
SEED_EDUARDO_PASSWORD="..."
```

Depois, em ordem:

```
npx prisma migrate deploy        # cria tabelas, etapas do funil, RLS
NODE_ENV=production npm run db:seed   # João e Eduardo (ADMIN) e as 2 lojas
npm run db:check-rls             # deve dizer: OK, todas com RLS
```

Se o `db:check-rls` listar alguma tabela, ligue com
`ALTER TABLE "Nome" ENABLE ROW LEVEL SECURITY;` antes de continuar.

Usuários também podem ser criados sem senha em `.env`: `node scripts/gerar-usuario-sql.mjs`
pede nome, e-mail, perfil e senha (sem aparecer na tela) e imprime um `INSERT` para colar no
SQL Editor do Supabase.

## 3. Variáveis na Vercel

Projeto `crm-paraiso` > Settings > Environment Variables (Production e
Preview), ou `vercel env add NOME production` na pasta do projeto:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | pooler do Supabase |
| `DIRECT_URL` | conexão direta |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `node -e "console.log(require('web-push').generateVAPIDKeys())"` |
| `VAPID_SUBJECT` | `mailto:contato@athenum.com.br` |
| `UAZAPI_URL` | URL do servidor da uazapi, sem barra no final |
| `UAZAPI_TOKEN_LOJA_SERRA`, `UAZAPI_TOKEN_LOJA_ALBUQUERQUE`, `UAZAPI_TOKEN_JOAO` | token de cada instância |
| `WHATSAPP_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `WHATSAPP_WAIT_ALERT_HOURS` | opcional (ex: `2`); vazio = alerta desligado |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | opcional (sincronizar tarefas com o Google Agenda) |

Use sempre `https://crm-paraiso.vercel.app` nas URLs do cron e do webhook, não a
URL longa de cada deploy (essas pedem login na Vercel e bloqueariam a uazapi e o
Supabase).

Depois de cadastrar tudo, faça um novo deploy para valer:
`vercel deploy --prod --scope athenum` (na pasta `crm-paraiso/`).

## 4. Primeiro acesso

1. Abra a URL do projeto e entre com o João ou o Eduardo.
2. Em **Usuários**, crie os funcionários da loja (perfil "Equipe da loja") com
   senha temporária; eles trocam no primeiro acesso.
3. Em **Funil > Regras e rotas**: cadastre as rotas de atendimento e decida se
   liga o retorno automático de proposta (D+1, D+3, D+7, D+14). Vem desligado.
4. Em **Conversas > Números**: cadastre as respostas rápidas.
5. No iPhone: Safari > Compartilhar > Adicionar à Tela de Início. Notificação
   push no iOS só funciona com o app instalado (iOS 16.4 ou mais novo).

## 5. Agendador (lembretes, avisos de evento, reprocesso do WhatsApp)

No SQL Editor do Supabase (troque a URL e o segredo):

```sql
select cron.schedule('crm-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://crm-paraiso.vercel.app/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET')
  );
$$);
```

Teste: `curl -X POST https://crm-paraiso.vercel.app/api/cron/tick -H "Authorization: Bearer SEU_CRON_SECRET"`
deve devolver `{"ok":true,...}`. Sem o segredo, devolve 401.

## 6. WhatsApp (uazapi)

1. Na uazapi, crie **uma instância por número** (Loja Serra, Loja Albuquerque,
   João) e copie o token de cada uma para as variáveis do passo 3.
2. Em **Conversas > Números**: "Novo número" com nome, área (Loja ou Jardim) e o
   nome da variável do token (ex: `UAZAPI_TOKEN_LOJA_SERRA`).
3. Clique em **Conectar (QR)** e leia o código no celular da loja (WhatsApp >
   Aparelhos conectados). Depois **Configurar webhook**.
4. Teste: mande uma mensagem de outro celular para o número. Ela deve aparecer em
   **Conversas**. Responda pelo CRM e confira se chegou.
5. Risco: serviço não oficial. A Meta pode bloquear o número e a sessão por QR
   pode cair (a tela mostra "Desconectado"). Não envie mensagens em massa.

## 7. Antes de usar com clientes de verdade

- Trocar as senhas do seed por senhas fortes e únicas.
- Plano Supabase Pro (backup diário) e testar uma restauração.
- Vercel: o plano Hobby é só para uso pessoal e não comercial, e o time ATHENUM
  está no Hobby. Para operação do cliente, plano **Pro**.
- Não há 2FA. Considere adicionar antes de abrir para mais gente.
- LGPD: o cadastro de contato tem o campo de autorização de WhatsApp; só inicie
  conversa com quem autorizou.

## Testes locais

```
npm test                     # unitários
node scripts/e2e-access.mjs  # integração (banco local descartável + vite dev)
```

## Estado em 16/11/2026

Feito: projeto Supabase `crm-paraiso` (São Paulo), migrations 1 a 5, RLS, João e Eduardo como ADMIN,
variáveis na Vercel (banco, `CRON_SECRET`, `WHATSAPP_WEBHOOK_SECRET`, VAPID), `pg_cron` ativo a cada
minuto, deploy em produção. Falta: credenciais do Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`), servidor e tokens da uazapi, trocar a senha do banco (foi colada em conversa).
Etapas, motivos de perda, origens e tipos de serviço são editados em **Funil > Configurar funil**.
