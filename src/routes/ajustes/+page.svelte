<script>
	import { enhance } from '$app/forms';
	import WhatsappSettings from '$lib/components/WhatsappSettings.svelte';
	import SheetsIntegration from '$lib/components/SheetsIntegration.svelte';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	// Estado da notificação push é lido do próprio navegador (Push API),
	// não do servidor — o Hub não tem como saber se ESTE navegador
	// específico já tem uma subscription ativa sem perguntar a ele.
	let pushSupported = $state(true);
	let pushSubscribed = $state(false);
	let pushBusy = $state(false);
	let pushMessage = $state('');

	function supportsWebPush() {
		return 'serviceWorker' in navigator && 'PushManager' in window;
	}

	// Chave VAPID vem em base64url; a Push API exige um Uint8Array — conversão
	// padrão do ecossistema Web Push, sem lib nova só por causa disso.
	function urlBase64ToUint8Array(base64String) {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		const rawData = atob(base64);
		return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
	}

	// Abas: o link (#whatsapp, #integracoes) abre a aba certa.
	const TABS = [
		{ id: 'geral', label: 'Geral' },
		{ id: 'whatsapp', label: 'WhatsApp', admin: true },
		{ id: 'google', label: 'Google Agenda' },
		{ id: 'integracoes', label: 'Integrações', admin: true }
	];
	let tab = $state('geral');
	const tabs = $derived(TABS.filter((x) => !x.admin || (x.id === 'whatsapp' ? data.wa : data.leads)));
	$effect(() => {
		const wanted = location.hash.slice(1);
		if (TABS.some((x) => x.id === wanted)) tab = wanted;
		else if (data.flash.connected || data.flash.error) tab = 'google';
	});
	$effect(() => {
		if (form?.leadError || form?.leadOk || form?.leadKey) tab = 'integracoes';
	});
	function onHash() {
		const wanted = location.hash.slice(1);
		if (TABS.some((x) => x.id === wanted)) tab = wanted;
	}
	function openTab(id) {
		tab = id;
		history.replaceState(null, '', `#${id}`);
	}

	onMount(async () => {
		if (!supportsWebPush()) {
			pushSupported = false;
			return;
		}
		const registration = await navigator.serviceWorker.register('/sw.js');
		const subscription = await registration.pushManager.getSubscription();
		pushSubscribed = Boolean(subscription);
	});

	async function ativarPush() {
		pushBusy = true;
		pushMessage = '';
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				pushMessage =
					'Permissão negada: habilite notificações pro CRM nas configurações do navegador.';
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(data.vapidPublicKey)
			});
			const json = subscription.toJSON();
			const res = await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			pushSubscribed = true;
		} catch (err) {
			pushMessage = `Falha ao ativar: ${err.message}`;
		} finally {
			pushBusy = false;
		}
	}

	async function desativarPush() {
		pushBusy = true;
		pushMessage = '';
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (subscription) {
				await fetch('/api/push/unsubscribe', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ endpoint: subscription.endpoint })
				});
				await subscription.unsubscribe();
			}
			pushSubscribed = false;
		} catch (err) {
			pushMessage = `Falha ao desativar: ${err.message}`;
		} finally {
			pushBusy = false;
		}
	}

	async function testarPush() {
		pushBusy = true;
		pushMessage = '';
		try {
			const res = await fetch('/api/push/test', { method: 'POST' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			pushMessage = 'Notificação de teste enviada.';
		} catch (err) {
			pushMessage = `Falha ao enviar teste: ${err.message}`;
		} finally {
			pushBusy = false;
		}
	}

	const GOOGLE_ERRORS = {
		nao_configurado: 'A integração com o Google ainda não está configurada. Avise o administrador.',
		access_denied: 'A conexão foi cancelada ou o seu e-mail ainda não foi liberado no Google. Peça a um administrador para incluir o seu e-mail na lista de usuários de teste e tente de novo.',
		redirect_uri_mismatch: 'O endereço de retorno do Google não confere com o configurado. Avise o administrador.',
		invalid_grant: 'O Google recusou o código de acesso (ele expira em poucos minutos). Tente conectar de novo.'
	};
	const googleErrorText = (code) => GOOGLE_ERRORS[code] ?? `Não foi possível conectar o Google Agenda (${code}). Tente de novo ou avise o administrador.`;
</script>

<svelte:window onhashchange={onHash} />

<svelte:head>
	<title>Ajustes · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<h1>Ajustes</h1>

	{#if data.flash.connected}
		<p class="success-text">Google Agenda conectada.</p>
	{/if}
	{#if data.flash.error}
		<p class="error-text">{googleErrorText(data.flash.error)}</p>
	{/if}

	<nav class="tabs" aria-label="Seções dos ajustes">
		{#each tabs as x (x.id)}
			<button type="button" class="tab" class:on={tab === x.id} aria-current={tab === x.id ? 'page' : undefined} onclick={() => openTab(x.id)}>{x.label}</button>
		{/each}
	</nav>

	{#if tab === 'whatsapp' && data.wa}
		<WhatsappSettings wa={data.wa} {form} />
	{/if}

	{#if tab === 'integracoes' && data.leads}
		<SheetsIntegration leads={data.leads} {form} />
	{/if}

	{#if tab === 'google'}
	<section class="card section">
		<h2>Google Agenda</h2>
		<p class="hint">
			Reuniões, visitas, entregas, viagens e prazos de tarefas em que você é participante ou
			responsável aparecem automaticamente na sua Google Agenda. É uma via só: o que você muda na
			Google Agenda não volta para o CRM.
		</p>

		{#if data.googleConnected}
			<div class="status">
				<span class="badge badge-success">Conectada</span>
				{#if data.googleConnectedSince}
					<span class="since"
						>desde {new Date(data.googleConnectedSince).toLocaleDateString('pt-BR')}</span
					>
				{/if}
			</div>
			<form method="POST" action="?/desconectarGoogle" use:enhance>
				<button class="btn btn-secondary" type="submit">Desconectar</button>
			</form>
		{:else}
			<div class="status">
				<span class="badge">Não conectada</span>
			</div>
			{#if data.googleConfigured}
				<a class="btn" href={resolve('/api/google/connect')}>Conectar Google Agenda</a>
				<p class="hint">
					Na tela do Google, escolha o seu e-mail. Se aparecer "app não verificado", clique em Avançado e
					depois em "Ir para CRM Paraíso das Plantas". Se aparecer "Acesso bloqueado", peça a um
					administrador para incluir o seu e-mail na lista de usuários de teste do Google.
				</p>
			{:else}
				<button class="btn" type="button" disabled>Conectar Google Agenda</button>
				<p class="hint">A integração com o Google ainda não está configurada. Avise o administrador.</p>
			{/if}
		{/if}
	</section>
	{/if}

	{#if tab === 'geral'}
	<section class="card section">
		<h2>Notificações push</h2>
		<p class="hint">Lembretes chegam como notificação neste navegador, mesmo com o CRM fechado.</p>

		{#if !pushSupported}
			<p class="hint">Este navegador não suporta notificações push.</p>
		{:else if !data.vapidPublicKey}
			<p class="hint">VAPID_PUBLIC_KEY não configurado no servidor.</p>
		{:else}
			<div class="status">
				<span class="badge" class:badge-success={pushSubscribed}>
					{pushSubscribed ? 'Ativadas' : 'Desativadas'}
				</span>
			</div>
			{#if pushMessage}
				<p class="hint">{pushMessage}</p>
			{/if}
			<div class="push-actions">
				{#if pushSubscribed}
					<button class="btn btn-secondary" type="button" disabled={pushBusy} onclick={desativarPush}>
						Desativar
					</button>
					<button class="btn btn-secondary" type="button" disabled={pushBusy} onclick={testarPush}>
						Mandar notificação de teste
					</button>
				{:else}
					<button class="btn" type="button" disabled={pushBusy} onclick={ativarPush}>
						Ativar notificações
					</button>
				{/if}
			</div>
		{/if}
	</section>
	{/if}
</main>

<style>
	.page {
		max-width: 780px;
		margin: 0 auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.tabs { display: flex; gap: 0.3rem; flex-wrap: wrap; border-bottom: 1px solid var(--color-border); }
	.tab { background: none; border: 0; border-bottom: 2px solid transparent; min-height: var(--control-h); padding: 0 0.9rem; font-weight: 700; color: var(--color-text-dim); cursor: pointer; }
	.tab:hover { color: var(--color-text); }
	.tab.on { color: var(--color-accent-text); border-bottom-color: var(--color-accent); }

	h1 {
		margin: 0;
		font-size: 1.3rem;
	}

	.section {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.section h2 {
		margin: 0;
		font-size: 1rem;
	}

	.hint {
		margin: 0;
		color: var(--color-text-dim);
		font-size: 0.85rem;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.badge-success {
		border-color: var(--color-success);
		color: var(--color-success);
	}

	.since {
		font-size: 0.75rem;
		color: var(--color-text-dim);
	}

	.push-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
</style>
