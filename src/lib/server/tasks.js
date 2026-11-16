// Mutações de Task compartilhadas entre /tarefas e o quick-add da tela Hoje.
// Todas recebem o `user` e aplicam taskScope: um usuário LOJA nunca altera
// tarefa da área JARDIM, nem por id direto.
import { db } from './db.js';
import { allowedArea, taskScope } from './access.js';
import { upsertEventForTask, deleteEventForTask } from './googleCalendar.js';

export async function createTask(
	user,
	{ title, description, priority, dueDate, contactId, assigneeId, area, recurrence }
) {
	const task = await db.task.create({
		data: {
			title,
			description: description || null,
			priority: priority || 'NORMAL',
			dueDate: dueDate || null,
			contactId: contactId || null,
			assigneeId: assigneeId || null,
			area: allowedArea(user, area),
			recurrence: recurrence || 'NENHUMA'
		}
	});
	// Sincronizar com a Google Agenda é best-effort (sem responsável, prazo
	// ou conexão, é no-op) e não trava a criação.
	await upsertEventForTask(task);
	return task;
}

function nextDate(date, recurrence) {
	const next = new Date(date);
	if (recurrence === 'DIARIA') next.setDate(next.getDate() + 1);
	else if (recurrence === 'SEMANAL') next.setDate(next.getDate() + 7);
	else if (recurrence === 'MENSAL') next.setMonth(next.getMonth() + 1);
	return next;
}

/**
 * Tarefa de rotina concluída gera a próxima ocorrência (sem prazo, nasce
 * hoje ou no dia seguinte conforme a recorrência). Idempotente por tarefa:
 * só cria quando a tarefa acabou de entrar em FEITO.
 */
async function spawnNextIfRecurring(task) {
	if (task.recurrence === 'NENHUMA') return;
	const base = task.dueDate ?? new Date();
	await db.task.create({
		data: {
			title: task.title,
			description: task.description,
			priority: task.priority,
			area: task.area,
			recurrence: task.recurrence,
			assigneeId: task.assigneeId,
			contactId: task.contactId,
			dueDate: nextDate(base, task.recurrence)
		}
	});
}

/** Muda o status; marca/limpa completedAt ao entrar/sair de FEITO. */
export async function setTaskStatus(user, id, status) {
	const task = await db.task.findFirst({ where: { id, ...taskScope(user) } });
	if (!task) return null;
	const entering = status === 'FEITO' && task.status !== 'FEITO';
	const updated = await db.task.update({
		where: { id },
		data: { status, completedAt: status === 'FEITO' ? (task.completedAt ?? new Date()) : null }
	});
	if (entering) await spawnNextIfRecurring(task);
	return updated;
}

export async function deleteTask(user, id) {
	const task = await db.task.findFirst({ where: { id, ...taskScope(user) } });
	if (!task) return null;
	await deleteEventForTask(task);
	return db.task.delete({ where: { id } });
}

/**
 * Persiste o resultado de um drag no board: `taskIds` é a ordem final da
 * coluna `status` depois do drop. Só mexe em tarefas dentro do escopo do
 * usuário (ids fora do escopo são ignorados).
 */
export async function reorderColumn(user, status, taskIds) {
	const current = await db.task.findMany({
		where: { id: { in: taskIds }, ...taskScope(user) },
		select: { id: true, status: true, completedAt: true }
	});
	const previous = new Map(current.map((t) => [t.id, t]));
	const allowedIds = taskIds.filter((id) => previous.has(id));

	await db.$transaction(
		allowedIds.map((id, index) => {
			const wasFeito = previous.get(id).status === 'FEITO';
			const isFeito = status === 'FEITO';
			const data = { status, order: index };
			if (isFeito && !wasFeito) data.completedAt = new Date();
			if (!isFeito && wasFeito) data.completedAt = null;
			return db.task.update({ where: { id }, data });
		})
	);

	for (const id of allowedIds) {
		const before = previous.get(id);
		if (status === 'FEITO' && before.status !== 'FEITO') {
			const task = await db.task.findUnique({ where: { id } });
			await spawnNextIfRecurring(task);
		}
	}
}
