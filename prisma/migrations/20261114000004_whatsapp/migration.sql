-- CreateEnum
CREATE TYPE "ChannelState" AS ENUM ('DESCONHECIDO', 'CONECTADO', 'CONECTANDO', 'DESCONECTADO');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ABERTA', 'PENDENTE', 'FECHADA');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXTO', 'MIDIA', 'NOTA');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('RECEBIDA', 'ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

-- CreateTable
CREATE TABLE "WhatsappChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" "Area" NOT NULL,
    "phone" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'uazapi',
    "tokenEnv" TEXT NOT NULL,
    "state" "ChannelState" NOT NULL DEFAULT 'DESCONHECIDO',
    "stateAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WhatsappChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappConversation" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "area" "Area" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ABERTA',
    "assigneeId" TEXT,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "optOutAt" TIMESTAMP(3),
    "waitingAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXTO',
    "body" TEXT,
    "mediaType" TEXT,
    "externalId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'RECEBIDA',
    "authorId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappWebhookInbox" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsappWebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickReply" (
    "id" TEXT NOT NULL,
    "area" "Area" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappChannel_name_key" ON "WhatsappChannel"("name");

-- CreateIndex
CREATE INDEX "WhatsappConversation_area_status_idx" ON "WhatsappConversation"("area", "status");

-- CreateIndex
CREATE INDEX "WhatsappConversation_lastMessageAt_idx" ON "WhatsappConversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversation_channelId_phone_key" ON "WhatsappConversation"("channelId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_externalId_key" ON "WhatsappMessage"("externalId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_conversationId_sentAt_idx" ON "WhatsappMessage"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "WhatsappWebhookInbox_processedAt_receivedAt_idx" ON "WhatsappWebhookInbox"("processedAt", "receivedAt");

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "WhatsappChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappWebhookInbox" ADD CONSTRAINT "WhatsappWebhookInbox_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "WhatsappChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS ligado e sem policy nas tabelas novas (ver migration enable_rls).
ALTER TABLE "WhatsappChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsappConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsappMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsappWebhookInbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuickReply" ENABLE ROW LEVEL SECURITY;
