<script>
	/** Métrica + valor grande + variação opcional. Ver contrato em
	 * `references/marks-and-anatomy.md` da skill dataviz: label em sentence
	 * case sem dois-pontos, valor compacto, delta com sinal e cor por direção. */
	let { label, value, danger = false, class: className = '' } = $props();
</script>

<div class="card stat-tile {className}" class:stat-tile-danger={danger}>
	<span class="stat-label">{label}</span>
	<strong class="stat-value" class:negative={danger}>{value}</strong>
</div>
