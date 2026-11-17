# Entrega do CRM para o João

Objetivo: o João vira dono do CRM (código, publicação, banco e conexões), altera com o Claude dele e publica sozinho, sem que o endereço, os dados ou as conexões mudem e sem derrubar o site que está no ar.

Princípio que evita quebrar coisas: o projeto é transferido inteiro, em vez de recriado. Variáveis, chaves e o endereço `crm-paraiso.vercel.app` vão junto dentro da Vercel. Webhook do WhatsApp, Google Agenda, agendador, notificações e o app instalado no iPhone continuam funcionando sem ninguém reconfigurar.

## Antes de começar (Carlos)

1. Backup do banco. Supabase, Database > Backups, ou `pg_dump` com a conexão direta. Guarde o arquivo fora do repositório.
2. Escolha um horário de pouco uso (de manhã cedo ou à noite). Avise o João que o CRM pode ficar alguns minutos instável.
3. O João precisa ter, no nome dele: conta no GitHub, conta na Vercel (plano Pro, porque o uso é comercial; o Hobby proíbe) e conta no Supabase. Tudo com autenticação em dois fatores.

## Ordem da transferência

Faça um item por vez e confira que o CRM abre e que entrar, abrir uma conversa e abrir o funil funcionam antes de passar ao próximo.

1. **GitHub.** No repositório, Settings > Danger Zone > Transfer ownership, para a conta do João. O João aceita pelo e-mail. Apague antes os quatro segredos do Actions (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `DIRECT_URL`): não são mais usados, e o token da Vercel em `vercel.com/account/tokens` também deve ser revogado.
2. **Vercel.** No projeto, Settings > General > Transfer Project, para a equipe do João. As variáveis de ambiente (incluindo as sensíveis) e o domínio `crm-paraiso.vercel.app` seguem com o projeto. Depois, na conta do João: Settings > Git > Connect Git Repository, escolhendo o repositório transferido e a branch `main`. A partir daí, push na `main` publica sozinho e roda as migrations (`scripts/vercel-build.mjs`).
3. **Supabase.** No projeto, Settings > General > Transfer project, para a organização do João. As conexões continuam iguais. Gire a senha do banco logo depois (Database > Settings > Reset password) e atualize `DATABASE_URL` e `DIRECT_URL` na Vercel do João.
4. **Google (Agenda).** No console do Google Cloud do projeto `crm-paraiso`, IAM, adicione o João como Proprietário. O app está em modo de teste: o e-mail dele precisa estar na lista de usuários de teste.
5. **uazapi (WhatsApp).** A instância e o token estão na conta do Carlos. Duas saídas: o João cria a conta dele e reconecta o número (novo token e novo webhook, ver README), ou o Carlos mantém a conta e repassa a cobrança. Decidam antes; é o único item que exige reconectar o WhatsApp.

## Chaves e conexões: como entregar sem expor

Com o projeto transferido, o João não precisa receber nenhuma chave: elas ficam dentro da Vercel dele. Para o computador dele, o `.env` é só de desenvolvimento, com banco local, e não leva nenhuma chave de produção (ver Parte 2).

Se for preciso passar qualquer segredo (por exemplo o token da uazapi, se o Carlos continuar com a conta), use um cofre de senhas compartilhado (1Password, Bitwarden) ou um recado que se apaga depois de lido. Nunca por e-mail, WhatsApp comum, chat ou dentro do repositório.

Variáveis que o projeto usa (valores ficam na Vercel): `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `UAZAPI_URL`, `UAZAPI_TOKEN_*`, `WHATSAPP_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. A lista comentada está em `.env.example`.

## Como o João trabalha (Parte 2)

1. Instalar Node 22 ou mais novo, Git e o Claude Code. Baixar o projeto: `git clone <endereço do repositório>` e `npm install`.
2. Banco de desenvolvimento local, que não toca na produção: `npx prisma dev --detach --name crm-dev`. O comando imprime uma conexão `postgres://...` (a de TCP).
3. Copiar `.env.example` para `.env` e preencher só o mínimo: `DATABASE_URL` e `DIRECT_URL` com a conexão do passo 2 (as duas iguais, terminando em `?sslmode=disable`), `CRON_SECRET` com qualquer texto longo e as quatro variáveis `SEED_*` com valores de teste. Deixar vazio o que for de WhatsApp, Google, push e Storage.
4. `npm run db:deploy`, `npm run db:seed`, `npm run dev`. Abrir http://localhost:5173.
5. Abrir a pasta no Claude Code. O `CLAUDE.md` do projeto é lido sozinho e traz as regras.
6. Para publicar: `npm run lint`, `npm test`, `npm run build`, depois `git push` na `main`. A Vercel faz o build; se a migration ou o build falharem, o site atual continua no ar.

## O que protege o site de quebrar

- Build ou migration com erro não troca o site: a versão em produção continua a anterior.
- Branches e pull requests geram só uma prévia na Vercel e rodam a verificação (`verificar.yml`); nunca mexem no banco de produção.
- O banco de desenvolvimento é local. Nenhuma chave de produção fica no computador.
- Se uma publicação entrar com defeito: na Vercel, aba Deployments, no deploy anterior, "Promote to Production" volta na hora. Migration já aplicada não se desfaz sozinha; por isso migration só pode adicionar (regra no `CLAUDE.md`). Restaure o backup do banco apenas como último recurso.
- Variável nova de ambiente: cadastrar em Vercel > Settings > Environment Variables (Production) e republicar.

## Depois da entrega

- O Carlos remove o acesso dele às contas que não precisa mais, ou mantém só como convidado se continuar dando suporte.
- Quem for dono de cada conta (GitHub, Vercel, Supabase, Google, uazapi) anota onde fica a recuperação de acesso (e-mail e telefone da conta).
