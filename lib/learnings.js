'use strict';
/**
 * LEARNINGS.md — one `## LRN-YYYYMMDD-NN: title` block per learning (RFC 0001 §3, self-improve protocol).
 * Fields: Status (active|promoted|retired) · Scope (activities or all) · Statement · Overrides (<NS>-…#id | none)
 *         · Evidence · Fingerprint (optional ffp) · Profile (optional key=value, AND-ed with the run profile)
 *         · Promoted-to (the wiki section this learning became, once Status is promoted — its tag carries from=<this id>).
 * Learnings are project content and are never written by this tool — only read.
 */
const fs = require('fs');

function parse(cfg) {
  const p = cfg.learnings;
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const blocks = text.split(/\n(?=## LRN-)/).filter(b => b.startsWith('## LRN-'));
  return blocks.map(b => {
    const id = (b.match(/^## (LRN-\d{8}-\d{2})/) || [])[1];
    const field = (name) => { const m = b.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n## |$)`)); return m ? m[1].trim() : ''; };
    const status = (field('Status').split(/\s/)[0] || '').toLowerCase();
    const scope = field('Scope').split('<!--')[0].split(',').map(x => x.trim()).filter(Boolean);
    const profile = {};
    for (const tok of field('Profile').split('<!--')[0].split(/\s+/)) { const kv = tok.match(/^([a-z_]+)=([A-Za-z0-9_-]+)$/); if (kv) profile[kv[1]] = kv[2]; }
    const overrides = field('Overrides');
    const overridesRef = (overrides.match(/[A-Z][A-Z0-9]+-[a-z0-9ㄱ-힝-]+(?:\/[a-z0-9ㄱ-힝-]+)*#[a-z0-9ㄱ-힝-]+/) || [])[0] || null;
    const fpRaw = field('Fingerprint').split('<!--')[0].trim().toLowerCase().replace(/^ffp-/, '');
    const fingerprint = /^[0-9a-f]{12}$/.test(fpRaw) ? fpRaw : null;
    const promotedTo = (field('Promoted-to').split('<!--')[0].match(/[A-Z][A-Z0-9]+-[a-z0-9ㄱ-힝-]+(?:\/[a-z0-9ㄱ-힝-]+)*#[a-z0-9ㄱ-힝-]+/) || [])[0] || null;
    return { id, status, scope, profile, overridesRef, fingerprint, promotedTo, statement: field('Statement'), overrides, block: b.trim() };
  }).filter(l => l.id);
}

const ID_RE = /^LRN-\d{8}-\d{2}$/;

module.exports = { parse, ID_RE };
