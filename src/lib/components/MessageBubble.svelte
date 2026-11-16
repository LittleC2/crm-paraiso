<script>
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import User from '@lucide/svelte/icons/user';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import AudioPlayer from './AudioPlayer.svelte';
	import { clock, formatSize, mediaLabel, tickState } from '$lib/chatFormat.js';

	// Um balão da conversa, no estilo do WhatsApp: texto, foto, vídeo, áudio, voz,
	// documento, figurinha, localização e contato, com hora e tique de lido.
	let { m, onview, onretry } = $props();

	const out = $derived(m.direction === 'SAIDA');
	const tick = $derived(tickState(m));
	const src = $derived(`/api/midia/${m.id}`);
	const type = $derived(m.kind === 'MIDIA' ? m.mediaType : null);
	const hasFile = $derived(m.mediaState !== 'FALHOU' && m.mediaState !== 'NENHUMA');
	let broken = $state(false);
	let retrying = $state(false);

	async function retry() {
		retrying = true;
		await onretry?.(m);
		retrying = false;
		broken = false;
	}
</script>

{#snippet ticks()}
	{#if tick}
		<span class="tick {tick}" role="img" aria-label={{ clock: 'enviando', sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'não enviada' }[tick]}>
			{#if tick === 'clock'}
				<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M8 4.6V8l2.2 1.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
			{:else if tick === 'failed'}
				<AlertCircle size={14} />
			{:else if tick === 'sent'}
				<svg viewBox="0 0 16 11" width="16" height="11"><path d="M1.5 5.8 5 9.3 11.7 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
			{:else}
				<svg viewBox="0 0 18 11" width="18" height="11"><path d="M1.2 5.8 4.7 9.3 11.4 1.5M7 8.4l.9.9L14.7 1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
			{/if}
		</span>
	{/if}
{/snippet}

{#if type === 'sticker' && hasFile && !broken}
	<div class="row" class:out>
		<div class="sticker">
			<img {src} alt="Figurinha" loading="lazy" onerror={() => (broken = true)} />
			<span class="stamp loose">{clock(m.sentAt)}{@render ticks()}</span>
		</div>
	</div>
{:else}
	<div class="row" class:out>
		<div class="bubble" class:in={!out} class:out class:wide={type === 'image' || type === 'video' || type === 'document'}>
			{#if type}
				{#if m.mediaState === 'FALHOU' || broken}
					<div class="missing">
						<AlertCircle size={18} />
						<span>Não foi possível carregar {mediaLabel(type).toLowerCase()}.</span>
						<button class="btn btn-secondary btn-sm" type="button" onclick={retry} disabled={retrying}>{retrying ? 'Tentando...' : 'Tentar de novo'}</button>
					</div>
				{:else if m.mediaState === 'NENHUMA' && !['location', 'contact'].includes(type)}
					<div class="missing"><AlertCircle size={18} /><span>{mediaLabel(type)} indisponível (expirou na origem).</span></div>
				{:else if type === 'image' || type === 'sticker'}
					<button class="media-btn" type="button" onclick={() => onview?.(m, src)} aria-label="Abrir foto">
						<img class="photo" {src} alt={m.body ?? 'Foto'} loading="lazy" onerror={() => (broken = true)} />
					</button>
				{:else if type === 'video'}
					<!-- svelte-ignore a11y_media_has_caption -->
					<div class="video-wrap">
						<video {src} controls preload="metadata" playsinline onerror={() => (broken = true)}></video>
					</div>
				{:else if type === 'audio' || type === 'ptt'}
					<AudioPlayer {src} seconds={m.mediaSeconds ?? 0} voice={type === 'ptt'} onerror={() => (broken = true)} />
				{:else if type === 'document'}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="doc" href="{src}?baixar=1" download={m.mediaName ?? undefined}>
						<span class="doc-icon"><FileText size={22} /></span>
						<span class="doc-info">
							<strong>{m.mediaName ?? 'Documento'}</strong>
							<small>{[(m.mediaMime ?? '').split('/').pop()?.toUpperCase(), formatSize(m.mediaSize)].filter(Boolean).join(' · ')}</small>
						</span>
						<Download size={18} />
					</a>
				{:else if type === 'location'}
					<div class="card-line"><MapPin size={18} /><span>Localização compartilhada</span></div>
				{:else if type === 'contact'}
					<div class="card-line"><User size={18} /><span>Contato compartilhado</span></div>
				{:else}
					<div class="card-line"><span>{mediaLabel(type)}</span></div>
				{/if}
			{/if}
			{#if m.body}<p class="text">{m.body}</p>{/if}
			<span class="stamp">{clock(m.sentAt)}{@render ticks()}</span>
		</div>
	</div>
{/if}

<style>
	.row { display: flex; padding: 0 0.2rem; }
	.row.out { justify-content: flex-end; }
	.bubble { position: relative; max-width: min(78%, 30rem); padding: 0.35rem 0.55rem 0.3rem; border-radius: 9px; font-size: 0.92rem; line-height: 1.35; box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13); }
	.bubble.in { background: #fff; border-top-left-radius: 2px; }
	.bubble.out { background: #d9fdd3; border-top-right-radius: 2px; }
	.bubble.in::before, .bubble.out::before { content: ''; position: absolute; top: 0; width: 8px; height: 10px; }
	.bubble.in::before { left: -7px; background: #fff; clip-path: polygon(100% 0, 0 0, 100% 100%); }
	.bubble.out::before { right: -7px; background: #d9fdd3; clip-path: polygon(0 0, 100% 0, 0 100%); }
	.bubble.wide { width: min(78%, 21rem); }
	.text { margin: 0.1rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; padding-right: 3.6rem; }
	.stamp { float: right; margin: 0.15rem 0 -0.1rem 0.5rem; display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.66rem; color: #667781; line-height: 1; }
	.stamp.loose { float: none; position: absolute; right: 0.3rem; bottom: 0.3rem; background: rgba(0, 0, 0, 0.45); color: #fff; border-radius: 999px; padding: 0.15rem 0.4rem; margin: 0; }
	.tick { display: inline-flex; color: #8696a0; }
	.tick.read { color: #53bdeb; }
	.tick.failed { color: var(--color-danger); }
	.media-btn { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; border-radius: 6px; overflow: hidden; }
	.photo { display: block; width: 100%; max-height: 22rem; object-fit: cover; background: #e9edef; min-height: 6rem; }
	.video-wrap { position: relative; border-radius: 6px; overflow: hidden; background: #000; }
	video { display: block; width: 100%; max-height: 22rem; }
	.sticker { position: relative; }
	.sticker img { width: 8.5rem; height: 8.5rem; object-fit: contain; display: block; }
	.doc { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem; border-radius: 7px; background: rgba(11, 20, 26, 0.06); text-decoration: none; color: inherit; min-width: 14rem; }
	.doc:hover { background: rgba(11, 20, 26, 0.1); }
	.doc-icon { width: 2.4rem; height: 2.4rem; display: grid; place-items: center; border-radius: 6px; background: #fff; color: #c2362b; flex: none; }
	.doc-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.doc-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.86rem; }
	.doc-info small { color: #667781; font-size: 0.72rem; }
	.card-line { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.2rem; font-size: 0.88rem; }
	.missing { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; padding: 0.4rem 0.2rem; color: #667781; font-size: 0.84rem; }
</style>
