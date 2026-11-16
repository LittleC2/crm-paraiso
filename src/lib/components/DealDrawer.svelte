<script>
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import { formatPhone, waLink } from '$lib/phone.js';
	import { formatBRL } from '$lib/money.js';
	import { callAction } from '$lib/formAction.js';
	import { retryMedia, sendFile } from '$lib/chatClient.js';
	import ChatThread from './ChatThread.svelte';
	import Composer from './Composer.svelte';
	import NewConversation from './NewConversation.svelte';

	// Painel lateral do quadro: etapa do lead e conversa de WhatsApp no mesmo lugar.
	let { deal, stages, basePath, onclose } = $props();

	let chat = $state(null);
	let loading = $state(true);
	let error = $state('');
	let newChatOpen = $state(false);


	async function load() {
		try {
			const res = await fetch(`/api/negocio/${deal.id}/conversa`);
			if (!res.ok) throw new Error(String(res.status));
			chat = await res.json();
			error = '';
		} catch {
			error = 'Não foi possível carregar a conversa.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		load();
		const timer = setInterval(() => document.visibilityState === 'visible' && load(), 5_000);
		return () => clearInterval(timer);
	});

	const done = async (r) => (r.ok && (await Promise.all([load(), invalidateAll()])), r);
	const send = (body) => callAction('/conversas?/enviar', { id: chat.conversation.id, text: body }).then(done);
	const file = (f, opts) => sendFile(chat.conversation.id, f, opts).then(done);
	const retry = async (m) => (await retryMedia(m.id), load());

	async function moveTo(stageId) {
		if (stageId === deal.stageId) return;
		const moved = await callAction(`${basePath}/${deal.id}?/mover`, { stageId });
		if (!moved.ok) error = 'Essa etapa exige outro caminho (por exemplo, motivo de perda na ficha).';
		else await invalidateAll();
	}

</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<button class="scrim" type="button" aria-label="Fechar painel" onclick={onclose}></button>
<aside class="drawer" aria-label="Conversa de {deal.contact.name}">
	<header>
		<div class="avatar">{deal.contact.name.trim().charAt(0).toUpperCase()}</div>
		<div class="who">
			<h2>{deal.contact.name}</h2>
			<p>{deal.contact.phone ? formatPhone(deal.contact.phone) : 'Sem telefone'}{deal.valueCents ? ` · ${formatBRL(deal.valueCents)}` : ''}</p>
		</div>
		<button class="close" type="button" onclick={onclose} aria-label="Fechar"><X size={18} /></button>
	</header>

	<div class="stage-bar">
		<label>
			<span>Etapa</span>
			<select value={deal.stageId} onchange={(e) => moveTo(e.currentTarget.value)}>
				{#each stages as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
			</select>
		</label>
		<a class="btn btn-secondary btn-sm" href={resolve(`${basePath}/${deal.id}`)}>Ficha completa</a>
	</div>

	{#if deal.title}<p class="summary">{deal.title}</p>{/if}
	{#if error}<p class="error-text">{error}</p>{/if}

	{#if loading}
		<p class="empty">Carregando conversa...</p>
	{:else if !chat?.conversation}
		<div class="empty">
			<p>Ainda não há conversa de WhatsApp com este contato.</p>
			{#if deal.contact.phone}
				<button class="btn btn-sm" type="button" onclick={() => (newChatOpen = true)}>Iniciar conversa</button>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="link" href={waLink(deal.contact.phone)} target="_blank" rel="noopener noreferrer">ou abrir no app do WhatsApp</a>
			{:else}
				<p class="hint">Este contato não tem telefone. Cadastre o telefone na ficha para conversar.</p>
			{/if}
			<p class="hint">As respostas do cliente aparecem aqui sozinhas.</p>
		</div>
	{:else}
		{#if chat.conversation.channel.state === 'DESCONECTADO'}
			<p class="alert">Número desconectado. As mensagens não serão enviadas até reconectar.</p>
		{/if}
		{#if chat.conversation.optOutAt}<p class="alert">Este contato pediu para não receber mensagens.</p>{/if}

		<ChatThread messages={chat.conversation.messages} onretry={retry} />
		<Composer
			replies={chat.replies}
			disabled={!!chat.conversation.optOutAt}
			blocked={chat.conversation.optOutAt ? 'Este contato pediu para não receber mensagens.' : ''}
			contactName={deal.contact.name}
			agentName={chat.me?.name ?? ''}
			mediaEnabled={chat.mediaEnabled}
			onsend={send}
			onfile={file}
		/>
	{/if}
</aside>

{#if newChatOpen}
	<NewConversation
		contact={{ id: deal.contact.id, name: deal.contact.name, phone: deal.contact.phone }}
		onclose={() => (newChatOpen = false)}
		ondone={async () => {
			newChatOpen = false;
			loading = true;
			await load();
		}}
	/>
{/if}

<style>
	.scrim { position: fixed; inset: 0; background: rgba(22, 36, 27, 0.35); border: 0; padding: 0; z-index: 40; cursor: default; }
	.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100vw); background: var(--color-bg); border-left: 1px solid var(--color-border); z-index: 41; display: flex; flex-direction: column; gap: 0.7rem; padding: 1rem; box-shadow: -8px 0 30px rgba(0, 0, 0, 0.12); }
	header { display: flex; align-items: center; gap: 0.7rem; }
	.avatar { width: 2.4rem; height: 2.4rem; border-radius: 50%; background: var(--color-accent-dim); color: var(--color-accent-text); display: grid; place-items: center; font-weight: 800; flex: none; }
	.who { min-width: 0; flex: 1; }
	.who h2 { margin: 0; font-size: 1.05rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.who p { margin: 0.1rem 0 0; font-size: 0.8rem; color: var(--color-text-dim); }
	.close { background: none; border: 0; cursor: pointer; color: var(--color-text-dim); padding: 0.3rem; }
	.stage-bar { display: flex; gap: 0.6rem; align-items: flex-end; }
	.stage-bar label { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-text-dim); }
	.stage-bar select { background: var(--color-bg-alt); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.45rem 0.6rem; color: var(--color-text); font-size: 0.9rem; text-transform: none; letter-spacing: 0; }
	.summary { margin: 0; font-size: 0.85rem; color: var(--color-text-dim); }
	.empty { padding: 1.2rem; text-align: center; color: var(--color-text-dim); display: flex; flex-direction: column; gap: 0.7rem; align-items: center; }
	.hint { font-size: 0.78rem; margin: 0; }
	.link { background: none; border: 0; padding: 0; color: var(--color-accent-text); font-weight: 700; font-size: 0.8rem; cursor: pointer; text-decoration: underline; }
	.alert { margin: 0; padding: 0.5rem 0.8rem; border-radius: var(--radius-button); background: rgba(194, 54, 43, 0.1); color: var(--color-danger); font-size: 0.82rem; font-weight: 600; }
</style>
