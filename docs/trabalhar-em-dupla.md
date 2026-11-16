# Trabalhar no CRM em dupla (Carlos e João)

O código do CRM fica num repositório privado no GitHub. Cada pessoa trabalha numa cópia no próprio computador, com o Claude. Quando alguém envia (push) uma alteração para a branch `main`, o GitHub verifica o código, atualiza o banco e publica no CRM que está na Vercel do Carlos. Nada é copiado à mão.

```
computador do João  --push-->  GitHub (main)  --Actions-->  testes + migrations + deploy  -->  crm-paraiso.vercel.app
computador do Carlos --push-->  GitHub (main)
```

## Parte 1: uma vez só, feita pelo Carlos

1. Criar o repositório privado `crm-paraiso` no GitHub (mesma conta do `athenum-site`) e enviar o código.
2. No repositório, em Settings > Collaborators, convidar o João com permissão Write.
3. Na Vercel, criar um token em Account Settings > Tokens (nome `github-deploy`, escopo da equipe `athenum`).
4. No GitHub, em Settings > Secrets and variables > Actions, cadastrar quatro segredos:
   - `VERCEL_TOKEN`: o token do passo 3.
   - `VERCEL_ORG_ID`: `team_4RcAWiKOTE7aAnXY5nwgUyUh`.
   - `VERCEL_PROJECT_ID`: `prj_BZ14BLonXMaYUvVLiLuI0DcWNQNk`.
   - `DIRECT_URL`: a conexão direta (porta 5432) do banco de produção no Supabase, a mesma da Vercel.
5. Garantir que o projeto na Vercel não esteja ligado ao GitHub por integração própria (Settings > Git > Disconnect). A publicação é feita só pelo workflow; os dois juntos publicariam duas vezes.
6. Fazer um push de teste e conferir a aba Actions: os dois jobs (`verificar` e `publicar`) precisam ficar verdes.

O João não vê nenhum desses segredos. Ele só consegue publicar porque o workflow usa o token do Carlos.

## Parte 2: preparar o computador do João (uma vez)

1. Instalar Node 22 ou mais novo, Git e o Claude Code.
2. Aceitar o convite do GitHub e entrar na conta pelo terminal (`git` pede o login na primeira vez).
3. Baixar o projeto:
   ```
   git clone https://github.com/<conta>/crm-paraiso.git
   cd crm-paraiso
   npm install
   ```
4. Criar o banco de desenvolvimento local, que não toca na produção:
   ```
   npx prisma dev --detach --name crm-dev
   ```
   O comando imprime uma conexão `postgres://...` (a de TCP). Guarde ela.
5. Copiar `.env.example` para `.env` e preencher só o mínimo:
   - `DATABASE_URL` e `DIRECT_URL`: a conexão do passo 4 (as duas iguais, terminando em `?sslmode=disable`).
   - `CRON_SECRET`: qualquer texto longo.
   - `SEED_JOAO_EMAIL`, `SEED_JOAO_PASSWORD`, `SEED_EDUARDO_EMAIL`, `SEED_EDUARDO_PASSWORD`: valores de teste, só para o computador dele.
   - Deixar vazio o que for do WhatsApp, Google, push e Storage. O CRM abre normalmente sem essas conexões.
6. Montar o banco local e abrir o CRM:
   ```
   npm run db:deploy
   npm run db:seed
   npm run dev
   ```
   Abrir http://localhost:5173 e entrar com o e-mail e a senha de teste.

Nunca colocar no `.env` do computador as conexões do banco de produção.

## Parte 3: o dia a dia do João

1. Abrir a pasta `crm-paraiso` no Claude Code (as skills e o jeito de trabalhar dele continuam valendo; o `CLAUDE.md` do projeto é lido automaticamente e traz as regras do CRM).
2. Antes de começar, trazer o que o Carlos mudou: `git pull`.
3. Pedir a alteração ao Claude e conferir no `npm run dev`.
4. Quando estiver bom, pedir ao Claude para rodar lint, testes e build e enviar: commit e `git push`.
5. Acompanhar em GitHub > Actions. Em cerca de 3 a 5 minutos o CRM de produção está atualizado. Se o job `verificar` ficar vermelho, nada é publicado e o banco não muda; o Claude corrige a partir da mensagem de erro.

Para testar uma ideia sem publicar: `git switch -c nome-da-ideia`, trabalhar e dar push na branch. Ela só roda a verificação. Para publicar, juntar na `main` (`git switch main`, `git merge nome-da-ideia`, `git push`).

## O que protege a produção

- Só publica se lint, testes e build passarem.
- Migration nova que apaga tabela, coluna ou dados é bloqueada. O Carlos revisa e libera incluindo `[destrutiva-ok]` na mensagem do commit.
- As migrations só rodam na `main`, depois da verificação, e só as que ainda não foram aplicadas.
- O banco de produção, o WhatsApp e as chaves só existem na Vercel, no Supabase e nos segredos do GitHub. O computador do João não os recebe.

## Se algo der errado

- Publicação com erro depois do deploy: na Vercel, aba Deployments, o deploy anterior tem "Promote to Production" para voltar na hora. Migration já aplicada não é desfeita; avisar o Carlos.
- Esqueceu de dar `git pull` e o push foi recusado: `git pull`, resolver o que o Claude indicar e enviar de novo.
- Variável de ambiente nova: o Carlos cadastra o valor em Vercel > Settings > Environment Variables e faz novo deploy (Actions > Run workflow, ou um push qualquer).
