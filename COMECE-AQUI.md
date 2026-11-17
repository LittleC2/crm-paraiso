# CRM Paraíso das Plantas: instalar a sua cópia

Este projeto é uma cópia completa e independente do CRM. Você roda no seu computador, personaliza do jeito que quiser e publica na **sua** Vercel, com o **seu** banco no Supabase e as **suas** chaves. Nada aqui depende de contas, chaves ou bancos de outra pessoa, e nenhuma chave vem dentro da pasta.

## Jeito mais fácil: peça ao Claude

Abra esta pasta no Claude Code (ou envie a pasta ou o link do repositório) e cole:

> Leia o `COMECE-AQUI.md` e o `CLAUDE.md` e instale este CRM para mim: primeiro rodando no meu computador com um banco local, depois publicando na minha Vercel com um banco novo no meu Supabase. Pare e me peça quando precisar que eu crie uma conta, copie uma chave ou clique em algo que você não pode fazer. Nunca coloque chave nenhuma no código nem no Git.

O resto deste arquivo é o roteiro que o Claude segue. Dá para fazer à mão também.

## O que você precisa criar (uma vez)

1. **Supabase** (supabase.com): um projeto novo, região São Paulo (`sa-east-1`). Anote a senha do banco que você escolher.
2. **Vercel** (vercel.com): conta no plano Pro, porque o uso é comercial (o plano gratuito proíbe).
3. **GitHub** (opcional, recomendado): repositório privado seu, para publicar com um `git push`.

## Parte 1: rodar no seu computador

Pré-requisitos: Node 22 ou mais novo e Git.

```
npm install
npx prisma dev --detach --name crm-dev
```

O segundo comando cria um Postgres local e imprime uma conexão `postgres://...` (a de TCP). Depois:

1. `cp .env.example .env`.
2. No `.env`, preencha só: `DATABASE_URL` e `DIRECT_URL` com a conexão local (as duas iguais, terminando em `?sslmode=disable`), `CRON_SECRET` (qualquer texto longo) e as variáveis `SEED_JOAO_EMAIL` e `SEED_JOAO_PASSWORD` (a conta que vai entrar no CRM). Deixe em branco o que for de WhatsApp, Google, push e Storage: o CRM abre sem essas conexões.
3. `npm run db:deploy`, `npm run db:seed`, `npm run dev`, e abra http://localhost:5173.

## Parte 2: publicar na sua Vercel, com seu banco

1. No Supabase, em Connect, copie duas conexões do usuário `postgres`:
   - `DATABASE_URL`: pooler em modo transação, porta 6543, terminando em `?pgbouncer=true`.
   - `DIRECT_URL`: conexão direta ou pooler de sessão, porta 5432.
2. Crie o projeto na Vercel a partir desta pasta (`npx vercel link`, framework SvelteKit; a região `gru1` já vem na configuração).
3. Cadastre na Vercel, em Settings > Environment Variables (Production), no mínimo:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | pooler (6543) |
   | `DIRECT_URL` | conexão direta (5432) |
   | `CRON_SECRET` | texto longo e aleatório (`openssl rand -hex 32`) |
   | `SEED_JOAO_EMAIL`, `SEED_JOAO_PASSWORD` | seu login no CRM |

   Os segredos novos (`CRON_SECRET` e os de WhatsApp e push) saem de `node scripts/gerar-chaves.mjs`: copie o resultado para a Vercel, sem gravar em arquivo do projeto.

4. Publique: `npx vercel deploy --prod`. O build roda `scripts/vercel-build.mjs`, que aplica as migrations no seu banco antes de compilar. Se algo falhar, o build para e nada é trocado.
5. Crie a sua conta de login uma única vez, no seu terminal, informando as variáveis na própria linha (sem gravar no `.env`):

   ```
   NODE_ENV=production DIRECT_URL='<sua conexão direta>' SEED_JOAO_EMAIL='<email>' SEED_JOAO_PASSWORD='<senha>' npm run db:seed
   ```
6. Abra o endereço da Vercel e entre. Troque a senha em `/senha`.
7. Para publicar sozinho a cada `git push`: suba o código para o seu GitHub e conecte o repositório em Vercel > Settings > Git.

## Parte 3: conexões opcionais (liga quando precisar)

Cada uma vira variável de ambiente na Vercel (nomes e comentários em `.env.example`; passo a passo em `docs/`). Os endereços de exemplo nos documentos são os da instalação original: troque pelo seu domínio.

- **Lembretes e agendador:** uma chamada por minuto em `POST /api/cron/tick` com `Authorization: Bearer <CRON_SECRET>` (agendamento com `pg_cron` do Supabase no `README.md`).
- **Notificações push:** `node -e "console.log(require('web-push').generateVAPIDKeys())"` gera `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`; `VAPID_SUBJECT` é `mailto:seu-email`.
- **WhatsApp (uazapi):** conta própria na uazapi, `UAZAPI_URL`, um `UAZAPI_TOKEN_*` por número e `WHATSAPP_WEBHOOK_SECRET`. Detalhes no `README.md`. Mídia (fotos, áudios) exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do seu projeto.
- **Google Agenda:** `docs/setup-google-calendar.md`, com o seu projeto no Google Cloud.
- **Leads por planilha do Google:** em Ajustes > Integrações do CRM, sem variável extra.

## Personalizar

Peça ao Claude. Os pontos principais:
- Nome, cores e fonte: `src/app.css` e `static/` (ícones e manifest do app instalável).
- Textos e menu: `src/routes/` e `src/lib/components/Sidebar.svelte`.
- Etapas do funil, listas e metas: dentro do CRM, em Ajustes e Funil > Configurar.
- Modo com uma única pessoa: variável `SOLO_MODE` (ligado por padrão). `SOLO_MODE=false` reativa a loja e a equipe de duas áreas.

## Para não quebrar

- As regras estão no `CLAUDE.md`, que o Claude lê sozinho: rodar `npm run lint`, `npm test` e `npm run build` antes de publicar, migration só adiciona, nenhuma chave no código.
- Build ou migration com erro não troca o site no ar. Se uma publicação sair com defeito, na Vercel, aba Deployments, use "Promote to Production" no deploy anterior.
- Antes de qualquer mudança grande no banco, faça backup: `node scripts/backup-banco.mjs` (precisa do certificado raiz do Supabase em `PG_CA_CERT_PATH`; instruções no topo do script).

## Se você recebeu o arquivo `chaves.env.enc`

Ele guarda só as conexões do banco já existente do CRM original (`DATABASE_URL` e `DIRECT_URL`), para continuar com os mesmos dados em vez de um banco novo. A senha vem separada, por outro canal. Para abrir: `openssl enc -d -aes-256-cbc -pbkdf2 -in chaves.env.enc -out .env.producao`. Esse arquivo é só para copiar os dois valores para a Vercel: nunca renomeie para `.env`, nunca rode o CRM local contra ele e nunca suba para o Git (já está no `.gitignore`). Apontar duas instalações para o mesmo banco funciona, mas elas passam a compartilhar contatos e conversas.
