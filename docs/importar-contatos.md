# Como importar contatos para o CRM

Tela: **Contatos > Como importar** (`/contatos/importar`). Antes de gravar, o CRM mostra uma prévia
(quantos contatos novos, quantos já existem, quantos têm problema). Nada é gravado até você clicar em
"Importar".

## De onde vem o arquivo

**Google Contatos (Android ou conta Gmail).** No computador, abra contacts.google.com, clique em
Exportar, escolha "CSV do Google" e baixe o `contacts.csv`.

**iPhone (iCloud).** No computador, abra icloud.com/contacts, marque todos os contatos (Ctrl+A ou
Cmd+A), clique na engrenagem e em "Exportar vCard". O arquivo `.vcf` entra direto no CRM.

**Planilha (Excel, Google Sheets) ou outro sistema.** Baixe o modelo em `/contatos/modelo.csv`, copie os
contatos para ele e salve como CSV (no Excel, "CSV UTF-8").

## Colunas aceitas

Nome (obrigatório), Telefone, E-mail, Bairro, Cidade, Origem, Tipo, Etiquetas, Observações e
Autorizou WhatsApp (sim ou não). Do Google, o CRM entende "First Name", "Last Name", "Phone 1 - Value"
e "E-mail 1 - Value". Vários telefones na mesma célula: vale o primeiro.

## Regras

- Telefone com DDD, com ou sem 55. Sem DDD ou inválido, a linha vai para a lista de problemas.
- Telefone que já existe no CRM é ignorado (o contato atual não é alterado).
- Um arquivo por área (jardim ou loja). A equipe da loja só importa para a loja.
- Máximo de 2000 contatos e 1 MB por arquivo.
- Sem a coluna "Autorizou WhatsApp", o contato entra sem autorização. Ao iniciar a conversa pelo CRM,
  o sistema pede a confirmação de que o cliente já falou com a equipe.
