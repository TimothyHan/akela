# Changelog

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
