import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Região gru1 (São Paulo): mesma do projeto Supabase, para a
			// latência função -> banco ficar baixa.
			adapter: adapter({ regions: ['gru1'] })
		})
	],
	test: { include: ['src/**/*.test.js'] }
});
