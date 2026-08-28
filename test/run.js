#!/usr/bin/env node
'use strict';
/**
 * Akela tests — zero dependencies. Fixture: QABuddy's real reference files (test/fixtures/qa-refs)
 * under the `qa` domain pack, so the QA-parity block proves the extraction changed nothing;
 * the generic blocks prove the parts QABuddy never had (derived wikis, retrievers, default domain).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'akela.js');
const REFS = path.join(ROOT, 'test', 'fixtures', 'qa-refs');
let passed = 0, failed = 0;
function check(cond, msg, detail) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.log(`  ✗ ${msg}${detail ? `\n      ${detail}` : ''}`); } }

function project(cfg, files = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akela-'));
  if (cfg) fs.writeFileSync(path.join(tmp, 'akela.json'), JSON.stringify(cfg));
  for (const [rel, content] of Object.entries(files)) { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); }
  const env = { ...process.env, AKELA_CWD: tmp, AKELA_TS: '2026-08-22T00:00:00Z' };
  const run = (args, extra, stdin) => execFileSync(process.execPath, [BIN, ...args], { env: { ...env, ...(extra || {}) }, encoding: 'utf8', ...(stdin !== undefined ? { input: stdin } : { stdio: ['ignore', 'pipe', 'pipe'] }) });
  const fails = (args, extra) => { try { run(args, extra); return null; } catch (e) { return e.status !== 0 ? String(e.stderr || '') : null; } };
  const manifest = (slicePath) => {
    const slice = fs.readFileSync(slicePath, 'utf8');
    const fm = slice.split('\n---\n')[0];
    const sources = (fm.split('\nsources:\n')[1] || '').split('\ndropped:')[0];
    const dropped = fm.split('\ndropped:')[1] || '';
    return { slice, fm, sources, dropped, ids: [...sources.matchAll(/^  - id: (\S+)/gm)].map(m => m[1]), droppedIds: [...dropped.matchAll(/^  - id: (\S+)/gm)].map(m => m[1]) };
  };
  const compile = (args) => { const out = run(['compile', ...args]); return { out, ...manifest(path.join(tmp, out.split('\n')[0].trim())), slicePath: path.join(tmp, out.split('\n')[0].trim()) }; };
  return { tmp, run, fails, compile, manifest, rm: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

const QA = { domain: path.join(ROOT, 'test', 'fixtures', 'qa-pack.json'), knowledge: [{ path: REFS, namespace: 'REF' }] }; // the origin pack is part of the fixture, not the product
const LEARNINGS = [
  '# Project Learnings', '',
  '## LRN-20260801-01: applies to test-cases', '- **Status:** active', '- **Scope:** test-cases, qa', '- **Statement:** seed via API', '- **Overrides:** REF-playwright-patterns#must-rules (extends)', '- **Evidence:** run', '',
  '## LRN-20260801-02: retired one', '- **Status:** retired', '- **Scope:** all', '- **Statement:** old', '- **Overrides:** none', '- **Evidence:** run', '',
  '## LRN-20260801-03: profile-narrowed (surface=api)', '- **Status:** active', '- **Scope:** all', '- **Statement:** api only', '- **Overrides:** none', '- **Evidence:** run', '- **Profile:** surface=api', '',
  '## LRN-20260801-04: scope all, no profile', '- **Status:** active', '- **Scope:** all', '- **Statement:** everywhere', '- **Overrides:** none', '- **Evidence:** run', '',
].join('\n');

// ── 1. QA parity: the compile step behaves exactly as QABuddy's qab.js (RFC 0001 PR5) ───────────
function testQaParity() {
  console.log('\n🧩 QA parity — compile under the qa pack (ported from QABuddy test.js)');
  const p = project(QA, { 'features-kb/LEARNINGS.md': LEARNINGS, 'playwright/AUTOMATION.md': '# decisions\n', 'playwright/pom/x.page.ts': '' });
  try {
    const index = JSON.parse(p.run(['index', '--json']));
    check(Object.keys(index).length > 50 && Object.values(index).every(e => e.tier && e.scope.length), `index builds from the fixture root (${Object.keys(index).length} sections)`);
    const c = p.compile(['--skill', 'test-cases', '--ticket', 'PROJ-1']);
    const runDir = path.dirname(c.slicePath);
    check(/test-cases-PROJ-1-[0-9a-f]{6}$/.test(runDir), 'run dir name = <activity>-<task>-<6hex> (--skill/--ticket aliases accepted)');
    for (const f of ['profile.json', 'scratchpad.md', 'events.jsonl']) check(fs.existsSync(path.join(runDir, f)), `run dir has ${f}`);
    check(/^---\nmanifest: 1\n/.test(c.slice) && /scoring: off/.test(c.fm) && /budget: \{max: 0, used: \d+\}/.test(c.fm), 'manifest: version, scoring off, uncapped budget');
    check(c.ids.every(id => !c.droppedIds.includes(id)), 'no id is both packed and dropped');
    const expected = Object.entries(index).filter(([, e]) => e.scope.includes('test-cases') || (e.scope.includes('all') && e.tier === 'must')).map(([id]) => id).sort();
    const got = c.ids.filter(id => id.startsWith('REF-')).sort();
    check(JSON.stringify(got) === JSON.stringify(expected), `slice section set == declared read set (${got.length})`, `missing ${expected.filter(x => !got.includes(x))} extra ${got.filter(x => !expected.includes(x))}`);
    check(JSON.stringify(c.ids.filter(id => id.startsWith('LRN-')).sort()) === JSON.stringify(['LRN-20260801-01', 'LRN-20260801-04']), 'learnings = active ∩ scoped ∩ profile-compatible');
    check(c.droppedIds.includes('LRN-20260801-03'), 'profile-narrowed learning dropped for a web profile and listed');
    check(c.droppedIds.some(id => id.startsWith('REF-feature-knowledge-base-spec#')), 'scope=all non-must sections listed under dropped (general-scope)');
    const tiers = c.ids.filter(id => id.startsWith('REF-')).map(id => index[id].tier);
    check(tiers.lastIndexOf('must') < (tiers.findIndex(t => t !== 'must') === -1 ? Infinity : tiers.findIndex(t => t !== 'must')), 'every must section packed before any non-must');
    check(c.ids[c.ids.indexOf('REF-playwright-patterns#must-rules') + 1] === 'LRN-20260801-01', 'learning packed right after the section it Overrides');
    // verbatim body incl. the LAST section of a file
    const src = fs.readFileSync(path.join(REFS, 'playwright-patterns.md'), 'utf8').split('\n');
    const h = index['REF-playwright-patterns#pitfalls'].heading;
    const j0 = src.findIndex(l => l.replace(/^#+\s*/, '').trim() === h);
    const expectedLast = src.slice(j0 + 1).filter(l => !/^<!--\s*(qab|akela):/.test(l)).join('\n').trim();
    const after = c.slice.split(`## REF-playwright-patterns#pitfalls — ${h}\n`)[1];
    check(after && after.split('\n## ')[0].trim() === expectedLast, 'slice body verbatim for a file\'s last section (runs to EOF)');
    check(!/<!--\s*(qab|akela):/.test(c.slice.split('\n---\n').slice(1).join('')), 'tag comments stripped from the body');
    const profile = JSON.parse(fs.readFileSync(path.join(runDir, 'profile.json'), 'utf8'));
    check(profile.schema === 'profile/1' && profile.surface === 'web' && profile.pom === 'exists' && profile.ticket_kind === 'unknown' && profile.pfp === '5408a28cb4ac', `profile v0 deterministic from pack rules, pfp identical to QABuddy's qab.js for this profile (${profile.surface}/${profile.pom}/${profile.ticket_kind} pfp ${profile.pfp})`);
    const events = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    check(events.length === 1 && events[0].event === 'compiled' && events[0].pfp === profile.pfp && events[0].activity === 'test-cases', 'compiled event mirrored into the run dir (activity field)');
    check(fs.readFileSync(path.join(p.tmp, 'features-kb', 'learnings-log.jsonl'), 'utf8').trim().split('\n').length === 1, 'qa pack default learnings path: features-kb/');
    p.run(['log', 'applied', 'LRN-20260801-01']);
    check(fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').trim().split('\n').length === 2, 'later log lines mirrored into the run dir');
    const c2 = p.compile(['--activity', 'test-cases']);
    check(path.dirname(c2.slicePath) === runDir, 'recompile for the current run reuses its directory');
    const c3 = p.compile(['--activity', 'test-cases', '--task', 'BUG-7']);
    check(path.dirname(c3.slicePath) !== runDir && JSON.parse(fs.readFileSync(path.join(path.dirname(c3.slicePath), 'profile.json'), 'utf8')).ticket_kind === 'bug', 'a different task starts a new run with its own profile (ticket_kind=bug)');
    const ce = p.compile(['--activity', 'test-cases', '--task', 'ALL-1', '--everything']);
    check(ce.ids.length > c.ids.length && /selection: everything \(baseline\)/.test(ce.fm) && ce.droppedIds.every(id => !id.startsWith('REF-')), 'compile --everything packs every section (dump-all baseline), marked in the manifest');
    check(/unknown activity "nope"/.test(p.fails(['compile', '--activity', 'nope']) || ''), 'qa pack declares activities: an unknown one is refused');
  } finally { p.rm(); }
}

// ── 2. Scope overrides (RFC 0002 §2.1) ──────────────────────────────────────────────────────────
function testScopeOverrides() {
  console.log('\n🎛  Scope overrides (RFC 0002 PR A)');
  const p = project(QA, { 'features-kb/LEARNINGS.md': '# L\n' });
  const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  try {
    const index = JSON.parse(p.run(['index', '--json']));
    const pick = (pred) => (Object.entries(index).find(([, e]) => pred(e)) || [null])[0];
    const removable = pick(e => e.tier !== 'must' && e.scope.includes('test-cases') && !e.scope.includes('all'));
    const addable = pick(e => e.tier !== 'must' && !e.scope.includes('test-cases') && !e.scope.includes('all'));
    const must = pick(e => e.tier === 'must');
    let n = 0;
    const setCfg = (compiler) => fs.writeFileSync(path.join(p.tmp, 'akela.json'), JSON.stringify({ ...QA, compiler }));
    const go = () => p.compile(['--activity', 'test-cases', '--task', `PROJ-${++n}`]);
    const base = go();
    check(base.ids.includes(removable) && !base.ids.includes(addable) && !/project-override/.test(base.fm), 'baseline follows shipped scope, no override markers');
    setCfg({ scope: { [removable]: { remove: ['test-cases'] }, [addable]: { add: ['test-cases'] } } });
    const o = go();
    check(!o.ids.includes(removable) && new RegExp(`^  - id: ${esc(removable)}   reason: project-override$`, 'm').test(o.dropped), 'removed section listed under dropped with reason: project-override');
    check(new RegExp(`^  - id: ${esc(addable)}   tier: \\w+   lines: \\d+   via: project-override$`, 'm').test(o.sources) && (o.sources.match(/via: project-override/g) || []).length === 1, 'added section packed with via: project-override (only that one)');
    p.run(['log', 'applied', removable]);
    check(true, 'a removed section is still citable (scope ≠ validity)');
    const eU = p.fails(['compile', '--activity', 'test-cases']) ; // still same cfg → fine; now break it
    setCfg({ scope: { [removable.slice(0, -1)]: { remove: ['qa'] } } });
    const e1 = p.fails(['compile', '--activity', 'test-cases']) || '';
    check(/unknown section id/.test(e1) && e1.includes(removable), 'unknown override id refused with did-you-mean');
    setCfg({ scope: { [must]: { remove: [index[must].scope[0]] } } });
    check(/tier=must/.test(p.fails(['compile', '--activity', 'test-cases']) || ''), 'removing a must section is refused (the floor)');
    setCfg({ scope: { [must]: { add: ['test-cases'] } } });
    check(new RegExp(`- id: ${esc(must)} .*via: project-override`).test(go().sources), 'adding to a must section is allowed');
    setCfg({ scope: { [removable]: { remove: 'test-cases' } } }); check(p.fails(['compile', '--activity', 'test-cases']) !== null, 'remove as a bare string refused');
    setCfg({ scope: { [removable]: { rename: ['x'] } } }); check(p.fails(['compile', '--activity', 'test-cases']) !== null, 'unknown override key refused');
    setCfg({ scope: [] }); check(p.fails(['compile', '--activity', 'test-cases']) !== null, 'compiler.scope as an array refused');
    setCfg({ bogus: 1 }); check(/unknown compiler key "bogus"/.test(p.fails(['compile', '--activity', 'test-cases']) || ''), 'unknown compiler key refused loudly');
    void eU;
  } finally { p.rm(); }
}

// ── 3. Log + fingerprints + stats (RFC 0001 PR1/PR6) ─────────────────────────────────────────────
function testLogAndStats() {
  console.log('\n🧾 Evidence log, fingerprints, distill arithmetic');
  const p = project({ ...QA, learnings: 'kb/LEARNINGS.md' }, { 'kb/LEARNINGS.md': [
    '# L', '',
    '## LRN-20260808-03: a', '- **Status:** active', '- **Scope:** all', '- **Statement:** s', '- **Overrides:** none', '- **Evidence:** e', '- **Fingerprint:** ffp-000000000000', '',
    '## LRN-20260808-09: fp-linked', '- **Status:** active', '- **Scope:** all', '- **Statement:** s', '- **Overrides:** none', '- **Evidence:** e', '- **Fingerprint:** ffp-FPHOLDER', '',
  ].join('\n') });
  try {
    const fp = require('../lib/fingerprint');
    const ffp = fp.fingerprintOf('locator-not-found', 'checkout/place-order-btn');
    fs.writeFileSync(path.join(p.tmp, 'kb', 'LEARNINGS.md'), fs.readFileSync(path.join(p.tmp, 'kb', 'LEARNINGS.md'), 'utf8').replace('FPHOLDER', ffp));
    check(fp.normalizeKey('Checkout / Place-Order-Btn #2026-08-17T10:00:00Z :3000 a3f9c21b0e44') === 'checkout/place-order-btn', 'fingerprint key normalization strips incident entropy (timestamp, port, hash)');
    check(fp.fingerprintOf('locator-not-found', 'checkout/place-order-btn:3000') === ffp, 'same failure class → same ffp across incidents');

    const runId = p.run(['run-id', '--activity', 'qa', '--task', 'PROJ-1']).trim();
    check(/^qa-PROJ-1-[0-9a-f]{6}$/.test(runId) && fs.existsSync(path.join(p.tmp, '.qa-reports', 'run')), 'run-id prints the id and writes the marker next to the runs dir');
    p.run(['log', 'applied', 'LRN-20260808-03']);
    p.run(['log', 'contradicted', 'LRN-20260808-03', '--note', 'x']);
    check(/requires --note/.test(p.fails(['log', 'contradicted', 'LRN-20260808-03']) || ''), 'contradicted without --note refused');
    check(/unknown section id/.test(p.fails(['log', 'applied', 'REF-playwright-patterns#nope']) || ''), 'unknown section id refused with did-you-mean');
    check(/unknown namespace "ZZZ"/.test(p.fails(['log', 'applied', 'ZZZ-x#y']) || ''), 'unknown namespace refused');
    p.run(['log', 'applied', 'REF-playwright-patterns#never']);
    p.run(['log', 'outcome', '--status', 'DONE']);
    check(/already reported an outcome/.test(p.fails(['log', 'applied', 'LRN-20260808-03']) || ''), 'a run is closed by its outcome — later events refused');
    check(/requires --status <DONE\|/.test(p.fails(['log', 'outcome'], { AKELA_RUN: 'r2' }) || ''), 'outcome statuses come from the pack');
    for (const r of ['r2', 'r3', 'r4']) { p.run(['log', 'applied', 'LRN-20260808-09'], { AKELA_RUN: r }); p.run(['log', 'outcome', '--status', 'DONE'], { AKELA_RUN: r }); }
    const lines = fs.readFileSync(path.join(p.tmp, 'kb', 'learnings-log.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    check(lines.length === 10 && lines[0].activity === 'qa' && lines[0].run === runId && lines[0].v === 1, `log appends one JSON line per event (${lines.length}), with activity + run from the marker`);
    const stats = JSON.parse(p.run(['stats', '--json']));
    const row = id => stats.rows.find(r => r.src === id);
    check(row('LRN-20260808-09').promotion_candidate === true, 'applied ≥3 across ≥3 runs ∧ contradicted=0 → promotion candidate');
    check(row('LRN-20260808-03').promotion_candidate === false && row('REF-playwright-patterns#never').kind === 'REF', 'contradicted learning is not a candidate; sections never are');
    // fingerprint in a later run falsifies LRN-09 (same class) — automatic evidence
    p.run(['run-id', '--activity', 'qa', '--task', 'PROJ-2']);
    const out = p.run(['fp', 'locator-not-found', 'checkout / place-order-btn :4173']);
    check(new RegExp(`ffp=${ffp} active=\\[LRN-20260808-09\\]`).test(out), 'fp names the learning that claimed to prevent this class (falsification evidence)');
    check(/Closed vocabulary/.test(p.fails(['fp', 'made-up-kind', 'x']) || ''), 'fingerprint kinds are the pack\'s closed vocabulary');
    const stats2 = JSON.parse(p.run(['stats', '--json']));
    check(stats2.rows.find(r => r.src === 'LRN-20260808-09').falsified_by_fingerprint === 1 && stats2.rows.find(r => r.src === 'LRN-20260808-09').promotion_candidate === false, 'a fingerprint hit demotes the candidate: falsified (fingerprint)');
    // falsification (b): a must-floor section that is applied every run and contradicted in 2 of the last 3 runs that touched it
    for (const [r, ev] of [['s1', 'applied'], ['s2', 'applied'], ['s3', 'contradicted'], ['s4', 'applied'], ['s5', 'contradicted']]) {
      if (ev === 'contradicted') p.run(['log', 'applied', 'REF-playwright-patterns#must-rules'], { AKELA_RUN: r, AKELA_TS: `2026-09-0${r[1]}T00:00:00Z` });
      p.run(['log', ev, 'REF-playwright-patterns#must-rules', ...(ev === 'contradicted' ? ['--note', 'stale'] : [])], { AKELA_RUN: r, AKELA_TS: `2026-09-0${r[1]}T00:00:01Z` });
    }
    const sec = JSON.parse(p.run(['stats', '--json'])).rows.find(r => r.src === 'REF-playwright-patterns#must-rules');
    check(sec.falsified === true && sec.contradicted_runs === 2 && sec.recent_contradicted === 2, 'a section applied in every run but contradicted in 2 of the last 3 touching runs is falsified (recency rule)');
    p.run(['log', 'applied', 'REF-playwright-patterns#never'], { AKELA_RUN: 'x1', AKELA_TS: '2026-09-01T00:00:00Z' });
    p.run(['log', 'contradicted', 'REF-playwright-patterns#never', '--note', 'once'], { AKELA_RUN: 'x1', AKELA_TS: '2026-09-01T00:00:01Z' });
    for (const r of ['x2', 'x3', 'x4']) p.run(['log', 'applied', 'REF-playwright-patterns#never'], { AKELA_RUN: r, AKELA_TS: `2026-09-0${r[1]}T00:00:00Z` });
    check(JSON.parse(p.run(['stats', '--json'])).rows.find(r => r.src === 'REF-playwright-patterns#never').falsified === false, 'one old contradiction followed by clean applications is NOT falsified');
    const gate = JSON.parse(p.run(['gate', '--json']));
    check(gate.eligible === false && /needs ≥ 2 profiles/.test(gate.reason), 'gate: not eligible without ≥2 profiles × ≥8 outcomes');
    check(/scoring is on but the gate is not eligible/.test((() => { fs.writeFileSync(path.join(p.tmp, 'akela.json'), JSON.stringify({ ...QA, learnings: 'kb/LEARNINGS.md', compiler: { scoring: true, budget_lines: 100 } })); return p.fails(['compile', '--activity', 'qa', '--task', 'PROJ-3']) || ''; })()), 'scoring refuses to turn on silently before the gate');
    fs.writeFileSync(path.join(p.tmp, 'akela.json'), JSON.stringify({ ...QA, learnings: 'kb/LEARNINGS.md', compiler: { scoring: true, budget_lines: 100, scoringOverride: 'owner accepts the risk' } }));
    const c = p.compile(['--activity', 'qa', '--task', 'PROJ-4']);
    check(/scoring: on \(insufficient data/.test(c.fm) && fs.readFileSync(path.join(p.tmp, 'kb', 'learnings-log.jsonl'), 'utf8').includes('"kind":"scoring-override"'), 'override records a decision line; insufficient profile data keeps the compile unscored');
    p.run(['scoreboard']);
    check(fs.existsSync(path.join(p.tmp, 'kb', '.cache', 'scoreboard.json')), 'scoreboard rebuilds the derived cache');
  } finally { p.rm(); }
}

// ── 4. Generic: default domain, derived wiki, init ───────────────────────────────────────────────
function testGeneric() {
  console.log('\n🌿 Generic — default domain, an untagged wiki, init');
  const wiki = {
    'wiki/onboarding.md': '# Onboarding\n\n## Escalation policy\nPage the on-call after 15 minutes.\n\n## Refund rules\nRefunds under $50 need no approval.\n',
    'wiki/tone.md': '# Tone\n<!-- akela: scope=support tier=must -->\n\n## Always\n<!-- akela: id=always -->\nUse the customer\'s name.\n\n## Never\nNever promise dates.\n',
  };
  const p = project({ domain: 'default', knowledge: [{ path: 'wiki', namespace: 'WIKI', untagged: 'derive' }] }, wiki);
  try {
    const index = JSON.parse(p.run(['index', '--json']));
    check(index['WIKI-onboarding#escalation-policy'] && index['WIKI-onboarding#escalation-policy'].derived === true && index['WIKI-onboarding#escalation-policy'].scope[0] === 'all', 'derive mode: ids from headings, scope=all, marked derived');
    check(index['WIKI-tone#always'] && !index['WIKI-tone#always'].derived && index['WIKI-tone#always'].tier === 'must' && index['WIKI-tone#always'].scope[0] === 'support', 'an explicit tag still wins inside a derived root (file-level scope/tier inherited)');
    check(index['WIKI-tone#never'] && index['WIKI-tone#never'].derived && index['WIKI-tone#never'].tier === 'must', 'derived section inherits the H1 tier');
    const c = p.compile(['--activity', 'support', '--task', 'T-1']);
    check(c.ids.includes('WIKI-tone#always') && c.ids.includes('WIKI-tone#never') && !c.ids.includes('WIKI-onboarding#refund-rules'), 'untagged wiki contributes nothing until scoped; tagged must sections pack');
    check(c.droppedIds.includes('WIKI-onboarding#refund-rules') && /reason: general-scope/.test(c.dropped), 'unscoped wiki sections listed under dropped (general-scope) — the expert sees what is waiting');
    check(/profile: \{\}/.test(c.fm) && /domain: default/.test(c.fm), 'default pack: no probes, empty profile, pfp still deterministic');
    check(path.basename(path.dirname(path.dirname(c.slicePath))) === 'runs' && fs.existsSync(path.join(p.tmp, 'akela', 'learnings-log.jsonl')), 'default paths: .akela/runs and akela/LEARNINGS.md');
    fs.writeFileSync(path.join(p.tmp, 'akela.json'), JSON.stringify({ domain: 'default', knowledge: [{ path: 'wiki', namespace: 'WIKI', untagged: 'derive' }], compiler: { scope: { 'WIKI-onboarding#refund-rules': { add: ['support'] } } } }));
    const c2 = p.compile(['--activity', 'support', '--task', 'T-2']);
    check(c2.ids.includes('WIKI-onboarding#refund-rules') && /WIKI-onboarding#refund-rules .*via: project-override/.test(c2.sources), 'the expert scopes a wiki section via override → it packs, with causality');
    check(/Refunds under \$50/.test(c2.slice), 'wiki body is verbatim');
    p.run(['log', 'applied', 'WIKI-onboarding#refund-rules']);
    check(true, 'derived ids are citable');
    // check: validates without writing a run; catches the bare-id override an agent is likely to write
    check(/^ok — /.test(p.run(['check'])), 'check passes on a valid project and writes no run');
    fs.writeFileSync(path.join(p.tmp, 'akela.json'), JSON.stringify({ domain: 'default', knowledge: [{ path: 'wiki', namespace: 'WIKI', untagged: 'derive' }], compiler: { scope: { 'refund-rules': { add: ['support'] } } } }));
    check(/unknown section id "refund-rules" — did you mean: WIKI-onboarding#refund-rules/.test(p.fails(['check']) || ''), 'check refuses a bare section id and names the full one');
    fs.writeFileSync(path.join(p.tmp, 'akela', 'LEARNINGS.md'), '# L\n\n## LRN-20260822-01: x\n- **Status:** maybe\n- **Scope:** all\n- **Statement:** s\n- **Overrides:** WIKI-nope#zip\n- **Evidence:** e\n');
    fs.writeFileSync(path.join(p.tmp, 'akela.json'), JSON.stringify({ domain: 'default', knowledge: [{ path: 'wiki', namespace: 'WIKI', untagged: 'derive' }] }));
    check(/unknown Status on LRN-20260822-01/.test(p.fails(['check']) || ''), 'check refuses an unknown learning Status');
    fs.writeFileSync(path.join(p.tmp, 'akela', 'LEARNINGS.md'), '# L\n\n## LRN-20260822-01: x\n- **Status:** active\n- **Scope:** all\n- **Statement:** s\n- **Overrides:** WIKI-nope#zip\n- **Evidence:** e\n');
    check(/^ok — /.test(p.run(['check'])), 'check passes with a dangling Overrides (warning only — retiring a section orphans pointers legitimately)');
    fs.writeFileSync(path.join(p.tmp, 'akela', 'LEARNINGS.md'), '# L\n');
    // stats marks a source that is no longer in the knowledge base as absent (history, not a live finding)
    p.run(['log', 'applied', 'WIKI-onboarding#refund-rules'], { AKELA_RUN: 'gone-1' });
    fs.writeFileSync(path.join(p.tmp, 'wiki', 'onboarding.md'), '# Onboarding\n\n## Escalation policy\nPage the on-call after 15 minutes.\n');
    const gone = JSON.parse(p.run(['stats', '--json'])).rows.find(r => r.src === 'WIKI-onboarding#refund-rules');
    check(gone && gone.absent === true && /\(absent\)/.test(p.run(['stats'])), 'a retired section keeps its history in stats but is marked absent');
    // strict root refuses untagged headings
    fs.writeFileSync(path.join(p.tmp, 'akela.json'), JSON.stringify({ domain: 'default', knowledge: [{ path: 'wiki', namespace: 'WIKI' }] }));
    check(/has no <!-- akela: id=/.test(p.fails(['compile', '--activity', 'support']) || ''), 'strict (refuse) mode: an untagged heading is a loud error');
    // init
    const q = project(null, { 'docs/a.md': '# A\n\n## One\ntext\n' });
    try {
      const out = q.run(['init', '--knowledge', 'docs']);
      const cfg = JSON.parse(fs.readFileSync(path.join(q.tmp, 'akela.json'), 'utf8'));
      check(cfg.domain === 'default' && cfg.knowledge[0].untagged === 'derive' && fs.existsSync(path.join(q.tmp, 'akela', 'LEARNINGS.md')) && /\.akela\//.test(fs.readFileSync(path.join(q.tmp, '.gitignore'), 'utf8')), `init writes akela.json (derive mode), LEARNINGS.md and .gitignore — ${out.split('\n')[0]}`);
      check(/WIKI|REF-a#one/.test(q.run(['index'])), 'init result indexes immediately');
      check(fs.existsSync(path.join(q.tmp, 'akela', 'PROTOCOL.md')) && /akela compile --activity/.test(fs.readFileSync(path.join(q.tmp, 'akela', 'PROTOCOL.md'), 'utf8')), 'init writes the agent protocol (akela/PROTOCOL.md)');
      check(fs.existsSync(path.join(q.tmp, 'akela', 'ONBOARD.md')) && /You propose; the owner decides/.test(fs.readFileSync(path.join(q.tmp, 'akela', 'ONBOARD.md'), 'utf8')), 'init writes the one-time onboarding protocol (akela/ONBOARD.md)');
      check(fs.existsSync(path.join(q.tmp, 'akela', 'CURATE.md')) && /You draft; the owner approves/.test(fs.readFileSync(path.join(q.tmp, 'akela', 'CURATE.md'), 'utf8')), 'init writes the curation protocol (akela/CURATE.md)');
      check(/already exists/.test(q.fails(['init']) || ''), 'init refuses to overwrite');
      fs.writeFileSync(path.join(q.tmp, 'docs', 'new-page.md'), '# New\n\n## Fresh section\nnobody scoped this yet\n');
      check(/REF-new-page#fresh-section.*unscoped \(derive-mode\)/.test(q.run(['stats'])), 'a new derive-mode page with no scope surfaces in stats as unscoped');
      check(/note: \d+ unscoped section/.test(q.run(['compile', '--activity', 'demo', '--task', 'T-2'])), 'compile mentions unscoped drift so the working agent can offer onboarding');
    } finally { q.rm(); }
  } finally { p.rm(); }
}

// ── 5. Retrievers: RAG as a candidate source, never the selector ────────────────────────────────
function testRetrievers() {
  console.log('\n🔌 Retrievers — external candidates enter as EXT-, cited and counted like any source');
  const script = `const chunks=[];process.stdin.on('data',c=>chunks.push(c)).on('end',()=>{const ctx=JSON.parse(chunks.join(''));process.stdout.write(JSON.stringify([{id:'ticket-'+ctx.task.toLowerCase(),heading:'Similar ticket',text:'activity='+ctx.activity+' pfp='+ctx.profile.pfp}]))});`;
  const p = project({ domain: 'default', knowledge: [{ path: 'wiki', namespace: 'WIKI', untagged: 'derive' }], compiler: { retrievers: [{ name: 'rag', cmd: `${process.execPath} retrieve.js` }] } },
    { 'wiki/a.md': '# A\n<!-- akela: tier=must scope=triage -->\n\n## Rule\nmust rule\n', 'retrieve.js': script });
  try {
    const c = p.compile(['--activity', 'triage', '--task', 'T-9']);
    check(c.ids[0] === 'WIKI-a#rule' && c.ids[1] === 'EXT-rag#ticket-t-9', 'retrieved item packs AFTER the floor, as EXT-<name>#<id>');
    check(/EXT-rag#ticket-t-9   tier: context   lines: \d+   via: retriever:rag/.test(c.sources), 'manifest marks it via: retriever:<name>, tier context');
    check(/activity=triage pfp=[0-9a-f]{12}/.test(c.slice), 'retriever received activity + profile (pfp) on stdin');
    check(/1 retrieved/.test(c.out), 'compile summary counts retrieved sources');
    p.run(['log', 'applied', 'EXT-rag#ticket-t-9']);
    const stats = JSON.parse(p.run(['stats', '--json']));
    check(stats.rows.find(r => r.src === 'EXT-rag#ticket-t-9').kind === 'EXT' && stats.rows.find(r => r.src === 'EXT-rag#ticket-t-9').in_slice === 1, 'EXT sources are counted (in_slice, applied) like any other');
    // supersedes: rides into the manifest; after 3 applied runs the note is a promotion candidate → wiki, retire the target
    fs.writeFileSync(path.join(p.tmp, 'retrieve.js'), `process.stdout.write(JSON.stringify([{id:'note',text:'Rule: new',supersedes:'WIKI-a#rule'}]))`);
    for (const n of [1, 2, 3]) { const cx = p.compile(['--activity', 'triage', '--task', `S-${n}`]); if (n === 1) check(/EXT-rag#note   tier: context   lines: \d+   via: retriever:rag   supersedes: WIKI-a#rule/.test(cx.sources), 'manifest shows what a retrieved note supersedes'); p.run(['log', 'applied', 'EXT-rag#note']); p.run(['log', 'outcome', '--status', 'DONE']); }
    const ext = JSON.parse(p.run(['stats', '--json'])).rows.find(r => r.src === 'EXT-rag#note');
    check(ext.promotion_candidate === true && ext.supersedes === 'WIKI-a#rule' && /promotion candidate → wiki \(retire WIKI-a#rule\)/.test(p.run(['stats'])), 'a retrieved note applied 3× uncontradicted is a promotion candidate into the wiki, naming what to retire');
    fs.writeFileSync(path.join(p.tmp, 'wiki', 'a.md'), '# A\n<!-- akela: tier=must scope=triage -->\n\n## Rule v2\n<!-- akela: id=rule-v2 from=EXT-rag#note -->\nRule: new\n');
    check(/^ok/.test(p.run(['check'])), 'a section promoted from a retrieved note (from=EXT-…) passes check with one-way lineage');
    fs.writeFileSync(path.join(p.tmp, 'retrieve.js'), 'process.stdout.write("not json")');
    check(/did not return JSON/.test(p.fails(['compile', '--activity', 'triage', '--task', 'T-10']) || ''), 'a broken retriever fails the compile loudly (never a silent empty contribution)');
  } finally { p.rm(); }
}

// ── 6. Lineage: a promoted copy is one fact in three places (E2-wiki, 2026-08-23) ────────────────
function testLineage() {
  console.log('\n🧬 Lineage — promoted copies follow their source');
  const wiki = (threshold) => `# Refunds\n<!-- akela: scope=refund tier=must -->\n\n## Approval\n<!-- akela: id=approval -->\nRule: under $${threshold} → approve\n\n## Shortcut\n<!-- akela: id=shortcut from=LRN-20260801-01 tier=should -->\nRule: under $50 inside the window → approve without a second look\n`;
  const learnings = (status, promotedTo) => `# L\n\n## LRN-20260801-01: shortcut\n- **Status:** ${status}\n- **Scope:** refund\n- **Statement:** under $50 → approve without a second look\n- **Overrides:** WIKI-refunds#approval\n- **Evidence:** seeded\n${promotedTo ? `- **Promoted-to:** ${promotedTo}\n` : ''}`;
  const p = project({ domain: 'default', knowledge: [{ path: 'wiki', namespace: 'WIKI' }], activities: ['refund'] }, { 'wiki/refunds.md': wiki(50), 'akela/LEARNINGS.md': learnings('promoted', 'WIKI-refunds#shortcut') });
  try {
    const idx = JSON.parse(p.run(['index', '--json']));
    check(idx['WIKI-refunds#shortcut'].from === 'LRN-20260801-01' && /^[0-9a-f]{12}$/.test(idx['WIKI-refunds#approval'].hash), 'index carries from= and a content hash per section');
    check(/^ok — /.test(p.run(['check'])), 'check passes when Promoted-to and from= agree');
    const c1 = p.compile(['--activity', 'refund', '--task', 'R-1']);
    check(c1.ids.includes('WIKI-refunds#approval') && c1.ids.includes('WIKI-refunds#shortcut'), 'before any rewrite, both the source and the promoted copy pack');
    const ev = JSON.parse(fs.readFileSync(path.join(path.dirname(c1.slicePath), 'events.jsonl'), 'utf8').trim().split('\n')[0]);
    check(ev.hashes && ev.hashes['WIKI-refunds#approval'] === idx['WIKI-refunds#approval'].hash, 'compiled event records per-source hashes');
    // the human rewrites the source (threshold → $25); nobody tells anyone
    fs.writeFileSync(path.join(p.tmp, 'wiki', 'refunds.md'), wiki(25));
    const c2 = p.compile(['--activity', 'refund', '--task', 'R-2']);
    check(c2.ids.includes('WIKI-refunds#approval') && !c2.ids.includes('WIKI-refunds#shortcut'), 'after the source is rewritten, the promoted copy is quarantined — only the fix packs');
    check(/- id: WIKI-refunds#shortcut   reason: source-rewritten   source: WIKI-refunds#approval   since: /.test(c2.dropped), 'manifest says why: source-rewritten, which source, since which run');
    check(!/under \$50/.test(c2.slice), 'the stale text is not in the slice');
    const st = JSON.parse(p.run(['stats', '--json']));
    const row = id => st.rows.find(r => r.src === id);
    check(row('WIKI-refunds#approval').rewritten_at === 'since last compile' || /R-2/.test(row('WIKI-refunds#approval').rewritten_at), `stats detects the rewrite (${row('WIKI-refunds#approval').rewritten_at})`);
    check(JSON.stringify(row('WIKI-refunds#shortcut').family) === JSON.stringify(['LRN-20260801-01', 'WIKI-refunds#approval']), 'family = learning + overridden source');
    check(row('WIKI-refunds#shortcut').source_rewritten && row('WIKI-refunds#shortcut').source_rewritten.source === 'WIKI-refunds#approval' && /review this copy/.test(p.run(['stats'])), 'the copy is flagged: its source was rewritten — review');
    // version-scoped evidence: contradictions earned by the OLD text do not falsify the rewritten text
    for (const r of ['v1', 'v2']) { p.run(['log', 'applied', 'WIKI-refunds#approval'], { AKELA_RUN: `${r}a`, AKELA_TS: `2026-09-2${r[1]}T00:00:00Z` }); }
    // (the two contradictions below land on runs compiled BEFORE the rewrite — use run R-1's id, whose compiled hash is the old text)
    const oldRun = fs.readdirSync(path.join(p.tmp, '.akela', 'runs')).find(r => r.includes('R-1'));
    p.run(['log', 'contradicted', 'WIKI-refunds#approval', '--note', 'old text wrong'], { AKELA_RUN: oldRun, AKELA_TS: '2026-09-23T00:00:00Z' });
    const vrow = JSON.parse(p.run(['stats', '--json'])).rows.find(r => r.src === 'WIKI-refunds#approval');
    check(vrow.contradicted === 0 && vrow.prior_versions && vrow.prior_versions.contradicted === 1 && vrow.falsified === false,
      `evidence against the old text is set aside as prior_versions (contradicted ${vrow.prior_versions && vrow.prior_versions.contradicted}), the rewrite starts clean`);
    // family blame: contradict the copy twice in distinct runs → the source and learning are flagged via family
    for (const r of ['f1', 'f2']) { p.run(['log', 'applied', 'WIKI-refunds#shortcut'], { AKELA_RUN: r, AKELA_TS: `2026-09-1${r[1]}T00:00:00Z` }); p.run(['log', 'contradicted', 'WIKI-refunds#shortcut', '--note', 'stale'], { AKELA_RUN: r, AKELA_TS: `2026-09-1${r[1]}T00:00:01Z` }); }
    const st2 = JSON.parse(p.run(['stats', '--json']));
    check(st2.rows.find(r => r.src === 'WIKI-refunds#shortcut').falsified === true && st2.rows.find(r => r.src === 'LRN-20260801-01').falsified_via.includes('WIKI-refunds#shortcut'), 'falsification propagates to the family (the learning is flagged via its copy)');
    // lineage validation
    fs.writeFileSync(path.join(p.tmp, 'akela', 'LEARNINGS.md'), learnings('promoted', null));
    check(/is promoted but has no Promoted-to/.test(p.fails(['check']) || ''), 'check: promoted learning without Promoted-to is refused');
    fs.writeFileSync(path.join(p.tmp, 'akela', 'LEARNINGS.md'), learnings('retired', 'WIKI-refunds#shortcut'));
    check(/^ok/.test(p.run(['check'])), 'check: retired learning may keep its Promoted-to while the section exists');
    // the correct end state of a retired family — learning retired, section deleted — must PASS
    fs.writeFileSync(path.join(p.tmp, 'wiki', 'refunds.md'), '# Refunds\n<!-- akela: scope=refund tier=must -->\n\n## Approval\n<!-- akela: id=approval -->\nRule: under $25 → approve\n');
    check(/^ok/.test(p.run(['check'])), 'a fully retired family (learning retired + its section deleted) passes check — refusing this handcuffed the matrix experts');
    fs.writeFileSync(path.join(p.tmp, 'akela', 'LEARNINGS.md'), learnings('promoted', 'WIKI-refunds#shortcut'));
    fs.writeFileSync(path.join(p.tmp, 'wiki', 'refunds.md'), wiki(25).replace('from=LRN-20260801-01 ', ''));
    check(/that section's tag says from=\(none\)/.test(p.fails(['check']) || ''), 'check: a PROMOTED learning whose section lacks from= is refused (retired ones are exempt)');
    fs.writeFileSync(path.join(p.tmp, 'wiki', 'refunds.md'), wiki(25).replace('from=LRN-20260801-01', 'from=bogus'));
    check(/from= must name a learning/.test(p.fails(['check']) || ''), 'check: malformed from= is refused by the index');
  } finally { p.rm(); }
}

// ── 7. Capture gate: vet as arithmetic (the flood scaled with model capability — 2026-08-25) ────
function testVet() {
  console.log('\n🚪 Capture gate — restatements and duplicates cannot argue their way in');
  const p = project({ domain: 'default', knowledge: [{ path: 'wiki', namespace: 'WIKI' }], activities: ['refund'] }, {
    'wiki/refunds.md': '# Refunds\n<!-- akela: scope=refund tier=must -->\n\n## Approval\n<!-- akela: id=approval -->\nRule: refund requested under $50 and order within 14 days → approve; $50 or more → escalate\n\n## Damaged\n<!-- akela: id=damaged -->\nRule: damage reported with photo within 7 days → replace at no cost; later or no photo → apply the refund approval rule\n',
    'akela/LEARNINGS.md': '# L\n\n## LRN-20260801-01: api seeding\n- **Status:** active\n- **Scope:** refund\n- **Statement:** Seed cart state via the API with a session token, never by UI clicks\n- **Overrides:** none\n- **Evidence:** run\n',
  });
  try {
    const vetIn = JSON.stringify([
      'Damage reported with a photo within 7 days gets a free replacement; otherwise the refund approval rule applies',  // restates WIKI-refunds#damaged (run-1's actual flood shape)
      'Seed the cart via the API using a session token instead of UI clicks',                                           // duplicates LRN-01
      'The finance reviewer rejects refunds filed on weekends; queue them for Monday',                                  // novel → accept
      'Refunds submitted on weekends are rejected by the finance reviewer and must queue until Monday',                 // duplicate of the accepted candidate
      'Escalations need a case number from the fraud desk',                                                             // novel → accept
      'Chargebacks reverse within 90 days',                                                                             // novel → accept (3rd)
      'The loyalty desk owns tier disputes',                                                                            // over cap
    ]);
    const out = JSON.parse(p.run(['vet', '--json'], undefined, vetIn));
    const v = out.map(x => x.verdict);
    check(v[0] === 'restates' && out[0].match === 'WIKI-refunds#damaged', `a restatement of a section is rejected and names the section (${out[0].match} ${out[0].score})`);
    check(v[1] === 'duplicate-of-learning' && out[1].match === 'LRN-20260801-01', 'a duplicate of an existing learning is rejected');
    check(v[2] === 'accept', 'a genuinely novel fact is accepted');
    check(v[3] === 'duplicate-of-candidate', 'a near-duplicate of an accepted candidate is rejected');
    check(v[4] === 'accept' && v[5] === 'accept' && v[6] === 'cap-exceeded', 'acceptances stop at the cap (3 per pass)');
    check(JSON.parse(p.run(['vet', '--json', '--cap', '1'], undefined, vetIn)).filter(x => x.verdict === 'accept').length === 1, '--cap overrides the pass limit');
    // recycles-retired: a dead value cannot come back, however novel the phrasing
    fs.appendFileSync(path.join(p.tmp, 'akela', 'LEARNINGS.md'), '\n## LRN-20260701-01: old threshold\n- **Status:** retired\n- **Scope:** refund\n- **Statement:** Refund threshold is $75 for premium members during promo periods\n- **Overrides:** none\n- **Evidence:** retired: falsified\n');
    const rec = JSON.parse(p.run(['vet', '--json'], undefined, JSON.stringify([
      'Premium customers may deserve special handling when their request totals about $75 in value',   // novel phrasing, dead number
      'Refund threshold is $75 for premium members while promotions run',                              // near-restatement of the retired one
      'Weekend queueing also applies to chargebacks',                                                  // novel, no dead value
    ])));
    check(rec[0].verdict === 'recycles-retired' && rec[0].match === 'LRN-20260701-01', 'a token-novel candidate carrying a dead value is rejected (recycles-retired)');
    check(rec[1].verdict === 'recycles-retired', 'a rephrasing of a retired statement is rejected');
    check(rec[2].verdict === 'accept', 'novel candidates without dead values still pass');
    // dead-value context test (generality audit 2026-08-27): a bare number is not the identity of a
    // dead rule — the dead $75 only blocks candidates sharing content tokens with what retired it
    const ctx = JSON.parse(p.run(['vet', '--json'], undefined, JSON.stringify([
      'Oversized freight incurs a $75 weekend surcharge at the loading dock',
    ])));
    check(ctx[0].verdict === 'accept', 'a dead number in an unrelated context does not poison a legitimate new rule');
    // symmetric containment: swallowing a section verbatim and padding with filler is still a restatement
    const pad = JSON.parse(p.run(['vet', '--json'], undefined, JSON.stringify([
      'Rule: damage reported with photo within 7 days → replace at no cost; later or no photo → apply the refund approval rule. Separately, remember agents appreciate concise notes, holiday volumes vary, and clear expectations reduce repeat contacts across channels.',
    ])));
    check(pad[0].verdict === 'restates' && pad[0].match === 'WIKI-refunds#damaged', 'verbatim section content padded with filler is caught (symmetric containment)');
    // Unicode tokens (generality audit): Korean statements are judged by their own words, not their English residue
    fs.writeFileSync(path.join(p.tmp, 'wiki', 'korean.md'), '# 한국어 규칙\n<!-- akela: scope=refund tier=should -->\n\n## 환불 승인\n<!-- akela: id=ko-refund -->\n규칙: 환불 요청 금액이 3만원 미만이고 주문 후 14일 이내이면 승인한다; 그 이상이면 상급자에게 보고한다.\n');
    const ko = JSON.parse(p.run(['vet', '--json'], undefined, JSON.stringify([
      '환불 요청 금액이 3만원 미만이고 주문 후 14일 이내이면 승인한다',   // restates the Korean section
      '야간 문의는 다음 영업일에 처리하고 고객에게 접수 알림을 발송한다', // novel Korean rule
    ])));
    check(ko[0].verdict === 'restates' && ko[0].match === 'WIKI-korean#ko-refund', 'a Korean restatement of a Korean section is caught');
    check(ko[1].verdict === 'accept', 'a novel Korean rule is accepted');
    // zero-token statements are not duplicates of each other (empty ∩ empty proves nothing)
    const zt = JSON.parse(p.run(['vet', '--json'], undefined, JSON.stringify(['!!!', '???'])));
    check(zt[0].verdict === 'accept' && zt[1].verdict !== 'duplicate-of-candidate', 'zero-token statements do not jaccard-match each other');
    // a restating learning already in the file: stats flags it, check warns, both name the section
    fs.appendFileSync(path.join(p.tmp, 'akela', 'LEARNINGS.md'), '\n## LRN-20260801-02: restater\n- **Status:** active\n- **Scope:** refund\n- **Statement:** Refunds under $50 within 14 days are approved; $50 or more must escalate\n- **Overrides:** WIKI-refunds#approval\n- **Evidence:** run\n');
    p.run(['log', 'applied', 'LRN-20260801-02'], { AKELA_RUN: 'r1' });
    const row = JSON.parse(p.run(['stats', '--json'])).rows.find(r => r.src === 'LRN-20260801-02');
    check(row.restates && row.restates.id === 'WIKI-refunds#approval' && /restates WIKI-refunds#approval .*retire or merge/.test(p.run(['stats'])), 'stats flags a learning that restates a section');
    check(/warning — learnings that restate a section.*LRN-20260801-02/.test(warnStderr(p)), 'check warns on restating learnings');
  } finally { p.rm(); }
}
function warnStderr(p) { try { const r = require('child_process').spawnSync(process.execPath, [BIN, 'check'], { env: { ...process.env, AKELA_CWD: p.tmp }, encoding: 'utf8' }); return r.stderr || ''; } catch { return ''; } }

testQaParity();
testScopeOverrides();
testLogAndStats();
testGeneric();
testRetrievers();
testLineage();
testVet();
console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
