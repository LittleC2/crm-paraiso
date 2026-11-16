<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import NewConversation from '$lib/components/NewConversation.svelte';
	import { resolve } from '$app/paths';
	import { formatPhone, waLink } from '$lib/phone.js';

	let { data, form } = $props();
	const c = $derived(data.contact);
	let newChatOpen = $state(false);

	const TYPE_LABEL = {
		CLIENTE_LOJA: 'Cliente da loja',
		CLIENTE_JARDIM: 'Cliente de jardim',
		PARCEIRO: 'Parceiro',
		FORNECEDOR: 'Fornecedor'
	};
	const KIND_LABEL = { NOTA: 'Nota', LIGACAO: 'Ligação', VISITA: 'Visita', SISTEMA: 'Sistema' };
	const fmt = (d) =>
		new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head>
	<title>{c.name} · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<a class="back" href={resolve('/contatos')}>← Contatos</a>
	<header class="head">
		<div>
			<h1>{c.name}</h1>
			<p class="dim">{formatPhone(c.phone)} {c.neighborhood ? `· ${c.neighborhood}` : ''} {c.city ? `· ${c.city}` : ''}</p>
		</div>
		{#if c.phone}
			<div class="head-actions">
				<button class="btn" type="button" onclick={() => (newChatOpen = true)}>Conversar pelo CRM</button>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="btn btn-secondary" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer">Abrir no app do WhatsApp</a>
			</div>
		{/if}
	</header>

	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.saved}<p class="success-text">Salvo.</p>{/if}

	<form method="POST" action="?/salvar" use:enhance class="card box grid">
		<label class="field"><span>Nome</span><input name="name" value={c.name} required maxlength="120" /></label>
		<label class="field"><span>Telefone</span><input name="phone" value={formatPhone(c.phone)} inputmode="tel" /></label>
		<label class="field"><span>E-mail</span><input name="email" type="email" value={c.email ?? ''} /></label>
		<label class="field">
			<span>Tipo</span>
			<select name="type" value={c.type}>
				{#each Object.entries(TYPE_LABEL) as [value, label] (value)}
					{#if data.isAdmin || value !== 'CLIENTE_JARDIM' || c.type === value}<option {value}>{label}</option>{/if}
				{/each}
			</select>
		</label>
		{#if data.isAdmin && !data.solo}
			<label class="field">
				<span>Área</span>
				<select name="area" value={c.area}><option value="LOJA">Loja</option><option value="JARDIM">Jardim</option></select>
			</label>
		{/if}
		<label class="field"><span>Bairro</span><input name="neighborhood" value={c.neighborhood ?? ''} /></label>
		<label class="field"><span>Cidade</span><input name="city" value={c.city ?? ''} /></label>
		<label class="field"><span>Origem</span><input name="source" value={c.source ?? ''} /></label>
		<label class="field"><span>Etiquetas</span><input name="tags" value={c.tags.join(', ')} /></label>
		<label class="field wide"><span>Observações</span><textarea name="notes" rows="3">{c.notes ?? ''}</textarea></label>
		<label class="check"><input type="checkbox" name="optInWhatsapp" checked={c.optInWhatsapp} /> Autorizou receber mensagens no WhatsApp</label>
		<button class="btn" type="submit">Salvar</button>
	</form>

	<section class="card box">
		<h2>Histórico</h2>
		{#if data.history.length === 0}<p class="dim">Nenhuma nota ainda. Notas internas escritas no WhatsApp aparecem aqui.</p>
		{:else}
			<ul class="history">
				{#each data.history as i (i.id)}
					<li>
						<span class="badge">{KIND_LABEL[i.kind] ?? i.kind}</span>
						<span class="body">{i.body}</span>
						<span class="dim">{i.author?.name ?? 'Sistema'} · {fmt(i.createdAt)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card box">
		<h2>Tarefas</h2>
		{#if data.tasks.length === 0}<p class="dim">Nenhuma tarefa ligada a este contato.</p>
		{:else}
			<ul>{#each data.tasks as t (t.id)}<li>{t.title} <span class="badge">{t.status.replace('_', ' ')}</span></li>{/each}</ul>
		{/if}
	</section>

	<section class="card box">
		<h2>Agenda</h2>
		{#if data.events.length === 0}<p class="dim">Nenhum evento ligado a este contato.</p>
		{:else}
			<ul>{#each data.events as e (e.id)}<li>{e.title} <span class="dim">{fmt(e.startsAt)}</span></li>{/each}</ul>
		{/if}
	</section>

	{#if data.canDelete}
		<form method="POST" action="?/excluir" use:enhance onsubmit={(e) => { if (!confirm('Excluir este contato?')) e.preventDefault(); }}>
			<button class="btn-danger" type="submit">Excluir contato</button>
		</form>
	{/if}
</main>

{#if newChatOpen}
	<NewConversation
		contact={{ id: c.id, name: c.name, phone: c.phone }}
		onclose={() => (newChatOpen = false)}
		ondone={(id) => goto(resolve(`/conversas?c=${id}`))}
	/>
{/if}

<style>
	.head-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.page { max-width: 820px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.back { font-size: 0.85rem; color: var(--color-text-dim); text-decoration: none; }
	.head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
	h1 { margin: 0; font-size: 1.4rem; }
	h2 { margin: 0 0 0.6rem; font-size: 1.05rem; }
	.dim { color: var(--color-text-dim); font-size: 0.85rem; margin: 0.2rem 0 0; }
	.box { padding: 1rem; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; align-items: end; }
	.wide { grid-column: 1 / -1; }
	.check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; grid-column: 1 / -1; }
	.history { list-style: none; padding-left: 0; }
	.history li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; }
	.history .body { flex: 1 1 18rem; white-space: pre-wrap; overflow-wrap: anywhere; }
	ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.9rem; }
</style>
