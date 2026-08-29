# FAQ

Real questions from first use. Short answers here; depth in [guide.md](guide.md), [how-akela-works.md](how-akela-works.md), and [DESIGN.md](DESIGN.md).

### Is Akela a RAG? Does it replace mine?

No, and no. Akela selects by *declared scope*, not similarity — there are no embeddings anywhere. If you have a RAG, keep it: plug it in as a retriever (one line in `akela.json`) and its results enter every slice as tracked sources. What a retrieved note keeps proving gets promoted into the wiki, retiring what it superseded — retrieval is how corrections travel; the wiki is where they live.

### If a wiki page isn't scoped, is it invisible? Never used?

Invisible to the **agent**, visible to **Akela's accounting** — and that's the design. Unscoped sections index but never pack; every `compile` prints how many exist, `stats` lists each as `unscoped`, and the onboarding protocol turns the list into scoping proposals. When missing knowledge actually bites, the agent closes the task `NEEDS_CONTEXT` — loud and fixable with one scoping decision. The trade: **missing knowledge announces itself; wrong knowledge never gets the chance** (a relevance guesser would fail silently instead).

### Do I have to tag everything by hand?

Scoping is required for Akela to do anything — but "required" ≠ "you, typing," and ≠ "everything." Three routes: `compiler.scope` in config (zero wiki edits), tags in the files, or your agent drafting both for your approval (*"Follow `akela/ONBOARD.md`"*). Ten well-scoped sections per activity is a working start; evidence (`unscoped` findings, `NEEDS_CONTEXT` outcomes) pulls in the rest as agents actually need it.

### I have a huge wiki — will scoping take forever?

No: cost scales with what agents need, not wiki size. The onboarding protocol tells the agent to triage from `akela index` (headings only, no bodies), use one file-level tag instead of forty section tags, and work one activity per review. Your review time is the bottleneck, and it comes in ten-minute portions. Meanwhile slice size scales with the rules relevant to a task, not with wiki size — in our test bed that meant ~150 tokens per task against a 365k-token wiki; your ratio will differ, but the shape holds.

### Once installed, does my agent automatically use Akela?

No — a file on disk does nothing; agents follow only what their harness loads. The entire integration is one line in your auto-loaded instruction file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`): **"Follow `akela/PROTOCOL.md` for every task."** `init` detects which file you have and prints the exact line. Only `PROTOCOL.md` goes there; `ONBOARD.md` and `CURATE.md` are invoked on demand, and the worker protocol itself points at them at the right moments.

### Where do the generated files live?

In your project: `akela.json` at the root; `LEARNINGS.md`, `PROTOCOL.md`, `ONBOARD.md`, `CURATE.md` under `akela/`. Commit them — they're the contract every agent and clone shares. `init` never overwrites existing ones, so your edits survive upgrades.

### When a rule is retired, is the text deleted?

Nothing is ever deleted by Akela, and nothing is forgotten. A retired *learning* keeps its text (status flip) and works as a tombstone — new captures recycling its phrasing or values are auto-rejected. A retired wiki *section* is removed by the curator (Akela can't edit the wiki), and its full history stays in the append-only log under an `absent` marker. Retired knowledge stops being **context** but remains **evidence**.

### How does Akela decide what to compile? Does it learn to rank?

It doesn't rank — deliberately. Selection is set logic: scope match + tier, with `must` as an untrimmable floor, and everything dropped is named in the manifest with a reason. What *learns* is the library, not the selector: the evidence loop retires what fails and promotes what proves out, so the same deterministic compile yields better slices over time. Every change in what an agent sees traces to a visible edit or a counted event — never a hidden weight. (An optional per-profile scoring stage exists, off by default, gated on the project's own outcome data, and it can never touch the floor.)

### If accuracy is similar to just stuffing everything in context, why use it?

Our own measurements say the dump wins raw accuracy by a hair — we print that. What you buy: context 250× smaller at any knowledge-base size (no window ceiling, no cache-luck economics), a knowledge base that's *provably* clean instead of attentionally lucky (the dump carried stale rules in ~2/3 of contexts and dodged them until it didn't), lower cost per correct answer, and slices small enough for a human to audit (ours ran ~150 tokens; sized by relevant rules, not by wiki size). If today's accuracy is all you measure and tokens are free, you don't need this tool.

### Can it run fully autonomously?

The loop unlearns, adopts corrections, and polices citation honesty on its own — but our replication experiments showed a closed loop can retire a *correct* rule on sincere wrong distrust, because no arithmetic can distinguish a bad rule correctly distrusted from a good rule wrongly distrusted. That distinction is ground truth itself. Supervised curation (agent drafts, you approve — ~ten minutes a week) is the validated configuration; unreviewed autonomous curation is experimental.

### Do I need a domain pack?

Probably not. Every pack field can live inline in `akela.json`; the `default` pack is a generic floor. Extract a pack file when a second project shares the vocabulary, or when you're shipping a tool on top of Akela. See [../domains/README.md](../domains/README.md).

### My agent compiled an empty slice — why?

Almost always a naming mismatch: the agent passed the name it *invoked* (a command, a skill) instead of the activity name your scopes use. Since 0.1.3 an empty compile warns loudly on stderr and lists the known scope tokens; if your tool's command names carry a prefix, set `aliasPrefixes` (e.g. `["qa-"]`) and the prefix is stripped deterministically, with a visible `activity alias:` notice.

### Can two knowledge roots share a namespace? And what about non-knowledge files inside a root?

One root per namespace — the refusal is deliberate, since the namespace prefixes every section id. Teams with multiple methodology directories give each its own namespace: `{ "path": "pay-docs", "namespace": "PAY" }` and `{ "path": "ops-docs", "namespace": "OPS" }` — ids stay unambiguous and scopes can still be shared words. And if a root contains files that aren't knowledge (vendored code, generated output), exclude them with root-relative globs: `"exclude": ["engine/**"]` — skipped at index time, listed by `akela check --json`, never silently.

### What's the footprint?

~1,600 lines of plain Node, zero dependencies, no build step, no service, no database. `npm publish`-to-`node` with nothing in between: what's published is what runs.
