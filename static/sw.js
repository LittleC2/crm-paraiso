// Service worker mínimo: recebe push e abre o CRM ao clicar. Sem cache
// offline de propósito (dado de CRM desatualizado é pior que tela de erro);
// existir é o que torna o app instalável.
self.addEventListener('push', (event) => {
	const data = event.data ? event.data.json() : {};
	event.waitUntil(
		self.registration.showNotification(data.title ?? 'Paraíso das Plantas', {
			body: data.body ?? '',
			icon: '/icon-192.png',
			data: { url: data.url ?? '/' }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(clients.openWindow(event.notification.data?.url ?? '/'));
});
