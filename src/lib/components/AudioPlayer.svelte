<script>
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Mic from '@lucide/svelte/icons/mic';
	import { formatDuration } from '$lib/chatFormat.js';

	// Player de áudio e mensagem de voz no estilo do WhatsApp.
	let { src, seconds = 0, voice = false, onerror } = $props();

	let audio = $state(null);
	let playing = $state(false);
	let current = $state(0);
	// svelte-ignore state_referenced_locally
	let total = $state(Number(seconds) || 0);
	let rate = $state(1);
	let seeking = false;

	const RATES = [1, 1.5, 2];

	function toggle() {
		if (!audio) return;
		if (audio.paused) {
			// um áudio por vez
			for (const el of document.querySelectorAll('audio')) if (el !== audio) el.pause();
			audio.play().catch(() => onerror?.());
		} else audio.pause();
	}

	function cycleRate() {
		rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
		if (audio) audio.playbackRate = rate;
	}

	function seek(e) {
		if (!audio || !total) return;
		audio.currentTime = (Number(e.currentTarget.value) / 100) * total;
	}
</script>

<div class="player" class:voice>
	<button class="play" type="button" onclick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
		{#if playing}<Pause size={18} fill="currentColor" />{:else}<Play size={18} fill="currentColor" />{/if}
	</button>
	<div class="track">
		<input
			type="range"
			min="0"
			max="100"
			step="0.5"
			value={total ? (current / total) * 100 : 0}
			oninput={seek}
			onpointerdown={() => (seeking = true)}
			onpointerup={() => (seeking = false)}
			aria-label="Posição do áudio"
		/>
		<span class="time">{formatDuration(playing || current > 0 ? current : total)}</span>
	</div>
	{#if playing || rate !== 1}
		<button class="rate" type="button" onclick={cycleRate} aria-label="Velocidade {rate}x">{rate}x</button>
	{:else if voice}
		<span class="mic" aria-hidden="true"><Mic size={16} /></span>
	{/if}
	<audio
		bind:this={audio}
		{src}
		preload="metadata"
		onplay={() => (playing = true)}
		onpause={() => (playing = false)}
		onended={() => ((playing = false), (current = 0))}
		ontimeupdate={() => !seeking && (current = audio.currentTime)}
		onloadedmetadata={() => Number.isFinite(audio.duration) && audio.duration > 0 && (total = audio.duration)}
		onerror={() => onerror?.()}
	></audio>
</div>

<style>
	.player { display: flex; align-items: center; gap: 0.55rem; min-width: 14rem; padding: 0.15rem 0; }
	.play { flex: none; width: 2.4rem; height: 2.4rem; border-radius: 50%; border: 0; background: rgba(22, 36, 27, 0.08); color: #4b5a52; display: grid; place-items: center; cursor: pointer; }
	.play:hover { background: rgba(22, 36, 27, 0.14); }
	.track { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
	input[type='range'] { width: 100%; accent-color: #2f7d4f; height: 1rem; margin: 0; cursor: pointer; }
	.time { font-size: 0.68rem; color: #667781; }
	.rate { flex: none; border: 0; border-radius: 999px; background: rgba(22, 36, 27, 0.1); color: #3b4a43; font-size: 0.7rem; font-weight: 800; min-width: 2.2rem; min-height: 1.6rem; cursor: pointer; }
	.mic { color: #53bdeb; flex: none; display: grid; }
	audio { display: none; }
</style>
