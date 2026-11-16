import { PrismaClient } from '../../generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '$env/dynamic/private';

// Uma instância só de PrismaClient por processo. Em dev, o Vite recarrega
// módulos a cada mudança de arquivo — sem isso, cada reload abriria uma
// conexão nova com o Postgres até esgotar o pool.
const globalForPrisma = globalThis;

function createClient() {
	const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
	return new PrismaClient({ adapter });
}

export const db = globalForPrisma.__prisma ?? createClient();

if (env.NODE_ENV !== 'production') {
	globalForPrisma.__prisma = db;
}
