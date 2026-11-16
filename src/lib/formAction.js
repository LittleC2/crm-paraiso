// Chama uma ação de formulário do SvelteKit por fetch (sem navegar) e devolve
// { ok, error }. Valores em array viram campos repetidos.
import { deserialize } from '$app/forms';

export async function callAction(url, fields = {}) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (Array.isArray(value)) for (const v of value) body.append(key, v);
		else body.set(key, value);
	}
	try {
		const res = await fetch(url, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		const result = deserialize(await res.text());
		if (result.type === 'success') return { ok: true };
		if (result.type === 'redirect') return { ok: false, error: 'Sessão expirada. Entre de novo e repita.' };
		return { ok: false, error: result.type === 'failure' ? result.data?.error : undefined };
	} catch (err) {
		console.error('[callAction]', url, err);
		return { ok: false, error: 'Sem conexão com o servidor. Tente de novo.' };
	}
}
