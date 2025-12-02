import { defineConfig } from 'bunup'

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	dts: true,
	// Disable chunk splitting to avoid duplicate export bug
	splitting: false,
	// Don't bundle native binding - it needs to be loaded at runtime
	external: ['../../../crates/gust-napi', '@sylphx/gust-napi'],
})
