'use strict';
/**
 * Failure fingerprints (RFC 0001 §3.4). A fingerprint names a failure CLASS, not an incident: the
 * same failure on the same thing hashes the same across runs even though run ids, timestamps and
 * entity entropy differ. A later run's failure then counts as evidence against the learning that
 * claimed to prevent it (`active`) — automatic falsification, no judgement call.
 *
 * The vocabulary of kinds is the domain pack's — closed, grown deliberately, never ad hoc.
 */
const fs = require('fs');
const path = require('path');
const { sha, readJsonl, appendJsonl, readLines } = require('./util');

// Strip the per-incident parts of a key: ISO timestamps/dates, UUIDs, hex hashes (≥7 with a digit),
// :ports, digit runs ≥5; lowercase; collapse whitespace and repeated/dangling separators.
function normalizeKey(key) {
  return String(key).toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?z?)?/g, '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '')
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{7,}\b/g, '')
    .replace(/:\d{2,5}\b/g, '')
    .replace(/\d{5,}/g, '')
    .replace(/\s+/g, ' ')
    .replace(/([-_/.:# ])\1+/g, '$1')
    .replace(/[-_.:#]+(?=[\s/)]|$)/g, '')
    .replace(/(^|[\s/(])[-_.:#]+/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function fingerprintOf(kind, key) { return sha(`${kind}\n${normalizeKey(key)}`); }

function readFps(cfg) { return readJsonl(cfg.fpPath, o => !!(o.ffp && o.kind)); }

// LRN ids the run's slice packed (manifest `sources:` block) — null when the run has no slice.
function sliceLrnIds(dir) {
  const lines = readLines(path.join(dir, 'slice.md'));
  if (!lines) return null;
  const fm = lines.join('\n').split('\n---\n')[0];
  const block = (fm.split('\nsources:\n')[1] || '').split('\ndropped:')[0];
  return [...block.matchAll(/^  - id: (LRN-\d{8}-\d{2})/gm)].map(m => m[1]);
}

function record(cfg, { run, activity, dir }, kind, key, learnings, ts) {
  const ffp = fingerprintOf(kind, key);
  const inSlice = sliceLrnIds(dir);
  const candidates = inSlice !== null ? inSlice
    : learnings.filter(l => l.status === 'active' && (l.scope.includes('all') || l.scope.includes(activity))).map(l => l.id);
  const active = learnings.filter(l => candidates.includes(l.id) && l.fingerprint === ffp).map(l => l.id);
  let pfp;
  const profileFile = path.join(dir, 'profile.json');
  if (fs.existsSync(profileFile)) { try { pfp = JSON.parse(fs.readFileSync(profileFile, 'utf8')).pfp; } catch { /* derived only */ } }
  const line = { v: 1, ts, run, activity, ...(pfp ? { pfp } : {}), ffp, kind, key, active };
  appendJsonl(cfg.fpPath, line);
  if (fs.existsSync(dir)) fs.appendFileSync(path.join(dir, 'fingerprints.jsonl'), JSON.stringify(line) + '\n');
  return line;
}

module.exports = { normalizeKey, fingerprintOf, readFps, record };
