import { loadStats } from '$lib/server/funnelStats.js';

export const load = async () => ({ stats: await loadStats() });
