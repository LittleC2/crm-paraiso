# CRM Paraíso das Plantas: regras para quem mexe no código

CRM do Paraíso das Plantas (cliente da Athenum). Hoje tem um único usuário, o João (ADMIN). Stack, papéis e estrutura de pastas estão no `README.md`. Este arquivo trata do que importa ao alterar o código com o Claude.

## Como o trabalho chega ao ar

Push na branch `main` publica sozinho em https://crm-paraiso.vercel.app, depois que testes, lint e build passam (`.github/workflows/deploy.yml`). Em seguida o workflow aplica as migrations novas no banco de produção. Isso significa:

- Rode `npm run lint`, `npm test` e `npm run build` antes de dar push. Se algum falhar, corrija antes de publicar.
- Para testar algo sem publicar, trabalhe numa branch (`git switch -c minha-ideia`). Branches só rodam a verificação, não publicam. Para publicar, junte na `main`.
- Nunca use `git push --force` na `main`.

## Banco de dados

- O banco local de desenvolvimento é separado do de produção. Nunca coloque a `DATABASE_URL` ou a `DIRECT_URL` de produção no `.env` do seu computador. O passo a passo do banco local está em `docs/trabalhar-em-dupla.md`.
- Mudou o `prisma/schema.prisma`: crie a migration com `npx prisma migrate dev --name descricao-curta`, nunca edite uma migration já criada.
- Migration só pode adicionar (tabela, coluna opcional, índice). Apagar coluna ou tabela, ou `DELETE`/`TRUNCATE`, é bloqueado pelo workflow e exige o Carlos.
- Tabela nova precisa de RLS ligado, sem policy (o gatilho da migration `enable_rls` cuida disso). Rode `npm run db:check-rls` e confira.

## Segredos

- `.env` nunca vai para o Git. Chaves, tokens e senhas nunca aparecem em código, em commit, em log ou em mensagem.
- Variáveis de produção ficam na Vercel (`vercel env`), não no repositório. Variável nova: adicione o nome em `.env.example` e peça ao Carlos para cadastrar o valor na Vercel.

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
3. Depois do push, acompanhe a aba Actions do GitHub até o fim do job "publicar" e abra o site para conferir.
