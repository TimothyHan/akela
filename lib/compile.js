'use strict';
/**
 * Compile (RFC 0001 §5; RFC 0002 §2.1–2.4) — deterministic, inspectable, no LLM step.
 *
 *   candidates = { section : activity ∈ scope } ∪ { section : scope=all ∧ tier=must }
 *              ∪ { LRN : active ∧ scope ∋ activity|all ∧ profile ⊆ run profile }
 *              ∪ { EXT : returned by a configured retriever }                                  (§4.5)
 *   pack       = must first, then explicit scope, then the rest; each LRN right after the section it
 *                Overrides; learnings are a floor; the manifest lists every drop with its reason.
 *   scoring    = off by default; on only behind the gate (or a recorded override); per-profile,
 *                with a floor; never a global ranking (the §9.3 verdict binds the shape).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { die, warn, nowIso } = require('./util');
const { rel } = require('./config');
const knowledge = require('./index');
const learningsMod = require('./learnings');
const profileMod = require('./profile');
const logMod = require('./log');
const { readFps } = require('./fingerprint');
const { computeGate } = require('./stats');
const { appendJsonl } = require('./util');

const VERSION = require('../package.json').version;
const TIER_RANK = { must: 0, should: 1, context: 2 };
const SCORE_MIN_SAMPLES = 8;
const SCORE_EXPLORE_EVERY = 10;
const SCORE_RECENT_RUNS = 3;

// ── index + project overrides ────────────────────────────────────────────
function loadIndex(cfg) {
  const { index, errors } = knowledge.build(cfg);
  if (errors.length) die(`knowledge roots:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  return index;
}

// Scope overrides (RFC 0002 §2.1): effective scope = (index scope − remove) ∪ add, after core resolution.
// Every refusal is loud: an override that matches nothing is a config bug, not a no-op (decision 3).
function applyScopeOverrides(cfg, index) {
  const spec = cfg.compiler.scope;
  const overridden = new Set();
  if (spec === undefined) return overridden;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) die('compiler.scope must be an object: {"<section-id>": {"add": […], "remove": […]}}');
  for (const [id, o] of Object.entries(spec)) {
    if (!index[id]) {
      const near = knowledge.nearestIds(id, index);
      die(`compiler.scope: unknown section id "${id}"${near.length ? ` — did you mean: ${near.join(', ')}` : ''}\n  An override that matches nothing is a config bug, not a no-op (RFC 0002 decision 3) — fix the id or delete the entry.`);
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) die(`compiler.scope["${id}"] must be an object with "add" and/or "remove" arrays`);
    for (const k of Object.keys(o)) if (k !== 'add' && k !== 'remove') die(`compiler.scope["${id}"]: unknown key "${k}" — only "add" and "remove"`);
    for (const k of ['add', 'remove']) if (o[k] !== undefined && (!Array.isArray(o[k]) || o[k].some(x => typeof x !== 'string' || !x.trim()))) die(`compiler.scope["${id}"].${k} must be an array of activity names`);
    const remove = o.remove || [];
    if (remove.length && index[id].tier === 'must') die(`compiler.scope: "${id}" is tier=must — a must section is a floor and cannot be removed (RFC 0002 decision 2).`);
    const scope = index[id].scope.filter(s => !remove.includes(s));
    for (const s of (o.add || [])) if (!scope.includes(s)) scope.push(s);
    index[id] = { ...index[id], scope };
    overridden.add(id);
  }
  return overridden;
}

// ── retrievers (RAG as a candidate source, never the selector) ───────────
// Each retriever is a command; it gets {activity, task, profile} on stdin and returns JSON
// [{id, heading, text}]. Items enter as EXT-<name>#<id>, tier=context, `via: retriever:<name>`.
function runRetrievers(cfg, ctx) {
  const spec = cfg.compiler.retrievers;
  if (spec === undefined) return [];
  if (!Array.isArray(spec)) die('compiler.retrievers must be an array of { name, cmd }');
  const out = [];
  for (const r of spec) {
    if (!r || typeof r.name !== 'string' || !/^[a-z0-9-]+$/.test(r.name) || typeof r.cmd !== 'string' || !r.cmd.trim()) die('compiler.retrievers: each entry needs a kebab-case "name" and a "cmd"');
    let raw;
    try { raw = execSync(r.cmd, { cwd: cfg.root, input: JSON.stringify(ctx), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 }); }
    catch (e) { die(`retriever "${r.name}" failed: ${(e.stderr || e.message || '').toString().trim()}`); }
    let items;
    try { items = JSON.parse(raw); } catch { die(`retriever "${r.name}" did not return JSON`); }
    if (!Array.isArray(items)) die(`retriever "${r.name}" must return a JSON array`);
    items.forEach((it, i) => {
      if (!it || typeof it.id !== 'string' || !/^[a-z0-9-]+$/.test(it.id) || typeof it.text !== 'string') die(`retriever "${r.name}" item ${i}: needs kebab-case "id" and "text"`);
      if (it.supersedes !== undefined && (typeof it.supersedes !== 'string' || !/^[A-Z][A-Z0-9]+-[a-z0-9ㄱ-힝-]+(?:\/[a-z0-9ㄱ-힝-]+)*#[a-z0-9ㄱ-힝-]+$/.test(it.supersedes))) die(`retriever "${r.name}" item ${i}: "supersedes" must be a section id`);
      // `supersedes`: the retriever may say which section its result replaces. It rides into the manifest and stats so a
      // curator promoting the result into the wiki knows what to retire in the same edit (E2-rag: right answers, stale floor).
      out.push({ id: `EXT-${r.name}#${it.id}`, kind: 'EXT', heading: it.heading || it.id, text: it.text.replace(/\r\n/g, '\n').trim() + '\n', tier: 'context', via: `retriever:${r.name}`, retriever: r.name, supersedes: it.supersedes });
    });
  }
  return out;
}

// ── lineage: a promoted copy whose source was rewritten since promotion is quarantined ────────
// A promoted section carries `from=LRN-…`; that learning `Overrides:` the section it extended. The copy is one
// fact living in two places. If the overridden section's content hash differs from what it was when the copy
// first compiled (the first `compiled` event listing the copy, which carries per-source hashes), the source has
// been rewritten since promotion — the copy is now a stale twin competing with the fix (E2-wiki, 2026-08-23:
// refund never recovered; the expert retired the human's correction instead). The compiler packs the rewritten
// source and drops the copy with `reason: source-rewritten`; the expert decides whether to retire or re-promote.
function quarantine(cfg, index, learnings, lines) {
  const out = new Map(); // copy id → { source, since }
  const byId = Object.fromEntries(learnings.map(l => [l.id, l]));
  for (const [id, e] of Object.entries(index)) {
    if (!e.from) continue;
    const lrn = byId[e.from];
    const source = lrn && lrn.overridesRef && index[lrn.overridesRef] ? lrn.overridesRef : null;
    if (!source) continue;
    const first = lines.find(l => l.event === 'compiled' && Array.isArray(l.sources) && l.sources.includes(id) && l.hashes && l.hashes[source]);
    if (!first) continue; // no baseline (pre-lineage logs): nothing to compare against
    if (first.hashes[source] !== index[source].hash) out.set(id, { source, since: first.run });
  }
  return out;
}

// ── scoring (RFC 0002 PR D) ──────────────────────────────────────────────
function pfpStats(lines, pfp) {
  const runPfp = {};
  for (const l of lines) if (l.event === 'compiled' && l.run && l.pfp) runPfp[l.run] = l.pfp;
  const closed = [];
  for (const l of lines) if (l.event === 'outcome' && l.run && runPfp[l.run] === pfp) closed.push(l.run);
  const closedIdx = new Map(closed.map((r, i) => [r, i]));
  const recent = new Set(closed.slice(-SCORE_RECENT_RUNS));
  const per = {};
  const mk = () => ({ in_slice: 0, applied: 0, applied_recent: false, contradicted_recent: false, last_applied_run: null });
  for (const l of lines) {
    if (!l.run || runPfp[l.run] !== pfp) continue;
    if (l.event === 'compiled' && Array.isArray(l.sources)) { for (const id of l.sources) (per[id] || (per[id] = mk())).in_slice++; continue; }
    if (!l.src) continue;
    const s = per[l.src] || (per[l.src] = mk());
    if (l.event === 'applied') { s.applied++; s.last_applied_run = l.run; if (recent.has(l.run)) s.applied_recent = true; }
    else if (l.event === 'contradicted' && recent.has(l.run)) s.contradicted_recent = true;
  }
  const scoreOf = (id) => {
    const s = per[id];
    if (!s || !s.in_slice) return { score: 0, n: s ? s.in_slice : 0 };
    const ratio = s.applied / s.in_slice;
    const penalty = s.contradicted_recent ? 0.25 : 1;
    const idx = s.last_applied_run !== null && closedIdx.has(s.last_applied_run) ? closedIdx.get(s.last_applied_run) : (s.applied ? closed.length - 1 : -1);
    const runsSince = s.applied ? Math.max(0, closed.length - 1 - idx) : Infinity;
    const recency = s.applied ? 1 / (1 + runsSince) : 0;
    const freq = 1 + Math.log(1 + s.applied);
    return { score: ratio * penalty * recency * freq, n: s.in_slice };
  };
  return { per, outcomes: closed.length, scoreOf, appliedRecent: (id) => !!(per[id] && per[id].applied_recent) };
}

function recordScoringOverride(cfg, note) {
  const { lines } = logMod.readLog(cfg, null);
  if (lines.some(l => l.event === 'decision' && l.kind === 'scoring-override' && l.note === note)) return;
  appendJsonl(cfg.logPath, { v: 1, ts: nowIso(), event: 'decision', kind: 'scoring-override', note });
  warn(`scoring enabled by explicit override (gate not eligible) — decision recorded in the log: "${note}"`);
}

function resolveScoring(cfg) {
  const c = cfg.compiler;
  if (c.scoring === undefined || c.scoring === false) return null;
  if (c.scoring !== true) die('compiler.scoring must be true or absent — it is the one flag (RFC 0002 §6)');
  const budget = c.budget_lines;
  if (!Number.isInteger(budget) || budget <= 0) die('compiler.scoring requires compiler.budget_lines (a positive integer) — scoring exists to enforce a line budget');
  const { lines } = logMod.readLog(cfg, null);
  const gate = computeGate(lines, readFps(cfg).lines, learningsMod.parse(cfg));
  if (!gate.eligible) {
    const override = c.scoringOverride;
    if (typeof override === 'string' && override.trim()) { recordScoringOverride(cfg, override.trim()); return { budget, lines }; }
    die(`compiler.scoring is on but the gate is not eligible: ${gate.reason}\n  Run \`akela gate\` for the report. Either let the data reach the gate, or take explicit responsibility:\n  set compiler.scoringOverride to a one-line note — it is recorded in the log as a decision (RFC 0002 §2.4).`);
  }
  return { budget, lines };
}

// ── compile ──────────────────────────────────────────────────────────────
function compile(cfg, activity, task, opts = {}) {
  if (cfg.activities && !cfg.activities.includes(activity)) die(`unknown activity "${activity}" — this domain declares: ${cfg.activities.join(', ')}`);
  const index = loadIndex(cfg);

  // run: reuse the marker's run only if it is the same activity AND the same task
  let marker = logMod.readMarker(cfg);
  let run;
  const mActivity = marker && (marker.activity || marker.skill);
  const mTask = marker && (marker.task || marker.ticket);
  const sameTask = !task || !marker || !mTask || mTask === task;
  if (marker && mActivity === activity && sameTask && marker.dir && fs.existsSync(marker.dir)) run = { run: marker.run, activity, task: mTask || task, dir: marker.dir };
  else { run = logMod.startRun(cfg, activity, task); marker = logMod.readMarker(cfg); }

  const { profile, pfp } = profileMod.build(cfg, activity, run.task);

  // candidate sections; project scope overrides apply after core resolution, with causality in the manifest
  const baseScope = {};
  for (const [id, e] of Object.entries(index)) baseScope[id] = e.scope;
  const overridden = applyScopeOverrides(cfg, index);
  // opts.everything: the dump-everything baseline — every section regardless of scope, every active learning.
  // Exists so "no selection at all" can be measured against compiled slices with the same pipeline and manifest.
  const packs = opts.everything ? () => true : (scope, tier) => scope.includes(activity) || (scope.includes('all') && tier === 'must');
  const all = Object.entries(index).map(([id, e]) => ({
    id, ...e, kind: 'SEC', explicit: e.scope.includes(activity),
    via: overridden.has(id) && packs(e.scope, e.tier) && !packs(baseScope[id], e.tier) ? 'project-override' : undefined,
  }));
  const dropped = [];
  for (const r of all) {
    if (packs(r.scope, r.tier)) continue;
    if (overridden.has(r.id) && packs(baseScope[r.id], r.tier)) dropped.push({ id: r.id, reason: 'project-override' });
    else if (r.scope.includes('all') && r.tier !== 'must') dropped.push({ id: r.id, reason: 'general-scope' });
  }
  let refs = all.filter(r => packs(r.scope, r.tier))
    .sort((a, b) => (TIER_RANK[a.tier] ?? 1) - (TIER_RANK[b.tier] ?? 1) || (a.explicit === b.explicit ? 0 : a.explicit ? -1 : 1) || a.file.localeCompare(b.file));

  // lineage quarantine (see quarantine()): drop promoted copies whose source was rewritten since promotion
  const allLearnings = learningsMod.parse(cfg);
  const q = quarantine(cfg, index, allLearnings, logMod.readLog(cfg, null).lines);
  for (const [id, info] of q) if (refs.some(r => r.id === id)) dropped.push({ id, reason: 'source-rewritten', source: info.source, since: info.since });
  refs = refs.filter(r => !q.has(r.id));

  // candidate learnings: active, scoped, profile-compatible (profile-narrowed misses are dropped visibly)
  const scoped = allLearnings.filter(l => l.status === 'active' && (l.scope.includes('all') || l.scope.includes(activity)));
  const profileOk = (l) => Object.entries(l.profile).every(([k, v]) => profile[k] === undefined || profile[k] === v);
  const lrns = scoped.filter(profileOk);
  for (const l of scoped) if (!profileOk(l)) dropped.push({ id: l.id, reason: 'profile' });

  // external candidates (retrievers) — context tier, always after sections, never part of the floor
  const ext = runRetrievers(cfg, { activity, task: run.task, profile: { ...profile, pfp } });

  // scoring stage: ranks the NON-floor packed sections for THIS pfp and drops the tail past budget_lines
  const scoring = resolveScoring(cfg);
  let packedRefs = refs;
  let scoringLabel = 'off';
  let budgetMax = 0;
  const scoreTag = {};
  if (scoring) {
    const st = pfpStats(scoring.lines, pfp);
    if (st.outcomes < SCORE_MIN_SAMPLES) scoringLabel = `on (insufficient data for this profile: ${st.outcomes}/${SCORE_MIN_SAMPLES} outcomes — unscored)`;
    else {
      scoringLabel = 'on';
      budgetMax = scoring.budget;
      const bodyLines = (r) => { const t = knowledge.sectionBody(r); return t == null ? null : t.split('\n').length; };
      const floorRefs = [], rankable = [];
      for (const r of refs) (r.tier === 'must' || st.appliedRecent(r.id) ? floorRefs : rankable).push(r);
      let used = 0;
      for (const r of floorRefs) used += bodyLines(r) || 0;
      const ranked = rankable.map(r => ({ r, ...st.scoreOf(r.id), lines: bodyLines(r) })).sort((a, b) => b.score - a.score || a.r.file.localeCompare(b.r.file));
      const packedSet = new Set(floorRefs.map(r => r.id));
      const budgetDropped = [];
      for (const c of ranked) {
        if (c.lines === null) { packedSet.add(c.r.id); continue; }
        if (used + c.lines <= budgetMax) { used += c.lines; packedSet.add(c.r.id); scoreTag[c.r.id] = { score: c.score, n: c.n }; }
        else budgetDropped.push(c);
      }
      if (budgetDropped.length && st.outcomes % SCORE_EXPLORE_EVERY === 0) {
        const a = budgetDropped.shift();
        packedSet.add(a.r.id);
        scoreTag[a.r.id] = { score: a.score, n: a.n, audition: true };
      }
      for (const c of budgetDropped) dropped.push({ id: c.r.id, reason: 'budget', score: c.score, n: c.n });
      packedRefs = refs.filter(r => packedSet.has(r.id));
    }
  }

  // pack order: sections in rank order; each LRN right after the section it overrides, else at the end; EXT last
  const ordered = [];
  const placed = new Set();
  for (const r of packedRefs) {
    ordered.push(r);
    for (const l of lrns) if (l.overridesRef === r.id && !placed.has(l.id)) { ordered.push({ kind: 'LRN', ...l }); placed.add(l.id); }
  }
  for (const l of lrns) if (!placed.has(l.id)) ordered.push({ kind: 'LRN', ...l });
  ordered.push(...ext);

  // render
  const bodyParts = [];
  let used = 0;
  const sources = [];
  for (const s of ordered) {
    let text;
    if (s.kind === 'SEC') { text = knowledge.sectionBody(s); if (text == null) { dropped.push({ id: s.id, reason: 'section text not found' }); continue; } }
    else if (s.kind === 'LRN') text = `**Statement:** ${s.statement}\n**Overrides:** ${s.overrides || 'none'}\n`;
    else text = s.text;
    const n = text.split('\n').length;
    used += n;
    sources.push({ id: s.id, tier: s.kind === 'LRN' ? 'lrn' : s.tier, lines: n, via: s.via, tag: scoreTag[s.id], supersedes: s.supersedes });
    bodyParts.push(s.kind === 'LRN' ? `## ${s.id}\n${text}` : `## ${s.id} — ${s.heading}\n${text}`);
  }

  const fmt = (v) => (Math.round(v * 1000) / 1000).toString();
  const profileLine = Object.entries(profile).filter(([k]) => k !== 'schema' && k !== 'activity').map(([k, v]) => `${k}: ${v}`).join(', ');
  const manifest = [
    '---', 'manifest: 1', `run: ${run.run}`, `activity: ${activity}`, `pfp: ${pfp}`,
    `profile: {${profileLine}}`,
    `compiler: akela ${VERSION}   domain: ${cfg.pack}   scoring: ${scoringLabel}${opts.everything ? '   selection: everything (baseline)' : ''}`,
    `budget: {max: ${budgetMax}, used: ${used}}${budgetMax === 0 ? '   # max 0 = uncapped (unscored compile)' : '   # compiler.budget_lines (the floor packs regardless)'}`,
    'sources:', ...sources.map(x => `  - id: ${x.id}   tier: ${x.tier}   lines: ${x.lines}${x.via ? `   via: ${x.via}` : ''}${x.supersedes ? `   supersedes: ${x.supersedes}` : ''}${x.tag ? `   score: ${fmt(x.tag.score)}   n: ${x.tag.n}${x.tag.audition ? '   (audition)' : ''}` : ''}`),
    'dropped:', ...(dropped.length ? dropped.map(d => `  - id: ${d.id}   reason: ${d.reason}${d.reason === 'budget' ? `   score: ${fmt(d.score)}   n: ${d.n}` : ''}${d.reason === 'source-rewritten' ? `   source: ${d.source}   since: ${d.since}` : ''}`) : ['  []']),
    '---', '',
  ].join('\n');
  const slicePath = path.join(run.dir, 'slice.md');
  fs.writeFileSync(slicePath, manifest + bodyParts.join('\n'));
  fs.writeFileSync(path.join(run.dir, 'profile.json'), JSON.stringify({ ...profile, pfp }, null, 2) + '\n');
  const scratch = path.join(run.dir, 'scratchpad.md');
  if (!fs.existsSync(scratch)) fs.writeFileSync(scratch, `# ${run.run}\n\n${cfg.scratchpad.map(h => `## ${h}\n`).join('\n')}<!-- candidate learnings: anything noteworthy, no evidence bar; capture triggers are applied to these at close -->\n`);

  const hashes = {};
  const lrnById = Object.fromEntries(allLearnings.map(l => [l.id, l]));
  for (const x of sources) {
    if (index[x.id] && index[x.id].hash) hashes[x.id] = index[x.id].hash;
    else if (lrnById[x.id]) hashes[x.id] = require('./util').sha(lrnById[x.id].statement); // learnings version too
  }
  const supersedes = {};
  for (const x of sources) if (x.supersedes) supersedes[x.id] = x.supersedes;
  logMod.appendEvent(cfg, { v: 1, ts: nowIso(), run: run.run, activity, pfp, event: 'compiled', sources: sources.map(x => x.id), hashes, ...(Object.keys(supersedes).length ? { supersedes } : {}), used, max: budgetMax, dropped: dropped.map(d => d.id) }, marker);
  return { slicePath, run, sources, used, scratch };
}

module.exports = { compile, loadIndex, applyScopeOverrides, quarantine };
