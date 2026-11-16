<script>
	import { enhance } from '$app/forms';
	import { toSaoPauloInputValue } from '$lib/timezone.js';

	// Formulário único para criar e editar evento. `event` vazio = novo.
	let { event = null, action, users, contacts, isAdmin, submitLabel = 'Salvar evento' } = $props();

	const TYPES = [
		['ENTREGA', 'Entrega'],
		['REUNIAO', 'Reunião'],
		['EVENTO', 'Evento'],
		['VIAGEM', 'Viagem'],
		['VISITA', 'Visita'],
		['WORKSHOP', 'Workshop'],
		['OUTRO', 'Outro']
	];
	const chosen = $derived(new Set((event?.participants ?? []).map((p) => p.id)));
</script>

<form method="POST" {action} use:enhance class="grid">
	<label class="field wide"><span>Título</span><input name="title" required maxlength="140" value={event?.title ?? ''} /></label>
	<label class="field">
		<span>Tipo</span>
		<select name="type" value={event?.type ?? 'REUNIAO'}>
			{#each TYPES as [value, label] (value)}<option {value}>{label}</option>{/each}
		</select>
	</label>
	{#if isAdmin}
		<label class="field">
			<span>Área</span>
			<select name="area" value={event?.area ?? 'LOJA'}><option value="LOJA">Loja</option><option value="JARDIM">Jardim</option></select>
		</label>
	{/if}
	<label class="field"><span>Início</span><input type="datetime-local" name="startsAt" required value={event ? toSaoPauloInputValue(event.startsAt) : ''} /></label>
	<label class="field"><span>Fim (opcional)</span><input type="datetime-local" name="endsAt" value={event?.endsAt ? toSaoPauloInputValue(event.endsAt) : ''} /></label>
	<label class="check"><input type="checkbox" name="allDay" checked={event?.allDay ?? false} /> Dia inteiro (viagens, feiras)</label>
	<label class="field"><span>Local</span><input name="location" maxlength="140" value={event?.location ?? ''} /></label>
	<label class="field">
		<span>Repetição</span>
		<select name="recurrence" value={event?.recurrence ?? 'NENHUMA'}>
			<option value="NENHUMA">Não repete</option>
			<option value="DIARIA">Diária</option>
			<option value="SEMANAL">Semanal</option>
			<option value="MENSAL">Mensal</option>
		</select>
	</label>
	<label class="field">
		<span>Contato</span>
		<select name="contactId" value={event?.contactId ?? ''}>
			<option value="">Nenhum</option>
			{#each contacts as contact (contact.id)}<option value={contact.id}>{contact.name}</option>{/each}
		</select>
	</label>
	<fieldset class="field wide people">
		<legend>Participantes</legend>
		{#each users as u (u.id)}
			<label class="check"><input type="checkbox" name="participantIds" value={u.id} checked={chosen.has(u.id)} /> {u.name}</label>
		{/each}
	</fieldset>
	<label class="field wide"><span>Descrição</span><textarea name="description" rows="2">{event?.description ?? ''}</textarea></label>
	<button class="btn" type="submit">{submitLabel}</button>
</form>

<style>
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; align-items: end; }
	.wide { grid-column: 1 / -1; }
	.check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
	.people { border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.6rem 0.8rem; flex-direction: row; flex-wrap: wrap; gap: 0.4rem 1.2rem; }
	.people legend { font-size: 0.85rem; color: var(--color-text-dim); padding: 0 0.3rem; }
</style>
