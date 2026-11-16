<script>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { createBoardSync } from '$lib/boardSync.js';
	import { dndzone, SOURCES, TRIGGERS } from 'svelte-dnd-action';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import { formatBRL } from '$lib/money.js';
	import { waLink } from '$lib/phone.js';
	import { callAction } from '$lib/formAction.js';
	import { CARD_FIELDS } from '$lib/boardPrefs.js';
	import DealDrawer from './DealDrawer.svelte';

	// Quadro compartilhado: /funil (JARDIM) e /pedidos (LOJA).
	let { data, basePath, newLabel = 'Novo negócio', jardim = true } = $props();

	const FLIP_MS = 120;
	const LEVEL_LABEL = { QUENTE: 'Quente', MORNO: 'Morno', FRIO: 'Frio' };
	const DEFAULT_COLOR = { ABERTA: '#45524a', GANHO: '#2f8f4e', PERDIDO: '#c2362b' };
	const colorOf = (stage) => stage.color ?? DEFAULT_COLOR[stage.kind];

	// ---- filtros (ficam no link, para compartilhar) --------------------------
	const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
	let q = $state(params.get('q') ?? '');
	let only = $state(params.get('so') ?? ''); // '', meus, sem, espera
	let resp = $state(params.get('resp') ?? '');
	let level = $state(params.get('nivel') ?? '');

	$effect(() => {
		if (typeof window === 'undefined') return;
		const parts = [];
		const add = (key, value) => value && parts.push(`${key}=${encodeURIComponent(value)}`);
		add('q', q.trim());
		add('so', only);
		add('resp', resp);
		add('nivel', level);
		const qs = parts.join('&');
		window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname);
	});

	const filtered = $derived(Boolean(q.trim() || only || resp || level));

	function matches(d) {
		const needle = q.trim().toLowerCase();
		if (needle) {
			const hay = [d.contact.name, d.contact.phone, d.title, d.neighborhood, d.chat?.preview].filter(Boolean).join(' ').toLowerCase();
			if (!hay.includes(needle)) return false;
		}
		if (only === 'meus' && d.assignee?.id !== data.me.id) return false;
		if (only === 'sem' && d.assignee) return false;
		if (only === 'espera' && !d.chat?.waiting) return false;
		if (resp && d.assignee?.id !== resp) return false;
		if (level && d.level !== level) return false;
		return true;
	}

	// ---- colunas e arrasto ---------------------------------------------------
	function group(deals) {
		const out = {};
		for (const s of data.stages) out[s.id] = [];
		for (const d of deals) if (matches(d)) out[d.stageId]?.push(d);
		return out;
	}

	// Estado local por coluna: a biblioteca muda o array durante o gesto.
	// svelte-ignore state_referenced_locally
	let columns = $state(group(data.deals));
	let notice = $state('');
	// Só aceita dados do servidor sem arrasto nem gravação em andamento (ver boardSync.js).
	const sync = createBoardSync((next) => (columns = next));
	$effect(() => {
		const next = group(data.deals);
		untrack(() => sync.offer(next));
	});

	// Celular: arrastar o cartão inteiro brigaria com a rolagem, então só a alça arrasta.
	const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
	let dragDisabled = $state(coarse);

	// Alça (toque): libera o arrasto só enquanto o dedo está nela.
	function startDrag() {
		dragDisabled = false;
	}

	function onConsider(stageId, e) {
		sync.dragStart();
		columns[stageId] = e.detail.items;
		if (e.detail.info.source === SOURCES.KEYBOARD) dragDisabled = false;
	}

	// Depois de arrastar, o navegador pode soltar um "clique" no cartão: ignora por um instante.
	let justDragged = false;
	function cardClick(event, deal) {
		if (justDragged) return;
		if (event.target.closest('button, a, input, select, textarea, .menu, .handle')) return;
		openId = deal.id;
	}

	async function onFinalize(stage, e) {
		columns[stage.id] = e.detail.items;
		const trigger = e.detail.info.trigger;
		justDragged = true;
		setTimeout(() => (justDragged = false), 250);
		if (coarse) dragDisabled = true;
		// Coluna de origem: só atualiza os itens. Quem encerra o arrasto é a de destino,
		// senão o quadro ressincroniza com o estado antigo e o cartão "volta".
		if (trigger === TRIGGERS.DROPPED_INTO_ANOTHER) return;
		if (trigger !== TRIGGERS.DROPPED_INTO_ZONE) {
			sync.dragEnd();
			if (trigger === TRIGGERS.DROPPED_OUTSIDE_OF_ANY) sync.force(group(data.deals));
			return;
		}
		const movedId = e.detail.info.id;
		const original = data.deals.find((d) => d.id === movedId);
		const cameFromOther = original && original.stageId !== stage.id;

		if (stage.kind === 'PERDIDO') {
			sync.dragEnd();
			if (cameFromOther) {
				// Perdido exige o motivo: o cartão volta e o modal pergunta.
				sync.force(group(data.deals));
				askLoss(original);
			}
			return;
		}
		sync.begin();
		sync.dragEnd();
		const result = await callAction('?/posicionar', { stageId: stage.id, dealIds: e.detail.items.map((i) => i.id) });
		if (!result.ok) notice = result.error ?? 'Não foi possível mover. Tente de novo.';
		// Traz o estado real do servidor ANTES de liberar a ressincronização: o cartão não pisca nem volta.
		if (sync.lastPending) await invalidateAll();
		sync.end();
		if (!result.ok) sync.force(group(data.deals));
	}

	// ---- perda com motivo ----------------------------------------------------
	let loss = $state(null); // { deal }
	let lossReason = $state('');
	let lossNote = $state('');
	let lossBusy = $state(false);

	function askLoss(deal) {
		loss = { deal };
		lossReason = '';
		lossNote = '';
		menuId = null;
	}

	async function confirmLoss(event) {
		event.preventDefault();
		if (!lossReason || lossBusy) return;
		lossBusy = true;
		const result = await callAction(`${basePath}/${loss.deal.id}?/perder`, { reason: lossReason, note: lossNote });
		lossBusy = false;
		if (!result.ok) {
			notice = result.error ?? 'Não foi possível marcar como perdido.';
		} else {
			loss = null;
			await invalidateAll();
		}
	}

	// ---- menu do cartão ------------------------------------------------------
	let menuId = $state(null);

	async function runDealAction(deal, action, fields = {}) {
		menuId = null;
		sync.begin();
		const result = await callAction(`${basePath}/${deal.id}?/${action}`, fields);
		if (!result.ok) notice = result.error ?? 'Não foi possível concluir.';
		await invalidateAll();
		sync.end();
	}

	function moveTo(deal, stage) {
		if (stage.kind === 'PERDIDO') return askLoss(deal);
		return runDealAction(deal, 'mover', { stageId: stage.id });
	}

	// ---- painel lateral ------------------------------------------------------
	// Guarda só o id; o negócio vem sempre dos dados atuais do quadro.
	let openId = $state(params.get('abrir'));
	const openDeal = $derived(data.deals.find((d) => d.id === openId) ?? null);

	// ---- totais (do que está visível) ---------------------------------------
	const visibleOpen = $derived(
		data.deals.filter((d) => matches(d) && data.stages.find((s) => s.id === d.stageId)?.kind === 'ABERTA')
	);
	const totals = $derived({
		count: visibleOpen.length,
		value: visibleOpen.reduce((sum, d) => sum + (d.valueCents ?? 0), 0),
		waiting: visibleOpen.filter((d) => d.chat?.waiting).length,
		stale: visibleOpen.filter((d) => d.stale >= 1).length
	});
	const sum = (items) => items.reduce((acc, d) => acc + (d.valueCents ?? 0), 0);

	function ago(date) {
		const min = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60_000));
		if (min < 60) return `${min || 1} min`;
		if (min < 1440) return `${Math.round(min / 60)} h`;
		return `${Math.round(min / 1440)} d`;
	}

	let newOpen = $state(false);

	// ---- novo lead: contato existente preenche o formulário -----------------
	const EMPTY_LEAD = { title: '', serviceType: '', spaceType: '', squareMeters: '', address: '', neighborhood: '', source: '', value: '', assigneeId: '', contactName: '', contactPhone: '' };
	let lead = $state({ ...EMPTY_LEAD });
	let picked = $state(null); // contato escolhido
	let contactQuery = $state('');
	let contactResults = $state([]);
	let searchTimer;
	let phoneNotice = $state(null); // contato já existente com o telefone digitado

	async function searchContacts(q) {
		if (q.trim().length < 2) return [];
		try {
			const res = await fetch(`/api/contatos/buscar?q=${encodeURIComponent(q.trim())}&area=${data.area}`);
			return res.ok ? (await res.json()).contacts : [];
		} catch {
			return [];
		}
	}
	function onContactInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => (contactResults = await searchContacts(contactQuery)), 250);
	}
	// Preenche só o que está vazio: o que a pessoa já digitou não é sobrescrito.
	function pickContact(c) {
		picked = c;
		contactResults = [];
		contactQuery = '';
		phoneNotice = null;
		for (const k of ['neighborhood', 'source', 'serviceType', 'spaceType', 'address', 'squareMeters']) {
			if (!lead[k] && c[k]) lead[k] = String(c[k]);
		}
	}
	function clearContact() {
		picked = null;
	}
	async function checkPhone() {
		phoneNotice = null;
		const digits = lead.contactPhone.replace(/\D/g, '');
		if (picked || digits.length < 8) return;
		const found = (await searchContacts(digits)).find((c) => c.phone && c.phone.replace(/\D/g, '').endsWith(digits.slice(-8)));
		if (found) phoneNotice = found;
	}
	function resetLead() {
		lead = { ...EMPTY_LEAD };
		picked = null;
		phoneNotice = null;
		contactQuery = '';
		contactResults = [];
	}
	let prefsOpen = $state(false);
	const show = (key) => data.prefs[key];
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && ((menuId = null), (loss = null), (prefsOpen = false))} />

<div class="toolbar">
	<label class="search">
		<Search size={15} />
		<input type="search" placeholder="Buscar por nome, telefone ou mensagem" bind:value={q} />
	</label>
	<div class="chips">
		<button type="button" class="chip" class:on={only === 'meus'} onclick={() => (only = only === 'meus' ? '' : 'meus')}>Meus leads</button>
		<button type="button" class="chip" class:on={only === 'sem'} onclick={() => (only = only === 'sem' ? '' : 'sem')}>Sem responsável</button>
		<button type="button" class="chip" class:on={only === 'espera'} onclick={() => (only = only === 'espera' ? '' : 'espera')}>Aguardando resposta</button>
	</div>
	<select bind:value={resp} aria-label="Filtrar por responsável">
		<option value="">Todos os responsáveis</option>
		{#each data.users as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
	</select>
	{#if jardim}
		<select bind:value={level} aria-label="Filtrar por temperatura">
			<option value="">Toda temperatura</option>
			<option value="QUENTE">Quente</option>
			<option value="MORNO">Morno</option>
			<option value="FRIO">Frio</option>
		</select>
	{/if}
	{#if filtered}<button type="button" class="link" onclick={() => ((q = ''), (only = ''), (resp = ''), (level = ''))}>Limpar filtros</button>{/if}
	<span class="spacer"></span>
	<div class="prefs">
		<button type="button" class="btn btn-secondary btn-sm" onclick={() => (prefsOpen = !prefsOpen)}>Cartão</button>
		{#if prefsOpen}
			<form method="POST" action="?/prefs" use:enhance={() => async ({ update }) => { await update({ reset: false }); prefsOpen = false; }} class="prefs-pop card">
				<strong>O que aparece no cartão</strong>
				{#each CARD_FIELDS as f (f.key)}
					<label><input type="checkbox" name={f.key} checked={data.prefs[f.key]} /> {f.label}</label>
				{/each}
				<button class="btn btn-sm" type="submit">Salvar</button>
			</form>
		{/if}
	</div>
	{#if data.canConfig}
		<a class="btn btn-secondary icon-btn btn-sm" href={resolve('/funil/config')} aria-label="Editar etapas e listas" title="Editar etapas e listas"><Settings size={16} /></a>
	{/if}
	<button
		type="button"
		class="btn btn-sm"
		onclick={() => {
			newOpen = true;
			document.getElementById('novo-negocio')?.scrollIntoView({ behavior: 'smooth' });
		}}>{newLabel}</button
	>
</div>

<div class="totals">
	<div class="card tile"><span>Leads abertos</span><strong>{totals.count}</strong></div>
	<div class="card tile"><span>Valor potencial</span><strong>{totals.value ? formatBRL(totals.value) : 'sem valor'}</strong></div>
	<div class="card tile"><span>Aguardando resposta</span><strong>{totals.waiting}</strong></div>
	<div class="card tile"><span>Parados</span><strong>{totals.stale}</strong></div>
</div>

{#if filtered}<p class="hint">Arrastar fica desligado enquanto há filtro. Use o menu ⋮ do cartão para mover, ou limpe os filtros.</p>{/if}
{#if notice}<p class="error-text" role="alert">{notice} <button class="link" type="button" onclick={() => (notice = '')}>Fechar</button></p>{/if}

<div class="board">
	{#each data.stages as stage (stage.id)}
		<section class="column">
			<h2 class="column-head" style="--stage: {colorOf(stage)}">
				<span class="dot"></span>
				<span class="stage-name">{stage.name}</span>
				<span class="count">{columns[stage.id]?.length ?? 0}</span>
			</h2>
			<p class="column-sum">{sum(columns[stage.id] ?? []) ? formatBRL(sum(columns[stage.id])) : ' '}</p>
			<div
				class="cards"
				use:dndzone={{
					items: columns[stage.id] ?? [],
					flipDurationMs: FLIP_MS,
					// Com filtro ativo só parte da coluna aparece: arrastar bagunçaria a ordem dos ocultos.
					dragDisabled: dragDisabled || filtered,
					dropTargetStyle: {},
					dropTargetClasses: ['drop-over'],
					type: 'deal',
					transformDraggedElement: (el) => {
						if (el) el.style.boxShadow = '0 12px 28px rgba(22, 36, 27, 0.25)';
					}
				}}
				onconsider={(e) => onConsider(stage.id, e)}
				onfinalize={(e) => onFinalize(stage, e)}
			>
				{#each columns[stage.id] ?? [] as deal (deal.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
					<article
						onclick={(e) => cardClick(e, deal)}
						class="card deal stale-{deal.stale}"
						class:waiting={deal.chat?.waiting}
						style="--stage: {colorOf(stage)}"
					>
						<div class="top">
							<span class="handle" onmousedown={startDrag} ontouchstart={startDrag} role="presentation" aria-label="Arrastar {deal.contact.name}">
								<GripVertical size={14} strokeWidth={2} />
							</span>
							<button class="open" type="button" onclick={() => (openId = deal.id)}>
								<span class="avatar">{deal.contact.name.trim().charAt(0).toUpperCase()}</span>
								<span class="name">{deal.contact.name}</span>
								{#if deal.chat?.unread}<span class="unread" title="{deal.chat.unread} não lidas">{deal.chat.unread}</span>{/if}
							</button>
							<button class="kebab" type="button" aria-label="Ações de {deal.contact.name}" onclick={() => (menuId = menuId === deal.id ? null : deal.id)}>
								<EllipsisVertical size={16} />
							</button>
						</div>

						{#if menuId === deal.id}
							<div class="menu card" role="menu">
								<button type="button" role="menuitem" onclick={() => ((openId = deal.id), (menuId = null))}>{deal.chat ? 'Abrir conversa' : 'Iniciar conversa'}</button>
								<a role="menuitem" href={resolve(`${basePath}/${deal.id}`)}>Abrir ficha</a>
								{#if deal.contact.phone}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a role="menuitem" href={waLink(deal.contact.phone)} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a>
								{/if}
								{#if deal.assignee?.id !== data.me.id}
									<button type="button" role="menuitem" onclick={() => runDealAction(deal, 'assumir')}>Assumir lead</button>
								{/if}
								<span class="menu-label">Mover para</span>
								{#each data.stages.filter((s) => s.id !== deal.stageId) as s (s.id)}
									<button type="button" role="menuitem" onclick={() => ((menuId = null), moveTo(deal, s))}>
										<span class="dot small" style="--stage: {colorOf(s)}"></span>{s.name}
									</button>
								{/each}
							</div>
						{/if}

						{#if show('preview') && deal.chat?.preview}
							<button class="preview" type="button" onclick={() => (openId = deal.id)}>
								<span class="who">{deal.chat.fromClient ? '' : 'Você: '}</span>{deal.chat.preview}
							</button>
						{:else if deal.title}
							<p class="sub">{deal.title}</p>
						{/if}
						<div class="meta">
							{#if show('place') && deal.neighborhood}<span>{deal.neighborhood}</span>{/if}
							{#if show('place') && deal.squareMeters}<span>{deal.squareMeters} m²</span>{/if}
							{#if show('value') && deal.valueCents}<span class="money">{formatBRL(deal.valueCents)}</span>{/if}
							{#if deal.chat}<span class="when">{ago(deal.chat.lastMessageAt)}</span>{/if}
						</div>
						{#if show('badges')}
							<div class="tags">
								{#if deal.chat?.waiting}<span class="badge red">Aguardando resposta</span>{/if}
								{#if jardim && deal.level}<span class="badge level-{deal.level}">{LEVEL_LABEL[deal.level]}</span>{/if}
								{#if deal.outOfRoute}<span class="badge warn">Fora da rota</span>{/if}
								{#if deal.stale === 1}<span class="badge yellow">1 dia parado</span>{/if}
								{#if deal.stale === 2}<span class="badge red">Parado há 2+ dias</span>{/if}
							</div>
						{/if}
						{#if show('assignee')}
							{#if deal.assignee}
								<span class="badge">{deal.assignee.name}</span>
							{:else}
								<button class="assume" type="button" onclick={() => runDealAction(deal, 'assumir')}>Assumir lead</button>
							{/if}
						{/if}
						{#if show('next') && deal.nextAction}<p class="next">Próximo: {deal.nextAction}</p>{/if}
					</article>
				{/each}
				{#if (columns[stage.id]?.length ?? 0) === 0}
					<p class="empty">{filtered ? 'Nenhum lead com esse filtro' : 'Nenhum lead'}</p>
				{/if}
			</div>
		</section>
	{/each}
</div>

{#if openDeal}
	<DealDrawer deal={openDeal} stages={data.stages} {basePath} onclose={() => (openId = null)} />
{/if}

{#if loss}
	<button class="scrim" type="button" aria-label="Cancelar" onclick={() => (loss = null)}></button>
	<div class="modal card" role="dialog" aria-label="Marcar como perdido">
	<form onsubmit={confirmLoss} class="inner">
		<h3>Marcar como perdido</h3>
		<p class="dim">{loss.deal.contact.name}: o motivo é obrigatório.</p>
		<label class="field">
			<span>Motivo</span>
			<select bind:value={lossReason} required>
				<option value="">Escolha...</option>
				{#each data.lists.lostReasons as r (r.key)}<option value={r.key}>{r.label}</option>{/each}
			</select>
		</label>
		<label class="field"><span>Observação (opcional)</span><input bind:value={lossNote} maxlength="500" /></label>
		{#if notice}<p class="error-text" role="alert">{notice}</p>{/if}
		<div class="row">
			<button class="btn btn-secondary btn-sm" type="button" onclick={() => (loss = null)}>Cancelar</button>
			<button class="btn-danger" type="submit" disabled={!lossReason || lossBusy}>{lossBusy ? 'Salvando...' : 'Marcar como perdido'}</button>
		</div>
	</form>
	</div>
{/if}

<details class="card new" id="novo-negocio" bind:open={newOpen}>
	<summary>{newLabel}</summary>
	<form
		method="POST"
		action="?/criar"
		use:enhance={() => async ({ result, update }) => {
			await update({ reset: false });
			// Em erro (telefone inválido, duplicado) o que foi digitado fica para corrigir.
			if (result.type === 'success') resetLead();
		}}
		class="grid"
	>
		<div class="field wide contact-box">
			<span>Contato</span>
			{#if picked}
				<input type="hidden" name="contactId" value={picked.id} />
				<div class="picked">
					<strong>{picked.name}</strong>
					<span class="dim">{picked.phone ?? 'sem telefone'}</span>
					<button type="button" class="link" onclick={clearContact}>Trocar</button>
				</div>
				<p class="hint">Dados do contato já preenchidos abaixo. Complete o que faltar agora ou depois.</p>
			{:else}
				<input
					type="search"
					placeholder="Buscar contato por nome ou telefone"
					bind:value={contactQuery}
					oninput={onContactInput}
					autocomplete="off"
				/>
				{#if contactResults.length}
					<ul class="results" role="listbox">
						{#each contactResults as c (c.id)}
							<li><button type="button" onclick={() => pickContact(c)}><strong>{c.name}</strong> <span class="dim">{c.phone ?? ''} {c.neighborhood ? `· ${c.neighborhood}` : ''}</span></button></li>
						{/each}
					</ul>
				{:else if contactQuery.trim().length >= 2}
					<p class="hint">Nenhum contato encontrado. Preencha nome e telefone abaixo para criar um novo.</p>
				{/if}
			{/if}
		</div>
		{#if !picked}
			<label class="field"><span>Nome (contato novo)</span><input name="contactName" maxlength="120" bind:value={lead.contactName} /></label>
			<label class="field">
				<span>Telefone (contato novo)</span>
				<input name="contactPhone" inputmode="tel" placeholder="(21) 99999-9999" bind:value={lead.contactPhone} onblur={checkPhone} />
			</label>
			{#if phoneNotice}
				<p class="notice wide">
					Este telefone já é do contato <strong>{phoneNotice.name}</strong>.
					<button type="button" class="link" onclick={() => pickContact(phoneNotice)}>Usar os dados dele</button>
				</p>
			{/if}
		{/if}
		<label class="field wide"><span>{jardim ? 'Resumo do pedido de jardim' : 'O que o cliente pediu'}</span><input name="title" maxlength="120" bind:value={lead.title} /></label>
		{#if jardim}
			<label class="field">
				<span>Serviço</span>
				<select name="serviceType" bind:value={lead.serviceType}>{#each data.lists.services as s (s.key)}<option value={s.key}>{s.label}</option>{/each}</select>
			</label>
			<label class="field"><span>Tipo de espaço</span><input name="spaceType" placeholder="Jardim frontal, quintal..." bind:value={lead.spaceType} /></label>
			<label class="field"><span>Metragem (m²)</span><input name="squareMeters" type="number" min="1" bind:value={lead.squareMeters} /></label>
			<label class="field"><span>Endereço</span><input name="address" bind:value={lead.address} /></label>
		{/if}
		<label class="field"><span>Bairro</span><input name="neighborhood" bind:value={lead.neighborhood} /></label>
		<label class="field">
			<span>Origem</span>
			<select name="source" bind:value={lead.source}>
				<option value="">Escolha...</option>
				{#each data.lists.sources as o (o.key)}<option value={o.label}>{o.label}</option>{/each}
				{#if lead.source && !data.lists.sources.some((o) => o.label === lead.source)}<option value={lead.source}>{lead.source}</option>{/if}
			</select>
		</label>
		<label class="field"><span>Valor (R$)</span><input name="value" inputmode="decimal" bind:value={lead.value} /></label>
		<label class="field">
			<span>Responsável</span>
			<select name="assigneeId" bind:value={lead.assigneeId}>
				<option value="">Eu</option>
				{#each data.users as u (u.id)}<option value={u.id}>{u.name}</option>{/each}
			</select>
		</label>
		<button class="btn" type="submit">Criar</button>
	</form>
</details>

<style>
	.toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
	.search { display: flex; align-items: center; gap: 0.4rem; flex: 1 1 16rem; min-width: 14rem; background: var(--color-bg-alt); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0 0.7rem; color: var(--color-text-dim); }
	.search input { border: 0; background: none; outline: 0; padding: 0; min-height: var(--control-h-sm); flex: 1; color: var(--color-text); font: inherit; min-width: 0; }
	.toolbar select { background: var(--color-bg-alt); border: 1px solid var(--color-border); border-radius: var(--radius-button); min-height: var(--control-h-sm); padding: 0 0.6rem; color: var(--color-text); font-size: 0.85rem; }
	.chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.chip.on { background: var(--color-accent-dim); border-color: var(--color-accent-text); color: var(--color-accent-text); font-weight: 700; }
	.link { background: none; border: 0; padding: 0; color: var(--color-accent-text); font-weight: 700; font-size: 0.8rem; cursor: pointer; text-decoration: underline; }
	.spacer { flex: 1; }
	.icon-btn { padding: 0 0.7rem; }
	.prefs { position: relative; }
	.prefs-pop { position: absolute; right: 0; top: calc(100% + 0.3rem); z-index: 20; padding: 0.8rem; display: flex; flex-direction: column; gap: 0.45rem; min-width: 14rem; font-size: 0.85rem; }
	.prefs-pop label { display: flex; gap: 0.45rem; align-items: center; }
	.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.6rem; }
	.tile { padding: 0.65rem 0.9rem; display: flex; flex-direction: column; gap: 0.15rem; }
	.tile span { font-size: 0.75rem; color: var(--color-text-dim); }
	.tile strong { font-size: 1.15rem; }

	.board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(250px, 1fr); gap: 0.8rem; overflow-x: auto; padding-bottom: 0.5rem; align-items: stretch; min-height: 60vh; }
	.column { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
	.column-head { margin: 0; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; display: flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.2rem; border-bottom: 3px solid var(--stage); color: var(--color-text-dim); }
	.stage-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.dot { width: 0.65rem; height: 0.65rem; border-radius: 50%; background: var(--stage); flex: none; }
	.dot.small { width: 0.5rem; height: 0.5rem; margin-right: 0.4rem; display: inline-block; }
	.count { font-weight: 700; }
	.column-sum { margin: 0 0.2rem; font-size: 0.78rem; color: var(--color-text-dim); font-weight: 600; min-height: 1em; }
	/* A coluna inteira é alvo de soltar, mesmo vazia. */
	.cards { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-height: 8rem; padding-bottom: 1rem; border-radius: 10px; }
	.cards:global(.drop-over) { background: rgba(240, 180, 41, 0.1); }
	.deal { padding: 0.7rem; display: flex; flex-direction: column; gap: 0.35rem; position: relative; border-left: 4px solid var(--stage); cursor: grab; touch-action: pan-y; }
	.deal:active { cursor: grabbing; }
	.deal.stale-1 { border-left-color: #e0a420; }
	.deal.stale-2 { border-left-color: var(--color-danger); }
	.deal.waiting { border-left-color: var(--color-success); }
	.empty { margin: 0.5rem 0; text-align: center; font-size: 0.8rem; color: var(--color-text-dim); pointer-events: none; }
	.top { display: flex; align-items: center; gap: 0.3rem; }
	/* Alça só aparece no toque; com mouse o cartão inteiro arrasta. */
	.handle { display: none; cursor: grab; color: var(--color-text-dim); touch-action: none; padding: 0.3rem 0.2rem; }
	@media (pointer: coarse) { .handle { display: inline-flex; } .deal { cursor: default; } }
	.open { display: flex; align-items: center; gap: 0.45rem; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; min-width: 0; flex: 1; color: inherit; font: inherit; }
	.avatar { width: 1.7rem; height: 1.7rem; border-radius: 50%; background: var(--color-accent-dim); color: var(--color-accent-text); display: grid; place-items: center; font-weight: 800; font-size: 0.8rem; flex: none; }
	.name { font-weight: 700; font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.unread { margin-left: auto; background: var(--color-success); color: #fff; border-radius: 999px; min-width: 1.2rem; padding: 0 0.35rem; font-size: 0.7rem; font-weight: 700; text-align: center; line-height: 1.2rem; }
	.kebab { background: none; border: 0; cursor: pointer; color: var(--color-text-dim); padding: 0.2rem; border-radius: 6px; display: inline-flex; }
	.kebab:hover { background: var(--color-bg-alt); }
	.menu { position: absolute; right: 0.4rem; top: 2.4rem; z-index: 15; padding: 0.3rem; display: flex; flex-direction: column; min-width: 12rem; max-height: 20rem; overflow-y: auto; box-shadow: 0 10px 28px rgba(22, 36, 27, 0.18); }
	.menu button, .menu a { background: none; border: 0; text-align: left; padding: 0.4rem 0.6rem; font: inherit; font-size: 0.85rem; color: var(--color-text); cursor: pointer; border-radius: 6px; text-decoration: none; }
	.menu button:hover, .menu a:hover { background: var(--color-bg-alt); }
	.menu-label { padding: 0.4rem 0.6rem 0.1rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-text-dim); }
	.preview { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; font: inherit; font-size: 0.8rem; color: var(--color-text-dim); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.preview .who { font-weight: 600; }
	.when { margin-left: auto; }
	.sub { margin: 0; font-size: 0.8rem; color: var(--color-text-dim); }
	.meta { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; font-size: 0.75rem; color: var(--color-text-dim); }
	.money { color: var(--color-text); font-weight: 700; }
	.tags { display: flex; flex-wrap: wrap; gap: 0.25rem; }
	.badge.level-QUENTE { background: rgba(194, 54, 43, 0.12); color: var(--color-danger); border-color: transparent; }
	.badge.level-MORNO { background: var(--color-accent-dim); color: var(--color-accent-text); border-color: transparent; }
	.badge.warn { background: rgba(194, 54, 43, 0.1); color: var(--color-danger); border-color: transparent; }
	.badge.yellow { background: var(--color-accent-dim); color: var(--color-accent-text); border-color: transparent; }
	.badge.red { background: rgba(194, 54, 43, 0.12); color: var(--color-danger); border-color: transparent; }
	.assume { align-self: flex-start; background: none; border: 1px dashed var(--color-accent-text); color: var(--color-accent-text); border-radius: 8px; padding: 0.2rem 0.6rem; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
	.next { margin: 0; font-size: 0.75rem; }
	.deal > .badge { align-self: flex-start; }

	.scrim { position: fixed; inset: 0; background: rgba(22, 36, 27, 0.4); border: 0; padding: 0; z-index: 50; cursor: default; }
	.modal { position: fixed; z-index: 51; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 2rem)); padding: 1.2rem; display: flex; flex-direction: column; gap: 0.7rem; }
	.inner { display: flex; flex-direction: column; gap: 0.7rem; }
	.modal h3 { margin: 0; }
	.modal .dim { margin: 0; color: var(--color-text-dim); font-size: 0.85rem; }
	.row { display: flex; gap: 0.5rem; justify-content: flex-end; }

	.new { padding: 1rem; margin-top: 1rem; }
	.new summary { cursor: pointer; font-weight: 700; }
	.wide { grid-column: 1 / -1; }
	.contact-box { position: relative; display: flex; flex-direction: column; gap: 0.3rem; }
	.picked { display: flex; gap: 0.7rem; align-items: center; background: var(--color-accent-dim); border-radius: var(--radius-button); padding: 0.5rem 0.8rem; }
	.results { list-style: none; margin: 0; padding: 0.2rem; border: 1px solid var(--color-border); border-radius: var(--radius-button); background: var(--color-bg-elevated); }
	.results button { width: 100%; text-align: left; background: none; border: 0; padding: 0.45rem 0.6rem; cursor: pointer; font: inherit; border-radius: 6px; }
	.results button:hover { background: var(--color-bg-alt); }
	.dim { color: var(--color-text-dim); font-size: 0.8rem; }
	.hint { margin: 0; font-size: 0.78rem; color: var(--color-text-dim); }
	.notice { margin: 0; padding: 0.5rem 0.8rem; background: var(--color-accent-dim); border-radius: var(--radius-button); font-size: 0.85rem; }
	.grid { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; align-items: end; }
</style>
