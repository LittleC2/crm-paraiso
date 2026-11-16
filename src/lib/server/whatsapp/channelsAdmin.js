// Configuração dos números de WhatsApp (só admin), usada pela seção
// "WhatsApp" de /ajustes. Cada ação confere a permissão: a tela de Ajustes é
// aberta a todos, então a proteção não pode ficar só no caminho da rota.
import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '../db.js';
import { allowedArea, can, conversationScope, soloMode } from '../access.js';
import { getProvider } from './provider.js';
import { deleteQuickReply, saveQuickReply } from './conversations.js';
import { historyProgress, queueHistory } from './history.js';

export async function loadWhatsappAdmin(user, url) {
	if (!can(user, 'canais')) return null;
	const [channels, replies, history] = await Promise.all([
		db.whatsappChannel.findMany({ where: conversationScope(user), orderBy: { name: 'asc' } }),
		db.quickReply.findMany({ where: conversationScope(user), orderBy: [{ area: 'asc' }, { title: 'asc' }] }),
		historyProgress()
	]);
	return {
		channels: channels.map((c) => ({
			...c,
			// só diz se o token existe no ambiente, nunca o valor
			tokenConfigured: Boolean(env[c.tokenEnv]),
			history: history[c.id] ?? null
		})),
		replies,
		solo: soloMode(),
		baseConfigured: Boolean(env.UAZAPI_URL),
		secretConfigured: Boolean(env.WHATSAPP_WEBHOOK_SECRET),
		origin: url.origin
	};
}

const respond = (r, ok = { ok: true }) => (r?.error ? fail(400, { error: r.error }) : ok);
const channelOf = async (form) => db.whatsappChannel.findUnique({ where: { id: String(form.get('id') ?? '') } });

// Envolve a ação: só admin, com o formulário já lido.
const adminOnly = (fn) => async (event) => {
	if (!can(event.locals.user, 'canais')) return fail(403, { error: 'Sem permissão.' });
	const form = await event.request.formData();
	return fn({ ...event, form });
};

export const whatsappActions = {
	zapCriar: adminOnly(async ({ form, locals }) => {
		const name = String(form.get('name') ?? '').trim().slice(0, 60);
		const tokenEnv = String(form.get('tokenEnv') ?? '').trim();
		if (!name) return fail(400, { error: 'Dê um nome ao número.' });
		if (!/^UAZAPI_TOKEN_[A-Z0-9_]{1,50}$/.test(tokenEnv)) {
			return fail(400, { error: 'O nome da variável deve começar com UAZAPI_TOKEN_ (ex: UAZAPI_TOKEN_SERRA).' });
		}
		if (await db.whatsappChannel.findUnique({ where: { name } })) return fail(400, { error: 'Já existe um número com esse nome.' });
		await db.whatsappChannel.create({ data: { name, tokenEnv, area: allowedArea(locals.user, String(form.get('area') ?? '')) } });
		return { ok: true };
	}),

	zapStatus: adminOnly(async ({ form }) => {
		const channel = await channelOf(form);
		if (!channel) return fail(404, { error: 'Número não encontrado.' });
		try {
			const { state, phone } = await getProvider(channel).status();
			await db.whatsappChannel.update({ where: { id: channel.id }, data: { state, phone: phone ?? channel.phone, stateAt: new Date() } });
			return { ok: true, quiet: form.get('quiet') === '1' };
		} catch (err) {
			return fail(400, { error: String(err.message) });
		}
	}),

	zapConectar: adminOnly(async ({ form }) => {
		const channel = await channelOf(form);
		if (!channel) return fail(404, { error: 'Número não encontrado.' });
		try {
			const { state, qrcode } = await getProvider(channel).connect();
			await db.whatsappChannel.update({ where: { id: channel.id }, data: { state, stateAt: new Date() } });
			return { qr: { channelId: channel.id, image: qrcode } };
		} catch (err) {
			return fail(400, { error: String(err.message) });
		}
	}),

	zapDesconectar: adminOnly(async ({ form }) => {
		const channel = await channelOf(form);
		if (!channel) return fail(404, { error: 'Número não encontrado.' });
		try {
			await getProvider(channel).disconnect();
			await db.whatsappChannel.update({ where: { id: channel.id }, data: { state: 'DESCONECTADO', stateAt: new Date() } });
			return { ok: true };
		} catch (err) {
			return fail(400, { error: String(err.message) });
		}
	}),

	zapWebhook: adminOnly(async ({ form, url }) => {
		const channel = await channelOf(form);
		if (!channel) return fail(404, { error: 'Número não encontrado.' });
		if (!env.WHATSAPP_WEBHOOK_SECRET) return fail(400, { error: 'Defina WHATSAPP_WEBHOOK_SECRET no ambiente.' });
		try {
			const target = `${url.origin}/api/whatsapp/webhook?canal=${channel.id}&chave=${encodeURIComponent(env.WHATSAPP_WEBHOOK_SECRET)}`;
			await getProvider(channel).configureWebhook(target);
			return { ok: true };
		} catch (err) {
			return fail(400, { error: String(err.message) });
		}
	}),

	zapHistorico: adminOnly(async ({ form, locals }) => {
		const r = await queueHistory(locals.user, String(form.get('id') ?? ''));
		return r.error ? fail(400, { error: r.error }) : { ok: true, queued: r.queued };
	}),

	zapAtivo: adminOnly(async ({ form }) => {
		await db.whatsappChannel.updateMany({ where: { id: String(form.get('id')) }, data: { active: form.get('active') === '1' } });
		return { ok: true };
	}),

	zapResposta: adminOnly(async ({ form, locals }) => respond(await saveQuickReply(locals.user, Object.fromEntries(form)))),
	zapExcluirResposta: adminOnly(async ({ form, locals }) => respond(await deleteQuickReply(locals.user, String(form.get('id'))))),
};
