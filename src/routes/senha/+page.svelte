<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Trocar senha · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<h1>Trocar senha</h1>
	{#if data.forced}
		<p class="hint">Sua senha é temporária. Escolha uma nova para continuar.</p>
	{/if}
	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	<form method="POST" use:enhance class="card box">
		<label class="field"><span>Senha atual</span><input type="password" name="current" autocomplete="current-password" required /></label>
		<label class="field"><span>Nova senha (mín. 8 caracteres)</span><input type="password" name="next" autocomplete="new-password" minlength="8" required /></label>
		<label class="field"><span>Repetir nova senha</span><input type="password" name="confirm" autocomplete="new-password" minlength="8" required /></label>
		<button class="btn" type="submit">Salvar nova senha</button>
	</form>
</main>

<style>
	.page { max-width: 460px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	.hint { margin: 0; color: var(--color-text-dim); }
	.box { padding: 1.2rem; display: flex; flex-direction: column; gap: 0.9rem; }
</style>
