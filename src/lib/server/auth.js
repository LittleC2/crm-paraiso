// Autenticação própria, sem provedor terceiro (Supabase Auth não é usado:
// o Supabase é só o Postgres). Usuários criados pelo seed e pela tela de
// usuários do admin. Sessão = token opaco em cookie httpOnly, guardado na
// tabela Session (revogável: apagar a linha derruba a sessão).
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE = 'paraiso_crm_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Chave de rate limit: hash de e-mail + IP, nunca o IP puro. */
export function attemptKey(email, ip) {
	return createHash('sha256').update(`${email}|${ip}`).digest('hex');
}

export async function tooManyAttempts(keyHash) {
	const since = new Date(Date.now() - LOGIN_WINDOW_MS);
	const count = await db.loginAttempt.count({ where: { keyHash, createdAt: { gte: since } } });
	return count >= MAX_LOGIN_ATTEMPTS;
}

export async function recordFailedAttempt(keyHash) {
	await db.loginAttempt.create({ data: { keyHash } });
}

export async function clearAttempts(keyHash) {
	await db.loginAttempt.deleteMany({ where: { keyHash } });
}

/** Gera "salt:hash" em hex a partir de uma senha em texto puro. */
export async function hashPassword(password) {
	const salt = randomBytes(16).toString('hex');
	const derived = await scrypt(password, salt, 64);
	return `${salt}:${derived.toString('hex')}`;
}

/** Compara senha em texto puro com o "salt:hash" guardado no banco. */
export async function verifyPassword(password, stored) {
	const [salt, hashHex] = stored.split(':');
	if (!salt || !hashHex) return false;
	const derived = await scrypt(password, salt, 64);
	const storedBuf = Buffer.from(hashHex, 'hex');
	// Tamanhos diferentes quebrariam timingSafeEqual — trata como inválido.
	if (derived.length !== storedBuf.length) return false;
	return timingSafeEqual(derived, storedBuf);
}

/** Cria uma sessão nova pro usuário e devolve o token pra virar cookie. */
export async function createSession(userId) {
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	await db.session.create({ data: { token, userId, expiresAt } });
	return { token, expiresAt };
}

/** Busca a sessão pelo token do cookie; null se inválida/expirada. */
export async function getSessionUser(token) {
	if (!token) return null;
	const session = await db.session.findUnique({
		where: { token },
		include: { user: true }
	});
	if (!session) return null;
	if (session.expiresAt < new Date()) {
		await db.session.delete({ where: { id: session.id } }).catch(() => {});
		return null;
	}
	// Usuário desativado pelo admin perde o acesso na hora, mesmo com sessão válida.
	if (!session.user.active) return null;
	return session.user;
}

export async function deleteSession(token) {
	if (!token) return;
	await db.session.deleteMany({ where: { token } });
}

export function setSessionCookie(cookies, token, expiresAt) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
