// Cria (ou atualiza) as contas da equipe interna e as duas lojas.
// Rodar com: npm run db:seed
//
// Credenciais vêm de variáveis de ambiente para não deixar senha no código.
// Em produção (NODE_ENV=production) elas são obrigatórias; os padrões abaixo
// existem só para desenvolvimento local.
import 'dotenv/config';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const scrypt = promisify(scryptCallback);
const isProd = process.env.NODE_ENV === 'production';

// Mesmo formato de src/lib/server/auth.js: "salt:hash" em hex.
async function hashPassword(password) {
	const salt = randomBytes(16).toString('hex');
	const derived = await scrypt(password, salt, 64);
	return `${salt}:${derived.toString('hex')}`;
}

function required(name, devDefault) {
	const value = process.env[name];
	if (value) return value;
	if (isProd) throw new Error(`Variável ${name} obrigatória em produção.`);
	return devDefault;
}

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const admins = [
	{
		email: required('SEED_JOAO_EMAIL', 'joao@paraiso.local'),
		name: 'João',
		password: required('SEED_JOAO_PASSWORD', 'mude-esta-senha-1')
	},
	{
		email: required('SEED_EDUARDO_EMAIL', 'eduardo@paraiso.local'),
		name: 'Eduardo',
		password: required('SEED_EDUARDO_PASSWORD', 'mude-esta-senha-2')
	}
];

for (const admin of admins) {
	const passwordHash = await hashPassword(admin.password);
	await db.user.upsert({
		where: { email: admin.email },
		update: { name: admin.name, passwordHash, role: 'ADMIN', active: true },
		create: { email: admin.email, name: admin.name, passwordHash, role: 'ADMIN' }
	});
	console.log(`Conta ADMIN pronta: ${admin.email}`);
}

for (const name of ['Loja Serra', 'Loja Albuquerque']) {
	await db.store.upsert({ where: { name }, update: {}, create: { name } });
	console.log(`Loja pronta: ${name}`);
}

await db.$disconnect();
