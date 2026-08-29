# Domain packs

A pack answers one question: **what kind of work happens here?** It names the vocabulary Akela
counts with — it contains no knowledge (that lives in your wiki) and no tuning (there is none).

```jsonc
{
  "name": "ops",
  "activities": ["triage", "deploy", "postmortem"],   // the units of work agents run
  "profile": {                                        // deterministic probes: task id → traits
    "env": [ { "task": "^PROD-", "value": "prod" }, { "value": "staging" } ]
  },
  "fingerprints": ["wrong-runbook", "stale-threshold", "missing-context"],  // closed failure vocabulary
  "statuses": ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"],   // how a run may end
  "scratchpad": ["Plan", "State", "Findings", "Candidate learnings"]        // sections of the run scratchpad
}
```

## You probably don't need a pack file

Every pack field can be declared **inline in `akela.json`**, and inline values override the pack.
`default.json` (the only pack that ships) is just a generic floor. The typical adoption ladder:

1. **Day one:** `domain: "default"` plus inline `activities` / `profile` / `fingerprints` in your
   `akela.json`. This is a complete setup; most projects never leave this step.
2. **Second project in the same domain:** extract those fields into a JSON file and point at it —
   `"domain": "./ops-pack.json"` (any path works; built-in names resolve to this folder).
3. **Building a tool on top of Akela:** ship your pack with your tool, so your users get a
   configured domain without ever seeing these fields.

The ownership rule behind the ladder: **a pack belongs to the domain that defines it, not to the
engine.** That's why this folder contains only `default.json`.

## What a pack deliberately cannot do

No pack — and no `akela.json` — can change the evidence arithmetic: the promotion bar
(applied ≥ 3 across ≥ 3 runs, 0 contradicted), the falsification recency window, or the capture
gate's containment thresholds. Those are constants in code: a pack names your
world; it cannot make the evidence easier to satisfy.

## Field reference

| field | what it names | used by |
|---|---|---|
| `activities` | the closed list of work types; `compile --activity` must name one | selection (scope matching) |
| `profile` | ordered probes mapping a task id to trait values; first match wins, last entry is the fallback | profile-gated learnings (`Profile: env=prod`), per-profile scoring |
| `fingerprints` | the closed vocabulary of failure classes for `akela fp` | recurrence-based falsification evidence |
| `statuses` | allowed values for `akela log outcome` | outcome tracking, scoring eligibility |
| `scratchpad` | section headings of the per-run scratchpad file | run scaffolding |
| `aliasPrefixes` | prefixes stripped off invoked activity names (`qa-exploratory` → `exploratory`) — agents pass the name they invoked, which need not equal the activity name | compile, run-id |
| `knowledge`, `learnings`, `runs`, `idTag` | path defaults a tool may preset for its users | config layering |
