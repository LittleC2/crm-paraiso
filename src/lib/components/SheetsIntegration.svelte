<script>
	import { enhance } from '$app/forms';

	// Integração de leads por planilha do Google (Apps Script). Só admin.
	let { leads, form } = $props();

	const STATUS = { CRIADO: 'Lead criado', DUPLICADO: 'Duplicado', INVALIDO: 'Inválido', ERRO: 'Erro' };
	const when = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
	let copied = $state('');

	async function copy(text, what) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			setTimeout(() => (copied = ''), 2500);
		} catch {
			copied = 'Selecione o texto e copie com Ctrl+C.';
		}
	}
</script>

<section class="card section" id="integracoes">
	<h2>Google Sheets: leads direto no funil</h2>
	<p class="hint">
		Cada linha nova da planilha vira um lead na primeira etapa do funil. Funciona com planilha de formulário do Google, de
		anúncio (Meta, via Zapier ou Make) ou preenchida à mão. Nada é enviado ao cliente por aqui.
	</p>
	{#if form?.leadError}<p class="error-text" role="alert">{form.leadError}</p>{/if}
	{#if form?.leadOk}<p class="success-text">{form.leadOk}</p>{/if}

	{#each leads.integrations as i (i.id)}
		<div class="integration" class:off={!i.active}>
			<div class="top">
				<strong>{i.name}</strong>
				<span class="badge" class:badge-success={i.active}>{i.active ? 'Ligada' : 'Desligada'}</span>
				<span class="dim">{i.lastEventAt ? `última entrada ${when(i.lastEventAt)}` : 'nenhuma entrada ainda'}</span>
			</div>
			<p class="dim month">
				Neste mês: {i.month.CRIADO ?? 0} criados · {i.month.DUPLICADO ?? 0} duplicados · {(i.month.INVALIDO ?? 0) + (i.month.ERRO ?? 0)} com problema
			</p>

			{#if form?.leadFor === i.id && form?.leadKey}
				<div class="reveal">
					<p><strong>Copie agora: a chave não aparece de novo.</strong> Cole o script abaixo na planilha.</p>
					<ol>
						<li>Abra a planilha, menu <b>Extensões &gt; Apps Script</b>, apague o que houver e cole o script.</li>
						<li>Salve, escolha a função <b>enviarNovasLinhas</b> e clique em <b>Executar</b> (autorize quando o Google pedir).</li>
						<li>
							Menu <b>Gatilhos</b> (relógio): adicione <b>enviarNovasLinhas</b>, origem "Da planilha", evento "Ao enviar o formulário"
							(se for formulário) e outro "Controlado pelo tempo", a cada minuto.
						</li>
						<li>Volte aqui, envie um lead de teste e ligue a integração.</li>
					</ol>
					<textarea readonly rows="8" onfocus={(e) => e.currentTarget.select()}>{form.leadScript}</textarea>
					<div class="actions">
						<button class="btn btn-sm" type="button" onclick={() => copy(form.leadScript, 'Script copiado.')}>Copiar script</button>
						<button class="btn btn-secondary btn-sm" type="button" onclick={() => copy(form.leadKey, 'Chave copiada.')}>Copiar só a chave</button>
						{#if copied}<span class="dim">{copied}</span>{/if}
					</div>
				</div>
			{/if}

			<form method="POST" action="?/leadSalvar" use:enhance class="grid">
				<input type="hidden" name="id" value={i.id} />
				<label class="field">
					<span>Etapa de entrada</span>
					<select name="stageId" value={i.stageId ?? ''}>
						<option value="">Primeira etapa</option>
						{#each leads.stages as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span>Origem padrão</span>
					<select name="defaultSource" value={i.defaultSource ?? ''}>
						<option value="">Planilha: {i.name}</option>
						{#each leads.origins as o (o.key)}<option value={o.label}>{o.label}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span>Serviço padrão</span>
					<select name="defaultService" value={i.defaultService ?? ''}>
						<option value="">Primeiro da lista</option>
						{#each leads.services as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
					</select>
				</label>
				<details class="wide mapping">
					<summary>Colunas da planilha (opcional: o CRM reconhece os nomes comuns sozinho)</summary>
					<div class="grid">
						{#each leads.fields as f (f.key)}
							<label class="field"><span>{f.label}</span><input name="map_{f.key}" value={i.mapping?.[f.key] ?? ''} placeholder="automático" maxlength="80" /></label>
						{/each}
					</div>
				</details>
				<div class="actions wide">
					<button class="btn btn-secondary btn-sm" type="submit">Salvar</button>
				</div>
			</form>

			<div class="actions">
				<form method="POST" action="?/leadTeste" use:enhance><input type="hidden" name="id" value={i.id} /><button class="btn btn-secondary btn-sm" type="submit">Enviar lead de teste</button></form>
				<form method="POST" action="?/leadAtivo" use:enhance>
					<input type="hidden" name="id" value={i.id} /><input type="hidden" name="active" value={i.active ? '0' : '1'} />
					<button class="btn btn-sm" type="submit">{i.active ? 'Desligar' : 'Ligar'}</button>
				</form>
				<form method="POST" action="?/leadChave" use:enhance><input type="hidden" name="id" value={i.id} /><button class="btn btn-secondary btn-sm" type="submit">Gerar nova chave e script</button></form>
				<form method="POST" action="?/leadApagarTestes" use:enhance><button class="btn btn-secondary btn-sm" type="submit">Apagar leads de teste</button></form>
				<form method="POST" action="?/leadExcluir" use:enhance onsubmit={(e) => !confirm(`Remover a integração "${i.name}"? Os leads já criados continuam no funil.`) && e.preventDefault()}>
					<input type="hidden" name="id" value={i.id} /><button class="btn-danger btn-sm" type="submit">Remover</button>
				</form>
			</div>

			{#if i.recent.length}
				<details>
					<summary>Últimas chegadas ({i.recent.length})</summary>
					<ul class="log">
						{#each i.recent as r (r.id)}
							<li><span class="dim">{when(r.createdAt)}</span> <strong>{r.name ?? 'sem nome'}</strong> <span class="badge st-{r.status}">{STATUS[r.status]}</span>{#if r.reason} <span class="dim">{r.reason}</span>{/if}</li>
						{/each}
					</ul>
				</details>
			{/if}
		</div>
	{/each}

	<details open={leads.integrations.length === 0}>
		<summary>Nova integração com planilha</summary>
		<form method="POST" action="?/leadCriar" use:enhance class="grid">
			<label class="field"><span>Nome</span><input name="name" required maxlength="60" placeholder="Formulário do Instagram" /></label>
			<div class="actions"><button class="btn btn-sm" type="submit">Criar e gerar script</button></div>
		</form>
	</details>
</section>

<style>
	.section { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.9rem; }
	.section h2 { margin: 0; font-size: 1rem; }
	.hint, .dim { margin: 0; color: var(--color-text-dim); font-size: 0.82rem; }
	.integration { border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 0.9rem; display: flex; flex-direction: column; gap: 0.7rem; background: var(--color-bg-elevated); }
	.integration.off { opacity: 0.92; }
	.top { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
	.month { margin: 0; }
	.badge-success { border-color: var(--color-success); color: var(--color-success); }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.7rem; align-items: end; margin-top: 0.4rem; }
	.wide { grid-column: 1 / -1; }
	.field { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; color: var(--color-text-dim); }
	.field input, .field select { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-button); min-height: var(--control-h-sm); padding: 0 0.6rem; color: var(--color-text); font: inherit; }
	.reveal { background: var(--color-accent-dim); border: 1px solid var(--color-accent); border-radius: var(--radius-button); padding: 0.8rem; display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem; }
	.reveal p, .reveal ol { margin: 0; }
	.reveal ol { padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.25rem; }
	.reveal textarea { width: 100%; font-family: ui-monospace, monospace; font-size: 0.72rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 6px; padding: 0.5rem; box-sizing: border-box; }
	.log { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; }
	.st-CRIADO { color: var(--color-success); border-color: var(--color-success); }
	.st-ERRO, .st-INVALIDO { color: var(--color-danger); border-color: var(--color-danger); }
	summary { cursor: pointer; font-weight: 700; font-size: 0.85rem; }
</style>
