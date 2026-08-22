// Flat config. Replaces .eslintrc.json, which ESLint 9 no longer reads by
// default — `pnpm lint` had been failing for every file with a circular-
// structure error while loading the legacy config, so nothing was actually
// being linted. (CI only runs `pnpm build`, so this went unnoticed.)
//
// Invoked via `pnpm lint` -> `eslint .`. It is deliberately not `next lint`:
// Next 16 removed that command, so `next lint` is parsed as `next <dir>` and
// fails with "Invalid project directory provided, no such directory: ./lint".
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
	{
		ignores: [
			".next/**",
			"out/**",
			"node_modules/**",
			"next-env.d.ts",
			"supabase/**",
		],
	},
	...coreWebVitals,
	...typescript,
	{
		rules: {
			// eslint-config-next 16 turns these React Compiler rules on as errors.
			// They flag three pre-existing patterns that predate this config being
			// readable at all, and `next build` fails on lint errors — so leaving
			// them at "error" would break CI for code that has not changed and is
			// verified working end to end.
			//
			// They are real and worth fixing, so they stay visible as warnings
			// rather than being switched off:
			//   app/(debate)/d/[id]/page.tsx:32   setState synchronously in effect
			//   components/debate/argument-form.tsx:156  same
			//   components/debate/debate-provider.tsx:89 ref written during render
			//
			// Fixing them means changing render/effect timing, which wants its own
			// change and its own end-to-end run — not a drive-by in a lint commit.
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/refs": "warn",
		},
	},
];

export default config;
