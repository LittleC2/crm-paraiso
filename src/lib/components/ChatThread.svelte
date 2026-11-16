<script>
	import { tick, untrack } from 'svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import MessageBubble from './MessageBubble.svelte';
	import MediaViewer from './MediaViewer.svelte';
	import { clock, groupByDay } from '$lib/chatFormat.js';

	// Conversa no estilo do WhatsApp: fundo, separador de dia, balões, notas internas,
	// rolagem presa no fim (a menos que a pessoa tenha rolado para cima).
	let { messages, onretry } = $props();

	let box = $state(null);
	let inner = $state(null);
	let viewing = $state(null);
	let stuck = $state(true); // perto do fim
	let unseen = $state(0);
	let lastCount = 0;

	const groups = $derived(groupByDay(messages));

	function onScroll() {
		if (!box) return;
		stuck = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
		if (stuck) unseen = 0;
	}

	async function toEnd(smooth = false) {
		await tick();
		if (box) box.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
		unseen = 0;
	}

	// Foto, vídeo ou áudio que termina de carregar muda a altura: se estava no fim, continua no fim.
	$effect(() => {
		if (!inner || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => stuck && box && (box.scrollTop = box.scrollHeight));
		observer.observe(inner);
		return () => observer.disconnect();
	});

	// Mensagem nova: acompanha se estava no fim; senão avisa com o contador.
	$effect(() => {
		const count = messages.length;
		const last = messages.at(-1);
		untrack(() => {
			const added = count - lastCount;
			const first = lastCount === 0;
			lastCount = count;
			if (first || stuck || last?.direction === 'SAIDA') toEnd();
			else if (added > 0) unseen += added;
		});
	});
</script>

<div class="wrap">
	<div class="thread" bind:this={box} onscroll={onScroll}>
		<div class="inner" bind:this={inner}>
		{#if messages.length === 0}<p class="empty-chat">Nenhuma mensagem ainda.</p>{/if}
		{#each groups as g (g.key)}
			<div class="day"><span>{g.label}</span></div>
			{#each g.items as m (m.id)}
				{#if m.kind === 'NOTA'}
					<div class="note"><b>Nota interna</b> {m.body} <small>{clock(m.sentAt)}</small></div>
				{:else}
					<MessageBubble {m} onview={(msg, src) => (viewing = { src, id: msg.id, alt: msg.body ?? 'Foto' })} {onretry} />
				{/if}
			{/each}
		{/each}
		</div>
	</div>
	{#if !stuck}
		<button class="to-end" type="button" onclick={() => toEnd(true)} aria-label="Ir para a última mensagem">
			<ArrowDown size={18} />{#if unseen > 0}<span>{unseen}</span>{/if}
		</button>
	{/if}
</div>

{#if viewing}
	<MediaViewer src={viewing.src} downloadHref="{viewing.src}?baixar=1" alt={viewing.alt} onclose={() => (viewing = null)} />
{/if}

<style>
	.wrap { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
	.inner { display: flex; flex-direction: column; gap: 0.25rem; min-height: 100%; justify-content: flex-end; }
	.thread {
		flex: 1; min-height: 0; overflow-y: auto; padding: 0.8rem 0.9rem;
		border-radius: var(--radius-card, 12px); border: 1px solid var(--color-border);
		background-color: #efeae2;
		background-image: radial-gradient(rgba(22, 36, 27, 0.06) 1px, transparent 1.2px), radial-gradient(rgba(22, 36, 27, 0.04) 1px, transparent 1.2px);
		background-size: 22px 22px, 22px 22px; background-position: 0 0, 11px 11px;
	}
	.day { align-self: center; margin: 0.5rem 0 0.3rem; position: sticky; top: 0; z-index: 2; }
	.day span { background: #fff; color: #54656f; font-size: 0.72rem; font-weight: 600; padding: 0.22rem 0.7rem; border-radius: 8px; box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13); text-transform: capitalize; }
	.note { align-self: center; max-width: 88%; margin: 0.2rem 0; padding: 0.35rem 0.7rem; border-radius: 8px; background: #fff3c4; border: 1px dashed #c9a227; font-size: 0.8rem; color: #4a3d0a; }
	.note small { color: #7a6a2a; margin-left: 0.3rem; }
	.empty-chat { margin: auto; color: #667781; background: #fff; padding: 0.4rem 0.9rem; border-radius: 8px; font-size: 0.85rem; }
	.to-end { position: absolute; right: 0.9rem; bottom: 0.9rem; width: 2.5rem; height: 2.5rem; border-radius: 50%; border: 0; background: #fff; color: #54656f; box-shadow: 0 2px 6px rgba(11, 20, 26, 0.3); display: grid; place-items: center; cursor: pointer; }
	.to-end span { position: absolute; top: -0.4rem; right: -0.2rem; background: #25d366; color: #fff; font-size: 0.68rem; font-weight: 800; min-width: 1.15rem; line-height: 1.15rem; border-radius: 999px; text-align: center; }
</style>
