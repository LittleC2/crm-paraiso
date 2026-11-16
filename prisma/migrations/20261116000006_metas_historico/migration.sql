-- Metas mensais, log de mudança de etapa e fila de pedidos de histórico do WhatsApp.
-- Só adiciona tabelas; RLS ligado nas novas (acesso só pelo servidor).

-- CreateEnum
CREATE TYPE "GoalMetric" AS ENUM ('LEADS', 'VISITAS', 'PROPOSTAS', 'FECHAMENTOS', 'VALOR_FECHADO', 'RESPOSTA_HORAS', 'PEDIDOS_NOVOS', 'PEDIDOS_ENTREGUES');

-- CreateEnum
CREATE TYPE "HistoryRequestState" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "area" "Area" NOT NULL,
    "metric" "GoalMetric" NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'EQUIPE',
    "target" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageLog" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "area" "Area" NOT NULL,
    "toKey" TEXT NOT NULL,
    "toKind" "StageKind" NOT NULL,
    "userId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealStageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoryRequest" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "state" "HistoryRequestState" NOT NULL DEFAULT 'PENDENTE',
    "error" TEXT,
    "requestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Goal_period_area_metric_scope_key" ON "Goal"("period", "area", "metric", "scope");
CREATE INDEX "DealStageLog_area_at_idx" ON "DealStageLog"("area", "at");
CREATE INDEX "DealStageLog_dealId_idx" ON "DealStageLog"("dealId");
CREATE UNIQUE INDEX "HistoryRequest_channelId_contactId_key" ON "HistoryRequest"("channelId", "contactId");
CREATE INDEX "HistoryRequest_state_idx" ON "HistoryRequest"("state");

-- AddForeignKey
ALTER TABLE "DealStageLog" ADD CONSTRAINT "DealStageLog_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryRequest" ADD CONSTRAINT "HistoryRequest_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "WhatsappChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoryRequest" ADD CONSTRAINT "HistoryRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealStageLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HistoryRequest" ENABLE ROW LEVEL SECURITY;

-- Backfill: o log só existe daqui para frente; o que já está numa etapa conta pela data em que entrou nela.
INSERT INTO "DealStageLog" ("id", "dealId", "area", "toKey", "toKind", "userId", "at")
SELECT 'bf_' || d."id", d."id", d."area", s."key", s."kind", d."assigneeId", COALESCE(d."closedAt", d."enteredStageAt")
FROM "Deal" d JOIN "PipelineStage" s ON s."id" = d."stageId"
WHERE s."key" IN ('visita', 'proposta') OR s."kind" = 'GANHO';
