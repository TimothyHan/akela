'use strict';
/**
 * Capture vetting — the capture gate as arithmetic (2026-08-25: the prose gate "capture only what the wiki
 * does not say" did not hold; capture volume scaled with model capability — Sonnet 29–38, Opus 101–120 per
 * condition, same prompts, mostly restatements). A model can out-argue a sentence; it cannot out-argue
 * token containment.
 *
 * A candidate statement is rejected when:
 *   restates <source>        — ≥ RESTATE_CONTAINMENT of its content tokens appear in one section's body,
 *                              or the section's tokens are that contained in the candidate (symmetric —
 *                              a candidate that swallows a section verbatim and pads with filler restates it;
 *                              generality audit 2026-08-27: one-way containment scored the padded copy 0.4)
 *   duplicate-of-learning    — same test against an active/promoted learning's statement
 *   duplicate-of-candidate   — token Jaccard ≥ DUP_JACCARD with an already-accepted candidate this pass
 *   cap-exceeded             — more than CAP acceptances in one vetting pass (first come, first kept)
 *
 * Thresholds are CONSTANTS, not config (RFC 0002 §6): tunable gates become ungateable.
 * Vet decides admission to LEARNINGS.md candidacy; a human (or curator agent) still writes the file.
 */
const knowledge = require('./index');
const learningsMod = require('./learnings');

const RESTATE_CONTAINMENT = 0.7;
const DUP_JACCARD = 0.6;
const CAP = 3;

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'are', 'was', 'has', 'have', 'not', 'but', 'its', 'his', 'her', 'their', 'them', 'they', 'when', 'then', 'than', 'must', 'may', 'can', 'will', 'should', 'only', 'all', 'any', 'per', 'into', 'onto', 'from', 'over', 'under', 'more', 'less', 'been', 'does', 'did']);

// Content tokens: words minus stopwords, plus every numeric/amount token — numbers are the
// substance of rules ("$25" vs "$50" is the whole difference between fresh and stale).
// Unicode-aware (generality audit 2026-08-27): the old [^a-z0-9…] split treated every non-Latin
// character as a separator, so a Korean statement was judged by its incidental English residue —
// 3 of 8 real QABuddy learnings falsely rejected, one at containment 1.0 on three tokens.
// Latin tokens keep the ≥3 floor, stoplist, and crude stemming; non-Latin tokens get a ≥2 floor
// and no stemming (exact overlap between identical words is what containment needs; suffix
// stripping designed for English would only manufacture false collisions elsewhere).
const isNum = (t) => /\p{N}/u.test(t);
function tokens(s) {
  const out = new Set();
  for (const t of String(s).toLowerCase().split(/[^\p{L}\p{N}$%.]+/u)) {
    if (!t || t === '$' || t === '.') continue;
    if (isNum(t)) { out.add(t.replace(/\.$/, '')); continue; }
    if (/^[a-z$%.]+$/.test(t)) {
      if (t.length < 3 || STOP.has(t)) continue;
      // crude stemming — enough that "rejects"/"rejected"/"rejecting" and "approve"/"approved" collide
      let w = t;
      for (const suf of ['ment', 'ing', 'ed', 'es', 's']) if (w.length - suf.length >= 3 && w.endsWith(suf)) { w = w.slice(0, -suf.length); break; }
      if (w.length >= 4 && w.endsWith('i')) w = w.slice(0, -1) + 'y'; // applies→appli→apply
      out.add(w);
    } else {
      const w = t.replace(/\.$/, '');
      if (w.length >= 2) out.add(w);
    }
  }
  return out;
}

function containment(a, b) { // fraction of a's tokens found in b
  if (!a.size) return 0;
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / a.size;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0; // no tokens on either side is no evidence of identity, not proof of it
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / (a.size + b.size - n);
}

// The corpus a candidate is tested against: every section body + every non-retired learning statement —
// plus, separately, the retired statements and their "dead values" (numeric tokens that appear in retired
// statements and nowhere in the live corpus). D's churn (2026-08-26): retired hypotheses came back as
// token-novel rephrasings still carrying the dead threshold; evidence already killed the number once.
function corpus(cfg) {
  const { index, errors } = knowledge.build(cfg);
  const entries = [];
  const retired = [];
  if (!errors.length) {
    for (const [id, e] of Object.entries(index)) {
      const body = knowledge.sectionBody(e);
      if (body) entries.push({ id, toks: tokens(`${e.heading} ${body}`) });
    }
  }
  for (const l of learningsMod.parse(cfg)) {
    (l.status === 'retired' ? retired : entries).push({ id: l.id, toks: tokens(l.statement) });
  }
  const liveNums = new Set();
  for (const e of entries) for (const t of e.toks) if (isNum(t)) liveNums.add(t);
  const deadNums = new Map(); // num → [retired entries that carried it]
  for (const r of retired) for (const t of r.toks) if (isNum(t) && !liveNums.has(t)) (deadNums.get(t) || deadNums.set(t, []).get(t)).push(r);
  return { entries, retired, deadNums };
}

// ≥1 shared non-numeric content token — the context test on dead values (generality audit 2026-08-27:
// a bare number is not the identity of a dead rule; a retired "5 days" must not poison "5 screenshots").
function sharesContext(a, b) { for (const t of a) if (!isNum(t) && b.has(t)) return true; return false; }

// Symmetric restatement similarity: a short candidate restating part of a long section is caught by
// candidate→section containment; a long candidate that swallows a section and pads with filler is
// caught by section→candidate. Either direction over the line is a restatement.
function restateSim(candToks, otherToks) { return Math.max(containment(candToks, otherToks), containment(otherToks, candToks)); }

/**
 * Vet candidate statements. Returns [{ statement, verdict: 'accept' | reason, match?, score? }] in input order.
 * Deterministic; no I/O beyond reading the knowledge base once.
 */
function vet(cfg, statements, { cap = CAP } = {}) {
  const { entries: against, retired, deadNums } = corpus(cfg);
  const accepted = [];
  return statements.map((statement) => {
    const toks = tokens(statement);
    for (const t of toks) {
      const owners = deadNums.get(t);
      const hit = owners && owners.find(r => sharesContext(toks, r.toks));
      if (hit) return { statement, verdict: 'recycles-retired', match: hit.id, score: 1 };
    }
    for (const r of retired) { const c = restateSim(toks, r.toks); if (c >= RESTATE_CONTAINMENT) return { statement, verdict: 'recycles-retired', match: r.id, score: Math.round(c * 100) / 100 }; }
    let best = null;
    for (const e of against) {
      const c = restateSim(toks, e.toks);
      if (!best || c > best.score) best = { id: e.id, score: c };
    }
    if (best && best.score >= RESTATE_CONTAINMENT) {
      const verdict = /^LRN-/.test(best.id) ? 'duplicate-of-learning' : 'restates';
      return { statement, verdict, match: best.id, score: Math.round(best.score * 100) / 100 };
    }
    for (const a of accepted) {
      const j = jaccard(toks, a.toks);
      if (j >= DUP_JACCARD) return { statement, verdict: 'duplicate-of-candidate', match: a.statement.slice(0, 60), score: Math.round(j * 100) / 100 };
    }
    if (accepted.length >= cap) return { statement, verdict: 'cap-exceeded' };
    accepted.push({ statement, toks });
    return { statement, verdict: 'accept', ...(best && best.score > 0 ? { nearest: best.id, score: Math.round(best.score * 100) / 100 } : {}) };
  });
}

// Post-hoc: does an existing learning's statement restate a section? (for stats / check annotation)
function restates(cfg, learning, index) {
  const toks = tokens(learning.statement);
  let best = null;
  for (const [id, e] of Object.entries(index)) {
    if (id === learning.promotedTo) continue; // its own promoted copy is supposed to match
    const body = knowledge.sectionBody(e);
    if (!body) continue;
    const c = restateSim(toks, tokens(`${e.heading} ${body}`));
    if (!best || c > best.score) best = { id, score: c };
  }
  return best && best.score >= RESTATE_CONTAINMENT ? { id: best.id, score: Math.round(best.score * 100) / 100 } : null;
}

module.exports = { vet, restates, tokens, containment, jaccard, RESTATE_CONTAINMENT, DUP_JACCARD, CAP };
