// Notificação push de verdade (Web Push + VAPID) pros lembretes chegarem
// mesmo com o Hub fechado. Única lib externa desse tipo no projeto — o
// resto (Meta, Google) usa fetch cru de propósito, mas Web Push exige
// criptografia assimétrica por especificação (ECDH + aesgcm); reimplementar
// isso à mão seria reinventar uma parte sensível de segurança de um
// protocolo padronizado.
import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { db } from './db.js';

// Mesmo padrão de db.js: evita reconfigurar a cada reload do Vite em dev.
const globalForPush = globalThis;

function ensureConfigured() {
	if (globalForPush.__webPushConfigured) return;
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
		throw new Error(
			'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT não configurados. Ver .env.example.'
		);
	}
	webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
	globalForPush.__webPushConfigured = true;
}

export function getVapidPublicKey() {
	return env.VAPID_PUBLIC_KEY ?? null;
}

export async function saveSubscription({ userId, endpoint, p256dh, auth, deviceLabel }) {
	return db.pushSubscription.upsert({
		where: { endpoint },
		update: { p256dh, auth, deviceLabel: deviceLabel || null },
		create: { userId, endpoint, p256dh, auth, deviceLabel: deviceLabel || null }
	});
}

export async function removeSubscription(endpoint) {
	await db.pushSubscription.deleteMany({ where: { endpoint } });
}

/** Manda pra uma lista de PushSubscription, isolando falha por dispositivo
 * — uma subscription morta (404/410) é removida em vez de travar as
 * outras. */
async function sendToSubscriptions(subscriptions, payload) {
	ensureConfigured();
	const body = JSON.stringify(payload);
	await Promise.all(
		subscriptions.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{
						endpoint: sub.endpoint,
						keys: { p256dh: sub.p256dh, auth: sub.auth }
					},
					body
				);
			} catch (err) {
				if (err.statusCode === 404 || err.statusCode === 410) {
					await removeSubscription(sub.endpoint).catch(() => {});
				} else {
					console.error(`[push] falha ao enviar pra ${sub.endpoint}:`, err.message);
				}
			}
		})
	);
}

export async function sendPushToUser(userId, payload) {
	const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
	await sendToSubscriptions(subscriptions, payload);
}

export async function sendPushToAll(payload) {
	const subscriptions = await db.pushSubscription.findMany();
	await sendToSubscriptions(subscriptions, payload);
}
