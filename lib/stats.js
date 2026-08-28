'use strict';
/**
 * Distill arithmetic (RFC 0001 §6.2) — replaces prose judgement with counts:
 *   promotion candidate = (LRN | EXT) ∧ applied ≥ 3 across ≥ 3 runs ∧ contradicted = 0 ∧ no fingerprint hit ∧ own ffp silent since creation
 *                         (an EXT candidate is promoted INTO the wiki, retiring the section it `supersedes`)
 *   falsified           = contradicted ≥ 2 (and not re-applied since) — or any fingerprint line naming it in `active`
 *   duplicate           = active LRNs sharing Fingerprint ∧ Scope → newer ones duplicate the oldest
 *   never applied       = in_slice ≥ 10 ∧ applied = 0   (dormancy, decision 5)
 * A human approves every status change; this only computes.
 *
 * Gate (RFC 0001 §9.3 / RFC 0002 §2.3): scored selection may be considered only if ≥ 2 profiles carry
 * ≥ 8 attributed outcomes each AND application is uneven. The report assembles evidence; it never
 * classifies causes — that judgement is the expert's (decision 6).
 */
const { activityOf } = require('./log');

const NEVER_APPLIED_MIN_IN_SLICE = 10;
const FALSIFY_WINDOW = 3; // recency window for falsification (b): the last N runs that applied or contradicted the source
const GATE_MIN_PROFILES = 2;
const GATE_MIN_OUTCOMES = 8;
const GATE_APPLIED_RUNS = 3;

function kindOf(src) { return src.startsWith('LRN-') ? 'LRN' : src.startsWith('EXT-') ? 'EXT' : (src.match(/^([A-Z0-9]+)-/) || [])[1] || 'REF'; }

function computeStats(lines, fps = [], learnings = [], index = null) {
  // Version-scoped evidence (2026-08-27): applied/contradicted attach to the CONTENT a run actually saw, not to
  // the id. `compiled` events carry per-source content hashes; when the current content differs, evidence earned
  // by prior text is set aside as `prior_versions` and does not falsify (or promote) the new text — a rewritten
  // section starts with a clean record. E2-wiki's over-retirement (the human's fresh correction killed by blame
  // inherited from the old text and its neighbours) is the incident this exists to prevent. Events from runs with
  // no recorded hash for the source (old logs, EXT) count against the current version — back-compatible.
  const currentHash = {};
  if (index) for (const [id, e] of Object.entries(index)) if (e.hash) currentHash[id] = e.hash;
  const sha = require('./util').sha;
  for (const l of learnings) currentHash[l.id] = sha(l.statement);
  const runHash = {}; // run → { src → hash-at-compile }
  for (const l of lines) if (l.event === 'compiled' && l.run && l.hashes) runHash[l.run] = l.hashes;
  const sameVersion = (src, run) => {
    if (!currentHash[src]) return true;
    const h = runHash[run] && runHash[run][src];
    return h === undefined || h === currentHash[src];
  };
  const per = {};
  const prior = {}; // src → { applied, contradicted } earned by earlier content
  const runsWithOutcome = new Set();
  const outcomes = {};
  const mk = () => ({ applied: 0, contradicted: 0, captured: 0, in_slice: 0, last_applied: null, last_contradicted: null, runs: new Set(), contradicted_runs: new Set(), touched: [] });
  for (const l of lines) {
    if (l.event === 'outcome') { runsWithOutcome.add(l.run); outcomes[l.status] = (outcomes[l.status] || 0) + 1; continue; }
    if (l.event === 'compiled' && Array.isArray(l.sources)) { for (const id of l.sources) (per[id] || (per[id] = mk())).in_slice++; continue; }
    if (!l.src) continue;
    if ((l.event === 'applied' || l.event === 'contradicted') && !sameVersion(l.src, l.run)) {
      const p0 = prior[l.src] || (prior[l.src] = { applied: 0, contradicted: 0 });
      p0[l.event === 'applied' ? 'applied' : 'contradicted']++;
      continue;
    }
    const s = per[l.src] || (per[l.src] = mk());
    if (l.event === 'applied') { s.applied++; s.runs.add(l.run); if (!s.last_applied || l.ts > s.last_applied) s.last_applied = l.ts; if (!s.touched.includes(l.run)) s.touched.push(l.run); }
    else if (l.event === 'contradicted') { s.contradicted++; s.contradicted_runs.add(l.run); if (!s.last_contradicted || l.ts > s.last_contradicted) s.last_contradicted = l.ts; if (!s.touched.includes(l.run)) s.touched.push(l.run); }
    else if (l.event === 'captured') s.captured++;
  }
  const byId = {};
  for (const l of learnings) { byId[l.id] = l; if ((l.status === 'active' || l.status === 'promoted') && !per[l.id]) per[l.id] = mk(); } // promoted ones stay visible: they are live family members

  const fpr = {};
  for (const f of fps) {
    const r = fpr[f.ffp] || (fpr[f.ffp] = { ffp: f.ffp, kind: f.kind, key: f.key, count: 0, runs: new Set(), active: new Set(), first: f.ts, last: f.ts });
    r.count++; r.key = f.key; if (f.run) r.runs.add(f.run);
    for (const id of (f.active || [])) r.active.add(id);
    if (f.ts && f.ts < r.first) r.first = f.ts; if (f.ts && f.ts > r.last) r.last = f.ts;
  }
  const fingerprints = Object.values(fpr).map(r => ({ ...r, runs: r.runs.size, active: [...r.active].sort() })).sort((a, b) => b.count - a.count || a.ffp.localeCompare(b.ffp));
  const fpHits = {};
  for (const f of fps) for (const id of (f.active || [])) { const h = fpHits[id] || (fpHits[id] = { count: 0, ffps: new Set() }); h.count++; h.ffps.add(f.ffp); }
  const dupOf = {};
  const groups = {};
  for (const l of learnings) if (l.status === 'active' && l.fingerprint) (groups[`${l.fingerprint}|${[...l.scope].map(x => x.toLowerCase()).sort().join(',')}`] ||= []).push(l.id);
  for (const ids of Object.values(groups)) { if (ids.length < 2) continue; const sorted = [...ids].sort(); for (const id of sorted.slice(1)) dupOf[id] = sorted[0]; }
  const lrnDate = id => { const m = id.match(/^LRN-(\d{4})(\d{2})(\d{2})-/); return m ? `${m[1]}-${m[2]}-${m[3]}` : '0000-00-00'; };
  const recurrenceSince = (id) => { const l = byId[id]; if (!l || !l.fingerprint) return 0; const d = lrnDate(id); return fps.filter(f => f.ffp === l.fingerprint && (f.ts || '').slice(0, 10) >= d).length; };

  // Lineage (2026-08-23): a promoted learning, the section it became (`from=` / `Promoted-to:`), and the section it
  // `Overrides` are one fact in up to three places. Families share blame: if any member is falsified, all are flagged.
  const families = {};
  const link = (a, b) => { if (!a || !b) return; (families[a] ||= new Set()).add(b); (families[b] ||= new Set()).add(a); };
  for (const l of learnings) { if (l.promotedTo) link(l.id, l.promotedTo); if (l.promotedTo && l.overridesRef) link(l.promotedTo, l.overridesRef); if (l.status === 'promoted' && l.overridesRef) link(l.id, l.overridesRef); }
  if (index) for (const [id, e] of Object.entries(index)) if (e.from) { link(id, e.from); const lrn = byId[e.from]; if (lrn && lrn.overridesRef) link(id, lrn.overridesRef); }
  const familyOf = (id) => { const seen = new Set([id]); const q = [id]; while (q.length) { for (const n of (families[q.shift()] || [])) if (!seen.has(n)) { seen.add(n); q.push(n); } } seen.delete(id); return [...seen].sort(); };

  // Rewrites: per-source content hashes ride on `compiled` events; a change between compiles — or between the
  // last compile and the index now — means a human edited the text. The cue the curator never had.
  const lastHash = {}, rewrittenAt = {};
  for (const l of lines) {
    if (l.event !== 'compiled' || !l.hashes) continue;
    for (const [id, h] of Object.entries(l.hashes)) { if (lastHash[id] && lastHash[id] !== h) rewrittenAt[id] = l.run; lastHash[id] = h; }
  }
  if (index) for (const [id, e] of Object.entries(index)) if (lastHash[id] && e.hash && lastHash[id] !== e.hash) rewrittenAt[id] = 'since last compile';

  // EXT (retrieved) sources: what each claimed to supersede, from compiled events — a promoted note should retire it
  const supersedes = {};
  for (const l of lines) if (l.event === 'compiled' && l.supersedes) Object.assign(supersedes, l.supersedes);

  const pre = {};
  for (const [src, s] of Object.entries(per)) {
    const recent = s.touched.slice(-FALSIFY_WINDOW);
    const recentContradicted = recent.filter(r => s.contradicted_runs.has(r)).length;
    const hit = fpHits[src];
    pre[src] = (s.contradicted >= 2 && (!s.last_applied || (s.last_contradicted && s.last_applied < s.last_contradicted))) || (s.contradicted_runs.size >= 2 && recentContradicted >= 2) || (hit && hit.count > 0);
  }
  const rows = Object.entries(per).map(([src, s]) => {
    const hit = fpHits[src];
    const falsifiedFp = hit ? hit.count : 0;
    // Two ways to be falsified by contradiction:
    //  (a) RFC 0001 §6.2: contradicted ≥ 2 and not applied since — the shape for a learning the worker stops using;
    //  (b) recency: contradicted in ≥ 2 distinct runs AND in ≥ 2 of the last FALSIFY_WINDOW runs that touched it —
    //      the shape for a must-floor section that is packed and cited every run, so (a) can never fire for it
    //      (found in the first supervised run, 2026-08-22: refunds#approval applied 18×, contradicted 3×, never falsified).
    const recent = s.touched.slice(-FALSIFY_WINDOW);
    const recentContradicted = recent.filter(r => s.contradicted_runs.has(r)).length;
    const falsified = (s.contradicted >= 2 && (!s.last_applied || (s.last_contradicted && s.last_applied < s.last_contradicted)))
      || (s.contradicted_runs.size >= 2 && recentContradicted >= 2);
    const kind = kindOf(src);
    const family = familyOf(src);
    const falsifiedVia = family.filter(m => pre[m]);
    return {
      src, kind, applied: s.applied, contradicted: s.contradicted, captured: s.captured, in_slice: s.in_slice, runs: s.runs.size,
      last_applied: s.last_applied ? s.last_applied.slice(0, 10) : null,
      // LRN → reference; EXT (a retrieved note applied again and again, never contradicted) → the wiki, retiring what it supersedes.
      // Retrieved context must become source, not stay an overlay (E2-rag 2026-08-24: right answers, stale floor never retired).
      promotion_candidate: (kind === 'LRN' || kind === 'EXT') && s.applied >= 3 && s.runs.size >= 3 && s.contradicted === 0 && falsifiedFp === 0 && recurrenceSince(src) === 0,
      ...(supersedes[src] ? { supersedes: supersedes[src] } : {}),
      falsified, contradicted_runs: s.contradicted_runs.size, recent_contradicted: recentContradicted, falsified_by_fingerprint: falsifiedFp, fingerprint_ffps: hit ? [...hit.ffps].sort() : [],
      never_applied: s.in_slice >= NEVER_APPLIED_MIN_IN_SLICE && s.applied === 0,
      duplicate_of: dupOf[src] || null,
      family, falsified_via: falsifiedVia, rewritten_at: rewrittenAt[src] || null,
      ...(prior[src] ? { prior_versions: prior[src] } : {}),
      source_rewritten: (() => { const lrn = kind === 'LRN' ? byId[src] : (index && index[src] && index[src].from ? byId[index[src].from] : null); const t = lrn && lrn.overridesRef; return t && rewrittenAt[t] ? { source: t, at: rewrittenAt[t] } : null; })(),
    };
  }).sort((a, b) => b.applied - a.applied || a.src.localeCompare(b.src));

  // New-page drift: a derive-mode section no scope claims never packs, never earns events, and would
  // otherwise be invisible here. Tags are managed by curation; stats is where the drift must surface.
  for (const [id, e] of Object.entries(index || {})) {
    if (e.derived && e.scope.includes('all') && e.tier !== 'must' && !per[id]) {
      rows.push({ src: id, kind: kindOf(id), applied: 0, contradicted: 0, captured: 0, in_slice: 0, runs: 0,
        last_applied: null, promotion_candidate: false, falsified: false, contradicted_runs: 0,
        recent_contradicted: 0, falsified_by_fingerprint: 0, fingerprint_ffps: [], never_applied: false,
        duplicate_of: null, family: [], falsified_via: [], rewritten_at: null, source_rewritten: null, unscoped: true });
    }
  }

  // Citation compliance: of runs with an outcome, how many cited ≥1 section / ≥1 learning. Per activity.
  const runsBy = {};
  for (const l of lines) {
    if (!l.run) continue;
    const r = runsBy[l.run] || (runsBy[l.run] = { activity: activityOf(l), outcome: false, ref: false, lrn: false });
    if (l.event === 'outcome') r.outcome = true;
    if (l.event === 'applied' && l.src) { if (l.src.includes('#') && !l.src.startsWith('LRN-')) r.ref = true; else r.lrn = true; }
  }
  const compliance = {};
  for (const r of Object.values(runsBy)) {
    if (!r.outcome) continue;
    const c = compliance[r.activity] || (compliance[r.activity] = { runs: 0, with_ref: 0, with_lrn: 0 });
    c.runs++; if (r.ref) c.with_ref++; if (r.lrn) c.with_lrn++;
  }
  return { rows, fingerprints, runs_with_outcome: runsWithOutcome.size, outcomes, compliance };
}

function findingLabel(r) {
  const f = [];
  if (r.falsified) f.push('falsified (contradiction)');
  if (r.falsified_by_fingerprint) f.push(`falsified (fingerprint ${r.fingerprint_ffps.join(',')} ×${r.falsified_by_fingerprint})`);
  if (r.duplicate_of) f.push(`duplicate (fingerprint) of ${r.duplicate_of}`);
  if (r.never_applied) f.push(`never applied (in_slice ${r.in_slice})`);
  if (r.unscoped) f.push('unscoped (derive-mode) — never packs; scope it or leave it out');
  if (r.falsified_via && r.falsified_via.length && !r.falsified && !r.falsified_by_fingerprint) f.push(`falsified via family (${r.falsified_via.join(', ')})`);
  if (r.source_rewritten) f.push(`source ${r.source_rewritten.source} rewritten at ${r.source_rewritten.at} — review this copy`);
  else if (r.rewritten_at) f.push(`rewritten at ${r.rewritten_at}`);
  if (r.promotion_candidate) f.push(r.kind === 'EXT' ? `promotion candidate → wiki${r.supersedes ? ` (retire ${r.supersedes})` : ''}` : 'promotion candidate');
  return f.join('; ');
}

function computeGate(lines, fps, learnings) {
  const stats = computeStats(lines, fps, learnings);
  const runPfp = {};
  for (const l of lines) if (l.event === 'compiled' && l.run && l.pfp) runPfp[l.run] = l.pfp;
  const perPfp = {};
  let noProfileRuns = 0;
  for (const l of lines) {
    if (l.event !== 'outcome' || !l.run) continue;
    const pfp = runPfp[l.run];
    if (!pfp) { noProfileRuns++; continue; }
    const p = perPfp[pfp] || (perPfp[pfp] = { outcomes: 0, statuses: {} });
    p.outcomes++;
    if (l.status) p.statuses[l.status] = (p.statuses[l.status] || 0) + 1;
  }
  const profiles = Object.entries(perPfp).map(([pfp, p]) => ({ pfp, ...p })).sort((a, b) => b.outcomes - a.outcomes || a.pfp.localeCompare(b.pfp));
  const qualified = profiles.filter(p => p.outcomes >= GATE_MIN_OUTCOMES);
  const thresholdMet = qualified.length >= GATE_MIN_PROFILES;
  const dormant = stats.rows.filter(r => r.never_applied).map(r => ({ src: r.src, kind: r.kind, in_slice: r.in_slice }));
  const appliedRepeatedly = stats.rows.filter(r => r.runs >= GATE_APPLIED_RUNS).map(r => ({ src: r.src, runs: r.runs }));
  const uneven = dormant.length > 0 && appliedRepeatedly.length > 0;
  const slices = {};
  for (const l of lines) {
    if (l.event !== 'compiled' || typeof l.used !== 'number') continue;
    const key = activityOf(l);
    const s = slices[key] || (slices[key] = { compiles: 0, total: 0, last: 0 });
    s.compiles++; s.total += l.used; s.last = l.used;
  }
  const slice_by_activity = {};
  for (const [a, s] of Object.entries(slices)) slice_by_activity[a] = { compiles: s.compiles, last: s.last, mean: Math.round(s.total / s.compiles) };
  const eligible = thresholdMet && uneven;
  const reason = !thresholdMet
    ? `needs ≥ ${GATE_MIN_PROFILES} profiles with ≥ ${GATE_MIN_OUTCOMES} outcomes each — have ${qualified.length} (${profiles.length} profile${profiles.length === 1 ? '' : 's'} seen${noProfileRuns ? `, ${noProfileRuns} outcome run${noProfileRuns === 1 ? '' : 's'} without a profile not counted` : ''})`
    : !uneven
      ? (dormant.length === 0
        ? `application is not uneven: no dormant source (in_slice ≥ ${NEVER_APPLIED_MIN_IN_SLICE} ∧ applied = 0) — there is nothing for scoring to demote`
        : `application is not uneven: no source applied in ≥ ${GATE_APPLIED_RUNS} distinct runs yet — the applied side of the contrast is missing`)
      : `${qualified.length} profiles carry ≥ ${GATE_MIN_OUTCOMES} outcomes and application is uneven (${dormant.length} dormant vs ${appliedRepeatedly.length} repeatedly-applied sources)`;
  return {
    thresholds: { min_profiles: GATE_MIN_PROFILES, min_outcomes: GATE_MIN_OUTCOMES, dormant_min_in_slice: NEVER_APPLIED_MIN_IN_SLICE, applied_min_runs: GATE_APPLIED_RUNS },
    profiles, no_profile_runs: noProfileRuns, threshold_met: thresholdMet, dormant, applied_repeatedly: appliedRepeatedly, uneven,
    slice_by_activity, eligible, reason,
  };
}

module.exports = { computeStats, computeGate, findingLabel, NEVER_APPLIED_MIN_IN_SLICE, FALSIFY_WINDOW, GATE_MIN_PROFILES, GATE_MIN_OUTCOMES, GATE_APPLIED_RUNS };
