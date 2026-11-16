<script>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { callAction } from '$lib/formAction.js';
	import { formatPhone } from '$lib/phone.js';

	// Seção "WhatsApp" de Ajustes (só admin): números, conexão por QR, webhook e respostas rápidas.
	let { wa, form } = $props();

	const STATE = { DESCONHECIDO: 'Desconhecido', CONECTADO: 'Conectado', CONECTANDO: 'Aguardando leitura do QR', DESCONECTADO: 'Desconectado' };
	const when = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

	const qrChannelId = $derived(form?.qr?.channelId ?? null);
	const qrChannel = $derived(wa.channels.find((c) => c.id === qrChannelId) ?? null);
	const waitingQr = $derived(Boolean(qrChannel && qrChannel.state !== 'CONECTADO' && form?.qr?.image));

	// Enquanto o QR está na tela, pergunta ao WhatsApp a cada 4 s se já foi lido.
	$effect(() => {
		if (!waitingQr) return;
		const id = qrChannelId;
		const timer = setInterval(async () => {
			await callAction('?/zapStatus', { id, quiet: '1' });
			await invalidateAll();
		}, 4000);
		return () => clearInterval(timer);
	});
</script>

<section class="card section" id="whatsapp">
	<h2>WhatsApp</h2>
	<p class="hint">
		Serviço não oficial (uazapi): o número continua funcionando no celular, mas a Meta pode bloquear números que usam
		serviços não oficiais, e a conexão por QR pode cair. Não envie mensagens em massa. Responda a quem escreveu e só
		inicie conversa com quem autorizou.
	</p>
	{#if !wa.baseConfigured || !wa.secretConfigured}
		<p class="alert">Faltam variáveis de ambiente: {!wa.baseConfigured ? 'UAZAPI_URL ' : ''}{!wa.secretConfigured ? 'WHATSAPP_WEBHOOK_SECRET' : ''}</p>
	{/if}
	{#if form?.error}<p class="alert">{form.error}</p>{/if}
	{#if form?.ok && !form.quiet}<p class="success-text">{form.queued != null ? `${form.queued} pedidos de histórico novos na fila.` : 'Feito.'}</p>{/if}

	{#each wa.channels as c (c.id)}
		<div class="channel" class:off={!c.active}>
			<div class="top">
				<div class="title">
					<strong>{c.name}</strong>
					{#if !wa.solo}<span class="badge">{c.area === 'LOJA' ? 'Loja' : 'Jardim'}</span>{/if}
					<span class="badge state-{c.state}">{STATE[c.state]}</span>
					{#if !c.active}<span class="badge">Desativado</span>{/if}
				</div>
				<span class="dim">{c.phone ? formatPhone(c.phone) : 'número ainda não lido'} · último evento: {when(c.lastWebhookAt)}</span>
			</div>
			{#if !c.tokenConfigured}<p class="alert">Token não configurado: crie a variável <code>{c.tokenEnv}</code> na Vercel.</p>{/if}

			<div class="buttons">
				{#if c.state === 'CONECTADO'}
					<form method="POST" action="?/zapDesconectar" use:enhance={({ cancel }) => { if (!confirm('Desconectar o WhatsApp deste número? As mensagens deixam de chegar até reconectar.')) cancel(); }}>
						<input type="hidden" name="id" value={c.id} /><button class="btn-danger" type="submit">Desconectar</button>
					</form>
				{:else}
					<form method="POST" action="?/zapConectar" use:enhance>
						<input type="hidden" name="id" value={c.id} /><button class="btn btn-sm" type="submit">Conectar por QR</button>
					</form>
				{/if}
				<form method="POST" action="?/zapStatus" use:enhance>
					<input type="hidden" name="id" value={c.id} /><button class="btn btn-secondary btn-sm" type="submit">Testar conexão</button>
				</form>
				<form method="POST" action="?/zapWebhook" use:enhance>
					<input type="hidden" name="id" value={c.id} /><button class="btn btn-secondary btn-sm" type="submit">Reaplicar webhook</button>
				</form>
				<form method="POST" action="?/zapAtivo" use:enhance>
					<input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.active ? '0' : '1'} />
					<button class="btn btn-secondary btn-sm" type="submit">{c.active ? 'Desativar' : 'Reativar'}</button>
				</form>
			</div>

			{#if c.state === 'CONECTADO'}
				<div class="history">
					<form method="POST" action="?/zapHistorico" use:enhance>
						<input type="hidden" name="id" value={c.id} />
						<button class="btn btn-secondary btn-sm" type="submit">Importar histórico dos contatos</button>
					</form>
					{#if c.history}
						<span class="dim">
							{c.history.ENVIADO} pedidos enviados{c.history.PENDENTE ? `, ${c.history.PENDENTE} na fila` : ''}{c.history.FALHOU ? `, ${c.history.FALHOU} com falha` : ''}.
						</span>
					{/if}
					<p class="dim">
						Pede ao celular as últimas mensagens de cada contato já cadastrado. O celular precisa estar com internet, o
						WhatsApp decide quanto entrega e pode vir só parte. Quem não está no CRM é ignorado.
					</p>
				</div>
			{/if}

			{#if qrChannelId === c.id}
				{#if c.state === 'CONECTADO'}
					<p class="success-text">Conectado! O WhatsApp deste número já está ligado ao CRM.</p>
				{:else if form.qr.image}
					<div class="qr-box">
						<img class="qr" src={form.qr.image.startsWith('data:') ? form.qr.image : `data:image/png;base64,${form.qr.image}`} alt="Código QR para conectar o WhatsApp" />
						<ol class="steps">
							<li>No celular, abra o WhatsApp.</li>
							<li>Toque em <strong>Aparelhos conectados</strong>, depois em <strong>Conectar um aparelho</strong>.</li>
							<li>Aponte a câmera para este código. Ele vale por cerca de 1 minuto.</li>
						</ol>
						<p class="dim">Esta tela confere sozinha quando o código for lido.</p>
					</div>
				{:else}
					<p class="dim">Sem QR agora. Se já estiver conectado, use "Testar conexão".</p>
				{/if}
			{/if}
		</div>
	{/each}

	{#if wa.channels.length === 0}<p class="dim">Nenhum número cadastrado ainda. Cadastre abaixo.</p>{/if}

	<details class="sub">
		<summary>Cadastrar novo número</summary>
		<form method="POST" action="?/zapCriar" use:enhance class="grid">
			<label class="field"><span>Nome</span><input name="name" required placeholder="Jardim João" /></label>
			{#if !wa.solo}
				<label class="field">
					<span>Quem atende</span>
					<select name="area"><option value="LOJA">Loja (equipe da loja e interna)</option><option value="JARDIM">Jardim (só equipe interna)</option></select>
				</label>
			{/if}
			<label class="field"><span>Variável do token na Vercel</span><input name="tokenEnv" required placeholder="UAZAPI_TOKEN_SERRA" /></label>
			<button class="btn" type="submit">Adicionar</button>
		</form>
		<p class="dim">O token da instância fica só na variável de ambiente (Vercel), nunca no banco.</p>
	</details>

	<details class="sub" open>
		<summary>Respostas rápidas</summary>
		<p class="dim">Use <code>{'{nome}'}</code> (primeiro nome do contato) e <code>{'{atendente}'}</code> (quem envia).</p>
		<ul>
			{#each wa.replies as r (r.id)}
				<li>
					<span><strong>{r.title}</strong> {#if !wa.solo}<span class="badge">{r.area === 'LOJA' ? 'Loja' : 'Jardim'}</span>{/if}<br /><span class="dim">{r.body}</span></span>
					<form method="POST" action="?/zapExcluirResposta" use:enhance><input type="hidden" name="id" value={r.id} /><button class="btn-icon" type="submit" aria-label="Excluir resposta {r.title}">×</button></form>
				</li>
			{/each}
		</ul>
		<form method="POST" action="?/zapResposta" use:enhance class="grid">
			<label class="field"><span>Título</span><input name="title" required maxlength="60" /></label>
			{#if !wa.solo}<label class="field"><span>Área</span><select name="area"><option value="LOJA">Loja</option><option value="JARDIM">Jardim</option></select></label>{/if}
			<label class="field wide"><span>Texto</span><textarea name="body" rows="2" required maxlength="1000"></textarea></label>
			<button class="btn" type="submit">Salvar resposta</button>
		</form>
	</details>
</section>

<style>
	.section { padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
	h2 { margin: 0; font-size: 1.05rem; }
	.hint, .dim { color: var(--color-text-dim); font-size: 0.82rem; margin: 0; }
	.alert { margin: 0; padding: 0.55rem 0.85rem; border-radius: var(--radius-button); background: rgba(194, 54, 43, 0.1); color: var(--color-danger); font-size: 0.85rem; font-weight: 600; }
	.channel { border: 1px solid var(--color-border); border-radius: var(--radius-card, 12px); padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem; background: var(--color-bg-elevated); }
	.channel.off { opacity: 0.6; }
	.top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
	.title { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
	.badge.state-CONECTADO { background: rgba(47, 125, 79, 0.12); color: var(--color-success); border-color: transparent; }
	.badge.state-DESCONECTADO { background: rgba(194, 54, 43, 0.1); color: var(--color-danger); border-color: transparent; }
	.badge.state-CONECTANDO { background: var(--color-accent-dim); color: var(--color-accent-text); border-color: transparent; }
	.buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.history { display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-start; }
	.qr-box { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
	.qr { width: 240px; height: 240px; background: #fff; padding: 8px; border-radius: 8px; }
	.steps { margin: 0; padding-left: 1.2rem; font-size: 0.88rem; display: flex; flex-direction: column; gap: 0.3rem; max-width: 22rem; }
	.sub { border-top: 1px solid var(--color-border); padding-top: 0.6rem; }
	.sub summary { cursor: pointer; font-weight: 700; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; align-items: end; margin-top: 0.6rem; }
	.wide { grid-column: 1 / -1; }
	ul { list-style: none; margin: 0.5rem 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	li { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
	code { background: var(--color-bg-alt); padding: 0 0.3rem; border-radius: 4px; }
</style>
