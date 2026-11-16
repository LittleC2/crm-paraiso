<script>
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Mic from '@lucide/svelte/icons/mic';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import X from '@lucide/svelte/icons/x';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import FileText from '@lucide/svelte/icons/file-text';
	import { formatDuration, formatSize } from '$lib/chatFormat.js';

	// Campo de envio estilo WhatsApp: texto, anexo (clipe, arrastar, colar), voz gravada
	// no navegador e respostas rápidas. Não fala com o servidor: devolve para quem usa.
	//   onsend(text) / onnote(text) / onfile(file, { caption, voice, seconds }) -> Promise<{ ok, error }>
	let { replies = [], disabled = false, blocked = '', contactName = '', agentName = '', onsend, onnote, onfile, mediaEnabled = true } = $props();

	const MAX_BYTES = 16 * 1024 * 1024;
	const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/mp4,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';

	let text = $state('');
	let error = $state('');
	let busy = $state(false);
	let picked = $state(null); // { file, url, caption }
	let recording = $state(false);
	let recSeconds = $state(0);
	let dragOver = $state(false);
	let fileInput = $state(null);

	let recorder = null;
	let chunks = [];
	let stream = null;
	let timer = null;
	let cancelled = false;

	const isImage = $derived(picked?.file.type.startsWith('image/'));

	function useReply(reply) {
		// {nome} e {atendente} entram aqui, igual ao envio de texto simples
		const first = (s) => String(s).trim().split(/\s+/)[0] ?? '';
		text = String(reply.body).replaceAll('{nome}', first(contactName)).replaceAll('{atendente}', first(agentName));
	}

	async function run(promise) {
		busy = true;
		error = '';
		const r = await promise;
		busy = false;
		if (!r?.ok) error = r?.error ?? 'Não foi possível enviar.';
		return r?.ok;
	}

	async function send(event) {
		event?.preventDefault();
		if (busy || disabled) return;
		if (picked) {
			const ok = await run(onfile(picked.file, { caption: picked.caption.trim(), voice: false, seconds: null }));
			if (ok) clearPicked();
			return;
		}
		if (!text.trim()) return;
		if (await run(onsend(text))) text = '';
	}

	async function note() {
		if (busy || !text.trim() || !onnote) return;
		if (await run(onnote(text))) text = '';
	}

	function pick(file) {
		error = '';
		if (!file) return;
		if (file.size > MAX_BYTES) return (error = 'O arquivo passa de 16 MB.');
		if (picked?.url) URL.revokeObjectURL(picked.url);
		picked = { file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '', caption: text };
		text = '';
	}

	function clearPicked() {
		if (picked?.url) URL.revokeObjectURL(picked.url);
		picked = null;
	}

	function onPaste(e) {
		const file = [...(e.clipboardData?.files ?? [])][0];
		if (file && mediaEnabled && !disabled) {
			e.preventDefault();
			pick(file);
		}
	}

	function onDrop(e) {
		e.preventDefault();
		dragOver = false;
		if (!mediaEnabled || disabled) return;
		pick(e.dataTransfer?.files?.[0]);
	}

	// ---- voz -------------------------------------------------------------------------
	async function startRecording() {
		error = '';
		if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return (error = 'Este navegador não grava áudio.');
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			return (error = 'Permita o microfone no navegador para gravar.');
		}
		const mime = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
		recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
		chunks = [];
		cancelled = false;
		recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
		recorder.onstop = finishRecording;
		recorder.start();
		recording = true;
		recSeconds = 0;
		timer = setInterval(() => {
			recSeconds += 1;
			if (recSeconds >= 300) stopRecording(); // 5 min
		}, 1000);
	}

	function stopRecording(cancel = false) {
		cancelled = cancel;
		clearInterval(timer);
		if (recorder && recorder.state !== 'inactive') recorder.stop();
	}

	async function finishRecording() {
		stream?.getTracks().forEach((t) => t.stop());
		const seconds = recSeconds;
		recording = false;
		if (cancelled || !chunks.length || seconds < 1) return;
		const type = recorder.mimeType || 'audio/webm';
		const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
		const file = new File([new Blob(chunks, { type })], `voz.${ext}`, { type });
		await run(onfile(file, { caption: '', voice: true, seconds }));
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="composer"
	class:drag={dragOver}
	ondragover={(e) => (e.preventDefault(), (dragOver = mediaEnabled && !disabled))}
	ondragleave={() => (dragOver = false)}
	ondrop={onDrop}
>
	{#if blocked}<p class="blocked">{blocked}</p>{/if}
	{#if error}<p class="error-text" role="alert">{error}</p>{/if}

	{#if picked}
		<div class="preview">
			<button class="btn-icon" type="button" onclick={clearPicked} aria-label="Remover anexo"><X size={16} /></button>
			{#if isImage}
				<img src={picked.url} alt="Prévia do anexo" />
			{:else}
				<div class="file"><FileText size={26} /><strong>{picked.file.name}</strong><small>{formatSize(picked.file.size)}</small></div>
			{/if}
		</div>
		<div class="line">
			<input class="caption" type="text" maxlength="1000" placeholder="Legenda (opcional)" bind:value={picked.caption} onkeydown={(e) => e.key === 'Enter' && send(e)} />
			<button class="send" type="button" onclick={send} disabled={busy || disabled} aria-label="Enviar anexo"><SendHorizontal size={20} /></button>
		</div>
	{:else if recording}
		<div class="line rec">
			<button class="btn-icon" type="button" onclick={() => stopRecording(true)} aria-label="Cancelar gravação"><Trash2 size={16} /></button>
			<span class="pulse" aria-hidden="true"></span>
			<span class="rec-time">Gravando {formatDuration(recSeconds)}</span>
			<button class="send" type="button" onclick={() => stopRecording(false)} aria-label="Enviar áudio"><SendHorizontal size={20} /></button>
		</div>
	{:else}
		{#if replies.length}
			<div class="replies actions">
				{#each replies as r (r.id)}<button type="button" class="chip" onclick={() => useReply(r)}>{r.title}</button>{/each}
			</div>
		{/if}
		<form class="line" onsubmit={send}>
			{#if mediaEnabled}
				<input bind:this={fileInput} type="file" accept={ACCEPT} hidden onchange={(e) => (pick(e.currentTarget.files?.[0]), (e.currentTarget.value = ''))} />
				<button class="btn-icon round" type="button" onclick={() => fileInput?.click()} disabled={disabled || busy} aria-label="Anexar arquivo" title="Anexar foto, vídeo ou documento"><Paperclip size={18} /></button>
			{/if}
			<textarea
				rows="1"
				bind:value={text}
				placeholder="Escreva a mensagem..."
				maxlength="4000"
				{disabled}
				onpaste={onPaste}
				oninput={(e) => ((e.currentTarget.style.height = 'auto'), (e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 140) + 'px'))}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						send();
					}
				}}
			></textarea>
			{#if text.trim() || !mediaEnabled}
				<button class="send" type="submit" disabled={busy || disabled || !text.trim()} aria-label="Enviar"><SendHorizontal size={20} /></button>
			{:else}
				<button class="send mic" type="button" onclick={startRecording} disabled={disabled || busy} aria-label="Gravar áudio" title="Gravar mensagem de voz"><Mic size={20} /></button>
			{/if}
		</form>
		{#if onnote}
			<div class="foot">
				<button class="link" type="button" onclick={note} disabled={busy || !text.trim()} title="Fica só aqui, não vai para o cliente">Salvar como nota interna</button>
				<span class="dim">Enter envia · Shift+Enter quebra a linha</span>
			</div>
		{/if}
	{/if}
	{#if dragOver}<div class="drop">Solte para anexar</div>{/if}
</div>

<style>
	.composer { position: relative; display: flex; flex-direction: column; gap: 0.5rem; }
	.composer.drag { outline: 2px dashed var(--color-accent); outline-offset: 2px; border-radius: 10px; }
	.drop { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(240, 180, 41, 0.18); font-weight: 800; color: var(--color-accent-text); border-radius: 10px; pointer-events: none; }
	.blocked { margin: 0; padding: 0.45rem 0.7rem; border-radius: var(--radius-button); background: rgba(194, 54, 43, 0.1); color: var(--color-danger); font-size: 0.82rem; font-weight: 600; }
	.line { display: flex; align-items: flex-end; gap: var(--gap-actions); }
	textarea, .caption { flex: 1; min-width: 0; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 22px; padding: 0.6rem 0.9rem; color: var(--color-text); resize: none; font: inherit; line-height: 1.3; max-height: 140px; min-height: var(--control-h); box-sizing: border-box; }
	textarea:focus, .caption:focus { outline: 2px solid var(--color-accent); outline-offset: 0; }
	.btn-icon.round { border-radius: 50%; width: var(--control-h); height: var(--control-h); border-color: transparent; }
	.send { flex: none; width: var(--control-h); height: var(--control-h); border-radius: 50%; border: 0; background: var(--color-accent); color: var(--color-on-accent); display: grid; place-items: center; cursor: pointer; }
	.send:disabled { opacity: 0.5; cursor: not-allowed; }
	.send.mic { background: var(--color-bg-elevated); color: var(--color-text); border: 1px solid var(--color-border); }
	.replies { gap: 0.35rem; }
	.preview { position: relative; background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: 10px; padding: 0.6rem; display: flex; justify-content: center; }
	.preview .btn-icon { position: absolute; top: 0.4rem; right: 0.4rem; background: #fff; }
	.preview img { max-width: 100%; max-height: 14rem; border-radius: 6px; object-fit: contain; }
	.file { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 2rem 0.6rem 0.4rem; min-width: 0; }
	.file strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.file small { color: var(--color-text-dim); }
	.rec { align-items: center; background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: 999px; padding: 0.3rem 0.4rem; }
	.rec-time { flex: 1; font-weight: 700; }
	.pulse { width: 0.7rem; height: 0.7rem; border-radius: 50%; background: var(--color-danger); animation: pulse 1s ease-in-out infinite; }
	@keyframes pulse { 50% { opacity: 0.25; } }
	.foot { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
	.link { background: none; border: 0; padding: 0; color: var(--color-accent-text); font-weight: 700; font-size: 0.8rem; cursor: pointer; text-decoration: underline; }
	.link:disabled { opacity: 0.5; cursor: not-allowed; }
	.dim { color: var(--color-text-dim); font-size: 0.75rem; }
</style>
