<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const RECURRENCE_LABEL = {
		NENHUMA: null,
		DIARIA: 'Diário',
		SEMANAL: 'Semanal',
		MENSAL: 'Mensal'
	};

	function formatWhen(remindAt) {
		return new Date(remindAt).toLocaleString('pt-BR', {
			timeZone: 'America/Sao_Paulo',
			day: '2-digit',
			month: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Lembretes · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<h1>Lembretes</h1>

	{#if form?.error}
		<p class="error-text">{form.error}</p>
	{/if}

	<form method="POST" action="?/criar" use:enhance class="card new-reminder">
		<input type="text" name="title" placeholder="Novo lembrete..." required />
		<details>
			<summary>Mais detalhes</summary>
			<div class="new-reminder-details">
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
				{#if data.isAdmin}
					<label class="field">
						<span>Pra quem</span>
						<select name="userId">
							<option value="">Toda a equipe</option>
							{#each data.users as user (user.id)}
								<option value={user.id}>{user.name}</option>
							{/each}
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
			</div>
		</details>
		<label class="field">
			<span>Quando</span>
			<input type="datetime-local" name="remindAt" required />
		</label>
		<button class="btn" type="submit">Adicionar</button>
	</form>

	{#if data.overdue.length > 0}
		<section class="list-section">
			<h2 class="section-head overdue-head">Atrasados</h2>
			<div class="list">
				{#each data.overdue as reminder (reminder.id)}
					<article class="card reminder-card overdue">
						<div class="reminder-top">
							<strong>{reminder.title}</strong>
							<span class="when overdue-text">{formatWhen(reminder.remindAt)}</span>
						</div>
						{#if reminder.description}
							<p class="description">{reminder.description}</p>
						{/if}
						<div class="meta">
							{#if reminder.user}<span>{reminder.user.name}</span>{/if}
							{#if reminder.contact}<span>{reminder.contact.name}</span>{/if}
							{#if RECURRENCE_LABEL[reminder.recurrence]}
								<span>{RECURRENCE_LABEL[reminder.recurrence]}</span>
							{/if}
						</div>
						<div class="reminder-actions">
							<form method="POST" action="?/dispensar" use:enhance>
								<input type="hidden" name="id" value={reminder.id} />
								<button class="btn btn-secondary btn-sm" type="submit">Dispensar</button>
							</form>
							<form method="POST" action="?/excluir" use:enhance>
								<input type="hidden" name="id" value={reminder.id} />
								<button class="btn-icon" type="submit" title="Excluir" aria-label="Excluir"
									>×</button
								>
							</form>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	<section class="list-section">
		<h2 class="section-head">Próximos</h2>
		{#if data.upcoming.length === 0}
			<p class="hint">Nenhum lembrete agendado.</p>
		{:else}
			<div class="list">
				{#each data.upcoming as reminder (reminder.id)}
					<article class="card reminder-card">
						<div class="reminder-top">
							<strong>{reminder.title}</strong>
							<span class="when">{formatWhen(reminder.remindAt)}</span>
						</div>
						{#if reminder.description}
							<p class="description">{reminder.description}</p>
						{/if}
						<div class="meta">
							{#if reminder.user}<span>{reminder.user.name}</span>{/if}
							{#if reminder.contact}<span>{reminder.contact.name}</span>{/if}
							{#if RECURRENCE_LABEL[reminder.recurrence]}
								<span>{RECURRENCE_LABEL[reminder.recurrence]}</span>
							{/if}
						</div>
						<div class="reminder-actions">
							<form method="POST" action="?/dispensar" use:enhance>
								<input type="hidden" name="id" value={reminder.id} />
								<button class="btn btn-secondary btn-sm" type="submit">Dispensar</button>
							</form>
							<form method="POST" action="?/excluir" use:enhance>
								<input type="hidden" name="id" value={reminder.id} />
								<button class="btn-icon" type="submit" title="Excluir" aria-label="Excluir"
									>×</button
								>
							</form>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	h1 {
		margin: 0;
		font-size: 1.3rem;
	}

	.new-reminder {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.new-reminder > input {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-button);
		padding: 0.65rem 0.8rem;
		color: var(--color-text);
	}

	.new-reminder > button {
		align-self: flex-start;
	}

	.new-reminder summary {
		font-size: 0.8rem;
		color: var(--color-text-dim);
		cursor: pointer;
	}

	.new-reminder-details {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--color-text-dim);
	}

	.field select,
	.field textarea,
	.field input {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-button);
		padding: 0.55rem 0.7rem;
		color: var(--color-text);
		font-size: 0.85rem;
	}

	.list-section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.section-head {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-dim);
	}

	.overdue-head {
		color: var(--color-danger);
	}

	.hint {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-text-dim);
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.reminder-card {
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border-left: 3px solid var(--color-border);
		transition:
			transform var(--transition-base),
			box-shadow var(--transition-base);
	}

	.reminder-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.reminder-card.overdue {
		border-left-color: var(--color-danger);
	}

	.reminder-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.when {
		font-size: 0.75rem;
		color: var(--color-text-dim);
		white-space: nowrap;
	}

	.overdue-text {
		color: var(--color-danger);
		font-weight: 700;
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

	.reminder-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.2rem;
	}

</style>
