-- CreateEnum
CREATE TYPE "StageKind" AS ENUM ('ABERTA', 'GANHO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('CONSTRUCAO', 'MANUTENCAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('CARO', 'LONGE', 'SEM_EQUIPE', 'DESISTIU', 'SEM_RESPOSTA', 'OUTRO');

-- CreateEnum
CREATE TYPE "InteractionKind" AS ENUM ('NOTA', 'LIGACAO', 'VISITA', 'WHATSAPP', 'SISTEMA');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('ATIVO', 'PAUSADO', 'ENCERRADO');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "dealId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "autoKey" TEXT,
ADD COLUMN     "dealId" TEXT;

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "area" "Area" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "StageKind" NOT NULL DEFAULT 'ABERTA',

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "area" "Area" NOT NULL,
    "title" TEXT,
    "contactId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL DEFAULT 'CONSTRUCAO',
    "spaceType" TEXT,
    "squareMeters" INTEGER,
    "neighborhood" TEXT,
    "address" TEXT,
    "hasPhotos" BOOLEAN NOT NULL DEFAULT false,
    "askedQuote" BOOLEAN NOT NULL DEFAULT false,
    "valueCents" INTEGER,
    "source" TEXT,
    "notes" TEXT,
    "assigneeId" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "lostReason" "LostReason",
    "lostNote" TEXT,
    "firstContactAt" TIMESTAMP(3),
    "enteredStageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "dealId" TEXT,
    "kind" "InteractionKind" NOT NULL DEFAULT 'NOTA',
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageRule" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "followUpDays" INTEGER[],

    CONSTRAINT "StageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekday" INTEGER,
    "neighborhoods" TEXT[],

    CONSTRAINT "ServiceRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceContract" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "dealId" TEXT,
    "monthlyValueCents" INTEGER NOT NULL,
    "visitIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "nextVisitAt" TIMESTAMP(3),
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'ATIVO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_area_key_key" ON "PipelineStage"("area", "key");

-- CreateIndex
CREATE INDEX "Deal_stageId_idx" ON "Deal"("stageId");

-- CreateIndex
CREATE INDEX "Deal_area_idx" ON "Deal"("area");

-- CreateIndex
CREATE INDEX "Deal_assigneeId_idx" ON "Deal"("assigneeId");

-- CreateIndex
CREATE INDEX "Deal_contactId_idx" ON "Deal"("contactId");

-- CreateIndex
CREATE INDEX "Interaction_contactId_createdAt_idx" ON "Interaction"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Interaction_dealId_idx" ON "Interaction"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "StageRule_stageId_key" ON "StageRule"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_autoKey_key" ON "Task"("autoKey");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageRule" ADD CONSTRAINT "StageRule_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceContract" ADD CONSTRAINT "MaintenanceContract_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceContract" ADD CONSTRAINT "MaintenanceContract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS ligado e sem policy nas tabelas novas (ver migration enable_rls).
ALTER TABLE "PipelineStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Interaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StageRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceRoute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenanceContract" ENABLE ROW LEVEL SECURITY;

-- Etapas padrão (o nome é editável; o comportamento vem de `key` e `kind`).
INSERT INTO "PipelineStage" ("id", "area", "key", "name", "order", "kind") VALUES
	('stg_jardim_novo', 'JARDIM', 'novo', 'Novo', 1, 'ABERTA'),
	('stg_jardim_conversando', 'JARDIM', 'conversando', 'Conversando', 2, 'ABERTA'),
	('stg_jardim_qualificado', 'JARDIM', 'qualificado', 'Qualificado', 3, 'ABERTA'),
	('stg_jardim_visita', 'JARDIM', 'visita', 'Visita ou orçamento agendado', 4, 'ABERTA'),
	('stg_jardim_proposta', 'JARDIM', 'proposta', 'Proposta enviada', 5, 'ABERTA'),
	('stg_jardim_fechado', 'JARDIM', 'fechado', 'Fechado', 6, 'GANHO'),
	('stg_jardim_perdido', 'JARDIM', 'perdido', 'Perdido', 7, 'PERDIDO'),
	('stg_loja_pedido', 'LOJA', 'pedido', 'Novo pedido', 1, 'ABERTA'),
	('stg_loja_separando', 'LOJA', 'separando', 'Separando', 2, 'ABERTA'),
	('stg_loja_pronto', 'LOJA', 'pronto', 'Pronto para retirada ou envio', 3, 'ABERTA'),
	('stg_loja_entregue', 'LOJA', 'entregue', 'Entregue', 4, 'GANHO'),
	('stg_loja_cancelado', 'LOJA', 'cancelado', 'Cancelado', 5, 'PERDIDO')
ON CONFLICT DO NOTHING;

-- Retorno de proposta (D+1, D+3, D+7, D+14): desligado até o João ativar.
INSERT INTO "StageRule" ("id", "stageId", "active", "followUpDays") VALUES
	('rule_jardim_proposta', 'stg_jardim_proposta', false, ARRAY[1, 3, 7, 14])
ON CONFLICT DO NOTHING;
