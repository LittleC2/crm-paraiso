// Guarda de ressincronização dos quadros arrastáveis (leads e tarefas).
// O estado local das colunas só aceita dados do servidor quando não há arrasto
// nem gravação em andamento. Dados que chegam no meio ficam guardados e entram
// uma única vez, quando tudo termina: o cartão nunca "vai e volta".
export function createBoardSync(apply) {
	let dragging = false;
	let pending = 0;
	let latest = null;
	let hasLatest = false;

	function flush() {
		if (dragging || pending > 0 || !hasLatest) return;
		const next = latest;
		hasLatest = false;
		latest = null;
		apply(next);
	}

	return {
		/** Dados novos do servidor (ou filtro novo). */
		offer(next) {
			latest = next;
			hasLatest = true;
			flush();
		},
		/** Aplica já, descartando o que estava guardado (ex.: servidor recusou o movimento). */
		force(next) {
			hasLatest = false;
			latest = null;
			apply(next);
		},
		dragStart() {
			dragging = true;
		},
		dragEnd() {
			dragging = false;
			flush();
		},
		begin() {
			pending += 1;
		},
		/** Retorna true quando foi a última gravação pendente. */
		get lastPending() {
			return pending === 1;
		},
		end() {
			pending -= 1;
			flush();
		}
	};
}
