-- Integração de leads (Google Sheets via Apps Script) e registro de cada chegada.
CREATE TYPE "LeadIntakeStatus" AS ENUM ('CRIADO', 'DUPLICADO', 'INVALIDO', 'ERRO');

CREATE TABLE "LeadIntegration" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'SHEETS',
  "secretHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "stageId" TEXT,
  "ownerId" TEXT NOT NULL,
  "defaultSource" TEXT,
  "defaultService" TEXT,
  "mapping" JSONB NOT NULL DEFAULT '{}',
  "lastEventAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadIntegration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadIntake" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "LeadIntakeStatus" NOT NULL,
  "reason" TEXT,
  "name" TEXT,
  "phone" TEXT,
  "payload" JSONB,
  "dealId" TEXT,
  "contactId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadIntake_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadIntegration_name_key" ON "LeadIntegration"("name");
CREATE UNIQUE INDEX "LeadIntake_integrationId_dedupeKey_key" ON "LeadIntake"("integrationId", "dedupeKey");
CREATE INDEX "LeadIntake_integrationId_createdAt_idx" ON "LeadIntake"("integrationId", "createdAt");
ALTER TABLE "LeadIntake" ADD CONSTRAINT "LeadIntake_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "LeadIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadIntegration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadIntake" ENABLE ROW LEVEL SECURITY;
