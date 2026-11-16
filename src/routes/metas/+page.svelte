<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { formatBRL } from '$lib/money.js';

	let { data, form } = $props();
	const g = $derived(data.goals);

	const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
	const monthName = (p) => `${MONTHS[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;
	const AREA_LABEL = { JARDIM: 'Jardim', LOJA: 'Loja' };
	const STATUS = {
		ok: ['No ritmo', 'ok'],
		atras: ['Atrás do ritmo', 'warn'],
		muito_atras: ['Bem atrás', 'bad'],
		sem_meta: ['Sem meta', 'dim'],
		sem_dado: ['Sem dado', 'dim']
	};

	function show(card, v) {
		if (v == null) return 'sem dado';
		if (card.kind === 'money') return formatBRL(v);
		if (card.kind === 'hours') return v < 1 ? `${Math.round(v * 60)} min` : `${v.toFixed(1).replace('.', ',')} h`;
		return String(v);
	}
	// Valor que vai no campo de edição: reais com vírgula, o resto como número.
	function inputValue(card, t) {
		if (t == null) return '';
		if (card.kind === 'money') return (t / 100).toFixed(2).replace('.', ',');
		return String(Math.round(t * 100) / 100).replace('.', ',');
	}
	const unit = (card) => (card.kind === 'money' ? 'R$' : card.kind === 'hours' ? 'horas' : 'quantidade');
	const pct = (card) => (card.target && card.value != null && card.better === 'up' ? Math.min(100, (card.value / card.target) * 100) : 0);
</script>

<svelte:head>
	<title>Metas · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<header class="head">
		<h1>Metas</h1>
		<nav class="tabs" aria-label="Área">
			{#each (data.solo ? ['JARDIM'] : ['JARDIM', 'LOJA']) as a (a)}
				<a class="tab" class:on={data.area === a} href={resolve(`/metas?area=${a}&mes=${data.period}`)}>{AREA_LABEL[a]}</a>
			{/each}
		</nav>
	</header>

	<div class="month">
		<a class="btn btn-secondary" href={resolve(`/metas?area=${data.area}&mes=${data.prev}`)} aria-label="Mês anterior">←</a>
		<strong>{monthName(data.period)}</strong>
		<a class="btn btn-secondary" href={resolve(`/metas?area=${data.area}&mes=${data.next}`)} aria-label="Próximo mês">→</a>
		{#if !data.isCurrent}<a class="link" href={resolve(`/metas?area=${data.area}`)}>Ir para o mês atual</a>{/if}
		<span class="spacer"></span>
		<form method="POST" action="?/copiar" use:enhance>
			<input type="hidden" name="period" value={data.period} />
			<input type="hidden" name="area" value={data.area} />
			<button class="btn btn-secondary" type="submit">Repetir metas do mês anterior</button>
		</form>
	</div>

	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.copied}<p class="success-text">{form.copied} metas copiadas do mês anterior.</p>{/if}
	{#if !g.hasAnyGoal}
		<p class="hint">Ainda não há metas neste mês. Defina o alvo em cada cartão: o progresso é calculado sozinho a partir do funil.</p>
	{/if}

	<div class="grid">
		{#each g.cards as card (card.metric)}
			{@const st = STATUS[card.status]}
			<section class="card goal">
				<div class="top">
					<h2>{card.label}</h2>
					<span class="pill {st[1]}">{st[0]}</span>
				</div>
				<p class="big">{show(card, card.value)}{#if card.target}<span class="of"> de {show(card, card.target)}</span>{/if}</p>
				{#if card.better === 'up'}
					<div class="bar" role="progressbar" aria-valuenow={Math.round(pct(card))} aria-valuemin="0" aria-valuemax="100" aria-label="Progresso de {card.label}">
						<div class="fill {st[1]}" style="width: {pct(card)}%"></div>
						{#if card.target && data.isCurrent}<div class="pace" style="left: {g.fraction * 100}%" title="Onde deveria estar hoje"></div>{/if}
					</div>
				{/if}

				<form method="POST" action="?/salvar" use:enhance class="edit">
					<input type="hidden" name="period" value={data.period} />
					<input type="hidden" name="area" value={data.area} />
					<input type="hidden" name="metric" value={card.metric} />
					<input type="hidden" name="scope" value="EQUIPE" />
					<label>
						<span>Meta da equipe ({unit(card)})</span>
						<input name="value" inputmode="decimal" value={inputValue(card, card.target)} placeholder="sem meta" />
					</label>
					<button class="btn btn-secondary" type="submit">Salvar</button>
				</form>

				<details>
					<summary>Por pessoa</summary>
					<table>
						<tbody>
							{#each card.people as p (p.id)}
								<tr>
									<td>{p.name}</td>
									<td class="num">{show(card, p.value)}</td>
									<td>
										<form method="POST" action="?/salvar" use:enhance class="edit small">
											<input type="hidden" name="period" value={data.period} />
											<input type="hidden" name="area" value={data.area} />
											<input type="hidden" name="metric" value={card.metric} />
											<input type="hidden" name="scope" value={p.id} />
											<input name="value" inputmode="decimal" value={inputValue(card, p.target)} placeholder="meta" aria-label="Meta de {p.name}" />
											<button class="btn btn-secondary" type="submit">Ok</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</details>
				<details>
					<summary>Como contamos</summary>
					<p class="how">{card.how}{card.sample != null ? ` Base: ${card.sample} leads respondidos no mês.` : ''}</p>
				</details>
			</section>
		{/each}
	</div>
	<p class="hint">A marca na barra mostra onde você deveria estar hoje se o mês andasse em ritmo constante. Meta vazia ou zero remove a meta.</p>
</main>

<style>
	.page { max-width: 1100px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.6rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	.tabs { display: flex; gap: 0.3rem; background: var(--color-bg-alt); border-radius: 999px; padding: 0.2rem; }
	.tab { padding: 0.35rem 1rem; border-radius: 999px; text-decoration: none; color: var(--color-text-dim); font-weight: 700; font-size: 0.85rem; }
	.tab.on { background: var(--color-accent); color: var(--color-on-accent); }
	.month { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
	.month strong { min-width: 10rem; text-align: center; }
	.month strong::first-letter { text-transform: uppercase; }
	.spacer { flex: 1; }
	.link { color: var(--color-accent-text); font-weight: 700; font-size: 0.82rem; }
	.hint { margin: 0; color: var(--color-text-dim); font-size: 0.82rem; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 0.9rem; }
	.goal { padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
	.top { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
	h2 { margin: 0; font-size: 1rem; }
	.pill { font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.6rem; border-radius: 999px; background: var(--color-bg-alt); color: var(--color-text-dim); }
	.pill.ok { background: rgba(47, 125, 79, 0.14); color: var(--color-success); }
	.pill.warn { background: var(--color-accent-dim); color: var(--color-accent-text); }
	.pill.bad { background: rgba(194, 54, 43, 0.12); color: var(--color-danger); }
	.big { margin: 0; font-size: 1.7rem; font-weight: 800; }
	.of { margin-left: 0.35rem; font-size: 0.95rem; font-weight: 600; color: var(--color-text-dim); }
	.bar { position: relative; height: 0.7rem; background: var(--color-bg-alt); border-radius: 999px; overflow: visible; }
	.fill { height: 100%; border-radius: 999px; background: var(--color-text-dim); }
	.fill.ok { background: var(--color-success); }
	.fill.warn { background: #e0a420; }
	.fill.bad { background: var(--color-danger); }
	.pace { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--color-text); opacity: 0.7; }
	.edit { display: flex; gap: 0.5rem; align-items: flex-end; }
	.edit label { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; font-size: 0.75rem; color: var(--color-text-dim); }
	.edit input { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.45rem 0.6rem; color: var(--color-text); min-width: 0; width: 100%; }
	.edit.small input { width: 6.5rem; }
	table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
	td { padding: 0.35rem 0.2rem; border-bottom: 1px solid var(--color-border); }
	td.num { text-align: right; font-weight: 700; }
	summary { cursor: pointer; font-size: 0.82rem; font-weight: 700; color: var(--color-text-dim); }
	.how { margin: 0.4rem 0 0; font-size: 0.82rem; color: var(--color-text-dim); }
</style>
