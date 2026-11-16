import { CONTACTS_TEMPLATE_CSV } from '$lib/csv.js';

// Planilha modelo para importar contatos (abre direto no Excel e no Google Sheets).
export const GET = () =>
	new Response(CONTACTS_TEMPLATE_CSV, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="modelo-contatos-paraiso.csv"'
		}
	});
