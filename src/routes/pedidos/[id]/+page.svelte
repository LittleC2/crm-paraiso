<script>
	import DealDetail from '$lib/components/DealDetail.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{data.deal.contact.name} · Paraíso das Plantas</title>
</svelte:head>

<DealDetail {data} {form} basePath="/pedidos" backLabel="Pedidos" />
