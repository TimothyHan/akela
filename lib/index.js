'use strict';
/**
 * Knowledge index — every `##` section of every file under every knowledge root becomes an
 * addressable source `<NS>-<file-stem>#<id>` (RFC 0001 §3.1). Built at compile time; no build step.
 *
 * Tagged root (default):  the line after a heading carries `<!-- akela: id=… scope=… tier=… -->`
 *                         (`qab:` is accepted for QABuddy content). Missing ids are errors.
 * Derived root:           ids are slugs of headings; scope=all, tier=should unless a tag says otherwise.
 *                         Lets an existing wiki plug in with zero edits — and contributes nothing
 *                         until the expert scopes sections (RFC 0001 PR5: scope=all ∧ ¬must is not packed).
 *
 * H1 comment carries file-level defaults (scope=, tier=) and may carry id= for files whose knowledge
 * sits under the H1. README.md / index.md are navigation, excluded. `##` inside fences is not a heading.
 */
const fs = require('fs');
const path = require('path');
const { readLines, slug, sha } = require('./util');

const EXCLUDE = new Set(['README.md', 'index.md']);
const TIERS = new Set(['must', 'should', 'context']);

function parseTag(line, tag) {
  const m = line.match(new RegExp(`^<!--\\s*(?:${tag}|qab):\\s*(.*?)\\s*-->\\s*$`));
  if (!m) return null;
  const out = {};
  for (const tok of m[1].split(/\s+/).filter(Boolean)) {
    const kv = tok.match(/^([a-z_]+)=(.+)$/);
    if (!kv) return { error: `bad token "${tok}"` };
    out[kv[1]] = kv[2];
  }
  return out;
}

function isTagLine(line) { return /^<!--\s*(?:[a-z]+):\s/.test(line) && /^<!--\s*(?:akela|qab):/.test(line); }

function listFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { if (name !== 'bin' && !name.startsWith('.')) out.push(...listFiles(p, prefix + name + '/')); }
    else if (name.endsWith('.md') && !EXCLUDE.has(name)) out.push(prefix + name);
  }
  return out;
}

function parseFile(root, relFile, index, errors, tag) {
  const abs = path.join(root.path, relFile);
  const lines = readLines(abs);
  const display = `${root.rel}/${relFile}`;
  const stem = relFile.replace(/\.md$/, '');
  const derive = root.untagged === 'derive';
  let fence = false, fileScope = 'all', fileTier = 'should', seenH1 = false;
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) { fence = !fence; continue; }
    if (fence) continue;
    const isH1 = l.startsWith('# ') && !seenH1;
    const isH2 = l.startsWith('## ');
    if (!isH1 && !isH2) continue;
    const heading = l.replace(/^#+\s*/, '').trim();
    const c = i + 1 < lines.length ? parseTag(lines[i + 1], tag) : null;
    if (c && c.error) { errors.push(`${display}:${i + 2}: ${c.error}`); continue; }
    if (isH1) {
      seenH1 = true;
      if (c) {
        if (c.scope) fileScope = c.scope;
        if (c.tier) { if (!TIERS.has(c.tier)) errors.push(`${display}:${i + 2}: unknown tier "${c.tier}"`); else fileTier = c.tier; }
        if (c.id) sections.push({ id: c.id, heading, start: i, scope: c.scope || fileScope, tier: c.tier || fileTier, h1: true });
      }
      continue;
    }
    const last = sections[sections.length - 1];
    if (last && last.h1 && last.end === undefined) last.end = i;
    let id = c && c.id;
    if (!id) {
      if (!derive) { errors.push(`${display}:${i + 1}: "## ${heading}" has no <!-- ${tag}: id=… --> comment on the next line`); continue; }
      id = slug(heading);
    }
    if (c && c.tier && !TIERS.has(c.tier)) errors.push(`${display}:${i + 2}: unknown tier "${c.tier}"`);
    if (last && !last.h1) last.end = i;
    if (c && c.from && !/^LRN-\d{8}-\d{2}$/.test(c.from) && !/^EXT-[a-z0-9-]+#[a-z0-9-]+$/.test(c.from)) errors.push(`${display}:${i + 2}: from= must name a learning (LRN-YYYYMMDD-NN) or a retrieved source (EXT-<name>#<id>), got "${c.from}"`);
    sections.push({ id, heading, start: i, scope: (c && c.scope) || fileScope, tier: (c && c.tier) || fileTier, derived: !(c && c.id), from: (c && c.from) || undefined });
  }
  for (const s of sections) {
    if (s.end === undefined) s.end = lines.length;
    if (!/^[a-z0-9ㄱ-힝][a-z0-9ㄱ-힝-]*$/.test(s.id)) { errors.push(`${display}: id "${s.id}" must be kebab-case`); continue; }
    const key = `${root.namespace}-${stem}#${s.id}`;
    if (index[key]) { errors.push(`duplicate id ${key} (${display} and ${index[key].file})`); continue; }
    // content hash: the section's body lines, tag comments excluded — lets a later compile see that the text changed
    const body = lines.slice(s.start + 1, s.end).filter(l => !/^<!--\s*(?:akela|qab):/.test(l)).join('\n').trim();
    index[key] = {
      file: display, abs, heading: s.heading, namespace: root.namespace,
      scope: s.scope === 'all' ? ['all'] : s.scope.split(',').map(x => x.trim()).filter(Boolean),
      tier: s.tier, lines: s.end - s.start, hash: sha(body), ...(s.derived ? { derived: true } : {}), ...(s.from ? { from: s.from } : {}),
    };
  }
}

// Build the full index over all roots. Returns { index, errors }.
function build(cfg) {
  const index = {};
  const errors = [];
  const excluded = {}; // ns → files skipped by the root's exclude globs (visible, never silent)
  for (const root of cfg.roots) {
    if (!fs.existsSync(root.path)) { errors.push(`knowledge root "${root.rel}" does not exist`); continue; }
    for (const f of listFiles(root.path)) {
      if ((root.excludeRes || []).some(re => re.test(f))) { (excluded[root.namespace] || (excluded[root.namespace] = [])).push(f); continue; }
      parseFile(root, f, index, errors, cfg.idTag);
    }
  }
  return { index, errors, excluded };
}

// Verbatim section body (heading → next same-or-higher heading), tag comment stripped.
function sectionBody(entry) {
  const lines = readLines(entry.abs);
  if (!lines) return null;
  let fence = false, start = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) { fence = !fence; continue; }
    if (fence) continue;
    if (!(l.startsWith('# ') || l.startsWith('## '))) continue;
    const text = l.replace(/^#+\s*/, '').trim();
    if (start === -1) { if (text === entry.heading) { start = i; continue; } }
    else break;
  }
  if (start === -1) return null;
  const out = [];
  let f2 = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) f2 = !f2;
    if (!f2 && (l.startsWith('## ') || l.startsWith('# '))) break;
    if (isTagLine(l)) continue; // metadata, not knowledge
    out.push(l);
  }
  return out.join('\n').trim() + '\n';
}

// Cheap "did you mean": same file stem first, then token overlap, fragment edit distance as tiebreak.
function nearestIds(id, index, n = 3) {
  const ids = Object.keys(index);
  const strip = s => s.replace(/^[A-Z0-9]+-/, '');
  const stem = strip(id.split('#')[0] || '');
  const frag = id.split('#')[1] || '';
  const toks = s => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const t = toks(stem + ' ' + frag);
  const lev = (a, b) => {
    const m = a.length, l = b.length; if (!m) return l; if (!l) return m;
    let prev = Array.from({ length: l + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= l; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[l];
  };
  return ids.map(k => {
    const ks = strip(k).split('#')[0];
    const kf = k.split('#')[1] || '';
    const kt = toks(k);
    let score = 0;
    for (const x of t) if (kt.has(x)) score++;
    if (ks === stem) score += 3;
    return [score, lev(frag, kf), k];
  }).sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2].localeCompare(b[2])).slice(0, n).filter(x => x[0] > 0).map(x => x[2]);
}

module.exports = { build, sectionBody, nearestIds, parseTag, TIERS };
