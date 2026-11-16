// Gestão de usuários (só ADMIN) e troca de senha. Sem serviço de e-mail:
// o admin define uma senha temporária e o usuário é obrigado a trocá-la no
// primeiro acesso (mustChangePassword).
import { db } from './db.js';
import { hashPassword, verifyPassword } from './auth.js';
import { can } from './access.js';

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function denied() {
	return { error: 'Sem permissão.' };
}

export function validatePassword(password) {
	if (String(password ?? '').length < MIN_PASSWORD) {
		return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
	}
	return null;
}

async function activeAdminCount() {
	return db.user.count({ where: { role: 'ADMIN', active: true } });
}

export async function createUser(actor, { name, email, role, phone, password }) {
	if (!can(actor, 'usuarios')) return denied();
	const cleanName = String(name ?? '').trim().slice(0, 80);
	const cleanEmail = String(email ?? '').trim().toLowerCase();
	if (!cleanName) return { error: 'Nome é obrigatório.' };
	if (!EMAIL_RE.test(cleanEmail)) return { error: 'E-mail inválido.' };
	const passwordError = validatePassword(password);
	if (passwordError) return { error: passwordError };
	if (await db.user.findUnique({ where: { email: cleanEmail } })) {
		return { error: 'Já existe um usuário com esse e-mail.' };
	}
	const user = await db.user.create({
		data: {
			name: cleanName,
			email: cleanEmail,
			role: role === 'ADMIN' ? 'ADMIN' : 'LOJA',
			phone: String(phone ?? '').trim().slice(0, 30) || null,
			passwordHash: await hashPassword(password),
			mustChangePassword: true
		}
	});
	return { user };
}

export async function resetPassword(actor, id, password) {
	if (!can(actor, 'usuarios')) return denied();
	const passwordError = validatePassword(password);
	if (passwordError) return { error: passwordError };
	const { count } = await db.user.updateMany({
		where: { id },
		data: { passwordHash: await hashPassword(password), mustChangePassword: true }
	});
	if (!count) return { error: 'Usuário não encontrado.' };
	await db.session.deleteMany({ where: { userId: id } });
	return { ok: true };
}

export async function setActive(actor, id, active) {
	if (!can(actor, 'usuarios')) return denied();
	if (!active) {
		if (id === actor.id) return { error: 'Você não pode desativar a si mesmo.' };
		const target = await db.user.findUnique({ where: { id } });
		if (target?.role === 'ADMIN' && target.active && (await activeAdminCount()) <= 1) {
			return { error: 'É preciso manter pelo menos um administrador ativo.' };
		}
	}
	const { count } = await db.user.updateMany({ where: { id }, data: { active } });
	if (!count) return { error: 'Usuário não encontrado.' };
	if (!active) await db.session.deleteMany({ where: { userId: id } });
	return { ok: true };
}

export async function setRole(actor, id, role) {
	if (!can(actor, 'usuarios')) return denied();
	const next = role === 'ADMIN' ? 'ADMIN' : 'LOJA';
	if (next === 'LOJA') {
		const target = await db.user.findUnique({ where: { id } });
		if (target?.role === 'ADMIN' && target.active && (await activeAdminCount()) <= 1) {
			return { error: 'É preciso manter pelo menos um administrador ativo.' };
		}
	}
	await db.user.updateMany({ where: { id }, data: { role: next } });
	return { ok: true };
}

/** Troca a própria senha; encerra as outras sessões e mantém a atual. */
export async function changeOwnPassword(user, currentToken, current, next) {
	const full = await db.user.findUnique({ where: { id: user.id } });
	if (!full || !(await verifyPassword(String(current ?? ''), full.passwordHash))) {
		return { error: 'Senha atual incorreta.' };
	}
	const passwordError = validatePassword(next);
	if (passwordError) return { error: passwordError };
	if (next === current) return { error: 'A nova senha precisa ser diferente da atual.' };
	await db.user.update({
		where: { id: user.id },
		data: { passwordHash: await hashPassword(next), mustChangePassword: false }
	});
	await db.session.deleteMany({ where: { userId: user.id, token: { not: currentToken } } });
	return { ok: true };
}
