<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { formatBRL } from '$lib/money.js';
	import { clock } from '$lib/chatFormat.js';

	// Tela inicial: o que precisa do João agora, compromissos, tarefas, metas e funil.
	let { data, form } = $props();

	const TZ = 'America/Sao_Paulo';
	const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()));
	const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
	const dateText = new Date().toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });

	// "há 3 h", "há 2 dias"
	function ago(d) {
		const min = Math.max(0, Math.round((Date.now() - new Date(d)) / 60000));
		if (min < 60) return `há ${min} min`;
		if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
		const days = Math.round(min / 1440);
		return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
	}

	const attention = $derived(data.attention);
	const tasksOpen = $derived(data.overdue.length + data.today.length);
	const todayEvents = $derived(data.agenda.filter((e) => e.day === data.todayKey));
	// Agenda agrupada por dia, na ordem.
	const agendaDays = $derived.by(() => {
		const groups = [];
		for (const e of data.agenda) {
			const last = groups.at(-1);
			if (last?.day === e.day) last.items.push(e);
			else groups.push({ day: e.day, items: [e] });
		}
		return groups;
	});
	// "Hoje", "Amanhã" ou "quinta, 19/11"
	function dayText(key) {
		const diff = Math.round((new Date(`${key}T12:00:00Z`) - new Date(`${data.todayKey}T12:00:00Z`)) / 86_400_000);
		if (diff === 0) return 'Hoje';
		if (diff === 1) return 'Amanhã';
		const d = new Date(`${key}T12:00:00Z`);
		return `${d.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long' })}, ${d.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })}`;
	}

	const STATUS = {
		ok: { label: 'No ritmo', cls: 'ok' },
		atras: { label: 'Atrás do ritmo', cls: 'late' },
		muito_atras: { label: 'Bem atrás', cls: 'bad' },
		sem_dado: { label: 'Sem dado', cls: '' },
		sem_meta: { label: '', cls: '' }
	};
	function show(card, v) {
		if (v == null) return 'sem dado';
		if (card.kind === 'money') return formatBRL(v);
		if (card.kind === 'hours') return v < 1 ? `${Math.round(v * 60)} min` : `${v.toFixed(1).replace('.', ',')} h`;
		return String(v);
	}
	const pct = (c) => (c.target && c.value != null && c.better === 'up' ? Math.min(100, (c.value / c.target) * 100) : 0);
	const maxCount = $derived(Math.max(1, ...(data.pipeline?.stages.map((s) => s.count) ?? [1])));
</script>

<svelte:head>
	<title>Hoje · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<header class="top">
		<div>
			<h1>{greeting}, {data.user.name.split(' ')[0]}.</h1>
			<p class="date">{dateText}</p>
		</div>
		{#if data.isAdmin}
			<div class="actions">
				<a class="btn btn-sm" href={resolve('/funil')}>Novo lead</a>
				<a class="btn btn-secondary btn-sm" href={resolve('/conversas')}>Abrir WhatsApp</a>
				<a class="btn btn-secondary btn-sm" href={resolve('/agenda')}>Agenda</a>
			</div>
		{/if}
	</header>

	<div class="kpis">
		{#if data.isAdmin}
			<a class="kpi card" class:alert={attention.waitingTotal > 0} href={resolve('/conversas')}>
				<span class="k-label">Esperando resposta</span>
				<strong>{attention.waitingTotal}</strong>
				<span class="k-sub">{attention.waitingTotal ? 'clientes aguardando você' : 'tudo respondido'}</span>
			</a>
			<a class="kpi card" href={resolve('/funil')}>
				<span class="k-label">Leads abertos</span>
				<strong>{data.pipeline.total}</strong>
				<span class="k-sub">{formatBRL(data.pipeline.valueCents)} em jogo</span>
			</a>
		{/if}
		<a class="kpi card" class:alert={data.overdue.length > 0} href={resolve('/tarefas')}>
			<span class="k-label">Tarefas</span>
			<strong>{tasksOpen}</strong>
			<span class="k-sub">{data.overdue.length ? `${data.overdue.length} atrasada${data.overdue.length > 1 ? 's' : ''}` : 'nenhuma atrasada'}</span>
		</a>
		<a class="kpi card" href={resolve('/agenda')}>
			<span class="k-label">Compromissos hoje</span>
			<strong>{todayEvents.length}</strong>
			<span class="k-sub">{todayEvents[0] ? `próximo: ${todayEvents[0].allDay ? 'dia todo' : clock(todayEvents[0].start)} ${todayEvents[0].title}` : 'agenda livre'}</span>
		</a>
	</div>

	<div class="cols">
		<div class="col">
			{#if data.isAdmin}
				<section class="card box">
					<div class="head"><h2>Precisa de você agora</h2></div>
					{#if attention.waiting.length === 0 && attention.stale.length === 0}
						<p class="empty">Nenhuma conversa esperando e nenhum lead parado. Bom trabalho.</p>
					{/if}
					{#if attention.waiting.length}
						<h3>Conversas esperando resposta</h3>
						<ul class="rows">
							{#each attention.waiting as c (c.id)}
								<li>
									<a class="row" href={resolve(`/conversas?c=${c.id}`)}>
										<span class="avatar">{c.name.trim().charAt(0).toUpperCase()}</span>
										<span class="mid"><strong>{c.name}</strong><span class="dim clip">{c.preview}</span></span>
										<span class="end"><span class="dim">{ago(c.since)}</span>{#if c.unread}<span class="dot">{c.unread}</span>{/if}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
					{#if attention.stale.length}
						<h3>Leads parados há 2 dias ou mais</h3>
						<ul class="rows">
							{#each attention.stale as d (d.id)}
								<li>
									<a class="row" href={resolve(`/funil?abrir=${d.id}`)}>
										<span class="avatar warn">{d.name.trim().charAt(0).toUpperCase()}</span>
										<span class="mid"><strong>{d.name}</strong><span class="dim clip">{d.stage}{d.valueCents ? ` · ${formatBRL(d.valueCents)}` : ''}</span></span>
										<span class="end"><span class="dim">{ago(d.since)}</span></span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}

			<section class="card box">
				<div class="head"><h2>Tarefas</h2><a class="see" href={resolve('/tarefas')}>Ver todas</a></div>
				<form method="POST" action="?/criarTarefaRapida" use:enhance class="quick">
					<input type="text" name="title" placeholder="Anotar tarefa rápida..." required />
					<button class="btn btn-secondary btn-sm" type="submit">Adicionar</button>
				</form>
				{#if form?.error}<p class="error-text">{form.error}</p>{/if}
				{#if tasksOpen === 0}
					<p class="empty">Nada atrasado nem para hoje.</p>
				{/if}
				{#each [['Atrasadas', data.overdue, true], ['Hoje', data.today, false]] as [label, list, late] (label)}
					{#if list.length}
						<h3>{label}</h3>
						<ul class="tasks">
							{#each list as task (task.id)}
								<li>
									<form method="POST" action="?/concluir" use:enhance>
										<input type="hidden" name="id" value={task.id} />
										<button class="check" type="submit" aria-label="Concluir {task.title}"></button>
									</form>
									{#if late}<span class="late-dot"></span>{/if}
									<span class="t-title">{task.title}</span>
									{#if task.contact}<span class="tag">{task.contact.name}</span>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				{/each}
			</section>
			{#if data.pipeline}
				<section class="card box">
					<div class="head"><h2>Funil por etapa</h2><a class="see" href={resolve('/funil')}>Abrir funil</a></div>
					<ul class="stages">
						{#each data.pipeline.stages as s (s.id)}
							<li>
								<span class="s-name">{s.name}</span>
								<span class="s-bar"><span style="width: {(s.count / maxCount) * 100}%; background: {s.color ?? 'var(--color-accent)'}"></span></span>
								<span class="s-count">{s.count}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>

		<div class="col">
			<section class="card box">
				<div class="head"><h2>Agenda</h2><a class="see" href={resolve('/agenda')}>Abrir agenda</a></div>
				{#if agendaDays.length === 0}
					<p class="empty">Nenhum compromisso nos próximos 7 dias.</p>
				{/if}
				{#each agendaDays as g (g.day)}
					<h3>{dayText(g.day)}</h3>
					<ul class="agenda">
						{#each g.items as e (e.id + e.start)}
							<li>
								<a class="ev" href={resolve(`/agenda/${e.id}`)}>
									<span class="time">{e.allDay ? 'Dia todo' : clock(e.start)}</span>
									<span class="mid"><strong>{e.title}</strong><span class="dim clip">{[e.type, e.contact?.name, e.location].filter(Boolean).join(' · ')}</span></span>
								</a>
							</li>
						{/each}
					</ul>
				{/each}
			</section>

			{#if data.goals}
				<section class="card box">
					<div class="head"><h2>Metas do mês</h2><a class="see" href={resolve('/metas')}>Ver metas</a></div>
					{#if data.goals.cards.length === 0}
						<p class="empty">Nenhuma meta definida neste mês. <a class="see" href={resolve('/metas')}>Definir metas</a></p>
					{:else}
						<ul class="goals">
							{#each data.goals.cards as card (card.metric)}
								{@const st = STATUS[card.status] ?? STATUS.sem_meta}
								<li>
									<div class="g-top">
										<span>{card.label}</span>
										{#if st.label}<span class="pill {st.cls}">{st.label}</span>{/if}
									</div>
									<div class="g-val"><strong>{show(card, card.value)}</strong> <span class="dim">de {show(card, card.target)}</span></div>
									{#if card.better === 'up'}
										<div class="bar"><span class="fill {st.cls}" style="width: {pct(card)}%"></span><span class="mark" style="left: {Math.min(100, data.goals.fraction * 100)}%"></span></div>
									{/if}
								</li>
							{/each}
						</ul>
						<p class="foot">A marca na barra mostra onde você deveria estar hoje.</p>
					{/if}
				</section>
			{/if}

		</div>
	</div>
</main>

<style>
	.page { max-width: 1180px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.1rem; }
	.top { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
	h1 { margin: 0; font-size: 1.6rem; }
	.date { margin: 0.2rem 0 0; color: var(--color-text-dim); }
	.date::first-letter { text-transform: uppercase; }
	h3::first-letter { text-transform: uppercase; }
	.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.8rem; }
	.kpi { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.9rem 1rem; text-decoration: none; color: inherit; border-left: 4px solid var(--color-border); }
	.kpi:hover { border-left-color: var(--color-accent); }
	.kpi.alert { border-left-color: var(--color-danger); }
	.k-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-dim); font-weight: 700; }
	.kpi strong { font-size: 1.9rem; line-height: 1.1; }
	.kpi.alert strong { color: var(--color-danger); }
	.k-sub { font-size: 0.8rem; color: var(--color-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cols { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 1.1rem; align-items: start; }
	.col { display: flex; flex-direction: column; gap: 1.1rem; min-width: 0; }
	.box { padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.7rem; }
	.head { display: flex; justify-content: space-between; align-items: baseline; }
	h2 { margin: 0; font-size: 1.05rem; }
	h3 { margin: 0.3rem 0 0; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-dim); }
	.see { font-size: 0.8rem; font-weight: 700; color: var(--color-accent-text); text-decoration: none; }
	.empty { margin: 0; color: var(--color-text-dim); font-size: 0.88rem; }
	.dim { color: var(--color-text-dim); font-size: 0.8rem; }
	.clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
	.rows, .agenda, .tasks, .goals, .stages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
	.row, .ev { display: flex; align-items: center; gap: 0.7rem; padding: 0.5rem 0.3rem; border-radius: var(--radius-button); text-decoration: none; color: inherit; }
	.row:hover, .ev:hover { background: var(--color-bg-elevated); }
	.mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.mid strong { font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.end { display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem; flex: none; }
	.avatar { width: 2.1rem; height: 2.1rem; border-radius: 50%; background: var(--color-accent-dim); color: var(--color-accent-text); display: grid; place-items: center; font-weight: 800; flex: none; }
	.avatar.warn { background: rgba(194, 54, 43, 0.12); color: var(--color-danger); }
	.dot { background: var(--color-success); color: #fff; font-size: 0.68rem; font-weight: 800; border-radius: 999px; padding: 0 0.4rem; min-width: 1.1rem; text-align: center; line-height: 1.1rem; }
	.time { flex: none; width: 4.3rem; font-weight: 800; font-size: 0.82rem; color: var(--color-accent-text); }
	.quick { display: flex; gap: 0.5rem; }
	.quick input { flex: 1; min-height: var(--control-h-sm); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0 0.8rem; color: var(--color-text); }
	.tasks { gap: 0.35rem; }
	.tasks li { display: flex; align-items: center; gap: 0.6rem; font-size: 0.9rem; padding: 0.15rem 0; }
	.t-title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
	.tag { font-size: 0.72rem; color: var(--color-text-dim); background: var(--color-bg-elevated); border-radius: 999px; padding: 0.1rem 0.55rem; flex: none; }
	.check { width: 1.15rem; height: 1.15rem; border-radius: 50%; border: 2px solid var(--color-border); background: transparent; cursor: pointer; padding: 0; transition: border-color var(--transition-fast), background-color var(--transition-fast); }
	.check:hover { border-color: var(--color-success); background: var(--color-accent-dim); }
	.late-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-danger); flex: none; }
	.goals { gap: 0.8rem; }
	.g-top { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; font-weight: 700; }
	.g-val { font-size: 0.85rem; margin: 0.1rem 0 0.3rem; }
	.g-val strong { font-size: 1.15rem; }
	.pill { font-size: 0.66rem; font-weight: 800; border-radius: 999px; padding: 0.1rem 0.5rem; background: var(--color-bg-elevated); color: var(--color-text-dim); }
	.pill.ok { background: rgba(47, 125, 79, 0.14); color: var(--color-success); }
	.pill.late { background: var(--color-accent-dim); color: var(--color-accent-text); }
	.pill.bad { background: rgba(194, 54, 43, 0.12); color: var(--color-danger); }
	.bar { position: relative; height: 0.5rem; border-radius: 999px; background: var(--color-bg-elevated); }
	.fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: var(--color-accent); }
	.fill.ok { background: var(--color-success); }
	.fill.bad { background: var(--color-danger); }
	.mark { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--color-text); opacity: 0.55; }
	.foot { margin: 0; font-size: 0.72rem; color: var(--color-text-dim); }
	.stages { gap: 0.45rem; }
	.stages li { display: grid; grid-template-columns: 8.5rem 1fr 1.8rem; align-items: center; gap: 0.6rem; font-size: 0.82rem; }
	.s-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.s-bar { height: 0.6rem; border-radius: 999px; background: var(--color-bg-elevated); overflow: hidden; }
	.s-bar span { display: block; height: 100%; border-radius: 999px; min-width: 4px; }
	.s-count { text-align: right; font-weight: 800; }
	@media (max-width: 900px) {
		.cols { grid-template-columns: minmax(0, 1fr); }
		.page { padding: 1rem; }
	}
</style>
