// Build da Vercel: em produção aplica as migrations pendentes antes de compilar.
// Se a migration falhar, o build para e o site atual continua no ar (nada é trocado).
// Prévias e branches nunca tocam no banco.
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => {
	const r = spawnSync(cmd, args, { stdio: 'inherit' });
	if (r.status !== 0) process.exit(r.status ?? 1);
};

if (process.env.VERCEL_ENV === 'production') run('npx', ['prisma', 'migrate', 'deploy']);
run('npx', ['vite', 'build']);
