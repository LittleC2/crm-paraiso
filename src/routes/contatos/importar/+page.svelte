<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { formatPhone } from '$lib/phone.js';

	let { data, form } = $props();

	let texto = $state('');
	let nome = $state('');
	let area = $state('JARDIM');
	let reading = $state(false);

	async function pick(event) {
		const file = event.currentTarget.files?.[0];
		texto = '';
		nome = '';
		if (!file) return;
		reading = true;
		texto = await file.text();
		nome = file.name;
		reading = false;
	}
	const preview = $derived(form?.preview ?? null);
	const done = $derived(form?.done ?? null);
</script>

<svelte:head>
	<title>Importar contatos · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<a class="back" href={resolve('/contatos')}>← Contatos</a>
	<h1>Importar contatos</h1>
	<p class="hint">Traga a sua lista de clientes de uma planilha, do Google Contatos ou do iPhone. Antes de gravar, você vê uma prévia do que vai entrar.</p>

	<section class="card box">
		<h2>1. Prepare o arquivo</h2>
		<details open>
			<summary>Do Google Contatos (Android ou conta Gmail)</summary>
			<ol>
				<li>Abra <strong>contacts.google.com</strong> no computador.</li>
				<li>No menu da esquerda, clique em <strong>Exportar</strong>.</li>
				<li>Escolha <strong>Todos os contatos</strong> (ou uma etiqueta) e o formato <strong>CSV do Google</strong>. Clique em Exportar.</li>
				<li>Use o arquivo <code>contacts.csv</code> baixado no passo 2.</li>
			</ol>
		</details>
		<details>
			<summary>Do iPhone (iCloud)</summary>
			<ol>
				<li>No computador, abra <strong>icloud.com/contacts</strong> e entre com o Apple ID.</li>
				<li>Clique em um contato, aperte <strong>Ctrl+A</strong> (ou Cmd+A) para marcar todos.</li>
				<li>Clique na engrenagem no canto inferior esquerdo e em <strong>Exportar vCard</strong>.</li>
				<li>Use o arquivo <code>.vcf</code> baixado no passo 2. O CRM lê esse formato direto.</li>
			</ol>
		</details>
		<details>
			<summary>De uma planilha (Excel ou Google Sheets) ou de outro sistema</summary>
			<ol>
				<li>Baixe o <a href={resolve('/contatos/modelo.csv')} download>modelo de planilha</a> e copie os seus contatos para ele.</li>
				<li>Colunas aceitas: <strong>Nome, Telefone, E-mail, Bairro, Cidade, Origem, Tipo, Etiquetas, Observações, Autorizou WhatsApp</strong>. Só o Nome é obrigatório.</li>
				<li>Salve como <strong>CSV</strong> (no Excel: Salvar como, "CSV UTF-8"; no Sheets: Arquivo, Fazer download, CSV).</li>
			</ol>
		</details>
		<div class="rules">
			<strong>Regras que o CRM aplica</strong>
			<ul>
				<li>Telefone com DDD, com ou sem 55 (ex: 21 99999-1111). Sem DDD, o contato entra sem telefone e aparece na lista de problemas.</li>
				<li>Telefone que já existe no CRM é ignorado (não duplica nem altera o contato atual).</li>
				<li>Um arquivo por área: escolha se são clientes do jardim ou da loja. Máximo 2000 contatos por arquivo.</li>
				<li>Coluna "Autorizou WhatsApp" com sim ou não. Sem a coluna, o contato entra sem autorização e o CRM pede confirmação na hora de iniciar a conversa.</li>
			</ul>
		</div>
	</section>

	<section class="card box">
		<h2>2. Envie e confira a prévia</h2>
		{#if form?.error}<p class="error-text">{form.error}</p>{/if}

		<form method="POST" action="?/previa" use:enhance class="upload">
			<label class="field">
				<span>Arquivo (.csv ou .vcf)</span>
				<input type="file" accept=".csv,.vcf,text/csv,text/vcard" onchange={pick} required />
			</label>
			{#if data.isAdmin && !data.solo}
				<label class="field">
					<span>Esses contatos são de</span>
					<select name="area" bind:value={area}><option value="JARDIM">Jardim (clientes de serviço)</option><option value="LOJA">Loja</option></select>
				</label>
			{/if}
			<input type="hidden" name="texto" value={texto} />
			<input type="hidden" name="nome" value={nome} />
			<button class="btn" type="submit" disabled={!texto || reading}>{reading ? 'Lendo...' : 'Ver prévia'}</button>
		</form>

		{#if preview}
			<div class="result">
				<p class="big"><strong>{preview.created}</strong> contatos novos serão criados</p>
				<ul class="stats">
					<li>{preview.duplicates} já existem (telefone repetido): ignorados</li>
					<li>{preview.invalid} com problema: ignorados</li>
					{#if preview.truncated}<li>O arquivo passa de 2000 linhas: só as primeiras serão lidas.</li>{/if}
				</ul>
				{#if preview.samples.length}
					<table>
						<thead><tr><th>Nome</th><th>Telefone</th><th>Bairro</th></tr></thead>
						<tbody>
							{#each preview.samples as c (c.name + c.phone)}
								<tr><td>{c.name}</td><td>{c.phone ? formatPhone(c.phone) : 'sem telefone'}</td><td>{c.neighborhood ?? ''}</td></tr>
							{/each}
						</tbody>
					</table>
					<p class="hint">Primeiros {preview.samples.length} da lista.</p>
				{/if}
				{#if preview.problems.length}
					<details>
						<summary>Ver os problemas ({preview.invalid})</summary>
						<ul>{#each preview.problems as p (p)}<li>{p}</li>{/each}</ul>
					</details>
				{/if}
				{#if preview.created > 0}
					<form method="POST" action="?/importar" use:enhance>
						<input type="hidden" name="texto" value={texto} />
						<input type="hidden" name="nome" value={nome} />
						{#if data.isAdmin && !data.solo}<input type="hidden" name="area" value={area} />{/if}
						<button class="btn" type="submit">Importar {preview.created} contatos</button>
					</form>
				{/if}
			</div>
		{/if}

		{#if done}
			<div class="result ok">
				<p class="big"><strong>{done.created}</strong> contatos importados.</p>
				<p class="hint">{done.duplicates} repetidos e {done.invalid} com problema foram ignorados.</p>
				<a class="btn" href={resolve('/contatos')}>Ver contatos</a>
			</div>
		{/if}
	</section>
</main>

<style>
	.page { max-width: 860px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.back { font-size: 0.85rem; color: var(--color-text-dim); text-decoration: none; }
	h1 { margin: 0; font-size: 1.4rem; }
	h2 { margin: 0 0 0.4rem; font-size: 1.05rem; }
	.hint { margin: 0; color: var(--color-text-dim); font-size: 0.85rem; }
	.box { padding: 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
	details { border-top: 1px solid var(--color-border); padding-top: 0.5rem; }
	summary { cursor: pointer; font-weight: 700; }
	ol, ul { margin: 0.5rem 0 0.2rem; padding-left: 1.3rem; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; }
	code { background: var(--color-bg-alt); padding: 0 0.3rem; border-radius: 4px; }
	.rules { background: var(--color-bg-elevated); border-radius: var(--radius-button); padding: 0.7rem 0.9rem; font-size: 0.88rem; }
	.upload { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: flex-end; }
	.field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; }
	.field span { color: var(--color-text-dim); }
	select { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.45rem 0.6rem; color: var(--color-text); }
	.result { border: 1px solid var(--color-border); border-radius: var(--radius-card, 12px); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; background: var(--color-bg-elevated); }
	.result.ok { border-color: var(--color-success); }
	.big { margin: 0; font-size: 1.1rem; }
	.stats { list-style: none; padding: 0; margin: 0; color: var(--color-text-dim); }
	table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
	th, td { text-align: left; padding: 0.35rem 0.4rem; border-bottom: 1px solid var(--color-border); }
</style>
