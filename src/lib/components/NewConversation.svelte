<script>
	import X from '@lucide/svelte/icons/x';
	import { renderTemplate } from '$lib/whatsapp.js';
	import { formatPhone } from '$lib/phone.js';

	// Janela para iniciar uma conversa de WhatsApp pelo CRM.
	// `contact` (opcional): contato já escolhido { id, name, phone }.
	let { contact = null, onclose, ondone } = $props();

	let options = $state(null);
	// svelte-ignore state_referenced_locally
	let picked = $state(contact);
	let query = $state('');
	let results = $state([]);
	let phone = $state('');
	let name = $state('');
	let channelId = $state('');
	let text = $state('');
	let confirm = $state(false);
	let needsConfirm = $state(false);
	let busy = $state(false);
	let error = $state('');
	let timer;

	$effect(() => {
		fetch('/api/conversas/opcoes')
			.then((r) => r.json())
			.then((o) => {
				options = o;
				const ready = o.channels.find((c) => c.state === 'CONECTADO') ?? o.channels[0];
				if (ready && !channelId) channelId = ready.id;
			})
			.catch(() => (error = 'Não foi possível carregar os números.'));
	});

	// Trocou o destinatário digitado: a confirmação anterior não vale para o novo.
	$effect(() => {
		phone;
		name;
		needsConfirm = false;
		confirm = false;
	});

	const channel = $derived(options?.channels.find((c) => c.id === channelId) ?? null);
	const replies = $derived((options?.replies ?? []).filter((r) => !channel || r.area === channel.area));

	function search() {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			if (query.trim().length < 2) return (results = []);
			const asked = query;
			const area = channel ? `&area=${channel.area}` : '';
			try {
				const res = await fetch(`/api/contatos/buscar?q=${encodeURIComponent(query.trim())}${area}`);
				// resposta atrasada de uma busca antiga não sobrescreve a atual
				if (asked === query) results = res.ok ? (await res.json()).contacts.filter((c) => c.phone) : [];
			} catch {
				results = [];
			}
		}, 250);
	}
	function pick(c) {
		picked = c;
		results = [];
		query = '';
		needsConfirm = false;
		confirm = false;
	}
	function useReply(r) {
		text = renderTemplate(r.body, { nome: picked?.name ?? name, atendente: options?.me?.name ?? '' });
	}

	async function send(event) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/conversas/iniciar', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ contactId: picked?.id ?? null, phone, name, channelId, text, confirmNoOptIn: confirm })
			});
			const out = await res.json().catch(() => ({}));
			if (res.ok && out.needsConfirm) {
				needsConfirm = true;
			} else if (!res.ok) {
				error = out.error ?? 'Não foi possível enviar.';
			} else {
				ondone(out.conversationId);
			}
		} catch {
			error = 'Sem conexão. Tente de novo.';
		} finally {
			busy = false;
		}
	}
	const canSend = $derived(
		!busy && text.trim() && channelId && (picked || phone.trim()) && (!needsConfirm || confirm)
	);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<button class="scrim" type="button" aria-label="Fechar" onclick={onclose}></button>
<div class="modal card" role="dialog" aria-label="Nova conversa">
<form onsubmit={send} class="inner">
	<header>
		<h3>Nova conversa</h3>
		<button class="close" type="button" onclick={onclose} aria-label="Fechar"><X size={18} /></button>
	</header>

	{#if !options}
		<p class="dim">Carregando...</p>
	{:else if options.channels.length === 0}
		<p class="alert">Nenhum número de WhatsApp cadastrado. Um administrador cadastra em Ajustes.</p>
	{:else}
		<label class="field">
			<span>Enviar pelo número</span>
			<select bind:value={channelId}>
				{#each options.channels as c (c.id)}
					<option value={c.id}>{c.name}{c.state === 'CONECTADO' ? '' : ' (desconectado)'}</option>
				{/each}
			</select>
		</label>
		{#if channel && channel.state !== 'CONECTADO'}<p class="alert">Este número está desconectado. Reconecte em Ajustes antes de enviar.</p>{/if}

		<div class="field">
			<span>Para</span>
			{#if picked}
				<div class="picked">
					<strong>{picked.name}</strong>
					<span class="dim">{formatPhone(picked.phone)}</span>
					{#if !contact}<button type="button" class="link" onclick={() => ((picked = null), (needsConfirm = false))}>Trocar</button>{/if}
				</div>
			{:else}
				<input type="search" placeholder="Buscar contato por nome ou telefone" bind:value={query} oninput={search} autocomplete="off" />
				{#if results.length}
					<ul class="results">
						{#each results as c (c.id)}
							<li><button type="button" onclick={() => pick(c)}><strong>{c.name}</strong> <span class="dim">{formatPhone(c.phone)}</span></button></li>
						{/each}
					</ul>
				{/if}
				<p class="dim">Ou digite um número novo:</p>
				<div class="two">
					<input placeholder="Nome" bind:value={name} maxlength="120" />
					<input placeholder="(21) 99999-9999" inputmode="tel" bind:value={phone} />
				</div>
			{/if}
		</div>

		{#if replies.length}
			<div class="replies">
				{#each replies as r (r.id)}<button type="button" class="chip" onclick={() => useReply(r)}>{r.title}</button>{/each}
			</div>
		{/if}
		<label class="field">
			<span>Mensagem</span>
			<textarea rows="4" bind:value={text} maxlength="4000" placeholder="Escreva a primeira mensagem..."></textarea>
		</label>

		{#if needsConfirm}
			<label class="confirm">
				<input type="checkbox" bind:checked={confirm} />
				<span>
					<strong>Este contato ainda não autorizou mensagens no WhatsApp.</strong>
					Marque se o cliente já falou com a equipe antes. Mensagem para quem não espera pode levar ao bloqueio do número.
				</span>
			</label>
		{/if}
		{#if error}<p class="error-text">{error}</p>{/if}

		<div class="row">
			<button class="btn btn-secondary" type="button" onclick={onclose}>Cancelar</button>
			<button class="btn" type="submit" disabled={!canSend || (channel && channel.state !== 'CONECTADO')}>{busy ? 'Enviando...' : 'Enviar'}</button>
		</div>
	{/if}
</form>
</div>

<style>
	.scrim { position: fixed; inset: 0; background: rgba(22, 36, 27, 0.4); border: 0; padding: 0; z-index: 60; cursor: default; }
	.modal { position: fixed; z-index: 61; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 2rem)); max-height: calc(100vh - 2rem); overflow-y: auto; padding: 1.2rem; display: flex; flex-direction: column; gap: 0.8rem; }
	.inner { display: flex; flex-direction: column; gap: 0.8rem; }
	header { display: flex; justify-content: space-between; align-items: center; }
	h3 { margin: 0; }
	.close { background: none; border: 0; cursor: pointer; color: var(--color-text-dim); }
	.field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
	.field > span { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-text-dim); }
	input, select, textarea { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.5rem 0.7rem; color: var(--color-text); font: inherit; }
	textarea { resize: vertical; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
	.picked { display: flex; gap: 0.7rem; align-items: center; background: var(--color-accent-dim); border-radius: var(--radius-button); padding: 0.5rem 0.8rem; }
	.results { list-style: none; margin: 0; padding: 0.2rem; border: 1px solid var(--color-border); border-radius: var(--radius-button); background: var(--color-bg-elevated); }
	.results button { width: 100%; text-align: left; background: none; border: 0; padding: 0.4rem 0.6rem; cursor: pointer; font: inherit; border-radius: 6px; }
	.results button:hover { background: var(--color-bg-alt); }
	.replies { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.confirm { display: flex; gap: 0.6rem; padding: 0.7rem; background: var(--color-accent-dim); border: 1px solid var(--color-accent-text); border-radius: var(--radius-button); font-size: 0.82rem; align-items: flex-start; }
	.alert { margin: 0; padding: 0.5rem 0.8rem; border-radius: var(--radius-button); background: rgba(194, 54, 43, 0.1); color: var(--color-danger); font-size: 0.82rem; font-weight: 600; }
	.dim { color: var(--color-text-dim); font-size: 0.8rem; margin: 0; }
	.link { background: none; border: 0; padding: 0; color: var(--color-accent-text); font-weight: 700; font-size: 0.8rem; cursor: pointer; text-decoration: underline; }
	.row { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
