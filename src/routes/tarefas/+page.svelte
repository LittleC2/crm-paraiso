<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import { createBoardSync } from '$lib/boardSync.js';
	import { dndzone, TRIGGERS } from 'svelte-dnd-action';
	import { callAction } from '$lib/formAction.js';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';

	let { data, form } = $props();

	const COLUMNS = [
		{ status: 'A_FAZER', label: 'A fazer' },
		{ status: 'FAZENDO', label: 'Fazendo' },
		{ status: 'BLOQUEADO', label: 'Bloqueado' },
		{ status: 'FEITO', label: 'Feito' }
	];

	const PRIORITY_LABEL = { BAIXA: 'Baixa', NORMAL: 'Normal', ALTA: 'Alta' };
	const FLIP_MS = 150;

	function groupByColumn(tasks) {
		const grouped = {};
		for (const column of COLUMNS) grouped[column.status] = [];
		for (const task of tasks) grouped[task.status]?.push(task);
		return grouped;
	}

	// Estado local espelhando data.tasks, separado por coluna — o dndzone
	// precisa de um array próprio por zona pra poder mexer durante o drag
	// sem esperar o servidor. $state comum de propósito aqui (não
	// $derived sobrescrevível): a lib muda esse objeto por fora do fluxo
	// normal de props, então quero o comportamento de proxy previsível do
	// $state, não a semântica de "override até a próxima recomputação" do
	// $derived. Resincroniza sozinho sempre que data.tasks mudar de
	// verdade (criar/excluir tarefa, trocar filtro) — arrastar não passa
	// por aqui, só por fetch direto em persistColumn.
	// svelte-ignore state_referenced_locally
	let columnTasks = $state(groupByColumn(data.tasks));

	function isOverdue(task) {
		return task.dueDate && task.status !== 'FEITO' && new Date(task.dueDate) < new Date();
	}

	// Mesmo tratamento do quadro de leads: o cartão inteiro arrasta no mouse (no
	// celular, só pela alça), a gravação acontece em segundo plano e a tela não
	// é refeita enquanto há arrasto ou gravação pendente.
	let notice = $state('');
	const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
	let dragDisabled = $state(coarse);
	// Só aceita dados do servidor sem arrasto nem gravação em andamento (ver boardSync.js).
	const sync = createBoardSync((next) => (columnTasks = next));
	$effect(() => {
		const next = groupByColumn(data.tasks);
		untrack(() => sync.offer(next));
	});

	function startDrag() {
		dragDisabled = false;
	}

	function handleConsider(status, event) {
		sync.dragStart();
		columnTasks[status] = event.detail.items;
	}

	async function handleFinalize(status, event) {
		if (coarse) dragDisabled = true;
		const trigger = event.detail.info.trigger;
		// Corrige o status de quem acabou de entrar nessa coluna na hora.
		const items = event.detail.items.map((item) => ({ ...item, status }));
		columnTasks[status] = items;
		// Coluna de origem só atualiza os itens; a de destino encerra o arrasto.
		if (trigger === TRIGGERS.DROPPED_INTO_ANOTHER) return;
		if (trigger !== TRIGGERS.DROPPED_INTO_ZONE) {
			sync.dragEnd();
			if (trigger === TRIGGERS.DROPPED_OUTSIDE_OF_ANY) sync.force(groupByColumn(data.tasks));
			return;
		}
		sync.begin();
		sync.dragEnd();
		const result = await callAction('?/reordenar', { status, taskIds: items.map((i) => i.id) });
		if (!result.ok) notice = result.error ?? 'Não foi possível mover a tarefa. Tente de novo.';
		if (sync.lastPending) await invalidateAll();
		sync.end();
		if (!result.ok) sync.force(groupByColumn(data.tasks));
	}

	// Troca de coluna pelo seletor do cartão, com a mesma atualização imediata.
	async function changeStatus(task, status) {
		if (status === task.status) return;
		for (const col of COLUMNS) columnTasks[col.status] = columnTasks[col.status].filter((t) => t.id !== task.id);
		columnTasks[status] = [{ ...task, status }, ...columnTasks[status]];
		sync.begin();
		const result = await callAction('?/mudarStatus', { id: task.id, status });
		if (!result.ok) notice = result.error ?? 'Não foi possível mudar o status.';
		if (sync.lastPending) await invalidateAll();
		sync.end();
		if (!result.ok) sync.force(groupByColumn(data.tasks));
	}

	// Filtros sem recarregar a página inteira.
	function setFilter(key, value) {
		const params = [];
		const contato = key === 'contato' ? value : data.contactFilter;
		const responsavel = key === 'responsavel' ? value : data.assigneeFilter;
		if (contato) params.push(`contato=${encodeURIComponent(contato)}`);
		if (responsavel) params.push(`responsavel=${encodeURIComponent(responsavel)}`);
		goto(resolve(`/tarefas${params.length ? `?${params.join('&')}` : ''}`), { keepFocus: true });
	}
</script>

<svelte:head>
	<title>Tarefas · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<h1>Tarefas</h1>

	{#if form?.error}
		<p class="error-text">{form.error}</p>
	{/if}
	{#if notice}<p class="error-text" role="alert">{notice} <button class="clear" type="button" onclick={() => (notice = '')}>Fechar</button></p>{/if}

	<form method="POST" action="?/criar" use:enhance class="card new-task">
		<input type="text" name="title" placeholder="Nova tarefa..." required />
		<details>
			<summary>Mais detalhes</summary>
			<div class="new-task-details">
				<label class="field">
					<span>Descrição</span>
					<textarea name="description" rows="2"></textarea>
				</label>
				<label class="field">
					<span>Contato</span>
					<select name="contactId">
						<option value="">Nenhum</option>
						{#each data.contacts as contact (contact.id)}
							<option value={contact.id}>{contact.name}</option>
						{/each}
					</select>
				</label>
				{#if data.isAdmin && !data.solo}
					<label class="field">
						<span>Área</span>
						<select name="area">
							<option value="LOJA" selected>Loja</option>
							<option value="JARDIM">Jardim</option>
						</select>
					</label>
				{/if}
				<label class="field">
					<span>Repetição</span>
					<select name="recurrence">
						<option value="NENHUMA" selected>Não repete</option>
						<option value="DIARIA">Diária</option>
						<option value="SEMANAL">Semanal</option>
						<option value="MENSAL">Mensal</option>
					</select>
				</label>
				<label class="field">
					<span>Responsável</span>
					<select name="assigneeId">
						<option value="">Sem responsável</option>
						{#each data.users as user (user.id)}
							<option value={user.id}>{user.name}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Prioridade</span>
					<select name="priority">
						<option value="BAIXA">Baixa</option>
						<option value="NORMAL" selected>Normal</option>
						<option value="ALTA">Alta</option>
					</select>
				</label>
				<label class="field">
					<span>Prazo</span>
					<input type="datetime-local" name="dueDate" />
				</label>
			</div>
		</details>
		<button class="btn" type="submit">Adicionar</button>
	</form>

	<div class="filters">
		<select onchange={(e) => setFilter('contato', e.target.value)}>
			<option value="">Todos os contatos</option>
			{#each data.contacts as contact (contact.id)}
				<option value={contact.id} selected={data.contactFilter === contact.id}>{contact.name}</option>
			{/each}
		</select>
		<select onchange={(e) => setFilter('responsavel', e.target.value)}>
			<option value="">Todos os responsáveis</option>
			{#each data.users as user (user.id)}
				<option value={user.id} selected={data.assigneeFilter === user.id}>{user.name}</option>
			{/each}
		</select>
		{#if data.contactFilter || data.assigneeFilter}
			<a href={resolve('/tarefas')} class="clear">Limpar filtros</a>
		{/if}
	</div>

	<div class="board">
		{#each COLUMNS as column (column.status)}
			<section class="column">
				<h2 class="column-head column-head-{column.status}">
					{column.label}
					<span class="count">{columnTasks[column.status].length}</span>
				</h2>
				<div
					class="cards"
					use:dndzone={{ items: columnTasks[column.status], flipDurationMs: FLIP_MS, dragDisabled: dragDisabled || Boolean(data.contactFilter || data.assigneeFilter), dropTargetStyle: {}, dropTargetClasses: ['drop-over'], type: 'task' }}
					onconsider={(e) => handleConsider(column.status, e)}
					onfinalize={(e) => handleFinalize(column.status, e)}
				>
					{#each columnTasks[column.status] as task (task.id)}
						<article
							class="card task-card priority-border-{task.priority}"
							class:overdue={isOverdue(task)}
							>
							<div class="task-top">
								<span class="handle" onmousedown={startDrag} ontouchstart={startDrag} role="presentation" aria-label="Arrastar {task.title}">
									<GripVertical size={14} strokeWidth={2} />
								</span>
								<strong>{task.title}</strong>
								{#if task.assignee}
									<span class="avatar" title={task.assignee.name}
										>{task.assignee.name.charAt(0)}</span
									>
								{/if}
							</div>
							{#if task.description}
								<p class="description">{task.description}</p>
							{/if}
							<div class="meta">
								{#if task.priority !== 'NORMAL'}<span>{PRIORITY_LABEL[task.priority]}</span>{/if}
								{#if task.contact}<span>{task.contact.name}</span>{/if}
								{#if task.dueDate}
									<span class:overdue-text={isOverdue(task)}>
										{new Date(task.dueDate).toLocaleDateString('pt-BR')}
									</span>
								{/if}
							</div>
							<div class="task-actions">
								<select value={task.status} onchange={(e) => changeStatus(task, e.target.value)} aria-label="Mover {task.title} para">
										{#each COLUMNS as c (c.status)}
											<option value={c.status}>{c.label}</option>
										{/each}
									</select>
								<form method="POST" action="?/excluir" use:enhance>
									<input type="hidden" name="id" value={task.id} />
									<button class="btn-icon" type="submit" title="Excluir" aria-label="Excluir"
										>×</button
									>
								</form>
							</div>
						</article>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</main>

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	h1 {
		margin: 0;
		font-size: 1.3rem;
	}

	.new-task {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.new-task > input {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-button);
		padding: 0.65rem 0.8rem;
		color: var(--color-text);
	}

	.new-task > button {
		align-self: flex-start;
	}

	.new-task summary {
		font-size: 0.8rem;
		color: var(--color-text-dim);
		cursor: pointer;
	}

	.new-task-details {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.new-task-details select,
	.new-task-details textarea,
	.new-task-details input {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-button);
		padding: 0.55rem 0.7rem;
		color: var(--color-text);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.filters select {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-button);
		padding: 0.5rem 0.7rem;
		color: var(--color-text);
		font-size: 0.85rem;
	}

	.clear {
		font-size: 0.8rem;
		color: var(--color-text-dim);
		text-decoration: underline;
	}

	.board {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
	}

	@media (max-width: 860px) {
		.board {
			grid-template-columns: 1fr;
		}
	}

	.column-head {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-dim);
		margin: 0 0 0.75rem;
		padding-bottom: 0.6rem;
		border-bottom: 2px solid var(--color-border);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.column-head-FAZENDO {
		border-bottom-color: var(--color-accent);
		color: var(--color-accent-text);
	}

	.column-head-BLOQUEADO {
		border-bottom-color: var(--color-danger);
		color: var(--color-danger);
	}

	.column-head-FEITO {
		border-bottom-color: var(--color-success);
		color: var(--color-success);
	}

	.count {
		background: var(--color-bg-elevated);
		border-radius: 999px;
		padding: 0.05rem 0.55rem;
		font-size: 0.7rem;
		color: var(--color-text);
		font-weight: 700;
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-height: 40px;
	}

	.task-card {
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border-left: 3px solid var(--color-border);
		transition:
			transform var(--transition-base),
			box-shadow var(--transition-base);
	}

	.task-card:hover {
		box-shadow: var(--shadow-md);
	}

	.task-card.overdue {
		border-color: var(--color-danger);
	}

	.priority-border-ALTA {
		border-left-color: var(--color-danger);
	}

	.priority-border-BAIXA {
		border-left-color: var(--color-text-dim);
	}

	.task-top {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.task-top strong {
		flex: 1;
	}

	.handle {
		display: flex;
		align-items: center;
		color: var(--color-text-dim);
		cursor: grab;
		flex-shrink: 0;
		touch-action: none;
	}

	.handle:active {
		cursor: grabbing;
	}

	.avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--color-accent-dim);
		color: var(--color-accent-text);
		font-size: 0.7rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		text-transform: uppercase;
	}

	.description {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-text-dim);
	}

	.meta {
		display: flex;
		gap: 0.6rem;
		font-size: 0.75rem;
		color: var(--color-text-dim);
		flex-wrap: wrap;
	}

	.overdue-text {
		color: var(--color-danger);
		font-weight: 700;
	}

	.task-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.2rem;
	}

	.task-actions select {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-button);
		padding: 0.3rem 0.5rem;
		color: var(--color-text);
		font-size: 0.75rem;
	}

	/* Cartão inteiro arrasta no mouse; alça só no toque. A coluna toda é alvo de soltar. */
	.cards:global(.drop-over) { background: rgba(240, 180, 41, 0.1); }
	.cards { min-height: 8rem; border-radius: 10px; }
	.task-card { cursor: grab; touch-action: pan-y; }
	.task-card:active { cursor: grabbing; }
	/* A alça só aparece no toque. */
	@media (pointer: fine) { .handle { display: none; } }
	@media (pointer: coarse) { .task-card { cursor: default; } }
</style>
