// Config do Prisma CLI (migrate, studio, seed). O app em si (SvelteKit) lê
// as env vars pelo próprio Vite — este arquivo só serve para rodar `prisma`
// fora do contexto do Vite.
//
// Supabase: o app usa DATABASE_URL (pooler, porta 6543, pgbouncer=true), que
// é o que funciona em serverless. Migrations NÃO funcionam pelo pooler em
// modo transação, então o CLI usa DIRECT_URL (conexão direta, porta 5432).
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
		seed: 'node prisma/seed.js'
	},
	datasource: {
		url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
		shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL
	}
});
