// Falha (exit 1) se alguma tabela do schema public estiver sem RLS.
// Rodar: npm run db:check-rls  (usa DIRECT_URL ou DATABASE_URL)
// Garante que a API pública do Supabase (chave anon) não lê nada: o app
// acessa o banco só pelo servidor, com o usuário postgres (BYPASSRLS).
import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
	`select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1`
);
await client.end();

if (rows.length > 0) {
	console.error('Tabelas SEM RLS:', rows.map((r) => r.tablename).join(', '));
	process.exit(1);
}
console.log('OK: todas as tabelas do schema public têm RLS ligado.');
