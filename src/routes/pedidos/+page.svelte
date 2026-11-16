<script>
	import DealBoard from '$lib/components/DealBoard.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Pedidos da loja · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<h1>Pedidos da loja</h1>
	<p class="hint">Pedidos que chegam pelo WhatsApp: do pedido até a entrega.</p>
	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.created}<p class="success-text">Pedido criado.</p>{/if}
	<DealBoard {data} basePath="/pedidos" newLabel="Novo pedido" jardim={false} />
</main>

<style>
	.page { max-width: 1400px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	.hint { margin: 0; color: var(--color-text-dim); font-size: 0.85rem; }
</style>
