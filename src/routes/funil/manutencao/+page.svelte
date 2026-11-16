<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { formatBRL } from '$lib/money.js';

	let { data, form } = $props();
	const fmt = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'sem data');
	const STATUS = { ATIVO: 'Ativo', PAUSADO: 'Pausado', ENCERRADO: 'Encerrado' };
</script>

<svelte:head>
	<title>Clube de manutenção · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<a class="back" href={resolve('/funil')}>← Funil</a>
	<h1>Clube de manutenção</h1>
	<p class="hint">
		Receita mensal recorrente dos planos ativos: <strong>{formatBRL(data.monthlyRecurringCents)}</strong>
		<span>(soma do valor mensal dos contratos com status Ativo)</span>
	</p>
	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.created}<p class="success-text">Contrato criado.</p>{/if}

	<div class="card list">
		{#if data.contracts.length === 0}<p class="pad hint">Nenhum contrato ainda.</p>{/if}
		{#each data.contracts as c (c.id)}
			<div class="row" class:off={c.status !== 'ATIVO'}>
				<div class="who">
					<a href={resolve(`/contatos/${c.contact.id}`)}><strong>{c.contact.name}</strong></a>
					<span class="hint">{formatBRL(c.monthlyValueCents)}/mês · visita a cada {c.visitIntervalDays} dias · próxima: {fmt(c.nextVisitAt)}</span>
				</div>
				<span class="badge">{STATUS[c.status]}</span>
				{#if c.status === 'ATIVO'}
					<form method="POST" action="?/visitaFeita" use:enhance><input type="hidden" name="id" value={c.id} /><button class="btn btn-secondary" type="submit">Visita feita</button></form>
				{/if}
				<form method="POST" action="?/status" use:enhance class="inline">
					<input type="hidden" name="id" value={c.id} />
					<select name="status" value={c.status} onchange={(e) => e.target.form.requestSubmit()}>
						{#each Object.entries(STATUS) as [v, label] (v)}<option value={v}>{label}</option>{/each}
					</select>
				</form>
			</div>
		{/each}
	</div>

	<details class="card box">
		<summary>Novo contrato</summary>
		<form method="POST" action="?/criar" use:enhance class="grid">
			<label class="field">
				<span>Contato (cliente de jardim)</span>
				<select name="contactId" required><option value="">Escolha...</option>{#each data.contacts as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select>
			</label>
			<label class="field"><span>Valor mensal (R$)</span><input name="monthlyValue" inputmode="decimal" required /></label>
			<label class="field"><span>Visita a cada (dias)</span><input name="visitIntervalDays" type="number" min="7" max="90" value="30" /></label>
			<label class="field"><span>Primeira visita</span><input name="firstVisitAt" type="date" /></label>
			<label class="field wide"><span>Observações</span><input name="notes" maxlength="1000" /></label>
			<button class="btn" type="submit">Criar contrato</button>
		</form>
	</details>
</main>

<style>
	.page { max-width: 900px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.back { font-size: 0.85rem; color: var(--color-text-dim); text-decoration: none; }
	h1 { margin: 0; font-size: 1.4rem; }
	.hint { margin: 0; color: var(--color-text-dim); font-size: 0.85rem; }
	.pad { padding: 1rem; }
	.row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; padding: 0.8rem 1rem; border-bottom: 1px solid var(--color-border); }
	.row:last-child { border-bottom: none; }
	.row.off { opacity: 0.6; }
	.who { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 0.15rem; }
	.who a { text-decoration: none; }
	.inline select { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.4rem 0.6rem; color: var(--color-text); }
	.box { padding: 1rem; }
	.box summary { cursor: pointer; font-weight: 700; }
	.grid { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; align-items: end; }
	.wide { grid-column: 1 / -1; }
</style>
