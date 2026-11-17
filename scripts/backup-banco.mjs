// Backup lógico do banco (somente leitura): uma tabela por arquivo JSON.
// Uso: node scripts/backup-banco.mjs [pasta-de-destino]
// Lê DIRECT_URL do .env. O destino padrão fica FORA do projeto (dados de clientes).
import 'dotenv/config';
import pg from 'pg';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Sem DIRECT_URL no .env');
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const dir = process.argv[2] ?? join(homedir(), 'Backups-CRM-Paraiso', stamp);
mkdirSync(dir, { recursive: true, mode: 0o700 });

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ'); // foto consistente
const { rows: tables } = await client.query(
	"select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"
);
const summary = {};
for (const { table_name: t } of tables) {
	const { rows } = await client.query(`select * from "${t.replaceAll('"', '""')}"`);
	const file = join(dir, `${t}.json`);
	writeFileSync(file, JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
	chmodSync(file, 0o600);
	summary[t] = rows.length;
}
await client.query('COMMIT');
await client.end();
writeFileSync(join(dir, '_resumo.json'), JSON.stringify({ criadoEm: new Date().toISOString(), tabelas: summary }, null, 2));
console.log(`Backup em ${dir}`);
console.table(summary);
