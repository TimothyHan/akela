# Changelog

## 0.1.4 — 2026-08-29

Findings from the first real consumer: QABuddy deleted its in-tree engine,
became a domain-pack consumer, and now runs its full 1,275-check suite against
Akela in CI. These are the gaps a first consumer should find pre-1.0.

- **Embeddable CLI entry**: `bin/akela.js` exports `main(argv)` — a consumer's
  launcher can delegate in-process instead of paying a node startup per command.
- **`~/` expansion** in `domain`, `knowledge[].path`, `learnings`, `runs` — a
  committed config with per-user install paths now travels between machines.
- **`knowledge[].exclude`** (root-relative globs, e.g. `["engine/**"]`):
  non-knowledge files vendored inside a knowledge root are skipped at index
  time and listed by `akela check --json` — visible, never silent.
- **Boundary tests ported from the consumer suite**: falsified-vs-reapplied
  ordering, closed-run refusal details (names the outcome, says how to open a
  new run, validation wins, refused appends write nothing, second outcome
  refused), EPIPE survival under `| head`, run reuse per activity+task.
- **Windows in CI**: the matrix now covers ubuntu + windows × Node 18/20/22/24.
- Docs: `docs/embedding.md` (the consumer pattern, with QABuddy as the worked
  reference) and FAQ entries for namespaces and excludes.
- 13 new tests · **139 total** · engine still zero dependencies.

## 0.1.3 — 2026-08-28

An empty slice is a naming problem until proven otherwise.

- **Loud 0-source warning**: `compile` that matches nothing now warns on stderr,
  naming the activity and listing the known scope tokens (exit stays 0; the
  empty `compiled` event is kept as evidence). Found live downstream: an agent
  passed the name it *invoked* instead of the activity name and ran four tasks
  on silently empty slices.
- **`aliasPrefixes`** (config/pack key): deterministic prefix stripping maps
  invoked names onto the activity vocabulary (`qa-exploratory` → `exploratory`),
  with an `activity alias:` notice printed after the path line. Applies to
  `compile` and `run-id`. Never fuzzy.
- Compile's first output line remains, by contract, the slice path — all
  notices print below it. 5 new tests (125 total).

## 0.1.2 — 2026-08-28

Docs and metadata only — no engine changes.

- FAQ (`docs/faq.md`) from real first-use questions; linked from the README.
- CI matrix (Node 18/20/22/24) and README badges; CHANGELOG introduced.
- Recordable demo script (`scripts/demo.sh`).
- Quick start clarifies `--knowledge` (any markdown folder path), `--domain`,
  and that RAG is post-init config.
- npm description/keywords carry "context compiler" / "context engineering".

## 0.1.1 — 2026-08-28

First release.

- Deterministic context compiler: scope/tier selection, must-floor guarantee,
  manifest of everything packed and dropped (with reasons); ~150-token slices
  independent of knowledge-base size.
- Append-only, content-hashed evidence log (`applied` / `contradicted` /
  `captured` / `outcome` / `compiled`).
- Falsification: disuse-based for learnings, recency-based for always-packed
  sections. Version-scoped evidence — rewrites start with a clean record
  (`prior_versions`). Bidirectional promotion lineage with quarantine.
- Arithmetic capture gate (`akela vet`): Unicode-aware restatement, duplicate,
  and dead-value (tombstone) rejection; hard cap per pass.
- Retrievers: any command as a RAG source; results counted like every source,
  promotable into the wiki with `supersedes` retirement.
- Agent-driven cycle: `akela init` generates `PROTOCOL.md` (per-task loop,
  unscoped-drift notice, escalate-on-critical), `ONBOARD.md` (scoping drafts),
  and `CURATE.md` (recurring review) — plus config, learnings file, and
  .gitignore entries.
- `stats` findings: falsified, promotion candidate, restates, dormant,
  unscoped (derive-mode drift), rewritten, family falsification.
- Zero dependencies · Node ≥ 18 · 120-check test suite.

`0.1.0` was published to npm from a pre-release tree by mistake and has been
unpublished; 0.1.1 is the first valid release.
