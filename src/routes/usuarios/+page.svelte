<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Usuários · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<h1>Usuários</h1>
	<p class="hint">
		Equipe interna (administrador) vê tudo. Equipe da loja vê só tarefas, agenda, contatos e conversas da loja.
		A senha que você define é temporária: a pessoa troca no primeiro acesso.
	</p>
	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.ok}<p class="success-text">Feito.</p>{/if}

	<div class="card list">
		{#each data.users as u (u.id)}
			<div class="row" class:off={!u.active}>
				<div class="who">
					<strong>{u.name}</strong>
					<span class="dim">{u.email}</span>
					{#if u.mustChangePassword}<span class="badge">Senha temporária</span>{/if}
					{#if !u.active}<span class="badge">Desativado</span>{/if}
				</div>
				<form method="POST" action="?/papel" use:enhance class="inline">
					<input type="hidden" name="id" value={u.id} />
					<select name="role" value={u.role} onchange={(e) => e.target.form.requestSubmit()}>
						<option value="ADMIN">Equipe interna</option>
						<option value="LOJA">Equipe da loja</option>
					</select>
				</form>
				<form method="POST" action="?/senha" use:enhance class="inline">
					<input type="hidden" name="id" value={u.id} />
					<input type="text" name="password" placeholder="Nova senha temporária" minlength="8" required />
					<button class="btn btn-secondary" type="submit">Redefinir</button>
				</form>
				<form method="POST" action="?/ativo" use:enhance class="inline">
					<input type="hidden" name="id" value={u.id} />
					<input type="hidden" name="active" value={u.active ? '0' : '1'} />
					<button class="btn btn-secondary" type="submit">{u.active ? 'Desativar' : 'Reativar'}</button>
				</form>
			</div>
		{/each}
	</div>

	<details class="card box">
		<summary>Novo usuário</summary>
		<form method="POST" action="?/criar" use:enhance class="grid">
			<label class="field"><span>Nome</span><input name="name" required maxlength="80" /></label>
			<label class="field"><span>E-mail</span><input name="email" type="email" required /></label>
			<label class="field"><span>Telefone</span><input name="phone" inputmode="tel" /></label>
			<label class="field">
				<span>Perfil</span>
				<select name="role"><option value="LOJA">Equipe da loja</option><option value="ADMIN">Equipe interna</option></select>
			</label>
			<label class="field"><span>Senha temporária (mín. 8)</span><input name="password" type="text" minlength="8" required /></label>
			<button class="btn" type="submit">Criar usuário</button>
		</form>
	</details>
</main>

<style>
	.page { max-width: 960px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	.hint { margin: 0; color: var(--color-text-dim); font-size: 0.85rem; }
	.row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; padding: 0.8rem 1rem; border-bottom: 1px solid var(--color-border); }
	.row:last-child { border-bottom: none; }
	.row.off { opacity: 0.6; }
	.who { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 0.15rem; }
	.dim { color: var(--color-text-dim); font-size: 0.8rem; }
	.inline { display: flex; gap: 0.4rem; align-items: center; }
	.inline input, .inline select { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.4rem 0.6rem; color: var(--color-text); }
	
	.box { padding: 1rem; }
	.box summary { cursor: pointer; font-weight: 700; }
	.grid { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; align-items: end; }
</style>
