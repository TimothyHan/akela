'use strict';
/**
 * Project configuration = akela.json (project root) layered over a domain pack.
 *
 * A domain pack describes "what kind of work happens here" — activities, profile probes, the
 * fingerprint vocabulary, outcome statuses, the scratchpad template. Built-ins live in domains/;
 * `domain` may also be a path. Any pack field may be overridden inline in akela.json.
 *
 * Nothing here is tunable scoring; the constants that shape selection stay constants (RFC 0002 §6).
 */
const fs = require('fs');
const path = require('path');
const { die, expandHome, globToRe } = require('./util');

const CONFIG_FILE = 'akela.json';
const CONFIG_KEYS = new Set(['domain', 'knowledge', 'learnings', 'runs', 'compiler', 'activities', 'profile', 'fingerprints', 'statuses', 'scratchpad', 'idTag', 'aliasPrefixes']);
const COMPILER_KEYS = new Set(['scope', 'scoring', 'budget_lines', 'scoringOverride', 'retrievers']);
const PACK_KEYS = new Set(['name', 'activities', 'profile', 'fingerprints', 'statuses', 'scratchpad', 'knowledge', 'learnings', 'runs', 'idTag', 'aliasPrefixes']);

function cwd() { return process.env.AKELA_CWD ? path.resolve(process.env.AKELA_CWD) : process.cwd(); }

function readProjectConfig(root) {
  const p = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(p)) return {};
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { die(`${CONFIG_FILE} is not valid JSON: ${e.message}`); }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) die(`${CONFIG_FILE} must be a JSON object`);
  // Loud config: a mistyped key silently disabling a capability is the failure mode RFC 0002 decision 3 exists to prevent.
  for (const k of Object.keys(cfg)) if (!CONFIG_KEYS.has(k)) die(`unknown key "${k}" in ${CONFIG_FILE} — known keys: ${[...CONFIG_KEYS].join(', ')}`);
  if (cfg.compiler !== undefined) {
    if (!cfg.compiler || typeof cfg.compiler !== 'object' || Array.isArray(cfg.compiler)) die(`"compiler" in ${CONFIG_FILE} must be an object`);
    for (const k of Object.keys(cfg.compiler)) if (!COMPILER_KEYS.has(k)) die(`unknown compiler key "${k}" in ${CONFIG_FILE} — known keys: ${[...COMPILER_KEYS].join(', ')}`);
  }
  return cfg;
}

function loadPack(name, root) {
  const builtin = path.join(__dirname, '..', 'domains', `${name}.json`);
  const candidate = fs.existsSync(builtin) ? builtin : path.resolve(root, expandHome(name));
  if (!fs.existsSync(candidate)) die(`domain "${name}" not found — neither a built-in pack (${path.relative(process.cwd(), builtin)}) nor a file`);
  let pack;
  try { pack = JSON.parse(fs.readFileSync(candidate, 'utf8')); } catch (e) { die(`domain pack ${candidate} is not valid JSON: ${e.message}`); }
  for (const k of Object.keys(pack)) if (!PACK_KEYS.has(k)) die(`domain pack ${candidate}: unknown key "${k}"`);
  return { ...pack, _path: candidate };
}

let cache = null;
function load() {
  if (cache) return cache;
  const root = cwd();
  const project = readProjectConfig(root);
  const pack = loadPack(project.domain || 'default', root);
  const pick = (k, fallback) => project[k] !== undefined ? project[k] : pack[k] !== undefined ? pack[k] : fallback;

  const knowledge = pick('knowledge', []);
  if (!Array.isArray(knowledge)) die('"knowledge" must be an array of { path, namespace, untagged? }');
  const roots = knowledge.map((k, i) => {
    if (!k || typeof k !== 'object' || typeof k.path !== 'string' || !k.path.trim()) die(`knowledge[${i}] needs a "path"`);
    for (const kk of Object.keys(k)) if (!['path', 'namespace', 'untagged', 'exclude'].includes(kk)) die(`knowledge[${i}]: unknown key "${kk}"`);
    const namespace = k.namespace || 'REF';
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(namespace)) die(`knowledge[${i}].namespace "${namespace}" must be 2–8 uppercase letters/digits (it prefixes every section id)`);
    if (['LRN', 'EXT'].includes(namespace)) die(`knowledge[${i}].namespace "${namespace}" is reserved (LRN = learnings, EXT = retrievers)`);
    const untagged = k.untagged || 'refuse';
    if (!['refuse', 'derive'].includes(untagged)) die(`knowledge[${i}].untagged must be "refuse" or "derive"`);
    const exclude = k.exclude || [];
    if (!Array.isArray(exclude) || exclude.some(x => typeof x !== 'string' || !x.trim())) die(`knowledge[${i}].exclude must be an array of glob strings`);
    return { path: path.resolve(root, expandHome(k.path)), rel: k.path, namespace, untagged, exclude, excludeRes: exclude.map(globToRe) };
  });
  const seen = new Set();
  for (const r of roots) { if (seen.has(r.namespace)) die(`two knowledge roots share the namespace "${r.namespace}"`); seen.add(r.namespace); }

  const learnings = path.resolve(root, expandHome(pick('learnings', 'akela/LEARNINGS.md')));
  const runs = path.resolve(root, expandHome(pick('runs', '.akela/runs')));
  const statuses = pick('statuses', ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT']);
  const fingerprints = pick('fingerprints', []);
  const activities = pick('activities', null);
  const profile = pick('profile', {});
  const scratchpad = pick('scratchpad', ['Plan', 'State', 'Findings', 'Candidate learnings']);
  const idTag = pick('idTag', 'akela');
  const aliasPrefixes = pick('aliasPrefixes', []);
  if (!Array.isArray(aliasPrefixes) || aliasPrefixes.some(x => typeof x !== 'string' || !x.trim())) die('"aliasPrefixes" must be an array of non-empty strings');
  for (const [label, v] of [['statuses', statuses], ['fingerprints', fingerprints]]) {
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x.trim())) die(`"${label}" must be an array of strings`);
  }
  if (activities !== null && (!Array.isArray(activities) || activities.some(x => typeof x !== 'string'))) die('"activities" must be an array of strings');

  cache = {
    root, pack: pack.name || project.domain || 'default', packPath: pack._path,
    roots, learnings, kbDir: path.dirname(learnings),
    logPath: path.join(path.dirname(learnings), 'learnings-log.jsonl'),
    fpPath: path.join(path.dirname(learnings), 'fingerprints.jsonl'),
    scoreboardPath: path.join(path.dirname(learnings), '.cache', 'scoreboard.json'),
    runs, marker: path.join(path.dirname(runs), 'run'),
    statuses, fingerprints, activities, profile, scratchpad, idTag, aliasPrefixes,
    compiler: project.compiler || {},
  };
  return cache;
}

// Display-only relative path with forward slashes on every OS.
function rel(p) { return path.relative(load().root, p).split(path.sep).join('/'); }

module.exports = { load, rel, cwd, CONFIG_FILE };
