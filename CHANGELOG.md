# Changelog

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
