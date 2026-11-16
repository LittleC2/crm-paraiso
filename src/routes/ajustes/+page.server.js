import { db } from '$lib/server/db.js';
import { disconnectUser, isGoogleConfigured } from '$lib/server/googleCalendar.js';
import { getVapidPublicKey } from '$lib/server/push.js';
import { leadActions, loadLeadAdmin } from '$lib/server/leadAdmin.js';
import { loadWhatsappAdmin, whatsappActions } from '$lib/server/whatsapp/channelsAdmin.js';

export const load = async ({ locals, url }) => {
	const connection = await db.googleCalendarConnection.findUnique({
		where: { userId: locals.user.id },
		select: { createdAt: true }
	});

	return {
		wa: await loadWhatsappAdmin(locals.user, url),
		leads: await loadLeadAdmin(locals.user, url),
		googleConfigured: isGoogleConfigured(),
		googleConnected: Boolean(connection),
		googleConnectedSince: connection?.createdAt ?? null,
		vapidPublicKey: getVapidPublicKey(),
		flash: {
			connected: url.searchParams.get('googleConnected') === '1',
			error: url.searchParams.get('googleError')
		}
	};
};

export const actions = {
	...whatsappActions,
	...leadActions,
	desconectarGoogle: async ({ locals }) => {
		await disconnectUser(locals.user.id);
		return { disconnected: true };
	}
};
