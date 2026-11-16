-- Mídia das conversas de WhatsApp: tipo normalizado, arquivo no Storage e estado do download.
CREATE TYPE "MediaState" AS ENUM ('NENHUMA', 'PENDENTE', 'SALVA', 'FALHOU');

ALTER TABLE "WhatsappMessage"
  ADD COLUMN "mediaPath" TEXT,
  ADD COLUMN "mediaMime" TEXT,
  ADD COLUMN "mediaName" TEXT,
  ADD COLUMN "mediaSize" INTEGER,
  ADD COLUMN "mediaSeconds" INTEGER,
  ADD COLUMN "mediaState" "MediaState" NOT NULL DEFAULT 'NENHUMA',
  ADD COLUMN "mediaTries" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "WhatsappMessage_mediaState_sentAt_idx" ON "WhatsappMessage"("mediaState", "sentAt");

-- Mídia já recebida antes desta migration: tenta baixar (a uazapi guarda 2 dias; o que expirou vira FALHOU).
UPDATE "WhatsappMessage" SET "mediaState" = 'PENDENTE'
WHERE "kind" = 'MIDIA' AND "mediaType" IS NOT NULL AND "externalId" IS NOT NULL AND "sentAt" > now() - interval '2 days';
