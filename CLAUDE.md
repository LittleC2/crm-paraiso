# CRM Paraíso das Plantas: regras para quem mexe no código

CRM do Paraíso das Plantas (cliente da Athenum). Hoje tem um único usuário, o João (ADMIN). Stack, papéis e estrutura de pastas estão no `README.md`. Este arquivo trata do que importa ao alterar o código com o Claude.

## Como o trabalho chega ao ar

Push na branch `main` publica sozinho: a Vercel faz o build e, em produção, aplica as migrations pendentes antes (`scripts/vercel-build.mjs`). Se a migration ou o build falharem, o site atual continua no ar. O GitHub Actions (`.github/workflows/verificar.yml`) só roda lint, testes e build. Isso significa:

- Rode `npm run lint`, `npm test` e `npm run build` antes de dar push. Se algum falhar, corrija antes de publicar.
- Para testar algo sem publicar, trabalhe numa branch (`git switch -c minha-ideia`). Branches geram só uma prévia na Vercel e nunca mexem no banco de produção. Para publicar, junte na `main`.
- Nunca use `git push --force` na `main`.
- Se uma publicação entrar com defeito: na Vercel, aba Deployments, "Promote to Production" no deploy anterior.

## Banco de dados

- O banco local de desenvolvimento é separado do de produção. Nunca coloque a `DATABASE_URL` ou a `DIRECT_URL` de produção no `.env` do seu computador. O passo a passo do banco local está em `docs/entrega-para-joao.md`.
- Mudou o `prisma/schema.prisma`: crie a migration com `npx prisma migrate dev --name descricao-curta`, nunca edite uma migration já criada.
- Migration só pode adicionar (tabela, coluna opcional, índice). Apagar coluna ou tabela, ou `DELETE`/`TRUNCATE`, não deve ir em migration automática: faça backup do banco e confirme com o dono do CRM antes.
- Tabela nova precisa de RLS ligado, sem policy (o gatilho da migration `enable_rls` cuida disso). Rode `npm run db:check-rls` e confira.

## Segredos

- `.env` nunca vai para o Git. Chaves, tokens e senhas nunca aparecem em código, em commit, em log ou em mensagem.
- Variáveis de produção ficam na Vercel (`vercel env`), não no repositório. Variável nova: adicione o nome em `.env.example` e cadastre o valor na Vercel (Settings > Environment Variables, Production).

## Regras do código que o Claude precisa respeitar

- Permissões e escopo: toda consulta de contatos, tarefas, eventos, negócios e conversas passa por `src/lib/server/access.js`. Não escreva consulta que fure esse filtro.
- `SOLO_MODE` (padrão ligado): só a área JARDIM aparece, `/pedidos` e `/usuarios` respondem 404. Os dados da loja continuam no banco.
- Quadros arrastáveis (funil e tarefas) usam `src/lib/boardSync.js`. Não volte a ressincronizar o estado durante o arrasto.
- Botões e controles seguem os tokens de `src/app.css` (`.btn`, `.btn-sm`, `.btn-lg`, `.actions`). Não crie tamanho ou espaçamento próprio por tela.
- WhatsApp (uazapi), mídia (Supabase Storage) e leads do Google Sheets têm código em `src/lib/server/whatsapp/`, `src/lib/server/storage.js` e `src/lib/server/leadIntake.js`. Webhook e rotas de lead são públicas por prefixo e protegidas por chave.
- Textos em português do Brasil, sem emoji em tela ou documento de cliente.

## Antes de dizer que terminou

1. `npm run lint`, `npm test`, `npm run build` passando.
2. Mexeu em tela: abra no `npm run dev` e veja funcionando, no computador e em largura de celular.
3. Depois do push, acompanhe o deploy na Vercel (aba Deployments) e abra o site para conferir.
