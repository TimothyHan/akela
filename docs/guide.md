# Using Akela day to day

Akela is agent-driven by design: `init` generates three protocols (`PROTOCOL.md`, `ONBOARD.md`, `CURATE.md`), your agent runs the whole cycle by following them, and you supply only judgment — a review table and a yes/no at each decision point. The cycle:

| moment | who acts | protocol |
|---|---|---|
| every task | agent: compile → work from the slice → log evidence | `PROTOCOL.md` |
| initial scoping · new pages appear | agent drafts scope/tier, you approve | `ONBOARD.md` |
| critical finding mid-task | agent asks whether to review now | `PROTOCOL.md` → `CURATE.md` |
| weekly / per sprint | agent drafts the review, you approve, it applies + validates | `CURATE.md` |

Your time budget: about an hour at setup, then roughly ten minutes per review. This guide covers each stage.

## 1 · Setup: point it at your knowledge, tag what matters

```bash
npx akela init --knowledge wiki     # akela.json + LEARNINGS.md + the three agent protocols (PROTOCOL, ONBOARD, CURATE)
#   --knowledge <dir>  any existing markdown folder — wiki/, docs/, kb/, notes/ — indexed as-is, no edits needed
#   --domain <pack>    optional: a domain pack name or JSON path (see domains/README.md); default "default"
#   RAG: not an init flag — added after, one line in akela.json (see Retrievers below)
npx akela index                     # lists every addressable section
```

An existing markdown folder plugs in with zero edits (`untagged: "derive"` mode) — but derived sections are scope-`all` and don't pack until you scope them, deliberately: Akela never guesses relevance. To make a section real knowledge, tag it:

```markdown
## Refund approval
<!-- akela: id=approval scope=refund,damaged tier=must -->
Rule: refund requested under $25 and order within 14 days → approve; ...
```

- **`scope`** — which activities this applies to (`all` for everything). Activities are whatever units of work your domain has: `refund`, `deploy`, `triage`… declared in `akela.json`.
- **`tier`** — `must` (the floor: always packed for its scope), `should` (packed on scope match), `context` (background; packed after the rest).

A file-level tag after the `# H1` sets defaults for the whole file.

**Do I have to tag by hand?** Tagging is required for Akela to do anything — an unscoped wiki indexes cleanly but packs nothing, deliberately: Akela never guesses which sections matter for which work, because a silent wrong guess is exactly the failure this tool exists to prevent. But "required" doesn't mean "you, typing." Three ways, least to most invasive:

1. **Scope from config, zero file edits:** `"compiler": { "scope": { "WIKI-refunds#approval": { "add": ["refund"] } } }` in `akela.json` — the wiki files stay untouched.
2. **Tag the files** as above — best when you own the wiki and want the scoping visible next to the content.
3. **Have your agent draft the tags** — `init` writes a one-time protocol for exactly this: tell your agent *"Follow `akela/ONBOARD.md`"* and it will study the wiki, propose scope/tier per section (in both config-only and tag form), and hand you a review table. Your approval keeps selection in the owner's hands.

**What one tag buys:** the section becomes real knowledge in four senses — it reaches the right tasks in a ~150-token slice instead of a whole-wiki dump; `must` becomes a delivery *guarantee*, provable from every manifest; it becomes an evidence-bearing unit that can be counted, falsified, retired, or promoted (untagged text can't earn or lose anything); and its staleness becomes measurable instead of a vibe.

Start small: tag the ten pages your agent actually needs; leave the rest derived and bring sections into scope as evidence shows they're missed (`stats` will tell you — that's the point).

Optional, in `akela.json`:
- **Profiles** route variant knowledge: `"profile": { "plan": [{ "task": "^PRO-", "value": "pro" }, ...] }` — a learning with `Profile: plan=pro` then packs only for matching tasks.
- **Retrievers** plug in RAG: `"compiler": { "retrievers": [{ "name": "updates", "cmd": "node retrieve.js" }] }` — your command gets the activity/task/profile on stdin and returns `[{ id, heading, text, supersedes? }]`.

## 2 · The agent protocol: compile → work → log

Akela's daily operator is your agent, not you — the loop only works if the agent runs it on every task. `akela init` writes the full protocol to `akela/PROTOCOL.md`; wiring it up is one line in your agent's instructions (`CLAUDE.md` / `AGENTS.md`): **"Follow `akela/PROTOCOL.md` for every task."** The protocol it writes:

The shape of the loop it prescribes:

```bash
akela compile --activity <activity> --task <id>   # before the task — the slice is the agent's ONLY knowledge source
# … work the task from the slice …
akela log applied <source-id>                     # once per rule relied on
akela log contradicted <source-id> --note "…"     # for any rule the outcome disproved — quoting the text verbatim
akela log outcome --status DONE                   # closes the run (or BLOCKED / NEEDS_CONTEXT)
```

The generated `akela/PROTOCOL.md` is the single source of truth — beyond the loop above it also covers: routing environment verdicts (reviews, CI, rejections) to the specific rule relied on; vetting candidate learnings before proposing them; noticing unscoped drift (every `compile` prints a count of sections no scope claims — the agent offers an onboarding draft when it appears or grows); **escalating instead of sitting on critical evidence** — a contradicted `must` rule, a task blocked on missing knowledge, or mutually contradictory rules in one slice make the agent ask whether to run the curation review now; and the standing prohibition on editing knowledge files directly. Don't paste a copy into your instructions; reference the file, so protocol updates reach every agent through the repo.

Two rules of thumb from our experiments, both learned the hard way:

- **Name the channel explicitly.** An agent told "you have exactly these inputs" will ignore a feedback file sitting next to them. If your environment produces verdicts (review results, CI failures, customer rejections), the instructions must say where they are and that a rejection should become a `contradicted` on the specific rule relied upon.
- **Require the quote.** A contradiction that quotes the disputed text verbatim can be verified mechanically; one that paraphrases can blame the wrong rule. Roughly one retirement in three in our no-quote runs was misattributed blame.

## 3 · The curation routine: read the counts, decide, edit

Weekly, or per sprint — and you can delegate the legwork: `init` writes `akela/CURATE.md`, so triggering a review is telling your agent *"Follow `akela/CURATE.md`"* (in Claude Code, a one-line skill or slash command wrapping that sentence makes it `/curate`). The agent runs stats, reads the contradiction notes, and hands you one review table; you approve, it applies and validates. Or run it yourself:

```bash
akela stats
```

The `finding` column is the recommendation queue. What each finding means and what to do:

| finding | meaning | your move |
|---|---|---|
| `falsified` | contradicted in ≥2 distinct runs *and* recently (2 of the last 3 that touched it) | Read the contradiction notes first. If the rule is genuinely stale: fix the wiki (rewrite the section, or delete it and mark related learnings `retired`). If the *workers* are wrong — it happens, especially right after you've updated a rule — leave it; the rewrite's clean record will outvote stale distrust |
| `promotion candidate` | applied ≥3 times across ≥3 runs, never contradicted | If it's a real fact: write it into the wiki as a section with `from=LRN-…` in the tag, set the learning's status to `promoted`. If it's a vague hedge that free-rode being packed: leave it or retire it — the bar measures use, not truth |
| `promotion candidate → wiki (retire X)` | a retrieved note keeps winning and claims to supersede section X | Write the note's content into the wiki, retire X. This is RAG graduating into canon |
| `restates <section>` | a learning that duplicates a wiki section | Retire the learning or merge the delta into the section |
| dormant (delivered, never applied) | packed every run, used never | Scope it tighter, demote its tier, or retire it — it's paying rent in every slice |
| `unscoped (derive-mode)` | a page was added (or grew a section) that no scope claims — it never packs, and agents can't see it | Scope it (tag or `compiler.scope`) if agents need it; leave it if it isn't agent knowledge. This is how new pages surface — writing a page doesn't require remembering to tag it |

Then validate before the edit lands (or make your agent do this before accepting its own edits):

```bash
akela check
```

`check` refuses malformed ids, broken lineage, and invalid statuses — and passes the legitimate end-states (a retired family, a dangling override) that a stricter validator would wrongly block.

**How tags stay managed over time:** editing a page needs no tag work — tags travel with the section, and a rewrite is handled by evidence version-scoping automatically. A **new page** (or new section) in a derive-mode root is noticed immediately — every `compile` prints a one-line count of unscoped sections, and the worker protocol tells the agent to offer an onboarding draft when it appears or grows — and it surfaces in the next `akela stats` as `unscoped` — so authors just write, and curation decides later whether it's agent knowledge; in a tagged (`refuse`) root, a missing tag is a loud index error instead, which suits wikis where every section is agent-facing. **RAG needs no tags at all**: retrieved items are auto-assigned `EXT-` ids at `context` tier, and the only declaration a retriever makes is what a result `supersedes`. If a scoping backlog builds up, re-run the onboarding draft: *"Follow `akela/ONBOARD.md` for the unscoped sections in `akela stats`."*

**Retirement mechanics:** a learning retires by flipping `Status: retired` in `LEARNINGS.md` — the text stays, and the vet gate uses it as a tombstone (a new capture recycling its numbers or phrasing is auto-rejected). A wiki section retires by removing it from the page; Akela marks its history `absent` and keeps every event it ever earned in the append-only log.

**When you rewrite a rule** (thresholds changed, policy updated): just edit the section. Evidence is version-scoped — the rewrite starts with a clean record, and blame earned by the old text is set aside as `prior_versions`. One caution from our replication runs: agents that struggled *before* your correction may sincerely distrust it *after*. When a freshly-rewritten rule shows `falsified`, read the notes before acting — the counts are honest, but honesty is not truth, and fresh corrections deserve the benefit of the doubt.

## 4 · What to expect

From our measurements (Sonnet-class agent, 60-task runs): compiled slices run ~100–200 tokens regardless of knowledge-base size; accuracy is on par with stuffing everything into context (within ~0.1); what you gain is a knowledge base that stays *provably* current — stale rules measurably out of context instead of papered over by attention — with lower cost per correct answer and slices a human can actually read. The loop's known limit, reproduced three of three times: it cannot distinguish a bad rule correctly distrusted from a good rule wrongly distrusted. That judgment is the curator's job — which is to say, for now, yours.
