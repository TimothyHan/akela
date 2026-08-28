'use strict';
/**
 * Runs and the evidence log (RFC 0001 §3.3, §3.7).
 *
 * Log line (schema v1):
 *   {"v":1,"ts":"…","run":"qa-PROJ-456-3f9a2c","activity":"qa","event":"applied","src":"LRN-20260808-03"}
 * Events: applied | contradicted (+note) | captured | outcome (+status) — compiled | escalated are written by compile.
 * The model never writes JSON; this helper does. Lines are mirrored into <run>/events.jsonl.
 * Lines written by QABuddy carry `skill` instead of `activity`; readers accept both.
 */
const fs = require('fs');
const path = require('path');
const { die, nowIso, sha, gitBranch, readJsonl, appendJsonl } = require('./util');
const { ID_RE } = require('./learnings');

const EVENTS = ['applied', 'contradicted', 'captured', 'outcome', 'compiled', 'escalated'];

function activityOf(l) { return l.activity || l.skill || 'unknown'; }

function readMarker(cfg) {
  if (!fs.existsSync(cfg.marker)) return null;
  try { return JSON.parse(fs.readFileSync(cfg.marker, 'utf8')); } catch { return null; }
}

function startRun(cfg, activity, task) {
  const scope = task || gitBranch(cfg.root);
  const run = `${activity}-${scope}-${sha(`${nowIso()}|${process.pid}|${Math.random()}`, 6)}`;
  const dir = path.join(cfg.runs, run);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.dirname(cfg.marker), { recursive: true });
  fs.writeFileSync(cfg.marker, JSON.stringify({ run, activity, task: task || undefined, dir, started: nowIso() }) + '\n');
  return { run, activity, task, dir };
}

function currentRun(cfg, args, opt) {
  const marker = readMarker(cfg);
  const run = opt(args, 'run') || process.env.AKELA_RUN || (marker && marker.run) || 'unknown';
  const activity = opt(args, 'activity', 'skill') || (marker && (marker.activity || marker.skill)) || 'unknown';
  const dir = (marker && marker.run === run && marker.dir) ? marker.dir : path.join(cfg.runs, run);
  return { marker, run, activity, dir };
}

function readLog(cfg, since) {
  const { lines: all, malformed } = readJsonl(cfg.logPath, o => !!o.event);
  let manual = 0;
  const lines = [];
  for (const l of all) {
    if (since && l.ts && l.ts.slice(0, 10) < since) continue;
    if (l.writer === 'manual') manual++;
    lines.push(l);
  }
  return { lines, malformed, manual };
}

// A run is closed by its outcome; anything appended afterwards belongs to different work.
function outcomeOf(cfg, run) {
  if (!run || run === 'unknown') return null;
  for (const l of readJsonl(cfg.logPath).lines) if (l.run === run && l.event === 'outcome') return l;
  return null;
}

function appendEvent(cfg, line, marker) {
  appendJsonl(cfg.logPath, line);
  const dir = (marker && marker.run === line.run && marker.dir) ? marker.dir : path.join(cfg.runs, line.run);
  if (fs.existsSync(dir)) fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(line) + '\n');
}

// Source ids: LRN- (any well-formed), EXT- (retriever output, any well-formed), or a section id that
// must exist in the index (REF-/PRJ-/<NS>-). `resolveIndex` is lazy so `log` stays cheap when not needed.
function validateSrc(src, resolveIndex) {
  if (ID_RE.test(src)) return;
  if (/^EXT-/.test(src)) { if (!/^EXT-[a-z0-9-]+#[a-z0-9-]+$/.test(src)) die(`malformed EXT id "${src}" — form is EXT-<retriever>#<id>`); return; }
  const m = src.match(/^([A-Z][A-Z0-9]+)-([a-z0-9ㄱ-힝-]+(?:\/[a-z0-9ㄱ-힝-]+)*)#([a-z0-9ㄱ-힝-]+)$/);
  if (!m) die(`source id must be LRN-YYYYMMDD-NN, EXT-<name>#<id> or <NS>-<file-stem>#<id>, got "${src}"`);
  const { index, nearest, namespaces } = resolveIndex();
  if (!namespaces.has(m[1])) die(`unknown namespace "${m[1]}" in "${src}" — configured knowledge roots: ${[...namespaces].join(', ') || '(none)'}`);
  if (!index[src]) { const near = nearest(src); die(`unknown section id "${src}"${near.length ? ` — did you mean: ${near.join(', ')}` : ''}`); }
}

module.exports = { EVENTS, activityOf, readMarker, startRun, currentRun, readLog, outcomeOf, appendEvent, validateSrc };
