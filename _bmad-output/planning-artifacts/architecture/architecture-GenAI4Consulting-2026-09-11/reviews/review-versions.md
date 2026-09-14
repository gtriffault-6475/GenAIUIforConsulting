# Review — Stack Versions & Tech-Choice Reality Check

**Target:** `ARCHITECTURE-SPINE.md` (GenAI4Consulting, updated 2026-09-14)
**Method:** Live web search (September 2026) against every version number and technology choice in the "Stack" table plus the `@anthropic-ai/sdk` vs Claude Agent SDK decision narrative.
**Today's date:** 2026-09-14

---

## Summary verdict

Most of the Stack table checks out and appears to have been reality-checked rather than asserted from training data (Next.js 16.x, React 19.x, and `@anthropic-ai/sdk` 0.124.x are all correct, current, and internally consistent as of this week). However, **`Node.js 20 LTS` is factually wrong today** — Node 20 reached end-of-life on 2026-04-30 and is unpatched, not "LTS" — and the `TypeScript >= 5.0` floor is stale/too loose given that TypeScript 7.0 (a from-scratch Go-based compiler with real breaking changes) has been the current stable line since July 2026. The `better-sqlite3` install-friction concern is legitimate and well-founded; a lower-friction alternative exists and should at least be considered. The reasoning for choosing the raw `@anthropic-ai/sdk` Messages API over the Claude Agent SDK holds up under scrutiny and is, if anything, understated.

---

## 1. Next.js 16.x (App Router, Turbopack) — ACCURATE

- Next.js 16 is current; 16.3 reached stable on 2026-08-03 with Turbopack now stable and the **default** bundler for both dev and production (not opt-in).
- Minimum Node.js requirement for Next.js 16 is **Node >= 20.9** — this is directly relevant to the Node.js LTS finding below (see §4): the framework's floor does not, by itself, justify pinning to Node 20.
- No stale reference found. The generic "16.x" pin (rather than a specific patch) is reasonable for a fast-moving major version.

Sources: nextjs.org/blog/next-16, nextjs.org/blog/next-16-3-turbopack, nextjs.org/docs/app/guides/upgrading/version-16

## 2. React 19.x — ACCURATE

- Latest published version is **19.3.0** (released 2026-09-09, i.e. 5 days before the spine's last update). The spine's generic "19.x" pin is correct and current.
- No red flags — React 19 is still the current major line (React 20 has not shipped).

Sources: npmjs.com/package/react, react.dev/versions

## 3. TypeScript >= 5.0 — STALE / TOO LOOSE (finding)

- TypeScript 6.0 shipped 2026-03-23; **TypeScript 7.0 shipped stable on 2026-07-08** (7.0.2), a from-scratch rewrite of the compiler and language service in Go, ~10x faster, but not merely an internal optimization:
  - `moduleResolution: "node" / "node10" / "classic"` are **removed** — only `"nodenext"`/`"bundler"` remain.
  - `types` now defaults to an **empty array** — `@types/node` and friends are no longer auto-included unless listed explicitly.
  - `rootDir` now defaults to `./` (was inferred), which can silently change output directory structure for a `src/`-based layout (this repo's proposed tree is exactly that shape: `app/`, `actions/`, `domain/`, etc. at the root — worth double-checking against whichever TS version is actually installed).
  - **TypeScript 7.0 does not ship a stable JavaScript compiler API.** Any tooling that imports `typescript` and walks the AST (e.g. Drizzle's own schema-introspection tooling) needs Microsoft's `@typescript/typescript6` compatibility shim to keep working under TS 7. This is a concrete, non-hypothetical interaction with this stack's own ORM choice.
- **Why this matters for the spine:** `>= 5.0` is satisfied by TypeScript 5.0 (May 2023), 6.0, and 7.0 alike — three compiler generations with materially different defaults and a discontinuity in tooling compatibility. An open floor like this reads like an assumed-safe default rather than a checked one. Recommend pinning to a specific current minor (e.g. `^5.7` if deliberately staying pre-7, or explicitly `7.x` with the Drizzle-tooling caveat called out) rather than leaving a three-generation-wide floor unexamined.
- Next.js 16.3 does support TypeScript 7 directly, so the ecosystem compatibility path exists — this is a documentation/precision gap in the spine, not a fatal choice.

Sources: devblogs.microsoft.com/typescript/announcing-typescript-6-0, visualstudiomagazine.com (TS 7.0 Beta), achromatic.dev/blog/nextjs-16-3-typescript-7-upgrade, developersdigest.tech (TS7 migration guide)

## 4. Node.js 20 LTS — INCORRECT / STALE (finding, most material one)

- **Node.js 20 reached end-of-life on 2026-04-30.** As of today (2026-09-14), Node 20 receives **no security patches**. Calling it "20 LTS" in a document dated/updated 2026-09-14 is factually wrong — it was LTS, it no longer is.
- Current state of the Node release line as of this week:
  - Node 22 — Maintenance LTS (critical fixes only), EOL 2027-04-30
  - **Node 24 — Active LTS** (the line new production work should target), EOL 2028-04-30
  - Node 26 — Current (not yet LTS)
- Next.js 16's own minimum is Node >= 20.9, so nothing in the stack *requires* staying on 20 — this looks like a version that was correct when originally decided (or copied from general knowledge of "Node 20 is the LTS") and not re-checked against today's release calendar.
- **Recommendation:** bump the pin to Node 22 (safe, still receiving fixes) or Node 24 (Active LTS, more headroom) — this is a one-line fix. Also relevant to §5 below: Node 22.13+/24 is the version floor for `node:sqlite`.

Sources: endoflife.ai/article-nodejs-eol, herodevs.com/blog-posts/node-js-end-of-life-dates-you-should-be-aware-of, pkgpulse.com/guides/nodejs-22-vs-nodejs-24-2026

## 5. Drizzle ORM + better-sqlite3 — LEGITIMATE INSTALL-FRICTION CONCERN (finding)

The task asked specifically whether "must be very easy to install on a single laptop" is well served by `better-sqlite3`. **This is a real, well-documented risk, not a hypothetical one:**

- `better-sqlite3` is a native Node addon. Its install path is: try to fetch a prebuilt binary matching the exact (Node ABI version × OS × arch) combination; if none exists, fall back to `node-gyp rebuild`, which requires a working C++ toolchain (Xcode Command Line Tools on macOS, Visual Studio Build Tools + Python on Windows).
- Multiple open/recent GitHub issues on `WiseLibs/better-sqlite3` show exactly this failure mode in practice ("No prebuilt binaries found", node-gyp rebuild failures) across Node versions and platforms — this is an ongoing, not historical, pattern.
- For a product whose explicit constraint is "very easy to install on a single laptop" (round 1 is mono-poste per the spine's own Deferred section), handing a non-technical or semi-technical consultant a `npm install` that might silently drop into a native compile step — on a corporate Windows laptop that may well lack build tools — is a genuine adoption risk, not a paranoid one.
- **A lower-friction alternative exists and is directly relevant:** `node:sqlite`, Node's **built-in** SQLite module, ships inside the Node binary itself — **zero install, no native compilation, no platform-specific failures** at all. Status: usable without flags since Node 22.13 (experimental warning), release-candidate stability on Node 24+, fully stable on Node 26. Drizzle has first-class support for `node:sqlite` alongside `better-sqlite3` and `libsql`.
- Given the spine is already going to bump off Node 20 (finding §4), moving to Node 22/24 makes `node:sqlite` a genuinely viable, lower-friction alternative to `better-sqlite3` for exactly the constraint the stack table is trying to satisfy. This doesn't mean `better-sqlite3` is wrong (it's mature, synchronous, widely used, and Drizzle supports it well) — but the spine does not show evidence this tradeoff was considered, and the "very easy to install" requirement is the one place where `node:sqlite` would have been the more defensible default.
- **Recommendation:** either (a) explicitly note in the spine why `better-sqlite3`'s native-compile risk was accepted despite the single-laptop constraint (e.g., "prebuilt binaries cover our target platforms, verified"), or (b) switch to `node:sqlite` given the Node version bump is already needed.

Sources: github.com/WiseLibs/better-sqlite3/issues/1027, /1326, /489, /782; betterstack.com/community/guides/scaling-nodejs/nodejs-sqlite; nodejs.org/api/sqlite.html; github.com/nodejs/node/issues/57445; orm.drizzle.team/docs/get-started/sqlite-new

## 6. @anthropic-ai/sdk (Messages API) 0.124.x — ACCURATE, ONE MINOR BEHIND

- `0.124.0` is real and was released 2026-09-04.
- As of today, **`0.125.0`** is the actual latest (released ~2026-09-11, 3 days before the spine's last update). This is not stale in any meaningful sense (SDK ships frequent minor versions; pinning "0.124.x" as a range rather than exact patch is normal practice) — just noting the spine is one minor version behind current at time of writing, which is expected drift for a fast-moving SDK and not a real issue.
- No deprecation or renaming of the `@anthropic-ai/sdk` package found; it remains the actively maintained official TypeScript SDK.

Sources: npmjs.com/package/@anthropic-ai/sdk, github.com/anthropics/anthropic-sdk-typescript/blob/main/CHANGELOG.md

## 7. Raw Messages API vs Claude Agent SDK — REASONING HOLDS UP (confirmed, slightly understated)

The spine's stated reasoning: Agent SDK is "shaped for coding-agent tasks (bundles a Claude Code binary, ships bash/file-edit tools)" and is "heavier than needed" for a product needing fine control over mapping tool calls to UI state (anchored suggestions on paragraphs).

Web research confirms this holds, and arguably understates the case:

- **Architecturally different, not just "more tools":** the Claude Agent SDK's TypeScript package (`@anthropic-ai/claude-agent-sdk`) bundles a **native Claude Code binary as a platform-specific optional dependency** and communicates with it over a subprocess (JSON-RPC over stdin/stdout). This means the SDK brings its own native-binary-per-platform install surface — ironically a second instance of the exact "native dependency install friction" concern raised for `better-sqlite3` in §5, but for the LLM client instead of the database driver.
- **Disabling built-in tools does not remove this weight.** It's true you can pass `tools: []` / list every built-in tool in `disallowedTools` to strip bash/file-edit access entirely, but this does not remove the bundled binary or the subprocess/stateful-agentic-loop architecture — you still get a spawned process managing a full agent loop, when the product's actual need (per AD-3: "the same tool call that creates content, in the same request, persisted before responding to the UI") is a single stateless request/response with structured tool-call output.
- **The Messages API's raw tool-use interface is a good match for this product's actual requirement**: tool calls come back as structured JSON blocks (`tool_use` content) in a normal HTTP response; the app parses them and maps each one to DB writes and UI state itself (matching AD-2/AD-3/AD-5's Server-Actions-own-all-persistence design) — there is no missing feature here (multi-turn conversation, streaming, and tool schemas are all supported natively by the Messages API and don't require the Agent SDK).
- No feature gap was found that the product needs and only the Agent SDK provides. The one thing the Agent SDK uniquely offers — an autonomous multi-step agentic loop that runs several tool calls in sequence without app-level orchestration — is explicitly not what AD-3's "one tool call per write" model wants.

**Conclusion:** the decision and its stated rationale are sound and appear to have been reasoned through rather than asserted; the additional detail (bundled binary + subprocess model as the concrete "heavier" mechanism) would strengthen the spine's justification if added, but nothing here is wrong.

Sources: platform.claude.com/docs/en/agent-sdk/custom-tools, code.claude.com/docs/en/agent-sdk/typescript, morphllm.com/claude-agent-sdk, news.ycombinator.com/item?id=47669957, mindstudio.ai/blog/what-is-claude-agent-sdk-vs-claude-api

---

## Findings ranked by materiality

1. **`Node.js 20 LTS` is incorrect as written** — Node 20 has been EOL since 2026-04-30; it is unpatched, not LTS. Fix: bump to Node 22 or 24.
2. **`better-sqlite3`'s native-compile install risk is real and documented**, and directly cuts against the stated "very easy to install on a single laptop" constraint; `node:sqlite` (zero-install, ships in the Node runtime) is a concrete, Drizzle-supported alternative that becomes viable once Node is bumped off 20 anyway. Worth an explicit accept-or-switch decision rather than silence.
3. **`TypeScript >= 5.0` is too wide a floor** — it spans three compiler generations (5.x, 6.x, the Go-rewritten 7.x) with real breaking changes and a documented Drizzle-tooling compatibility gap under TS 7. Should be pinned more precisely.
4. **`@anthropic-ai/sdk` 0.124.x vs current 0.125.x** — trivial one-minor drift, not a real issue, noted only for completeness.
5. **Messages API vs Agent SDK reasoning is confirmed correct** — no finding, but the review surfaced a stronger supporting fact (bundled binary + subprocess model) worth folding into the spine's own justification text.
