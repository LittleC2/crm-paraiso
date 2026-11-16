<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { formatPhone, waLink } from '$lib/phone.js';
	import { callAction } from '$lib/formAction.js';
	import { retryMedia, sendFile } from '$lib/chatClient.js';
	import { clock, dayLabel, previewText, tickState } from '$lib/chatFormat.js';
	import NewConversation from '$lib/components/NewConversation.svelte';
	import ChatThread from '$lib/components/ChatThread.svelte';
	import Composer from '$lib/components/Composer.svelte';

	// Janela de WhatsApp no estilo do original: lista à esquerda, conversa à direita.
	let { data, form } = $props();
	const sel = $derived(data.selected);
	const c = $derived(sel?.conversation ?? null);

	let newChatOpen = $state(false);

	async function chatStarted(id) {
		newChatOpen = false;
		await goto(resolve(`/conversas?c=${id}`), { invalidateAll: true });
	}

	// Sem websocket na Vercel: atualiza por polling (4 s com conversa aberta, 10 s sem) enquanto a aba está visível.
	onMount(() => {
		let timer;
		const tickPoll = () => {
			if (document.visibilityState === 'visible') invalidateAll();
			timer = setTimeout(tickPoll, c ? 4000 : 10_000);
		};
		timer = setTimeout(tickPoll, c ? 4000 : 10_000);
		return () => clearTimeout(timer);
	});

	const STATUS = { ABERTA: 'Aberta', PENDENTE: 'Aguardando cliente', FECHADA: 'Fechada' };
	const disconnected = $derived(data.channels.filter((ch) => ch.state === 'DESCONECTADO'));

	// Mantém os filtros no link ao trocar de conversa.
	function linkFor(id) {
		const parts = [`c=${id}`];
		const f = data.filters;
		if (f.q) parts.push(`q=${encodeURIComponent(f.q)}`);
		if (f.status) parts.push(`status=${f.status}`);
		if (f.assignee) parts.push(`responsavel=${f.assignee}`);
		if (f.channelId) parts.push(`canal=${f.channelId}`);
		return `/conversas?${parts.join('&')}`;
	}

	const boardOf = (area) => (area === 'JARDIM' ? '/funil' : '/pedidos');

	// Quem manda: tudo por fetch, sem recarregar a página; o polling traz o resto.
	const done = async (r) => (r.ok && (await invalidateAll()), r);
	const send = (text) => callAction('/conversas?/enviar', { id: c.id, text }).then(done);
	const note = (text) => callAction('/conversas?/nota', { id: c.id, text }).then(done);
	const file = (f, opts) => sendFile(c.id, f, opts).then(done);
	const retry = async (m) => (await retryMedia(m.id), invalidateAll());
	const lastTick = (m) => (m?.direction === 'SAIDA' ? tickState(m) : null);
</script>

<svelte:head>
	<title>WhatsApp · Paraíso das Plantas</title>
</svelte:head>

<div class="wa" class:has-chat={!!c}>
	<aside class="list-pane">
		<header class="pane-head">
			<h1>WhatsApp</h1>
			<div class="head-actions">
				<button class="btn btn-sm" type="button" onclick={() => (newChatOpen = true)}>Nova conversa</button>
				{#if data.isAdmin}<a class="link" href={resolve('/ajustes#whatsapp')}>Ajustes</a>{/if}
			</div>
		</header>

		{#each disconnected as ch (ch.id)}
			<p class="alert">Número {ch.name} desconectado.{data.isAdmin ? ' Reconecte em Números.' : ' Avise um administrador.'}</p>
		{/each}
		{#if data.channels.length === 0}
			<p class="alert soft">Nenhum número cadastrado ainda.{data.isAdmin ? ' Cadastre em Números.' : ''}</p>
		{/if}

		<form method="GET" class="filters">
			{#if c}<input type="hidden" name="c" value={c.id} />{/if}
			<input type="search" name="q" placeholder="Buscar nome ou telefone" value={data.filters.q} />
			<div class="row">
				<select name="status" value={data.filters.status} onchange={(e) => e.currentTarget.form.requestSubmit()} aria-label="Situação">
					<option value="">Abertas e aguardando</option>
					<option value="ABERTA">Só abertas</option>
					<option value="PENDENTE">Aguardando cliente</option>
					<option value="FECHADA">Fechadas</option>
				</select>
				<select name="responsavel" value={data.filters.assignee} onchange={(e) => e.currentTarget.form.requestSubmit()} aria-label="Responsável">
					<option value="">Todas</option>
					<option value="mim">Minhas</option>
					<option value="sem">Sem responsável</option>
				</select>
				{#if data.channels.length > 1}
					<select name="canal" value={data.filters.channelId} onchange={(e) => e.currentTarget.form.requestSubmit()} aria-label="Número">
						<option value="">Todos os números</option>
						{#each data.channels as ch (ch.id)}<option value={ch.id}>{ch.name}</option>{/each}
					</select>
				{/if}
			</div>
		</form>

		<div class="conversations">
			{#if data.conversations.length === 0}
				<p class="empty">Nenhuma conversa.</p>
			{:else}
				{#each data.conversations as item (item.id)}
					{@const last = item.messages[0]}
					{@const tk = lastTick(last)}
					<a class="conv" class:active={c?.id === item.id} class:unread={item.unread > 0} href={resolve(linkFor(item.id))} data-sveltekit-noscroll>
						<span class="avatar">{item.contact.name.trim().charAt(0).toUpperCase()}</span>
						<span class="mid">
							<strong>{item.contact.name}</strong>
							<span class="prev">
								{#if tk}<span class="mini-tick {tk}">{tk === 'sent' ? '✓' : tk === 'failed' ? '!' : tk === 'clock' ? '…' : '✓✓'}</span>{/if}{previewText(last).replace(/^Você: /, '')}
							</span>
						</span>
						<span class="end">
							<span class="dim">{dayLabel(item.lastMessageAt) === 'Hoje' ? clock(item.lastMessageAt) : dayLabel(item.lastMessageAt)}</span>
							{#if item.unread > 0}<span class="dot">{item.unread}</span>{/if}
						</span>
					</a>
				{/each}
			{/if}
		</div>
	</aside>

	<section class="chat-pane">
		{#if !c}
			<div class="placeholder">
				<p><strong>Escolha uma conversa</strong></p>
				<p class="dim">As mensagens dos clientes aparecem aqui. Responder, anotar e criar o lead tudo na mesma janela.</p>
			</div>
		{:else}
			<header class="chat-head">
				<a class="back" href={resolve('/conversas')} aria-label="Voltar para a lista">←</a>
				<span class="avatar big">{c.contact.name.trim().charAt(0).toUpperCase()}</span>
				<div class="who">
					<h2>{c.contact.name}</h2>
					<p class="dim">{formatPhone(c.phone)} · {c.channel.name}</p>
				</div>
				<div class="actions">
					{#if sel.deal}
						<a class="btn btn-sm" href={resolve(`${boardOf(c.area)}?abrir=${sel.deal.id}`)}>Ver no funil</a>
					{:else}
						<form method="POST" action="?/negocio" use:enhance>
							<input type="hidden" name="id" value={c.id} />
							<button class="btn btn-sm" type="submit">{c.area === 'JARDIM' ? 'Criar lead no funil' : 'Criar pedido'}</button>
						</form>
					{/if}
					<a class="btn btn-secondary btn-sm" href={resolve(`/contatos/${c.contact.id}`)}>Contato</a>
				</div>
			</header>

			{#if sel.deal}
				<p class="deal-bar">
					<span class="dot-stage" style="background: {sel.deal.stage.color ?? '#45524a'}"></span>
					No funil: <strong>{sel.deal.stage.name}</strong>{sel.deal.title ? ` · ${sel.deal.title}` : ''}
				</p>
			{/if}

			{#if c.channel.state === 'DESCONECTADO'}<p class="alert">Este número está desconectado. As mensagens não serão enviadas até reconectar.</p>{/if}
			{#if form?.error}<p class="error-text">{form.error}</p>{/if}

			<div class="bar">
				<form method="POST" action="?/atribuir" use:enhance>
					<input type="hidden" name="id" value={c.id} />
					<select name="assigneeId" value={c.assigneeId ?? ''} onchange={(e) => e.currentTarget.form.requestSubmit()} aria-label="Responsável">
						<option value="">Sem responsável</option>
						{#each sel.users as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
					</select>
				</form>
				<form method="POST" action="?/status" use:enhance>
					<input type="hidden" name="id" value={c.id} />
					<select name="status" value={c.status} onchange={(e) => e.currentTarget.form.requestSubmit()} aria-label="Situação">
						{#each Object.entries(STATUS) as [v, label] (v)}<option value={v}>{label}</option>{/each}
					</select>
				</form>
				{#if c.contact.phone}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="dim" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer">Abrir no app do WhatsApp</a>
				{/if}
			</div>

			<ChatThread messages={c.messages} onretry={retry} />

			<Composer
				replies={sel.replies}
				disabled={!!c.optOutAt}
				blocked={c.optOutAt ? 'Este contato pediu para não receber mensagens. O envio está bloqueado.' : ''}
				contactName={c.contact.name}
				agentName={data.me.name}
				mediaEnabled={data.mediaEnabled}
				onsend={send}
				onnote={note}
				onfile={file}
			/>
		{/if}
	</section>
</div>

{#if newChatOpen}
	<NewConversation onclose={() => (newChatOpen = false)} ondone={chatStarted} />
{/if}

<style>
	.wa { display: grid; grid-template-columns: 340px minmax(0, 1fr); height: 100vh; min-height: 0; }
	.list-pane { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--color-border); background: var(--color-bg-elevated); }
	.head-actions { display: flex; gap: 0.7rem; align-items: center; white-space: nowrap; }
	.pane-head { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1rem 0.5rem; }
	h1 { margin: 0; font-size: 1.2rem; }
	.link { font-size: 0.82rem; font-weight: 700; color: var(--color-accent-text); text-decoration: none; }
	.alert { margin: 0.4rem 1rem; padding: 0.5rem 0.7rem; border-radius: var(--radius-button); background: rgba(194, 54, 43, 0.1); color: var(--color-danger); font-size: 0.82rem; font-weight: 600; }
	.alert.soft { background: var(--color-accent-dim); color: var(--color-accent-text); }
	.filters { padding: 0.4rem 1rem 0.7rem; display: flex; flex-direction: column; gap: 0.4rem; border-bottom: 1px solid var(--color-border); }
	.filters input { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.45rem 0.7rem; color: var(--color-text); }
	.filters .row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
	.filters select, .bar select { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.35rem 0.5rem; color: var(--color-text); font-size: 0.8rem; min-width: 0; }
	.conversations { flex: 1; min-height: 0; overflow-y: auto; }
	.conv { display: flex; align-items: center; gap: 0.65rem; padding: 0.7rem 1rem; border-bottom: 1px solid var(--color-border); text-decoration: none; color: inherit; }
	.conv:hover { background: var(--color-bg-alt); }
	.conv.unread { background: var(--color-accent-dim); }
	.conv.active { background: var(--color-bg-alt); box-shadow: inset 3px 0 0 var(--color-accent); }
	.avatar { width: 2.2rem; height: 2.2rem; border-radius: 50%; background: var(--color-accent-dim); color: var(--color-accent-text); display: grid; place-items: center; font-weight: 800; flex: none; }
	.avatar.big { width: 2.6rem; height: 2.6rem; }
	.mid { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.mid strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.92rem; }
	.prev { font-size: 0.8rem; color: var(--color-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.end { display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem; flex: none; }
	.dot { background: var(--color-success); color: #fff; font-size: 0.7rem; font-weight: 800; border-radius: 999px; padding: 0 0.4rem; min-width: 1.1rem; text-align: center; line-height: 1.1rem; }
	.dim { color: var(--color-text-dim); font-size: 0.75rem; margin: 0; }
	.empty { padding: 1rem; margin: 0; color: var(--color-text-dim); }

	.mini-tick { margin-right: 0.25rem; font-size: 0.72rem; font-weight: 800; color: #8696a0; }
	.mini-tick.read { color: #53bdeb; }
	.mini-tick.failed { color: var(--color-danger); }
	.chat-pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; padding: 0.8rem 1rem; gap: 0.6rem; }
	.placeholder { margin: auto; text-align: center; max-width: 24rem; }
	.chat-head { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
	.back { display: none; text-decoration: none; font-size: 1.3rem; color: var(--color-text-dim); }
	.who { flex: 1; min-width: 0; }
	.who h2 { margin: 0; font-size: 1.05rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.deal-bar { margin: 0; font-size: 0.82rem; color: var(--color-text-dim); display: flex; align-items: center; gap: 0.4rem; }
	.dot-stage { width: 0.6rem; height: 0.6rem; border-radius: 50%; display: inline-block; }
	.bar { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }

	@media (max-width: 860px) {
		.wa { grid-template-columns: minmax(0, 1fr); height: calc(100vh - 4.5rem); }
		.list-pane, .chat-pane { min-width: 0; }
		.wa.has-chat .list-pane { display: none; }
		.wa:not(.has-chat) .chat-pane { display: none; }
		.back { display: inline; }
		.chat-head .actions { flex-basis: 100%; }
	}
</style>
