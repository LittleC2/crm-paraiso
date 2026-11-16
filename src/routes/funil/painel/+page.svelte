<script>
	import { resolve } from '$app/paths';
	import { formatBRL } from '$lib/money.js';

	let { data } = $props();
	const s = $derived(data.stats);
	const pct = (v) => (v == null ? null : `${Math.round(v * 100)}%`);
	const hours = (h) => (h == null ? null : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1).replace('.', ',')} h`);
</script>

<svelte:head>
	<title>Painel do funil · Paraíso das Plantas</title>
</svelte:head>

{#snippet tile(label, value, how)}
	<div class="card tile">
		<span class="label">{label}</span>
		<strong class="value">{value ?? 'sem dado'}</strong>
		<span class="how">{how}</span>
	</div>
{/snippet}

<main class="page">
	<a class="back" href={resolve('/funil')}>← Funil</a>
	<h1>Painel do funil de jardins</h1>

	<div class="tiles">
		{@render tile('Leads nos últimos 30 dias', s.leads30 || null, 'Negócios de jardim criados nos últimos 30 dias.')}
		{@render tile('Em proposta', s.proposalCents == null ? null : `${formatBRL(s.proposalCents)} (${s.proposalCount})`, 'Soma dos valores dos negócios hoje na etapa "Proposta enviada".')}
		{@render tile('Fechado no mês', s.wonMonthCount ? `${formatBRL(s.wonMonthCents)} (${s.wonMonthCount})` : null, 'Negócios que entraram em etapa de ganho neste mês.')}
		{@render tile('Conversão (90 dias)', pct(s.conversion90), `Ganhos divididos por ganhos mais perdidos, ${s.decided90} negócios decididos.`)}
		{@render tile('Tempo até o 1º contato', hours(s.firstContactHours), `Mediana em horário comercial (8h às 20h), ${s.firstContactSample} leads com contato registrado. Conta ligação, WhatsApp ou visita, não nota.`)}
	</div>

	<section class="card box">
		<h2>Negócios por etapa</h2>
		<ul>{#each s.stages as st (st.id)}<li><span>{st.name}</span><strong>{st.count}</strong></li>{/each}</ul>
		<p class="how">Conta todos os negócios que estão hoje em cada etapa.</p>
	</section>

	<div class="two">
		<section class="card box">
			<h2>Leads por origem (30 dias)</h2>
			{#if s.bySource.length === 0}<p class="how">sem dado</p>{:else}
				<ul>{#each s.bySource as [name, n] (name)}<li><span>{name}</span><strong>{n}</strong></li>{/each}</ul>
			{/if}
			<p class="how">A origem é a informada ao criar o negócio. "Sem origem" = não preenchida.</p>
		</section>
		<section class="card box">
			<h2>Motivos de perda (90 dias)</h2>
			{#if s.lostByReason.length === 0}<p class="how">sem dado</p>{:else}
				<ul>{#each s.lostByReason as [reason, n] (reason)}<li><span>{s.lostLabels[reason] ?? reason}</span><strong>{n}</strong></li>{/each}</ul>
			{/if}
			<p class="how">O motivo é obrigatório ao marcar um negócio como perdido.</p>
		</section>
	</div>
</main>

<style>
	.page { max-width: 1000px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.back { font-size: 0.85rem; color: var(--color-text-dim); text-decoration: none; }
	h1 { margin: 0; font-size: 1.4rem; }
	h2 { margin: 0 0 0.6rem; font-size: 1.05rem; }
	.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.8rem; }
	.tile { padding: 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
	.label { font-size: 0.78rem; color: var(--color-text-dim); }
	.value { font-size: 1.5rem; }
	.how { font-size: 0.75rem; color: var(--color-text-dim); margin: 0.3rem 0 0; }
	.box { padding: 1rem; }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
	ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
	li { display: flex; justify-content: space-between; font-size: 0.92rem; }
</style>
