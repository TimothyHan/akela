'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function die(msg) { process.stderr.write(`akela: ${msg}\n`); process.exit(1); }

// "~/x" in a committed config must travel between machines (first-consumer brief, 2026-08-29:
// per-user install paths made shared configs machine-specific).
function expandHome(p) {
  if (p === '~') return require('os').homedir();
  if (typeof p === 'string' && p.startsWith('~/')) return require('path').join(require('os').homedir(), p.slice(2));
  return p;
}

// Minimal root-relative glob for knowledge-root excludes: `**` crosses directories, `*` does not.
// Deterministic, dependency-free; anchored to the whole relative path.
function globToRe(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0001/g, '.*');
  return new RegExp(`^${esc}$`);
}
function warn(msg) { process.stderr.write(`akela: ${msg}\n`); }

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

// `--activity` is the generic word; `--skill` (QABuddy) is accepted as an alias. Same for --task / --ticket.
function opt(args, ...names) {
  for (const n of names) if (args[n] !== undefined && args[n] !== true) return String(args[n]);
  return null;
}

function nowIso() {
  if (process.env.AKELA_TS) return process.env.AKELA_TS;
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function sha(s, n = 12) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, n); }

function gitBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40) || 'nobranch';
  } catch { return 'nobranch'; }
}

// Minimal glob (zero-dep): `*` matches within a path segment; no `**`. Returns absolute file paths.
function globFiles(root, pattern) {
  const segs = pattern.split('/').filter(Boolean);
  let dirs = [root];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const last = i === segs.length - 1;
    const re = seg.includes('*') ? new RegExp('^' + seg.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$') : null;
    const next = [];
    for (const d of dirs) {
      if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) continue;
      const names = re ? fs.readdirSync(d).filter(n => re.test(n)).sort() : [seg];
      for (const n of names) {
        const p = path.join(d, n);
        if (!fs.existsSync(p)) continue;
        if (last) { if (fs.statSync(p).isFile()) next.push(p); }
        else if (fs.statSync(p).isDirectory()) next.push(p);
      }
    }
    dirs = next;
  }
  return dirs;
}

function readLines(abs) {
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n') : null;
}

function readJsonl(abs, accept) {
  if (!fs.existsSync(abs)) return { lines: [], malformed: 0 };
  const lines = []; let malformed = 0;
  for (const raw of fs.readFileSync(abs, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    try { const o = JSON.parse(raw); if (o && typeof o === 'object' && (!accept || accept(o))) lines.push(o); else malformed++; } catch { malformed++; }
  }
  return { lines, malformed };
}

function appendJsonl(abs, obj) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.appendFileSync(abs, JSON.stringify(obj) + '\n');
}

function slug(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u3131-\uD79D]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

module.exports = { die, warn, parseArgs, opt, nowIso, sha, gitBranch, globFiles, readLines, readJsonl, appendJsonl, slug, expandHome, globToRe };
