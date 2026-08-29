#!/usr/bin/env node
/**
 * akela — a deterministic compiler over rectified context.
 *
 *   akela init      [--domain <pack>] [--knowledge <dir>]      write akela.json + LEARNINGS.md for this folder
 *   akela index     [--json]                                   list every addressable section (id · scope · tier)
 *   akela check     [--json]                                   validate config, roots, scope overrides, learnings — no run written
 *   akela vet       [--cap N] [--json]  < candidates.json       the capture gate: reject restatements/duplicates, cap the rest
 *   akela run-id    --activity <name> [--task <key>]           start a run, print its id
 *   akela compile   --activity <name> [--task <key>] [--everything]   → slice.md (+ manifest); --everything = dump-all baseline
 *   akela log       <applied|contradicted|captured|outcome> [<src>] [--note <text>] [--status <S>] [--run <id>]
 *   akela fp        <kind> <key> | --list                      record a failure fingerprint (falsification evidence)
 *   akela stats     [--since <YYYY-MM-DD>] [--json]            per-source counts + findings (distill arithmetic)
 *   akela gate      [--json]                                   is scored selection justified on THIS project's data?
 *   akela scoreboard                                           rebuild the derived cache
 *
 * `--skill` / `--ticket` are accepted as aliases of `--activity` / `--task`.
 * Env: AKELA_CWD (project root), AKELA_RUN (run id), AKELA_TS (fixed timestamp, tests).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { die, parseArgs, opt, nowIso } = require('../lib/util');
const config = require('../lib/config');

function cfg() { return config.load(); }

function cmdInit(args) {
  const root = config.cwd();
  const target = path.join(root, config.CONFIG_FILE);
  if (fs.existsSync(target)) die(`${config.CONFIG_FILE} already exists — edit it instead`);
  const domain = opt(args, 'domain') || 'default';
  const kdir = opt(args, 'knowledge');
  const knowledge = kdir ? [{ path: kdir, namespace: 'REF', untagged: 'derive' }] : [];
  const out = { domain, knowledge, learnings: 'akela/LEARNINGS.md', runs: '.akela/runs', compiler: {} };
  fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  const lp = path.join(root, out.learnings);
  if (!fs.existsSync(lp)) {
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.writeFileSync(lp, '# Learnings\n\nOne `## LRN-YYYYMMDD-NN: title` block per learning. Fields: Status · Scope · Statement · Overrides · Evidence · Fingerprint (optional) · Profile (optional).\n');
  }
  // Akela's daily operator is an agent, not a person: init writes the protocol the agent follows,
  // so wiring a harness is one line in its instructions ("Follow akela/PROTOCOL.md").
  const pp = path.join(path.dirname(lp), 'PROTOCOL.md');
  if (!fs.existsSync(pp)) fs.writeFileSync(pp, `# Knowledge protocol (Akela)

You (the agent) run this loop on every task. The compiled slice is your only source of domain
knowledge — it is the current, evidence-vetted view; do not read the wiki directly.

Before starting a task:
1. \`akela compile --activity <activity> --task <task-id>\` — prints the slice path.
2. Read that slice. Every rule in it has a source id (\`WIKI-…#…\`, \`LRN-…\`, \`EXT-…\`).

While working: note which rules you actually relied on, and any rule the outcome proved wrong.

After finishing:
3. \`akela log applied <source-id>\` — once per rule you relied on.
4. \`akela log contradicted <source-id> --note "<what happened — quote the disputed text verbatim>"\`
   — for any rule the outcome contradicted. Verbatim quotes make blame verifiable; paraphrase gets rejected.
5. If the environment gave you a verdict (review, CI, rejection), it applies to a specific rule
   you relied on — contradict that rule, do not just note the failure.
6. Learned something the slice did not contain? Check it first: \`akela vet\` (stdin: JSON array of
   candidate statements). Only statements it accepts are worth proposing as learnings.
7. \`akela log outcome --status DONE\` (or BLOCKED / NEEDS_CONTEXT) — closes the run.

If the compile summary reports unscoped sections and the count is new or has grown, the wiki
gained pages agents cannot see — mention it to the owner and offer to draft the scoping
(akela/ONBOARD.md). Do not treat it as an error; unscoped is a pending decision, not a failure.

Escalate, don't sit on it: if what you just logged is critical — you contradicted a must-tier
rule, closed BLOCKED or NEEDS_CONTEXT because knowledge was missing or wrong, or the slice
contained rules that contradict each other — tell the owner what you found and ask whether they
want the curation review (akela/CURATE.md) run now instead of waiting for the scheduled one.

Never edit the wiki, LEARNINGS.md, or the log files directly. You report; the counts recommend;
the curator decides.
`);
  // One-time onboarding protocol: the agent DRAFTS the initial scoping; the owner approves.
  // Akela's invariant holds — no command mutates knowledge; changes are deliberate acts by the owner.
  const ob = path.join(path.dirname(lp), 'ONBOARD.md');
  if (!fs.existsSync(ob)) fs.writeFileSync(ob, `# Onboarding protocol (Akela) — bringing knowledge into scope

You (the agent) are drafting knowledge scoping for the owner to review — either the initial
pass over a fresh install, or a later pass over whatever \`akela stats\` marks \`unscoped\`
(new pages accumulate; this protocol is how they get onboarded too).
You propose; the owner decides. Do not edit any wiki file or config without their approval.

1. Read \`akela.json\`. If \`activities\` is empty or missing, first study the project (its docs,
   its recurring kinds of work) and propose 3–7 activity names — the units of work agents will
   run here. Wait for approval before continuing.
2. Run \`akela index --json\` and read the wiki files it lists — or, on a re-run, only the
   sections \`akela stats\` marks \`unscoped\`. For each section, judge:
   - which activities actually need it → proposed \`scope\`
   - how critical it is → proposed \`tier\`: \`must\` only for rules an agent must never work
     without (keep this floor SMALL — every must packs on every matching task); \`should\` for
     the useful majority; \`context\` for background.
   - not knowledge an agent needs (changelogs, meeting notes, marketing) → leave unscoped.
3. Present the proposal as a review table — section id · proposed scope · proposed tier · one-line
   reason — plus, for the approved outcome, BOTH forms and let the owner pick:
   - config-only: a \`compiler.scope\` block for \`akela.json\` (no wiki edits), or
   - tags: the exact \`<!-- akela: id=… scope=… tier=… -->\` lines to insert per section.
4. Aim small: a working start is ~10 well-scoped sections per activity, not complete coverage.
   Anything missed will surface later as evidence (unscoped findings, NEEDS_CONTEXT outcomes) —
   growing scope on demand is the designed path.
5. On a LARGE wiki, do not read everything. Triage from the index first (\`akela index\` lists
   every section id and heading without the bodies); shortlist by heading; read only shortlisted
   files. Prefer one file-level tag (after the # H1) over per-section tags when a whole file
   serves one purpose. Work one activity at a time and deliver each as its own small review —
   the owner's review time, not your reading time, is the scarce resource.
6. After approval is applied, run \`akela index\` and \`akela compile --activity <one> --task TEST-1\`
   and show the owner the first slice — then this protocol is done; daily work follows PROTOCOL.md.
`);
  // Curation as a protocol: the agent drafts the review from the counts; the owner approves each edit.
  const cu = path.join(path.dirname(lp), 'CURATE.md');
  if (!fs.existsSync(cu)) fs.writeFileSync(cu, `# Curation protocol (Akela) — the review routine

You (the agent) are running a curation review for the owner. This is a RECURRING routine —
weekly or per sprint by default; with heavy daily task volume, more often is fine (an empty
review costs a minute), and run it early when contradictions or unscoped sections accumulate; if your harness supports scheduled or recurring tasks,
offer to set it up on that cadence, and at the end of each review remind the owner when the
next one is due. You draft; the owner approves.
Apply no edit without approval. The counts are honest, but honesty is not truth — your job is
to bring the owner evidence and a recommendation, not to act on arithmetic alone.

1. Run \`akela stats\`. Build the review queue from the finding column, in this order:
   falsified → unscoped → promotion candidates → restates → dormant (never applied).
2. For every FALSIFIED source, read its contradiction notes in the log before recommending.
   Distinguish: (a) the rule is genuinely stale → recommend rewrite or retirement;
   (b) the workers are wrong — common right after the owner has updated a rule (a fresh
   rewrite has few applied to defend itself) → recommend leaving it, and say why.
3. For every PROMOTION CANDIDATE, judge the statement itself: a concrete fact that earned its
   record → recommend promoting (write the section with from=<id> lineage, mark the learning
   promoted; for EXT- notes, also retire what they supersede). A vague hedge that free-rode
   being packed → recommend leaving or retiring it. The bar measures use, not truth.
4. For UNSCOPED sections: recommend a scope/tier if agents need it, or explicitly leave it out.
   For RESTATES: recommend retiring the learning or merging its delta into the section.
   For DORMANT: recommend narrower scope, lower tier, or retirement — it pays rent in every slice.
5. Present ONE review table — source · finding · recommendation · one-line reason — and wait.
6. Apply only what the owner approves, then run \`akela check\`. If check refuses, fix the cause
   or revert that edit; never leave the knowledge base failing check.
7. Close with a summary: edits applied, recommendations declined, and anything deferred.
`);
  const gi = path.join(root, '.gitignore');
  const ignore = ['.akela/', `${path.dirname(out.learnings)}/.cache/`];
  const existing = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const add = ignore.filter(l => !existing.split('\n').includes(l));
  if (add.length) fs.appendFileSync(gi, (existing && !existing.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n');
  // Nothing is automatic: an agent follows only what its harness loads. Name the exact file to wire.
  const instrFile = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', '.github/copilot-instructions.md'].find(f => fs.existsSync(path.join(root, f)));
  const wire = `add this line to ${instrFile || 'your agent\'s instruction file (CLAUDE.md, AGENTS.md, …)'}:\n  Follow ${path.dirname(out.learnings)}/PROTOCOL.md for every task.`;
  process.stdout.write(`${config.CONFIG_FILE} written (domain ${domain}${kdir ? `, knowledge ${kdir} in derive mode` : ', no knowledge roots yet'})\n${out.learnings} ready · ${path.dirname(out.learnings)}/PROTOCOL.md + ONBOARD.md + CURATE.md ready · .gitignore += ${add.join(' ') || '(nothing)'}\nnext — wire your agent (Akela does nothing until an agent is told to use it): ${wire}\nthen — for the initial scoping, tell your agent: "Follow ${path.dirname(out.learnings)}/ONBOARD.md" and review its proposal\n`);
}

function cmdIndex(args) {
  const c = cfg();
  const { index, errors } = require('../lib/index').build(c);
  if (errors.length) die(`knowledge roots:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  if (args.json) { process.stdout.write(JSON.stringify(index, null, 2) + '\n'); return; }
  const ids = Object.keys(index);
  if (!ids.length) { process.stdout.write(`no sections — ${c.roots.length ? 'roots are empty' : 'no knowledge roots configured in ' + config.CONFIG_FILE}\n`); return; }
  for (const id of ids) { const e = index[id]; process.stdout.write(`${id}\t${e.tier}\t${e.scope.join(',')}\t${e.lines} lines${e.derived ? '\t(derived)' : ''}\n`); }
  process.stderr.write(`${ids.length} sections across ${c.roots.length} root${c.roots.length === 1 ? '' : 's'}\n`);
}

// check — validate everything a compile would validate, without writing a run: config keys, every knowledge
// root parses, every compiler.scope id resolves (must-floor respected), retrievers are well-formed, learnings parse.
// Used by anything that edits the knowledge base programmatically (an expert agent, a CI step) before it commits.
function cmdCheck(args) {
  const c = cfg();
  const compileMod = require('../lib/compile');
  const index = compileMod.loadIndex(c);
  const overridden = compileMod.applyScopeOverrides(c, index);
  const r = c.compiler.retrievers;
  if (r !== undefined) { if (!Array.isArray(r)) die('compiler.retrievers must be an array'); r.forEach((x, i) => { if (!x || typeof x.name !== 'string' || !/^[a-z0-9-]+$/.test(x.name) || typeof x.cmd !== 'string' || !x.cmd.trim()) die(`compiler.retrievers[${i}]: needs a kebab-case "name" and a "cmd"`); }); }
  const learn = require('../lib/learnings').parse(c);
  const bad = learn.filter(l => !['active', 'promoted', 'retired'].includes(l.status));
  if (bad.length) die(`LEARNINGS.md: unknown Status on ${bad.map(l => `${l.id} ("${l.status}")`).join(', ')} — use active | promoted | retired`);
  // A dangling Overrides is a warning: retiring a section legitimately orphans the learnings that pointed at it
  // (the first supervised run had a correct retirement refused for this). Packing falls back to "after all sections".
  const dangling = learn.filter(l => l.status === 'active' && l.overridesRef && !index[l.overridesRef] && !/^LRN-/.test(l.overridesRef));
  if (dangling.length) process.stderr.write(`akela: warning — Overrides points at a section that no longer exists (learning still packs, at the end): ${dangling.map(l => `${l.id} → ${l.overridesRef}`).join(', ')}\n`);
  // Lineage links must be bidirectional: a promoted learning names its section (Promoted-to:), the section names it (from=).
  const byId = Object.fromEntries(learn.map(l => [l.id, l]));
  const lineage = [];
  for (const l of learn) {
    if (l.status === 'retired') continue; // a retired learning whose section is gone is the CORRECT end state of a family
    // retirement — refusing it handcuffed the D and E2-wiki experts for 47 correct edits (matrix, 2026-08-24).
    if (l.status === 'promoted' && !l.promotedTo) lineage.push(`${l.id} is promoted but has no Promoted-to: — name the section it became`);
    if (l.promotedTo && !index[l.promotedTo]) lineage.push(`${l.id} Promoted-to ${l.promotedTo}, which does not exist — retire the learning, or restore the section`);
    else if (l.promotedTo && index[l.promotedTo].from !== l.id) lineage.push(`${l.id} Promoted-to ${l.promotedTo}, but that section's tag says from=${index[l.promotedTo].from || '(none)'}`);
  }
  for (const [id, e] of Object.entries(index)) {
    if (!e.from || e.from.startsWith('EXT-')) continue; // a promoted retrieved note: lineage is one-way, the retriever owns no file
    if (!byId[e.from]) lineage.push(`${id} says from=${e.from}, which is not in LEARNINGS.md`);
    else if (byId[e.from].status !== 'retired' && byId[e.from].promotedTo !== id) lineage.push(`${id} says from=${e.from}, but that learning's Promoted-to is ${byId[e.from].promotedTo || '(none)'}`);
  }
  if (lineage.length) die(`lineage:\n${lineage.map(e => `  - ${e}`).join('\n')}`);
  const vetMod = require('../lib/vet');
  const restating = learn.filter(l => l.status === 'active').map(l => ({ l, hit: vetMod.restates(c, l, index) })).filter(x => x.hit);
  if (restating.length) process.stderr.write(`akela: warning — learnings that restate a section (dead weight; retire or merge): ${restating.map(x => `${x.l.id} → ${x.hit.id} (${x.hit.score})`).join(', ')}\n`);
  if (args.json) { process.stdout.write(JSON.stringify({ ok: true, sections: Object.keys(index).length, overrides: overridden.size, learnings: learn.length, active: learn.filter(l => l.status === 'active').length }) + '\n'); return; }
  process.stdout.write(`ok — ${Object.keys(index).length} sections across ${c.roots.length} root${c.roots.length === 1 ? '' : 's'}, ${overridden.size} scope override${overridden.size === 1 ? '' : 's'}, ${learn.length} learnings (${learn.filter(l => l.status === 'active').length} active)\n`);
}

// vet — the capture gate as arithmetic: candidate statements in (stdin JSON array of strings or {statement}),
// verdicts out. Rejects restatements of the knowledge base, duplicates of learnings or of other candidates,
// and everything past the per-pass cap. Deterministic; writes nothing. See lib/vet.js for the thresholds.
function cmdVet(args) {
  const c = cfg();
  const vetMod = require('../lib/vet');
  let raw = '';
  try { raw = require('fs').readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  if (!raw.trim()) die('vet reads candidate statements from stdin: a JSON array of strings or of {"statement": …}');
  let items;
  try { items = JSON.parse(raw); } catch (e) { die(`vet: stdin is not valid JSON: ${e.message}`); }
  if (!Array.isArray(items)) die('vet: stdin must be a JSON array');
  const statements = items.map(x => typeof x === 'string' ? x : x && x.statement).filter(x => typeof x === 'string' && x.trim());
  if (!statements.length) die('vet: no statements found');
  const cap = args.cap && args.cap !== true ? parseInt(String(args.cap), 10) : undefined;
  const out = vetMod.vet(c, statements, cap ? { cap } : {});
  if (args.json) { process.stdout.write(JSON.stringify(out, null, 2) + '\n'); return; }
  for (const v of out) process.stdout.write(`${v.verdict === 'accept' ? 'ACCEPT' : 'REJECT'}  ${v.verdict === 'accept' ? '' : v.verdict}${v.match ? ` (${v.match}${v.score !== undefined ? ` ${v.score}` : ''})` : ''}  ${v.statement.slice(0, 100)}\n`);
  const acc = out.filter(v => v.verdict === 'accept').length;
  process.stderr.write(`${acc}/${out.length} accepted\n`);
}

// Agents pass the name they invoked, and the invoked name need not equal the activity name
// (found live 2026-08-27: a model passed its installed command name for four straight runs and
// compiled empty slices silently). aliasPrefixes maps invoked names onto the activity vocabulary —
// deterministic prefix stripping, never fuzzy matching.
function resolveActivity(c, raw) {
  if (!raw) return { activity: raw, aliased: false };
  // A declared activity name is never an alias — a pack with prefix "qa-" may still have a real
  // activity "qa-review"; stripping it would misroute a canonical call.
  if (c.activities && c.activities.includes(raw)) return { activity: raw, aliased: false };
  for (const pre of c.aliasPrefixes || []) {
    if (raw.startsWith(pre) && raw.length > pre.length) return { activity: raw.slice(pre.length), aliased: true, raw };
  }
  return { activity: raw, aliased: false };
}

function cmdRunId(args) {
  const c = cfg();
  const { activity, aliased, raw } = resolveActivity(c, opt(args, 'activity', 'skill'));
  if (!activity) die('run-id requires --activity <name>');
  if (c.activities && !c.activities.includes(activity)) die(`unknown activity "${activity}" — this domain declares: ${c.activities.join(', ')}`);
  const r = require('../lib/log').startRun(c, activity, opt(args, 'task', 'ticket'));
  process.stdout.write(r.run + '\n');
  if (aliased) process.stdout.write(`  activity alias: ${raw} → ${activity}\n`);
}

function cmdCompile(args) {
  const c = cfg();
  const { activity, aliased, raw } = resolveActivity(c, opt(args, 'activity', 'skill'));
  if (!activity) die('compile requires --activity <name>');
  const r = require('../lib/compile').compile(c, activity, opt(args, 'task', 'ticket'), { everything: !!args.everything });
  // Drift notice: new derive-mode pages that no scope claims are invisible to agents. Compile is the
  // command an agent runs on every task, so it is where drift must be mentioned (a count, not a nag).
  const { index: idx } = require('../lib/index').build(c);
  const unscoped = Object.values(idx || {}).filter(e => e.derived && e.scope.includes('all') && e.tier !== 'must').length;
  process.stdout.write(`${config.rel(r.slicePath)}\n`);
  // Notices come AFTER the path: the first line of compile output is a contract (agents read it as the slice path).
  if (aliased) process.stdout.write(`  activity alias: ${raw} → ${activity}\n`);
  if (unscoped) process.stdout.write(`  note: ${unscoped} unscoped section${unscoped === 1 ? '' : 's'} (derive-mode, never packed) — \`akela stats\` lists them\n`);
  // An empty slice is almost always a naming problem, never silently fine (caught live 2026-08-27:
  // four runs proceeded unguided on a misnamed activity). Warn loudly; exit 0 — a legitimately empty
  // project must not fail, and the empty compiled event is itself evidence of the misfire.
  if (r.sources.length === 0) {
    const known = new Set();
    for (const e of Object.values(idx || {})) for (const sc of e.scope) if (sc !== 'all') known.add(sc);
    for (const l of require('../lib/learnings').parse(c)) if (l.status === 'active') for (const sc of l.scope) if (sc !== 'all') known.add(sc);
    process.stderr.write(`akela: warning — 0 sources: no section or active learning is scoped to activity '${activity}'. Known scope tokens: ${[...known].sort().join(', ') || '(none)'}\n`);
  }
  process.stdout.write(`  run ${r.run.run} · ${r.sources.length} sources (${r.sources.filter(x => x.tier === 'must').length} must, ${r.sources.filter(x => x.tier === 'lrn').length} learnings${r.sources.some(x => x.via && x.via.startsWith('retriever')) ? `, ${r.sources.filter(x => x.via && x.via.startsWith('retriever')).length} retrieved` : ''}) · ${r.used} lines · scratchpad ${config.rel(r.scratch)}\n`);
}

function cmdLog(args) {
  const c = cfg();
  const logMod = require('../lib/log');
  const [event, src] = args._;
  if (!event) die(`log requires an event: ${logMod.EVENTS.join(' | ')}`);
  if (!logMod.EVENTS.includes(event)) die(`unknown event "${event}". Use: ${logMod.EVENTS.join(' | ')}`);
  const { marker, run, activity } = logMod.currentRun(c, args, opt);
  const line = { v: 1, ts: nowIso(), run, activity, event };
  if (['applied', 'contradicted', 'captured'].includes(event)) {
    if (!src) die(`log ${event} requires a source id`);
    logMod.validateSrc(src, () => {
      const k = require('../lib/index');
      const { index } = k.build(c);
      return { index, nearest: (id) => k.nearestIds(id, index), namespaces: new Set(c.roots.map(r => r.namespace)) };
    });
    line.src = src;
  } else if (src) line.src = src;
  const note = opt(args, 'note');
  if (event === 'contradicted') { if (!note) die('log contradicted requires --note "<one line>"'); line.note = note; }
  else if (note) line.note = note;
  if (event === 'outcome') {
    const status = opt(args, 'status');
    if (!status || !c.statuses.includes(status)) die(`log outcome requires --status <${c.statuses.join('|')}>`);
    line.status = status;
  }
  const closed = logMod.outcomeOf(c, run);
  if (closed) die(`run "${run}" already reported an outcome (${closed.status} at ${closed.ts}) — refusing to append ${event}.\n  A run is closed by its outcome; later events belong to a new run.\n  Start one:  akela run-id --activity <name> [--task <KEY>]\n  Or target an open run explicitly:  --run <id>`);
  const pfp = opt(args, 'pfp'); if (pfp) line.pfp = pfp;
  const writer = opt(args, 'writer'); if (writer) line.writer = writer;
  logMod.appendEvent(c, line, marker);
  process.stdout.write(`${config.rel(c.logPath)} += ${event}${line.src ? ' ' + line.src : ''}${line.status ? ' ' + line.status : ''}\n`);

  // Gate-opened notification: an outcome is the only moment a profile's count can cross the §9.3 threshold.
  if (event === 'outcome') {
    try {
      const { computeGate } = require('../lib/stats');
      const { lines: all } = logMod.readLog(c, null);
      const fps = require('../lib/fingerprint').readFps(c).lines;
      const learn = require('../lib/learnings').parse(c);
      const after = computeGate(all, fps, learn);
      if (after.eligible && !computeGate(all.slice(0, -1), fps, learn).eligible) {
        process.stdout.write(`🔓 scoring gate OPENED on this project's data — this outcome tipped it: ${after.reason}\n`
          + '   The logs now hold enough evidence that scored selection COULD be justified here. Gain: leaner slices.\n'
          + '   Risk: knowledge that is correct but merely unused so far can be trimmed too — a human call.\n'
          + '   Run `akela gate`, classify each dormant source, then the owner sets compiler.scoring + budget_lines.\n'
          + '   Relay this to the owner in plain language, gain and risk both — never enable it yourself.\n');
      }
    } catch { /* the notification must never break logging */ }
  }
}

function cmdFp(args) {
  const c = cfg();
  const logMod = require('../lib/log');
  const fpMod = require('../lib/fingerprint');
  const { run, activity, dir } = logMod.currentRun(c, args, opt);
  if (args.list) {
    const mine = fpMod.readFps(c).lines.filter(l => l.run === run);
    if (!mine.length) { process.stdout.write(`no fingerprints for run ${run}\n`); return; }
    for (const l of mine) process.stdout.write(`${l.ffp}  ${l.kind}  ${l.key}${l.active && l.active.length ? `  active: ${l.active.join(', ')}` : ''}\n`);
    return;
  }
  const [kind, ...keyParts] = args._;
  if (!c.fingerprints.length) die('this domain declares no fingerprint kinds — add "fingerprints": ["…"] to akela.json or the domain pack');
  if (!kind) die(`fp requires a kind: ${c.fingerprints.join(' | ')}`);
  if (!c.fingerprints.includes(kind)) die(`unknown fingerprint kind "${kind}". Closed vocabulary: ${c.fingerprints.join(' | ')}`);
  const key = keyParts.join(' ').trim();
  if (!key) die(`fp ${kind} requires a key naming the failure class (e.g. "checkout/place-order-btn", "PROJ-12/AC3")`);
  const line = fpMod.record(c, { run, activity, dir }, kind, key, require('../lib/learnings').parse(c), nowIso());
  process.stdout.write(`${config.rel(c.fpPath)} += ${kind} ffp=${line.ffp}${line.active.length ? ` active=[${line.active.join(', ')}]` : ''}\n`);
  if (line.active.length) process.stdout.write(`  ↳ falsification evidence for ${line.active.join(', ')} — flag it; stats lists it as falsified (fingerprint)\n`);
}

function cmdStats(args) {
  const c = cfg();
  const logMod = require('../lib/log');
  const { computeStats, findingLabel } = require('../lib/stats');
  const since = opt(args, 'since');
  const { lines, malformed, manual } = logMod.readLog(c, since);
  const fpsAll = require('../lib/fingerprint').readFps(c);
  const fps = since ? fpsAll.lines.filter(f => !f.ts || f.ts.slice(0, 10) >= since) : fpsAll.lines;
  const learn = require('../lib/learnings').parse(c);
  const { index } = require('../lib/index').build(c);
  const stats = computeStats(lines, fps, learn, index);
  // A section that has been retired (deleted from the wiki) keeps its history in the log; mark it so a curator
  // is not asked to retire a ghost every pass (seen in the E2 mock: a dead id flagged falsified forever).
  const lrnIds = new Set(learn.map(l => l.id));
  for (const r of stats.rows) r.absent = r.kind === 'LRN' ? !lrnIds.has(r.src) : r.kind === 'EXT' ? false : !index[r.src];
  // A learning that merely restates a section is dead weight the capture gate should have caught — flag it for distill.
  const vetMod = require('../lib/vet');
  const byLrnId = Object.fromEntries(learn.map(l => [l.id, l]));
  for (const r of stats.rows) {
    if (r.kind !== 'LRN' || r.absent || !byLrnId[r.src] || byLrnId[r.src].status === 'retired') continue;
    const hit = vetMod.restates(c, byLrnId[r.src], index);
    if (hit) r.restates = hit;
  }
  const summary = { ...stats, events: lines.length, malformed, manual_writer: manual, log: config.rel(c.logPath), fingerprint_lines: fps.length, fingerprints_file: config.rel(c.fpPath) };
  if (args.json) { process.stdout.write(JSON.stringify(summary, null, 2) + '\n'); return; }
  const out = [];
  out.push(`log: ${summary.log} — ${lines.length} events, ${stats.runs_with_outcome} runs with outcome${malformed ? `, ${malformed} malformed (skipped)` : ''}${manual ? `, ${manual} manual-writer` : ''}`);
  if (Object.keys(stats.outcomes).length) out.push('outcomes: ' + Object.entries(stats.outcomes).map(([k, v]) => `${k}=${v}`).join(' '));
  out.push(`fingerprints: ${summary.fingerprints_file} — ${fps.length} lines, ${stats.fingerprints.length} distinct classes${fpsAll.malformed ? `, ${fpsAll.malformed} malformed (skipped)` : ''}`);
  out.push('', '| source | kind | in_slice | applied | contradicted | runs | last_applied | finding |', '|---|---|---|---|---|---|---|---|');
  for (const r of stats.rows) out.push(`| ${r.src}${r.absent ? ' (absent)' : ''} | ${r.kind} | ${r.in_slice} | ${r.applied} | ${r.contradicted} | ${r.runs} | ${r.last_applied || '—'} | ${r.absent ? 'history — no longer in the knowledge base' : [findingLabel(r), r.restates ? `restates ${r.restates.id} (${r.restates.score}) — retire or merge` : ''].filter(Boolean).join('; ')} |`);
  if (!stats.rows.length) out.push('| (no source events yet) | | | | | | | |');
  if (stats.fingerprints.length) {
    out.push('', 'fingerprint recurrence (same class across runs; `active` = learnings it falsified):', '| ffp | kind | key (last) | count | runs | active |', '|---|---|---|---|---|---|');
    for (const f of stats.fingerprints) out.push(`| ${f.ffp} | ${f.kind} | ${f.key} | ${f.count} | ${f.runs} | ${f.active.join(', ') || '—'} |`);
  }
  const comp = Object.entries(stats.compliance || {});
  if (comp.length) {
    out.push('', 'citation compliance (runs with outcome → with ≥1 section applied / with ≥1 learning applied):');
    let tr = 0, tref = 0;
    for (const [a, cc] of comp) { tr += cc.runs; tref += cc.with_ref; out.push(`  ${a}: ${cc.with_ref}/${cc.runs} sections, ${cc.with_lrn}/${cc.runs} learnings`); }
    out.push(`  overall: ${tref}/${tr}`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

function cmdGate(args) {
  const c = cfg();
  const { computeGate, GATE_MIN_PROFILES, GATE_MIN_OUTCOMES, GATE_APPLIED_RUNS, NEVER_APPLIED_MIN_IN_SLICE } = require('../lib/stats');
  const { lines } = require('../lib/log').readLog(c, null);
  const gate = computeGate(lines, require('../lib/fingerprint').readFps(c).lines, require('../lib/learnings').parse(c));
  if (args.json) { process.stdout.write(JSON.stringify(gate, null, 2) + '\n'); return; }
  const out = [];
  out.push("gate (RFC 0001 §9.3, evaluated on this project's logs):");
  out.push(`  profiles with attributed outcomes (need ≥ ${GATE_MIN_PROFILES}, each ≥ ${GATE_MIN_OUTCOMES}):`);
  if (!gate.profiles.length) out.push('    (none — no run has both a compiled profile and an outcome yet)');
  for (const p of gate.profiles) out.push(`    ${p.pfp}  ${p.outcomes} outcome${p.outcomes === 1 ? '' : 's'}${Object.keys(p.statuses).length ? ` (${Object.entries(p.statuses).map(([k, v]) => `${k}=${v}`).join(' ')})` : ''}`);
  if (gate.no_profile_runs) out.push(`    (${gate.no_profile_runs} outcome run${gate.no_profile_runs === 1 ? '' : 's'} without a compiled profile — reported, never summed into a profile)`);
  out.push('  application:');
  out.push(`    repeatedly applied (runs ≥ ${GATE_APPLIED_RUNS}): ${gate.applied_repeatedly.length} · dormant (in_slice ≥ ${NEVER_APPLIED_MIN_IN_SLICE} ∧ applied = 0): ${gate.dormant.length}`);
  for (const d of gate.dormant) out.push(`    dormant: ${d.src} (${d.kind})  in_slice ${d.in_slice}`);
  if (Object.keys(gate.slice_by_activity).length) {
    out.push('  slice size per activity (compiled events):');
    for (const [a, s] of Object.entries(gate.slice_by_activity).sort((x, y) => x[0].localeCompare(y[0]))) out.push(`    ${a}: last ${s.last} lines · mean ${s.mean} · ${s.compiles} compile${s.compiles === 1 ? '' : 's'}`);
  }
  out.push(`  verdict: ${gate.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'} — ${gate.reason}`);
  if (gate.eligible) {
    out.push('', '  This report assembles evidence; it does not classify causes.', '  Before scoring may be enabled, a human classifies each dormant source:',
      '    cannot fire / duplicated elsewhere / the matching work has not happened / selection failure.',
      '  RFC 0001 §9.3 reached its verdict only through that classification — a tool that guessed would repeat the error.');
  }
  process.stdout.write(out.join('\n') + '\n');
}

function cmdScoreboard() {
  const c = cfg();
  const { computeStats } = require('../lib/stats');
  const { lines } = require('../lib/log').readLog(c, null);
  const { lines: fps } = require('../lib/fingerprint').readFps(c);
  const stats = computeStats(lines, fps, require('../lib/learnings').parse(c), require('../lib/index').build(c).index);
  const per_source = {}, per_fingerprint = {};
  for (const r of stats.rows) per_source[r.src] = { in_slice: r.in_slice, applied: r.applied, contradicted: r.contradicted, last_applied: r.last_applied, runs: r.runs };
  for (const f of stats.fingerprints) per_fingerprint[f.ffp] = { kind: f.kind, key: f.key, count: f.count, runs: f.runs, active: f.active, first: f.first, last: f.last };
  fs.mkdirSync(path.dirname(c.scoreboardPath), { recursive: true });
  fs.writeFileSync(c.scoreboardPath, JSON.stringify({ v: 1, rebuilt_at: nowIso(), events: lines.length, fingerprint_lines: fps.length, per_source, per_fingerprint }, null, 2) + '\n');
  process.stdout.write(`${config.rel(c.scoreboardPath)} rebuilt — ${Object.keys(per_source).length} sources, ${Object.keys(per_fingerprint).length} fingerprint classes (derived; gitignore ${config.rel(path.dirname(c.scoreboardPath))}/)\n`);
}

function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (sub) {
    case 'init': return cmdInit(args);
    case 'index': return cmdIndex(args);
    case 'check': return cmdCheck(args);
    case 'vet': return cmdVet(args);
    case 'run-id': return cmdRunId(args);
    case 'compile': return cmdCompile(args);
    case 'log': return cmdLog(args);
    case 'fp': return cmdFp(args);
    case 'stats': return cmdStats(args);
    case 'gate': return cmdGate(args);
    case 'scoreboard': return cmdScoreboard(args);
    case '--version': case '-v': return process.stdout.write(require('../package.json').version + '\n');
    case undefined: case '--help': case '-h': case 'help':
      process.stdout.write(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 18).map(l => l.replace(/^ \* ?/, '')).join('\n') + '\n');
      return;
    default: die(`unknown subcommand "${sub}" (init | index | check | vet | run-id | compile | log | fp | stats | gate | scoreboard)`);
  }
}

if (require.main === module) {
  process.stdout.on('error', (e) => { if (e && e.code === 'EPIPE') process.exit(0); throw e; });
  main();
}
