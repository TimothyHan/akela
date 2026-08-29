# Akela

**A deterministic compiler over rectified context.**

[![tests](https://github.com/TimothyHan/akela/actions/workflows/ci.yml/badge.svg)](https://github.com/TimothyHan/akela/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/akela)](https://www.npmjs.com/package/akela) ![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-brightgreen)

Akela is a **context compiler** for AI agents and a learning layer that grows beside your markdown knowledge base — a wiki, a references folder, a team playbook. It compiles exactly the context slice an agent needs for each run, and keeps per-rule evidence that decides what stays knowledge. Agents *propose* what they learned. Evidence *gates* what holds up. Someone *decides* what becomes knowledge — a domain expert, or, unattended, a curator agent working only from the counts.

Akela is not a RAG. If you already use one, keep it — retrieved results enter the slice as just another knowledge source, tracked like the rest.

It is the opposite of autonomous agent memory. Nothing here writes your knowledge base, ranks it by similarity, or learns behind your back:

- **Deterministic selection.** Same inputs → same slice, every time. No embeddings, no LLM step. Every compile writes a manifest of what was packed *and what was dropped, and why*.
- **Evidence, not recurrence.** A learning becomes a promotion candidate when runs *applied* it (≥ 3, across ≥ 3 runs) and nothing *contradicted* it. A learning gets flagged as falsified when runs contradict it or the failure it claimed to prevent happens again.
- **Supervised by design; unattended with eyes open.** With a person in the loop, promotion and retirement are human edits informed by the counts — this is the validated configuration. A curator agent *can* make the same edits from the same counts, and in our experiments the unattended loop unlearned, adopted corrections, and policed citation honesty entirely on its own — but a 3-seed replication also showed it sometimes retires a correct, freshly-updated rule on sincere wrong distrust, because no arithmetic inside a closed loop can tell a bad rule correctly distrusted from a good rule wrongly distrusted. Treat autonomous curation as experimental; the counts are the recommendation, a reviewer is the decision.
- **Your wiki stays yours.** Akela indexes it; it never rewrites it. An existing markdown folder plugs in with zero edits.

Born inside a QA automation tool, where the loop ran on real work first; extracted and generalized so any domain — support, ops, research, QA — can run it. Zero dependencies, Node ≥ 18.

## Quick start

Akela has two users with different jobs: **you** set it up and curate; **your agent** operates it on every task.

**You, once — install and point it at your knowledge:**

```bash
npx akela init --knowledge wiki   # akela.json + LEARNINGS.md + the three agent protocols (PROTOCOL, ONBOARD, CURATE)
#   --knowledge <dir>  path to your existing markdown folder — wiki/, docs/, kb/, notes/, anything
#   --domain <pack>    optional domain pack name or JSON path (default: "default")
#   RAG is not an init flag — plug yours in after, one line in akela.json ("RAG, if you have one" below)
npx akela index                   # every addressable section: <NS>-<file>#<id>  tier  scope
```

**You, once — wire your agent.** `init` wrote the operating protocol to `akela/PROTOCOL.md` **inside your project** (next to `LEARNINGS.md`; commit it). A file on disk does nothing by itself — an agent follows only what its harness loads — so the wiring is one line in the instruction file your agent auto-loads (`CLAUDE.md` for Claude Code, `AGENTS.md`, `.cursorrules`, or your system prompt):

> Follow `akela/PROTOCOL.md` for every task.

That line is the entire integration; without it, Akela is installed but unwired. (`init` detects your instruction file and names it.)

**You + your agent, once — scope the knowledge.** An unscoped wiki packs nothing (Akela never guesses relevance). `init` also wrote `akela/ONBOARD.md` — tell your agent *"Follow `akela/ONBOARD.md`"* and it drafts the initial scoping (which sections serve which activities, at what tier) as a review table; you approve, and the approved scoping is applied as config or tags. Ten well-scoped sections is a working start.

**Your agent, every task — automatically, per the protocol:**

```bash
akela compile --activity support --task T-123    # → slice.md: its only source of domain knowledge
# … works the task from the slice …
akela log applied WIKI-refunds#under-50          # "I relied on this rule"
akela log contradicted LRN-20260822-01 --note "…"  # "the outcome proved this rule wrong" (verbatim quote)
akela log outcome --status DONE                  # closes the run
```

**You, ten minutes a week — curate from the counts:**

```bash
akela stats      # per-source evidence + findings: promotion candidate · falsified · restates · dormant
akela check      # validates the knowledge base after your edits
```

The counts recommend; you decide — and even the review legwork is delegatable: `init` also writes `akela/CURATE.md`, so *"Follow `akela/CURATE.md`"* turns the whole routine into an agent-drafted table you approve.

### The whole cycle, agent-driven

`init` generates three protocols; your agent runs the cycle, and you supply only judgment — one review table and a yes/no at each decision point:

| moment | who acts | protocol |
|---|---|---|
| every task | agent: compile → work from the slice → log evidence | `PROTOCOL.md` |
| initial scoping, and whenever new pages appear | agent drafts scope/tier, you approve (every `compile` reports unscoped drift, so new pages are noticed within hours) | `ONBOARD.md` |
| critical finding mid-task | agent asks whether to run the review now | `PROTOCOL.md` → `CURATE.md` |
| weekly (or per sprint) | agent runs stats, reads the notes, hands you one review table; approved edits applied and validated | `CURATE.md` |

The division is the design: **the agent drives everything except judgment; you supply only judgment, and only when there's evidence to judge.** Full walkthrough: [docs/guide.md](docs/guide.md).

## How it fits together

For the full picture in diagrams — the evidence loop, selection, a rule's life, and how retrieved notes graduate — see [docs/how-akela-works.md](docs/how-akela-works.md). For day-to-day usage (tagging, the agent protocol, the curation routine) see [docs/guide.md](docs/guide.md). Quick answers to first-use questions: [docs/faq.md](docs/faq.md). Shipping Akela inside your own tool: [docs/embedding.md](docs/embedding.md).

```
 your markdown (wiki / references)          ← you author; Akela indexes
 ───────────────────────────────────
 LEARNINGS.md        LRN-20260822-01 …      ← proposed by runs; promoted or retired by you
 ───────────────────────────────────
 akela compile  →  slice.md + manifest      ← deterministic; must-floor, scope, project overrides
 akela log / fp →  learnings-log.jsonl      ← read path writes back: applied · contradicted · outcome
 akela stats    →  findings                 ← arithmetic, not judgement; you approve every change
```

### Addressable sections

Every `##` in a knowledge root is a source with a stable id. Two ways to get there:

- **Tagged** — the line after a heading carries `<!-- akela: id=refunds-under-50 scope=support tier=must -->`. Ids are explicit; parse errors are loud. (The legacy `qab:` tag name is accepted for content migrated from the parent tool.)
- **Derived** (`"untagged": "derive"`) — ids come from heading slugs; scope defaults to `all`, tier to `should`. Zero edits to an existing wiki. Derived sections contribute nothing until you scope them (`compiler.scope`), and show up under `dropped: general-scope` in every manifest until you do — selection is yours, not the indexer's.

### Domain packs

A pack says what kind of work happens here: the activities, the deterministic profile probes, the closed vocabulary of failure fingerprints, the outcome statuses. `domains/default.json` has no probes and a generic vocabulary. Every pack field can also be declared inline in `akela.json` (inline wins), so most projects never write a pack file at all; extract one when a second project shares the vocabulary, and point `"domain"` at any JSON path. A pack belongs to the domain that defines it, not to the engine — a tool built on Akela ships its own pack to its own users. Full concept and field reference: [domains/README.md](domains/README.md).

```jsonc
{
  "domain": "default",
  "knowledge": [
    { "path": "references", "namespace": "REF" },
    { "path": "wiki",       "namespace": "WIKI", "untagged": "derive" }
  ],
  "learnings": "akela/LEARNINGS.md",
  "runs": ".akela/runs",
  "activities": ["support", "triage"],
  "profile": { "tier": [ { "task": "^VIP-", "value": "vip" }, { "value": "standard" } ] },
  "fingerprints": ["wrong-answer", "stale-rule", "missing-context"],
  "compiler": {
    "scope": { "WIKI-refunds#under-50": { "add": ["support"] } },
    "retrievers": [ { "name": "rag", "cmd": "node scripts/retrieve.js" } ]
  }
}
```

### RAG, if you have one

A retriever is any command. It gets `{activity, task, profile}` on stdin and returns `[{id, heading, text}]`. Its items enter the slice as `EXT-<name>#<id>`, tier `context`, after the floor, marked `via: retriever:<name>` — and they are cited and counted like every other source. Akela never lets a retriever remove or reorder anything; it lets the retriever *audition*, and your run logs decide whether what it surfaced was ever applied.

## Measured, not promised

The whole claim set was put through our experiments: three isolated agents — a trainee that works tasks, a curator that reads `akela stats`, a silent script that updates the source when the world shifts — and a deterministic grader outside the loop, run across many conditions and seeds with every result archived. The full experiment program (harness, task beds, result archives, findings) will be published separately.

The buyer's table — files / maintained wiki / RAG, each **without → with** Akela, same bed, same model, same grader, after the rules change:

| | files | maintained wiki | RAG |
|---|---|---|---|
| accuracy | 0.53 → 0.51 | 0.96 → 0.90 | 0.89 → 0.81 |
| stale rules in context | 26/26 → 21/26 | **17/26 → 2/26** | 23/26 → 21/26 |
| context tokens / task | 35,690 → **139** | 35,773 → **138** | 35,772 → **201** |
| $ / correct answer | $2.37 → **$1.48** | $1.17 → **$0.81** | $1.45 → **$1.02** |

Stated honestly, in the order the data forces:

- **Maintenance beats tooling.** The biggest jump anywhere is unmaintained files → maintained wiki (0.53 → 0.96), from nothing but someone keeping the source current. Akela's job is making that affordable and provable, not replacing it.
- **On raw accuracy, dumping everything wins every pair by a hair** — and stayed flat to 353k tokens/task in a scaling test. If today's accuracy is all you measure and tokens are free, you don't need this tool.
- **Akela wins everything structural, in every pair:** context 257× smaller at any knowledge-base size, better cost per correct answer, and a knowledge base that is *provably* clean (2/26 → 0/26 stale at 10× scale) instead of attentionally lucky (the dump carried stale rules in 17–19 of 26 contexts at every scale and dodged them until it didn't).
- **Unlearning works unattended; relearning needs the source.** With accept/reject alone the trainee ends, honestly, at "rule absent". Corrections that arrive through the wiki are adopted without anyone being told (r=0 on trusted classes); retrieved corrections graduate into the wiki through the promotion path.
- **The residual failure is epistemic, reproduced 3/3:** a correct, freshly-updated rule can be retired on sincere wrong distrust — accurate quotes, correct attribution, honest counting, wrong outcome. Every mechanism checks whether evidence is honest; none can check whether it is right. That is why the curator exists.

## Design

[docs/DESIGN.md](docs/DESIGN.md) — the problem, the design principles, the architecture with diagrams, and the reasoning behind every non-obvious decision — including the failures each one answers and the limits stated honestly.

## Status

`0.1.0` — engine extracted, generalized, and hardened by the experiment program; 120-check test suite. The evidence loop is version-scoped (blame binds to the content hash a run actually saw; rewrites start clean), the capture gate is Unicode-aware arithmetic validated against an out-of-domain Korean corpus and an adversarial bed, and a byte-level replay showed the extracted engine reproducing its parent tool's real recorded compile slices exactly. Every non-obvious design decision was forced by an observed failure and is recorded with its reason in [docs/DESIGN.md](docs/DESIGN.md) §5. Known open items: an evidence-only `stats` view for large knowledge bases (the full table grows with corpus size), tombstones for values removed by page edits, and a promotion bar that requires surviving disconfirmation — the last two are the research frontier the replication named.

## License

MIT
