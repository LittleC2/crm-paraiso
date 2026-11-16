// Prisma Decimal (campo Client.contractValue, e futuramente
// FinanceTransaction.amount) não é serializável pelo devalue do SvelteKit
// — qualquer `load` que devolva isso direto quebra com "Cannot stringify
// arbitrary non-POJOs". Converter pra number antes de sair do load, aqui
// num lugar só em vez de em cada rota.
export function serializeClient(client) {
	if (!client) return client;
	return {
		...client,
		contractValue: client.contractValue == null ? null : Number(client.contractValue)
	};
}

export function serializeClients(clients) {
	return clients.map(serializeClient);
}

/** Pra registros que incluem um `client` aninhado (Task, Post, ...). */
export function serializeNestedClient(record) {
	if (!record?.client) return record;
	return { ...record, client: serializeClient(record.client) };
}

export function serializeNestedClients(records) {
	return records.map(serializeNestedClient);
}

/** FinanceTransaction.amount é Decimal — mesmo problema, mesmo fix. Também
 * serializa o `client` aninhado quando o include trouxer um. */
export function serializeTransaction(transaction) {
	if (!transaction) return transaction;
	return {
		...transaction,
		amount: Number(transaction.amount),
		...(transaction.client ? { client: serializeClient(transaction.client) } : {})
	};
}

export function serializeTransactions(transactions) {
	return transactions.map(serializeTransaction);
}

/** FinanceRecurringRule.amount também é Decimal. */
export function serializeRecurringRule(rule) {
	if (!rule) return rule;
	return {
		...rule,
		amount: Number(rule.amount),
		...(rule.client ? { client: serializeClient(rule.client) } : {})
	};
}

export function serializeRecurringRules(rules) {
	return rules.map(serializeRecurringRule);
}
