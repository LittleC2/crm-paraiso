// Gera o SQL para criar um usuario direto no SQL Editor do Supabase,
// sem deixar senha em .env. A senha e digitada aqui (nao aparece na tela) e
// so o hash scrypt (mesmo formato de src/lib/server/auth.js) vai para o SQL.
//
// Uso: node scripts/gerar-usuario-sql.mjs
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';

const scrypt = promisify(scryptCallback);

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Sem terminal (entrada por pipe, usada em teste): le todas as linhas de uma vez.
const piped = !process.stdin.isTTY ? [] : null;
if (piped) for await (const line of rl) piped.push(line);
const ask = (q) => (piped ? Promise.resolve(piped.shift() ?? '') : new Promise((r) => rl.question(q, r)));

function askHidden(q) {
	if (piped) return ask(q);
	return new Promise((resolve) => {
		const out = process.stdout;
		rl._writeToOutput = (s) => (s.includes(q) ? out.write(s) : out.write(''));
		rl.question(q, (v) => {
			out.write('\n');
			rl._writeToOutput = (s) => out.write(s);
			resolve(v);
		});
	});
}

const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;

const name = (await ask('Nome: ')).trim();
const email = (await ask('E-mail: ')).trim().toLowerCase();
const role = ((await ask('Perfil (ADMIN ou LOJA) [ADMIN]: ')).trim().toUpperCase() || 'ADMIN');
const password = await askHidden('Senha (min. 8 caracteres): ');
const trocar = (await ask('Obrigar troca no primeiro acesso? (s/N): ')).trim().toLowerCase() === 's';
rl.close();

if (!name || !email.includes('@')) throw new Error('Nome ou e-mail invalido.');
if (!['ADMIN', 'LOJA'].includes(role)) throw new Error('Perfil deve ser ADMIN ou LOJA.');
if (password.length < 8) throw new Error('Senha com menos de 8 caracteres.');

const salt = randomBytes(16).toString('hex');
const hash = `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;

console.log(`
-- Cole no SQL Editor do Supabase e execute.
INSERT INTO "User" (id, email, name, "passwordHash", role, active, "mustChangePassword")
VALUES (gen_random_uuid()::text, ${sql(email)}, ${sql(name)}, ${sql(hash)}, ${sql(role)}::"Role", true, ${trocar})
ON CONFLICT (email) DO UPDATE
  SET name = EXCLUDED.name, "passwordHash" = EXCLUDED."passwordHash",
      role = EXCLUDED.role, active = true, "mustChangePassword" = EXCLUDED."mustChangePassword";
`);
