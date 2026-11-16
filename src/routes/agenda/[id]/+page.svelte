<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EventForm from '$lib/components/EventForm.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{data.event.title} · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<a class="back" href={resolve('/agenda')}>← Agenda</a>
	<h1>{data.event.title}</h1>
	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.saved}<p class="success-text">Salvo.</p>{/if}

	<section class="card box">
		<EventForm event={data.event} action="?/salvar" users={data.users} contacts={data.contacts} isAdmin={data.isAdmin && !data.solo} />
	</section>

	<form method="POST" action="?/excluir" use:enhance onsubmit={(e) => { if (!confirm('Excluir este evento?')) e.preventDefault(); }}>
		<button class="btn-danger" type="submit">Excluir evento</button>
	</form>
</main>

<style>
	.page { max-width: 820px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.back { font-size: 0.85rem; color: var(--color-text-dim); text-decoration: none; }
	h1 { margin: 0; font-size: 1.4rem; }
	.box { padding: 1rem; }
</style>
