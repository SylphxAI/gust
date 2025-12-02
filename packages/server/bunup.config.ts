import { defineConfig } from 'bunup'

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	dts: true,
	// Disable chunk splitting to avoid duplicate export bug
	splitting: false,
})
