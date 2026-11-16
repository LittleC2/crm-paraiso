<script>
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	let { data, form } = $props();
	const AREA_LABEL = { JARDIM: 'Funil', LOJA: 'Pedidos da loja' };
	const LIST_LABEL = { MOTIVO_PERDA: 'Motivos de perda', ORIGEM: 'Origens do lead', SERVICO: 'Tipos de serviço' };
	const LIST_HINT = {
		MOTIVO_PERDA: 'Aparecem quando um negócio é marcado como perdido.',
		ORIGEM: 'Aparecem no cadastro do lead.',
		SERVICO: 'Aparecem no cadastro do lead de jardim.'
	};
	const DEFAULT_COLOR = { ABERTA: '#45524a', GANHO: '#2f8f4e', PERDIDO: '#c2362b' };
	const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
</script>

<svelte:head>
	<title>Configurar funil · Paraíso das Plantas</title>
</svelte:head>

<main class="page">
	<a class="back" href={resolve('/funil')}>← Funil</a>
	<h1>Configurar funil</h1>
	{#if form?.error}<p class="error-text">{form.error}</p>{/if}
	{#if form?.ok}<p class="success-text">Salvo.</p>{/if}

	<section class="card box">
		<h2>Etapas do funil</h2>
		<p class="hint">
			Renomeie, troque a cor, mude a ordem, crie e apague etapas. "Fechado" e "Perdido" não podem ser apagadas, e
			"Visita" e "Proposta" são usadas pelo sistema (podem ser renomeadas). Ao apagar uma etapa, os negócios dela vão
			para a etapa que você escolher.
		</p>
		{#each (data.solo ? ['JARDIM'] : ['JARDIM', 'LOJA']) as area (area)}
			{@const list = data.allStages.filter((s) => s.area === area)}
			<h3>{AREA_LABEL[area]}</h3>
			{#each list as s, i (s.id)}
				<form method="POST" action="?/etapaSalvar" use:enhance class="stage-row">
					<input type="hidden" name="id" value={s.id} />
					<input type="color" name="color" value={s.color ?? DEFAULT_COLOR[s.kind]} aria-label="Cor da etapa" />
					<input class="grow" name="name" value={s.name} maxlength="60" required aria-label="Nome da etapa" />
					<span class="dim">{s.deals} {s.deals === 1 ? 'negócio' : 'negócios'}{s.kind === 'GANHO' ? ' · ganho' : s.kind === 'PERDIDO' ? ' · perdido' : ''}</span>
					<button class="icon" type="submit" formaction="?/etapaMover" name="direction" value="up" disabled={i === 0} aria-label="Subir">↑</button>
					<button class="icon" type="submit" formaction="?/etapaMover" name="direction" value="down" disabled={i === list.length - 1} aria-label="Descer">↓</button>
					<button class="btn btn-secondary" type="submit">Salvar</button>
					{#if s.canDelete}
						<details class="del">
							<summary>Apagar</summary>
							<div class="del-body">
								<select name="targetId" aria-label="Mover negócios para">
									<option value="">Mover negócios para...</option>
									{#each list.filter((o) => o.kind === 'ABERTA' && o.id !== s.id) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
								</select>
								<button class="btn-danger" type="submit" formaction="?/etapaExcluir">Confirmar</button>
							</div>
						</details>
					{/if}
				</form>
			{/each}
			<form method="POST" action="?/etapaCriar" use:enhance class="stage-row new">
				<input type="hidden" name="area" value={area} />
				<input type="color" name="color" value="#45524a" aria-label="Cor da nova etapa" />
				<input class="grow" name="name" placeholder="Nova etapa" maxlength="60" required aria-label="Nome da nova etapa" />
				<button class="btn" type="submit">Adicionar etapa</button>
			</form>
		{/each}
	</section>

	{#each ['MOTIVO_PERDA', 'ORIGEM', 'SERVICO'] as kind (kind)}
		{@const items = data.options.filter((o) => o.kind === kind)}
		<section class="card box">
			<h2>{LIST_LABEL[kind]}</h2>
			<p class="hint">{LIST_HINT[kind]} Desativar esconde a opção dos formulários, sem apagar quem já usou.</p>
			{#each items as o, i (o.id)}
				<form method="POST" action="?/opcaoSalvar" use:enhance class="stage-row" class:off={!o.active}>
					<input type="hidden" name="id" value={o.id} />
					<input class="grow" name="label" value={o.label} maxlength="60" required aria-label="Nome" />
					<button class="icon" type="submit" formaction="?/opcaoMover" name="direction" value="up" disabled={i === 0} aria-label="Subir">↑</button>
					<button class="icon" type="submit" formaction="?/opcaoMover" name="direction" value="down" disabled={i === items.length - 1} aria-label="Descer">↓</button>
					<button class="btn btn-secondary" type="submit">Salvar</button>
					<button class="btn btn-secondary" type="submit" formaction="?/opcaoAtivar" name="active" value={o.active ? '0' : '1'}>{o.active ? 'Desativar' : 'Ativar'}</button>
				</form>
			{/each}
			<form method="POST" action="?/opcaoSalvar" use:enhance class="stage-row new">
				<input type="hidden" name="kind" value={kind} />
				<input class="grow" name="label" placeholder="Novo item" maxlength="60" required aria-label="Novo item" />
				<button class="btn" type="submit">Adicionar</button>
			</form>
		</section>
	{/each}

	<section class="card box">
		<h2>Retorno automático por etapa</h2>
		<p class="hint">
			Quando ligada, todo negócio que <strong>entrar</strong> na etapa depois de você ligar ganha tarefas de
			retorno nos dias indicados (às 9h). Negócios que já estão na etapa não são alterados. As tarefas
			param sozinhas se o negócio fechar, for perdido ou tiver visita marcada. Vem desligada.
		</p>
		{#each data.stages as s (s.id)}
			<form method="POST" action="?/regra" use:enhance class="rule">
				<input type="hidden" name="stageId" value={s.id} />
				<strong class="stage">{s.name}</strong>
				<label class="check"><input type="checkbox" name="active" checked={s.rule?.active ?? false} /> Ligada</label>
				<label class="field"><span>Dias (ex: 1, 3, 7, 14)</span><input name="days" value={(s.rule?.followUpDays ?? []).join(', ')} /></label>
				<button class="btn btn-secondary" type="submit">Salvar</button>
			</form>
		{/each}
	</section>

	<section class="card box">
		<h2>Rotas de atendimento</h2>
		<p class="hint">
			Bairros que a equipe atende, por dia da semana. Negócio em bairro fora de todas as rotas recebe o aviso
			"Fora da rota". Sem nenhuma rota cadastrada, não há aviso.
		</p>
		{#each data.routes as r (r.id)}
			<form method="POST" action="?/rota" use:enhance class="route">
				<input type="hidden" name="id" value={r.id} />
				<label class="field"><span>Nome</span><input name="name" value={r.name} required /></label>
				<label class="field">
					<span>Dia</span>
					<select name="weekday" value={r.weekday ?? ''}><option value="">Qualquer</option>{#each WEEKDAYS as w, i (w)}<option value={i}>{w}</option>{/each}</select>
				</label>
				<label class="field grow"><span>Bairros (separe por vírgula)</span><input name="neighborhoods" value={r.neighborhoods.join(', ')} /></label>
				<button class="btn btn-secondary" type="submit">Salvar</button>
				<button class="btn-danger" type="submit" formaction="?/excluirRota">Excluir</button>
			</form>
		{/each}
		<form method="POST" action="?/rota" use:enhance class="route new">
			<label class="field"><span>Nova rota</span><input name="name" required placeholder="Ex: Zona sul" /></label>
			<label class="field">
				<span>Dia</span>
				<select name="weekday"><option value="">Qualquer</option>{#each WEEKDAYS as w, i (w)}<option value={i}>{w}</option>{/each}</select>
			</label>
			<label class="field grow"><span>Bairros</span><input name="neighborhoods" /></label>
			<button class="btn" type="submit">Adicionar</button>
		</form>
	</section>
</main>

<style>
	.page { max-width: 900px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.back { font-size: 0.85rem; color: var(--color-text-dim); text-decoration: none; }
	h1 { margin: 0; font-size: 1.4rem; }
	h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
	.hint { margin: 0 0 1rem; color: var(--color-text-dim); font-size: 0.85rem; }
	.box { padding: 1rem; }
	.rule, .route { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: end; padding: 0.7rem 0; border-top: 1px solid var(--color-border); }
	.stage { min-width: 180px; padding-bottom: 0.6rem; }
	.check { display: flex; align-items: center; gap: 0.4rem; padding-bottom: 0.6rem; font-size: 0.85rem; }
	.grow { flex: 1; min-width: 200px; }
	.stage-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.5rem; }
	.stage-row.new { padding-top: 0.5rem; border-top: 1px dashed var(--color-border); }
	.stage-row.off { opacity: 0.55; }
	.stage-row input[type='color'] { width: 2.2rem; height: 2.2rem; padding: 0; border: 1px solid var(--color-border); border-radius: 8px; background: none; cursor: pointer; }
	.stage-row .grow { flex: 1; min-width: 10rem; }
	
	.stage-row select { background: var(--color-bg-alt); border: 1px solid var(--color-border); border-radius: var(--radius-button); padding: 0.4rem 0.6rem; color: var(--color-text); }
	.icon { border: 1px solid var(--color-border); background: var(--color-bg-elevated); border-radius: 8px; width: 2rem; height: 2rem; cursor: pointer; }
	.icon:disabled { opacity: 0.35; cursor: default; }
	.dim { color: var(--color-text-dim); font-size: 0.78rem; }
	h3 { margin: 1rem 0 0; font-size: 0.95rem; }
	.del summary { cursor: pointer; color: var(--color-danger); font-weight: 700; font-size: 0.8rem; padding: 0.4rem 0.5rem; }
	.del-body { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; padding: 0.4rem 0.5rem; }
</style>
