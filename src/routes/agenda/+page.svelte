<script>
	import { resolve } from '$app/paths';
	import EventForm from '$lib/components/EventForm.svelte';

	let { data, form } = $props();

	const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

	const title = $derived(
		new Date(`${data.date}T12:00:00Z`).toLocaleDateString('pt-BR', {
			timeZone: 'UTC',
			month: 'long',
			year: 'numeric',
			...(data.view === 'dia' ? { day: 'numeric', weekday: 'long' } : {})
		})
	);

	function href(overrides) {
		const params = {
			vista: data.view,
			data: data.date,
			pessoa: data.personFilter,
			area: data.areaFilter,
			...overrides
		};
		const query = Object.entries(params)
			.filter(([, v]) => v)
			.map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
			.join('&');
		return `/agenda?${query}`;
	}
	const dayNumber = (key) => Number(key.slice(8));
	const time = (d) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
	const inMonth = (key) => key.slice(0, 7) === data.date.slice(0, 7);
</script>

<svelte:head>
	<title>Agenda · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<header class="head">
		<h1>Agenda</h1>
		<nav class="views">
			{#each [['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia']] as [v, label] (v)}
				<a class="pill" class:on={data.view === v} href={resolve(href({ vista: v }))}>{label}</a>
			{/each}
		</nav>
	</header>

	<div class="bar">
		<a class="btn-icon" href={resolve(href({ data: data.prev }))} aria-label="Anterior">‹</a>
		<strong class="when">{title}</strong>
		<a class="btn-icon" href={resolve(href({ data: data.next }))} aria-label="Próximo">›</a>
		<a class="today" href={resolve(href({ data: data.today }))}>Hoje</a>
		<form method="GET" class="filters">
			<input type="hidden" name="vista" value={data.view} />
			<input type="hidden" name="data" value={data.date} />
			<select name="pessoa" value={data.personFilter} onchange={(e) => e.target.form.submit()}>
				<option value="">Toda a equipe</option>
				{#each data.users as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
			</select>
			{#if data.isAdmin && !data.solo}
				<select name="area" value={data.areaFilter} onchange={(e) => e.target.form.submit()}>
					<option value="">Loja e jardim</option>
					<option value="LOJA">Loja</option>
					<option value="JARDIM">Jardim</option>
				</select>
			{/if}
		</form>
	</div>

	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.created}<p class="success-text">Evento criado.</p>{/if}

	{#snippet items(key)}
		{#each data.eventsByDay[key] ?? [] as occ (occ.id + occ.occurrenceStart)}
			<a class="chip type-{occ.type}" href={resolve(`/agenda/${occ.id}`)} title={occ.title}>
				{#if !occ.allDay}<b>{time(occ.occurrenceStart)}</b>{/if}
				{occ.title}
			</a>
		{/each}
		{#each data.tasksByDay[key] ?? [] as t (t.id)}
			<a class="chip task" class:done={t.status === 'FEITO'} href={resolve('/tarefas')} title="Tarefa: {t.title}">☐ {t.title}</a>
		{/each}
	{/snippet}

	{#if data.view === 'dia'}
		<section class="card dayview">
			{#if !(data.eventsByDay[data.date]?.length || data.tasksByDay[data.date]?.length)}
				<p class="empty">Nada marcado para este dia.</p>
			{:else}
				<div class="daylist">{@render items(data.date)}</div>
			{/if}
		</section>
	{:else}
		<div class="cal" class:month={data.view === 'mes'}>
			{#each WEEKDAYS as w (w)}<div class="wd">{w}</div>{/each}
			{#each data.weeks.flat() as key (key)}
				<div class="cell" class:other={data.view === 'mes' && !inMonth(key)} class:now={key === data.today}>
					<a class="num" href={resolve(href({ vista: 'dia', data: key }))}>{dayNumber(key)}</a>
					<div class="stack">{@render items(key)}</div>
				</div>
			{/each}
		</div>
	{/if}

	<details class="card box">
		<summary>Novo evento</summary>
		<EventForm action="?/criar" users={data.users} contacts={data.contacts} isAdmin={data.isAdmin && !data.solo} submitLabel="Criar evento" />
	</details>
</main>

<style>
	.page { max-width: 1100px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	.views { display: flex; gap: 0.3rem; }
	.pill { padding: 0.35rem 0.9rem; border-radius: 999px; border: 1px solid var(--color-border); text-decoration: none; font-size: 0.85rem; font-weight: 600; }
	.pill.on { background: var(--color-forest); color: var(--color-bg); border-color: var(--color-forest); }
	.bar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
	.when { min-width: 10rem; text-align: center; }
	.when::first-letter { text-transform: uppercase; }
	.btn-icon { text-decoration: none; }
	.today { font-size: 0.85rem; color: var(--color-accent-text); font-weight: 700; text-decoration: none; }
	.filters { margin-left: auto; display: flex; gap: 0.5rem; }
	.filters select { background: var(--color-bg-alt); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.4rem 0.6rem; color: var(--color-text); }
	.cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px; background: var(--color-border); border: 1px solid var(--color-border); border-radius: var(--radius-card); overflow: hidden; }
	.wd { background: var(--color-bg-elevated); padding: 0.4rem; text-align: center; font-size: 0.72rem; font-weight: 700; color: var(--color-text-dim); text-transform: uppercase; }
	.cell { background: var(--color-bg-alt); min-height: 7rem; padding: 0.3rem; display: flex; flex-direction: column; gap: 0.2rem; }
	.cal.month .cell { min-height: 6rem; }
	.cell.other { background: var(--color-bg); opacity: 0.65; }
	.cell.now .num { background: var(--color-accent); color: var(--color-on-accent); }
	.num { align-self: flex-start; width: 1.5rem; height: 1.5rem; display: grid; place-items: center; border-radius: 50%; font-size: 0.78rem; font-weight: 700; text-decoration: none; }
	.stack, .daylist { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
	.chip { display: block; font-size: 0.72rem; padding: 0.12rem 0.35rem; border-radius: 5px; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--color-bg-elevated); border-left: 3px solid var(--color-text-dim); }
	.chip b { font-weight: 800; margin-right: 0.2rem; }
	.chip.type-REUNIAO { border-left-color: #3d6fb6; }
	.chip.type-ENTREGA { border-left-color: var(--color-accent); }
	.chip.type-VIAGEM { border-left-color: #8a5aa8; }
	.chip.type-VISITA { border-left-color: var(--color-success); }
	.chip.type-WORKSHOP, .chip.type-EVENTO { border-left-color: #c2762b; }
	.chip.task { background: transparent; border: 1px dashed var(--color-border); color: var(--color-text-dim); }
	.chip.task.done { text-decoration: line-through; opacity: 0.6; }
	.dayview { padding: 1rem; }
	.dayview .chip { font-size: 0.9rem; padding: 0.5rem 0.7rem; white-space: normal; }
	.empty { margin: 0; color: var(--color-text-dim); }
	.box { padding: 1rem; }
	.box summary { cursor: pointer; font-weight: 700; margin-bottom: 0.8rem; }
	@media (max-width: 700px) { .cell { min-height: 4.5rem; } .chip { font-size: 0.65rem; } }
</style>
