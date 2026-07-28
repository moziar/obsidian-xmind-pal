import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json" },
		},
		rules: {
			// Xmind 是品牌名，不应被 sentence-case 规则改为小写
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					brands: ["Xmind", "Obsidian"],
					acronyms: ["API", "CSS", "DOM", "HTML", "JS", "JSON", "URL", "SVG"],
				},
			],
		},
	},
	{
		ignores: [
			"node_modules/**",
			"main.js",
			"*.config.mjs",
		],
	},
]);
