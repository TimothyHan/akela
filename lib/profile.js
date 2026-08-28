'use strict';
/**
 * Run profile (RFC 0001 §3.2) — deterministic, no LLM step. Unknown is a first-class value.
 *
 * The domain pack declares fields as ordered rule lists; the first matching rule wins:
 *   { "exists": "<path>", "value": "…" }      a file or directory exists (project-relative)
 *   { "glob":   "<pattern>", "value": "…" }   at least one file matches (single-segment `*`)
 *   { "task":   "<regex>", "value": "…" }     the task key matches
 *   { "value": "…" }                          default (always matches)
 *
 * pfp = sha256 of the canonical field values (activity excluded) — a run's profile class.
 */
const fs = require('fs');
const path = require('path');
const { globFiles, sha, die } = require('./util');

function evalRules(cfg, field, rules, ctx) {
  if (!Array.isArray(rules)) die(`profile.${field} must be an array of rules`);
  for (const r of rules) {
    if (!r || typeof r !== 'object' || r.value === undefined) die(`profile.${field}: every rule needs a "value"`);
    if (r.exists !== undefined) { if (fs.existsSync(path.join(cfg.root, r.exists))) return String(r.value); continue; }
    if (r.glob !== undefined) { if (globFiles(cfg.root, r.glob).length) return String(r.value); continue; }
    if (r.task !== undefined) { if (ctx.task && new RegExp(r.task, 'i').test(ctx.task)) return String(r.value); continue; }
    return String(r.value);
  }
  return 'unknown';
}

function build(cfg, activity, task) {
  const profile = { schema: 'profile/1', activity };
  const canon = {};
  for (const [field, rules] of Object.entries(cfg.profile)) {
    if (!/^[a-z_]+$/.test(field) || field === 'activity' || field === 'schema') die(`profile field "${field}" must be snake_case and not "activity"/"schema"`);
    profile[field] = evalRules(cfg, field, rules, { task });
    canon[field] = profile[field];
  }
  const pfp = sha(JSON.stringify(canon));
  return { profile, pfp };
}

module.exports = { build };
