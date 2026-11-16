<script>
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Sidebar from '$lib/components/Sidebar.svelte';

	let { data, children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<div class="app-shell">
		<Sidebar user={data.user} unread={data.unread} />
		<div class="content">
			{@render children()}
		</div>
	</div>
{:else}
	{@render children()}
{/if}
