<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { formatPhone, waLink } from '$lib/phone.js';

	let { data, form } = $props();

	const TYPE_LABEL = {
		CLIENTE_LOJA: 'Cliente da loja',
		CLIENTE_JARDIM: 'Cliente de jardim',
		PARCEIRO: 'Parceiro',
		FORNECEDOR: 'Fornecedor'
	};

	function pageHref(n) {
		const u = new URL(location.href);
		u.searchParams.set('pagina', String(n));
		return u.pathname + u.search;
	}
</script>

<svelte:head>
	<title>Contatos · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<header class="head">
		<h1>Contatos <span class="count">{data.total}</span></h1>
	</header>

	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.created}<p class="success-text">Contato criado.</p>{/if}
	{#if form?.report}
		<p class="success-text">
			Importação: {form.report.created} criados, {form.report.duplicates} duplicados,
			{form.report.invalid} inválidos{form.report.truncated ? ' (só as 2000 primeiras linhas)' : ''}.
		</p>
		{#each form.report.problems as problem (problem)}<p class="hint">{problem}</p>{/each}
	{/if}

	<form method="GET" class="card filters">
		<input type="search" name="q" placeholder="Buscar nome, e-mail ou telefone" value={data.filters.q} />
		{#if data.isAdmin && !data.solo}
			<select name="area" value={data.filters.area}>
				<option value="">Todas as áreas</option>
				<option value="LOJA">Loja</option>
				<option value="JARDIM">Jardim</option>
			</select>
		{/if}
		<select name="tipo" value={data.filters.type}>
			<option value="">Todos os tipos</option>
			{#each Object.entries(TYPE_LABEL) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
		<input type="text" name="tag" placeholder="Etiqueta" value={data.filters.tag} />
		<button class="btn btn-secondary" type="submit">Filtrar</button>
	</form>

	<div class="card list">
		{#if data.contacts.length === 0}
			<p class="hint pad">Nenhum contato encontrado.</p>
		{:else}
			<ul>
				{#each data.contacts as contact (contact.id)}
					<li>
						<a class="row" href={resolve(`/contatos/${contact.id}`)}>
							<strong>{contact.name}</strong>
							<span class="dim">{formatPhone(contact.phone)}</span>
							<span class="badge">{TYPE_LABEL[contact.type]}</span>
							{#if data.isAdmin && !data.solo}<span class="badge">{contact.area === 'LOJA' ? 'Loja' : 'Jardim'}</span>{/if}
							{#each contact.tags as t (t)}<span class="badge tag">{t}</span>{/each}
						</a>
						{#if contact.phone}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a class="wa" href={waLink(contact.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if data.pages > 1}
		<nav class="pager">
			{#if data.page > 1}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={pageHref(data.page - 1)}>Anterior</a>
			{/if}
			<span>Página {data.page} de {data.pages}</span>
			{#if data.page < data.pages}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={pageHref(data.page + 1)}>Próxima</a>
			{/if}
		</nav>
	{/if}

	<details class="card box">
		<summary>Novo contato</summary>
		<form method="POST" action="?/criar" use:enhance class="grid">
			<label class="field"><span>Nome</span><input name="name" required maxlength="120" /></label>
			<label class="field"><span>Telefone (WhatsApp)</span><input name="phone" inputmode="tel" placeholder="(21) 99999-9999" /></label>
			<label class="field"><span>E-mail</span><input name="email" type="email" /></label>
			<label class="field">
				<span>Tipo</span>
				<select name="type">
					{#each Object.entries(TYPE_LABEL) as [value, label] (value)}
						{#if data.isAdmin || value !== 'CLIENTE_JARDIM'}<option {value}>{label}</option>{/if}
					{/each}
				</select>
			</label>
			{#if data.isAdmin && !data.solo}
				<label class="field">
					<span>Área</span>
					<select name="area"><option value="LOJA">Loja</option><option value="JARDIM">Jardim</option></select>
				</label>
			{/if}
			<label class="field"><span>Bairro</span><input name="neighborhood" /></label>
			<label class="field"><span>Cidade</span><input name="city" /></label>
			<label class="field"><span>Origem</span><input name="source" placeholder="Instagram, loja, indicação..." /></label>
			<label class="field"><span>Etiquetas (separe por vírgula)</span><input name="tags" /></label>
			<label class="field wide"><span>Observações</span><textarea name="notes" rows="2"></textarea></label>
			<label class="check"><input type="checkbox" name="optInWhatsapp" /> Autorizou receber mensagens no WhatsApp</label>
			<button class="btn" type="submit">Salvar contato</button>
		</form>
	</details>

	<div class="card box import-link">
		<div>
			<strong>Importar contatos</strong>
			<p class="hint">De planilha, Google Contatos ou iPhone, com guia passo a passo e prévia antes de gravar.</p>
		</div>
		<a class="btn" href={resolve('/contatos/importar')}>Como importar</a>
	</div>
</main>

<style>
	.page { max-width: 960px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	.count { font-size: 0.8rem; color: var(--color-text-dim); font-weight: 600; margin-left: 0.4rem; }
	.filters { padding: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.filters input, .filters select { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.5rem 0.7rem; color: var(--color-text); }
	.filters input[type='search'] { flex: 1; min-width: 200px; }
	.list ul { list-style: none; margin: 0; padding: 0; }
	.list li { display: flex; align-items: center; border-bottom: 1px solid var(--color-border); }
	.list li:last-child { border-bottom: none; }
	.row { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.8rem; padding: 0.8rem 1rem; text-decoration: none; }
	.row:hover { background: var(--color-bg-elevated); }
	.dim { color: var(--color-text-dim); font-size: 0.85rem; }
	.tag { background: var(--color-accent-dim); border-color: transparent; }
	.wa { margin-right: 1rem; font-size: 0.8rem; font-weight: 700; color: var(--color-accent-text); text-decoration: none; }
	.pad { padding: 1rem; margin: 0; }
	.hint { color: var(--color-text-dim); font-size: 0.85rem; margin: 0; }
	.pager { display: flex; gap: 1rem; justify-content: center; align-items: center; font-size: 0.85rem; }
	.box { padding: 1rem; }
	.import-link { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
	.box summary { cursor: pointer; font-weight: 700; }
	.grid { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; align-items: end; }
	.wide { grid-column: 1 / -1; }
	.check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; grid-column: 1 / -1; }
</style>
