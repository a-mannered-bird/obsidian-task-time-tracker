import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	plugins: [tsconfigPaths()],
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL('./src/test/obsidian-mock.ts', import.meta.url)
			),
		},
	},
	test: {
		include: ['src/**/*.test.ts'],
	},
})
