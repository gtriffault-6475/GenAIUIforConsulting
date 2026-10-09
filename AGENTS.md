<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules

- `domain/` holds the pure rules (no I/O) and is covered by `npm test` (`node --test`, see `domain/*.test.ts`). When a change touches a `domain/` function, add or update its tests and run `npm test` before reporting the work done; it must pass alongside `npx tsc --noEmit`.
- Before starting an epic story, make it visible on `main`: set it `in-progress` in `_bmad-output/implementation-artifacts/sprint-status.yaml` on `main`, or open a draft PR. Before starting one, check `main` and the open PRs for a story already in progress (Epic 5 retro A13).
- Every spec lists the existing flows it touches (`## Existing flows touched`: readers and writers of what it changes, including demo mode and the demo reset). `bmad-build` enforces this through `_bmad/custom/bmad-build.toml` (Epic 5 retro A14).
