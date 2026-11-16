<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { formatPhone, waLink } from '$lib/phone.js';
	import { formatBRL } from '$lib/money.js';

	// Ficha do negócio, usada por /funil/[id] (completa) e /pedidos/[id] (enxuta).
	let { data, form, basePath, backLabel } = $props();
	const d = $derived(data.deal);
	const jardim = $derived(data.area === 'JARDIM');
	const closed = $derived(d.stage.kind !== 'ABERTA');

	const fmt = (x) => new Date(x).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
	const KIND_LABEL = { NOTA: 'Nota', LIGACAO: 'Ligação', VISITA: 'Visita', WHATSAPP: 'WhatsApp', SISTEMA: 'Sistema' };
</script>

<main class="page">
	<a class="back" href={resolve(basePath)}>← {backLabel}</a>
	<header class="head">
		<div>
			<h1>{d.contact.name}</h1>
			<p class="dim">
				{d.stage.name}{d.title ? ` · ${d.title}` : ''}
				{#if d.valueCents}· {formatBRL(d.valueCents)}{/if}
			</p>
		</div>
		<div class="actions">
			{#if d.contact.phone}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="btn btn-sm" href={waLink(d.contact.phone)} target="_blank" rel="noopener noreferrer">WhatsApp {formatPhone(d.contact.phone)}</a>
			{/if}
			{#if !d.assigneeId}
				<form method="POST" action="?/assumir" use:enhance><button class="btn btn-secondary btn-sm" type="submit">Assumir</button></form>
			{/if}
		</div>
	</header>

	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.saved}<p class="success-text">Salvo.</p>{/if}
	{#if form?.visited}<p class="success-text">Visita agendada e etapa atualizada.</p>{/if}

	{#if jardim && data.quality}
		<section class="card box quality">
			<strong>{data.quality.level === 'QUENTE' ? 'Quente' : data.quality.level === 'MORNO' ? 'Morno' : 'Frio'} · {data.quality.score} pontos</strong>
			<span class="dim">{data.quality.signals.length ? data.quality.signals.join(' · ') : 'Nenhum sinal registrado ainda.'}</span>
			{#if data.inRoute === false}<span class="warn">Bairro fora das rotas de atendimento.</span>{/if}
		</section>
	{/if}

	<section class="card box">
		<form method="POST" action="?/mover" use:enhance class="row">
			<label class="field">
				<span>Etapa</span>
				<select name="stageId" value={d.stageId} onchange={(e) => e.target.form.requestSubmit()}>
					{#each data.stages.filter((s) => s.kind !== 'PERDIDO' || s.id === d.stageId) as s (s.id)}
						<option value={s.id} disabled={s.kind === 'PERDIDO'}>{s.name}</option>
					{/each}
				</select>
			</label>
		</form>
		{#if d.stage.kind === 'PERDIDO'}
			<p class="dim">Motivo da perda: {data.lists.lostLabels[d.lostReason] ?? d.lostReason ?? '—'}{d.lostNote ? ` (${d.lostNote})` : ''}</p>
		{:else}
			<form method="POST" action="?/perder" use:enhance class="row lose">
				<label class="field">
					<span>Marcar como perdido, motivo</span>
					<select name="reason" required>
						<option value="">Escolha...</option>
						{#each data.lists.lostReasons as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
					</select>
				</label>
				<label class="field"><span>Observação</span><input name="note" maxlength="500" /></label>
				<button class="btn-danger" type="submit">Perdido</button>
			</form>
		{/if}
	</section>

	{#if jardim && !closed}
		<section class="card box">
			<h2>Agendar visita ou orçamento</h2>
			<form method="POST" action="?/visita" use:enhance class="grid">
				<label class="field"><span>Data e hora</span><input type="datetime-local" name="startsAt" required /></label>
				<label class="field"><span>Local</span><input name="location" value={d.address ?? d.neighborhood ?? ''} /></label>
				<button class="btn" type="submit">Agendar</button>
			</form>
		</section>
	{/if}

	<section class="card box">
		<h2>Dados</h2>
		<form method="POST" action="?/salvar" use:enhance class="grid">
			<label class="field wide"><span>{jardim ? 'Resumo' : 'Pedido'}</span><input name="title" value={d.title ?? ''} maxlength="120" /></label>
			{#if jardim}
				<label class="field">
					<span>Serviço</span>
					<select name="serviceType" value={d.serviceType}>
						{#each data.lists.services as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
						{#if !data.lists.services.some((s) => s.key === d.serviceType)}<option value={d.serviceType}>{d.serviceType}</option>{/if}
					</select>
				</label>
				<label class="field"><span>Tipo de espaço</span><input name="spaceType" value={d.spaceType ?? ''} /></label>
				<label class="field"><span>Metragem (m²)</span><input name="squareMeters" type="number" min="1" value={d.squareMeters ?? ''} /></label>
				<label class="field"><span>Endereço</span><input name="address" value={d.address ?? ''} /></label>
			{/if}
			<label class="field"><span>Bairro</span><input name="neighborhood" value={d.neighborhood ?? ''} /></label>
			<label class="field"><span>Valor (R$)</span><input name="value" inputmode="decimal" value={d.valueCents ? (d.valueCents / 100).toFixed(2).replace('.', ',') : ''} /></label>
			<label class="field"><span>Origem</span><input name="source" value={d.source ?? ''} list="origens" />
			<datalist id="origens">{#each data.lists.sources as o (o.key)}<option value={o.label}></option>{/each}</datalist></label>
			<label class="field">
				<span>Responsável</span>
				<select name="assigneeId" value={d.assigneeId ?? ''}>
					<option value="">Sem responsável</option>
					{#each data.users as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
				</select>
			</label>
			<label class="field"><span>Próxima ação</span><input name="nextAction" value={d.nextAction ?? ''} maxlength="160" /></label>
			<label class="field"><span>Para quando</span><input name="nextActionAt" type="date" value={d.nextActionAt ? new Date(d.nextActionAt).toISOString().slice(0, 10) : ''} /></label>
			{#if jardim}
				<label class="check"><input type="checkbox" name="hasPhotos" checked={d.hasPhotos} /> Enviou fotos do espaço</label>
				<label class="check"><input type="checkbox" name="askedQuote" checked={d.askedQuote} /> Pediu orçamento específico</label>
			{/if}
			<label class="field wide"><span>Observações</span><textarea name="notes" rows="2">{d.notes ?? ''}</textarea></label>
			<button class="btn" type="submit">Salvar</button>
		</form>
	</section>

	<section class="card box">
		<h2>Histórico</h2>
		<form method="POST" action="?/nota" use:enhance class="row">
			<label class="field">
				<span>Tipo</span>
				<select name="kind"><option value="NOTA">Nota</option><option value="LIGACAO">Ligação</option><option value="WHATSAPP">WhatsApp</option><option value="VISITA">Visita</option></select>
			</label>
			<label class="field grow"><span>O que aconteceu</span><input name="body" required maxlength="2000" /></label>
			<button class="btn btn-secondary" type="submit">Registrar</button>
		</form>
		<ul class="timeline">
			{#each d.interactions as i (i.id)}
				<li>
					<span class="badge">{KIND_LABEL[i.kind]}</span>
					<span class="body">{i.body}</span>
					<span class="dim">{i.author?.name ?? 'Sistema'} · {fmt(i.createdAt)}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="card box">
		<h2>Excluir lead</h2>
		<details>
			<summary class="dim">Apagar este lead do CRM</summary>
			<form method="POST" action="?/excluir" use:enhance class="row lose">
				<p class="dim grow">O lead e o histórico dele no funil são apagados e não voltam. O contato e as conversas de WhatsApp continuam.</p>
				<button class="btn-danger" type="submit">Excluir definitivamente</button>
			</form>
		</details>
	</section>

	{#if d.tasks.length}
		<section class="card box">
			<h2>Tarefas</h2>
			<ul class="plain">
				{#each d.tasks as t (t.id)}<li>{t.title} {#if t.dueDate}<span class="dim">{fmt(t.dueDate)}</span>{/if} <span class="badge">{t.status.replace('_', ' ')}</span></li>{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	.page { max-width: 880px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.back { font-size: 0.85rem; color: var(--color-text-dim); text-decoration: none; }
	.head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
	.actions { display: flex; gap: 0.5rem; }
	h1 { margin: 0; font-size: 1.4rem; }
	h2 { margin: 0 0 0.7rem; font-size: 1.05rem; }
	.dim { color: var(--color-text-dim); font-size: 0.85rem; }
	.box { padding: 1rem; }
	.quality { display: flex; flex-direction: column; gap: 0.25rem; }
	.warn { color: var(--color-danger); font-size: 0.85rem; font-weight: 600; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; align-items: end; }
	.row { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: end; }
	.row .grow { flex: 1; min-width: 200px; }
	.lose { margin-top: 0.8rem; }
	.wide { grid-column: 1 / -1; }
	.check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
	.timeline, .plain { list-style: none; margin: 0.8rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.timeline li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.6rem; font-size: 0.9rem; }
	.timeline .body { flex: 1; min-width: 200px; }
</style>
