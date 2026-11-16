# Setup do Google Cloud pra sincronizar a Google Agenda

Pré-requisito pra Tarefas com responsável e prazo aparecerem
automaticamente na Google Agenda de cada sócio. Sem isso, criar/excluir
tarefa continua funcionando normal — só a sincronização com a Agenda fica
sem efeito (silenciosa, sem erro).

## 1. Criar o projeto e ativar a API

1. Acesse [console.cloud.google.com](https://console.cloud.google.com) e
   crie um projeto (ex: "Athenum Hub").
2. Em **APIs e serviços → Biblioteca**, procure **Google Calendar API** e
   clique em **Ativar**.

## 2. Tela de consentimento OAuth

Em **APIs e serviços → Tela de consentimento OAuth**:

- Tipo: **Externo** (funciona com conta pessoal do Gmail mesmo sem
  publicar o app).
- Preencha nome do app, e-mail de suporte, e-mail de contato do
  desenvolvedor.
- Em **Usuários de teste**, adicione o e-mail de cada sócio que for
  conectar a Agenda. Enquanto o app estiver em modo **Testing** (não
  precisa publicar nem passar pela revisão do Google), só esses e-mails
  conseguem autorizar — suficiente pros 2 sócios da agência.

## 3. Criar a credencial OAuth

Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente
OAuth**:

- Tipo de aplicativo: **Aplicativo da Web**.
- **URIs de redirecionamento autorizados**, adicionar:
  - `http://localhost:5183/api/google/callback` (dev local)
  - `<HUB_PUBLIC_URL>/api/google/callback` (produção — ex:
    `https://hub.athenum.com.br/api/google/callback`)

Depois de criar, copiar o **Client ID** e o **Client Secret**.

## 4. Configurar no Hub

No `.env` (local) e nas env vars do Railway (produção):

```
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="...."
GOOGLE_REDIRECT_URI="http://localhost:5183/api/google/callback"  # trocar pela URL de produção lá
```

## 5. Conectar pelo Hub

Cada sócio conecta a própria Agenda em **Ajustes** (`/ajustes`) dentro do
Hub, já logado com sua conta — não precisa mexer em código de novo depois
disso.

## Escopo do v1

Só sincroniza tarefas **com responsável definido** — tarefa "os dois"
não vai pra nenhuma agenda automaticamente. Cria o evento quando a
tarefa é criada, apaga quando a tarefa é excluída. Não existe edição de
tarefa ainda no Hub, então não há um terceiro gatilho de "atualizar" por
enquanto.
