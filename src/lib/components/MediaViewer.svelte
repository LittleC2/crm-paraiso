<script>
	import X from '@lucide/svelte/icons/x';
	import Download from '@lucide/svelte/icons/download';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';

	// Visualizador de imagem em tela cheia: Esc fecha, clique na imagem alterna o zoom.
	let { src, downloadHref, alt = 'Imagem da conversa', onclose } = $props();
	let zoomed = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="viewer" role="dialog" aria-modal="true" aria-label={alt}>
	<button class="scrim" type="button" aria-label="Fechar" onclick={onclose}></button>
	<div class="bar">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="btn-icon dark" href={downloadHref} aria-label="Baixar" title="Baixar"><Download size={18} /></a>
		<button class="btn-icon dark" type="button" aria-label="Zoom" title="Zoom" onclick={() => (zoomed = !zoomed)}><ZoomIn size={18} /></button>
		<button class="btn-icon dark" type="button" aria-label="Fechar" title="Fechar" onclick={onclose}><X size={18} /></button>
	</div>
	<div class="stage" class:zoomed>
		<button class="img-btn" type="button" onclick={() => (zoomed = !zoomed)} aria-label="Alternar zoom">
			<img {src} {alt} />
		</button>
	</div>
</div>

<style>
	.viewer { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; }
	.scrim { position: absolute; inset: 0; background: rgba(8, 14, 10, 0.88); border: 0; padding: 0; cursor: zoom-out; }
	.bar { position: relative; z-index: 1; display: flex; justify-content: flex-end; gap: var(--gap-actions); padding: 0.8rem 1rem; }
	.btn-icon.dark { background: rgba(255, 255, 255, 0.12); border-color: transparent; color: #fff; text-decoration: none; }
	.btn-icon.dark:hover { background: rgba(255, 255, 255, 0.24); color: #fff; }
	.stage { position: relative; z-index: 1; flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 0 1rem 1rem; }
	.img-btn { border: 0; background: none; padding: 0; cursor: zoom-in; display: grid; place-items: center; max-width: 100%; }
	img { max-width: 100%; max-height: calc(100vh - 5rem); object-fit: contain; border-radius: 6px; }
	.stage.zoomed .img-btn { cursor: zoom-out; max-width: none; }
	.stage.zoomed img { max-width: none; max-height: none; width: auto; }
</style>
