import tseslint from 'typescript-eslint'
import obsidianmd from 'eslint-plugin-obsidianmd'
import globals from 'globals'
import { globalIgnores } from 'eslint/config'

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.js', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Test stand-in for the `obsidian` package: it must import moment directly.
		files: ['src/test/obsidian-mock.ts'],
		rules: {
			'no-restricted-imports': 'off',
			'import/no-extraneous-dependencies': 'off',
		},
	},
	{
		// Test stubs build fake Obsidian objects; casting is the point there.
		files: ['src/**/*.test.ts', 'src/test/**/*.ts'],
		rules: {
			'obsidianmd/no-tfile-tfolder-cast': 'off',
		},
	},
	{
		// E2E specs: mocha globals via @wdio/mocha-framework, dev-only deps.
		files: ['test/specs/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.mocha,
			},
		},
		rules: {
			'import/no-extraneous-dependencies': 'off',
		},
	},
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'eslint.config.js',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'vitest.config.mts',
	])
)
