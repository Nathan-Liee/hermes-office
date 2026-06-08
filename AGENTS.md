# Agent Instructions

**HO3D (Hermes Office 3D)** — Hermes-native fork of **Claw3D** by [Luke The Dev](https://x.com/iamlukethedev). MIT License — Copyright (c) 2026 Luke The Dev.

This repo is a frontend for Hermes Agent. Keep any Hermes runtime checkout separate from this repository.

Do not modify the original Claw3D source. This fork is a modified version — keep instructions generic and safe for open source.

If you use local private overlay instructions, keep them outside the repository and do not commit them here.

Do not commit personal, environment-specific, or secret instructions to this repository.

## Service overview

HO3D is a Next.js 16 frontend (TypeScript, React 19, Three.js, Phaser) for Hermes Agent. It runs a custom Node.js server (`server/index.js`). No database or Docker is required. The only hard system dependency is Node.js 20+ with npm 10+.

### Running the app

- `npm run dev` starts the dev server on port 3000 via the custom server (`node server/index.js --dev`).
- The app requires a running Hermes API server to show agent data. Without one, the UI loads but shows the gateway connection form. This is expected and not an error.
- `.env` is copied from `.env.example`; see `README.md` "Configuration" for variable descriptions.
- For Hermes: set `HERMES_API_URL`, `HERMES_API_KEY`, run `npm run hermes-adapter`, then connect Studio to `ws://localhost:18789`.

### Lint, typecheck, and tests

- `npm run lint` — ESLint. The codebase has a small number of pre-existing warnings and one pre-existing error (in `RetroOffice3D.tsx`).
- `npm run typecheck` — `tsc --noEmit`. Pre-existing type errors exist in some test files (`agentChatPanel-*.test.ts`) due to a stale `onOpenSettings` prop.
- `npm run test -- --run` — Vitest unit tests (use `--run` for single-run mode). A few pre-existing failures exist.
- `npm run e2e` — Playwright E2E tests; requires `npx playwright install` first.
- `npm run smoke:dev-server` — starts the dev server on a random port and verifies HTTP response.

### Build

- `npm run build` — Next.js production build.

### Gotchas

- `npm run studio:setup` is interactive (TTY prompts) — avoid running it in non-interactive cloud environments.
- Vitest runs in watch mode by default; always pass `--run` for CI/cloud agent use.
