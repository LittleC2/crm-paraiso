<script>
	import { resolve } from '$app/paths';
	import DealBoard from '$lib/components/DealBoard.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Funil de jardins · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<header class="head">
		<h1>Funil de jardins</h1>
		<nav class="links">
			<a href={resolve('/funil/painel')}>Painel</a>
			<a href={resolve('/funil/manutencao')}>Manutenção</a>
			<a href={resolve('/funil/config')}>Configurar funil</a>
		</nav>
	</header>
	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.created}<p class="success-text">Negócio criado.</p>{/if}
	<DealBoard {data} basePath="/funil" newLabel="Novo lead de jardim" jardim={true} />
</main>

<style>
	.page { max-width: 1400px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	.links { display: flex; gap: 1rem; font-size: 0.85rem; font-weight: 700; }
	.links a { color: var(--color-accent-text); text-decoration: none; }
</style>
