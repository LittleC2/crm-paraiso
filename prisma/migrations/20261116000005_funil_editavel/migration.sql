-- Funil editável: cor da etapa, listas editáveis (motivos de perda, origens,
-- tipos de serviço) e preferências do quadro por usuário.
-- Os dois enums viram texto para a equipe poder editar as listas; os valores
-- existentes continuam válidos (a chave é a mesma).

-- AlterTable
ALTER TABLE "PipelineStage" ADD COLUMN "color" TEXT;
ALTER TABLE "User" ADD COLUMN "boardPrefs" JSONB;

-- Enums -> texto
ALTER TABLE "Deal" ALTER COLUMN "lostReason" TYPE TEXT USING "lostReason"::text;
ALTER TABLE "Deal" ALTER COLUMN "serviceType" DROP DEFAULT;
ALTER TABLE "Deal" ALTER COLUMN "serviceType" TYPE TEXT USING "serviceType"::text;
ALTER TABLE "Deal" ALTER COLUMN "serviceType" SET DEFAULT 'CONSTRUCAO';
DROP TYPE "LostReason";
DROP TYPE "ServiceType";

-- CreateEnum
CREATE TYPE "ListKind" AS ENUM ('MOTIVO_PERDA', 'ORIGEM', 'SERVICO');

-- CreateTable
CREATE TABLE "ListOption" (
    "id" TEXT NOT NULL,
    "kind" "ListKind" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ListOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListOption_kind_key_key" ON "ListOption"("kind", "key");

-- Sem acesso pela API pública do Supabase (só o servidor, com a conexão do Prisma).
ALTER TABLE "ListOption" ENABLE ROW LEVEL SECURITY;

-- Valores iniciais (os que já estavam no código)
INSERT INTO "ListOption" ("id", "kind", "key", "label", "order") VALUES
	('lo_perda_caro', 'MOTIVO_PERDA', 'CARO', 'Achou caro', 1),
	('lo_perda_longe', 'MOTIVO_PERDA', 'LONGE', 'Longe demais', 2),
	('lo_perda_sem_equipe', 'MOTIVO_PERDA', 'SEM_EQUIPE', 'Sem equipe disponível', 3),
	('lo_perda_desistiu', 'MOTIVO_PERDA', 'DESISTIU', 'Desistiu', 4),
	('lo_perda_sem_resposta', 'MOTIVO_PERDA', 'SEM_RESPOSTA', 'Parou de responder', 5),
	('lo_perda_outro', 'MOTIVO_PERDA', 'OUTRO', 'Outro', 6),
	('lo_serv_construcao', 'SERVICO', 'CONSTRUCAO', 'Construção', 1),
	('lo_serv_manutencao', 'SERVICO', 'MANUTENCAO', 'Manutenção', 2),
	('lo_serv_outro', 'SERVICO', 'OUTRO', 'Outro', 3),
	('lo_orig_instagram', 'ORIGEM', 'instagram', 'Instagram', 1),
	('lo_orig_anuncio', 'ORIGEM', 'anuncio', 'Anúncio', 2),
	('lo_orig_loja', 'ORIGEM', 'loja', 'Loja', 3),
	('lo_orig_indicacao', 'ORIGEM', 'indicacao', 'Indicação', 4),
	('lo_orig_estrada', 'ORIGEM', 'estrada', 'Estrada', 5);
