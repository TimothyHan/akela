# Embedding Akela

For tools that ship Akela as their engine — a domain-pack consumer with its own command name, config format, and users who never see `akela.json` directly. The reference consumer is [QABuddy](https://github.com/timothyhan/QABuddy): it deleted its in-tree engine, became a pack consumer, and runs its full 1,275-check suite against Akela in CI.

## The launcher pattern

A consumer's launcher does three things: ensure config exists (generate `akela.json` from your own config format on first run), map your environment onto Akela's, and delegate.

**Delegate in-process** — `bin/akela.js` exports its entry:

```js
const { main } = require('akela/bin/akela.js');
process.env.AKELA_CWD = projectRoot;   // Akela's project root
main(['compile', '--activity', activity, '--task', task]);
```

One node startup per *agent run* instead of one per command. (Child-process delegation with `spawnSync(process.execPath, [require.resolve('akela/bin/akela.js'), ...args])` also works and isolates exit behavior; `main` calls `process.exit` on fatal errors, so wrap or fork if your launcher must survive them.)

## What the config layer gives a consumer

- **Your vocabulary**: ship a domain pack with your `activities`, `profile` probes, `fingerprints`, `statuses` — your users get a configured domain without seeing the fields. Point `"domain"` at the pack JSON you ship.
- **Your command names**: `aliasPrefixes: ["qa-"]` maps invoked names (`qa-exploratory`) onto activity names (`exploratory`), deterministically, with a visible notice. Declared activity names are never treated as aliases.
- **Legacy tags**: content tagged `<!-- qab: … -->` parses as-is; set `idTag` if your tool wants its own tag name.
- **Per-user install paths**: `~/` in `domain`, `knowledge[].path`, `learnings`, and `runs` expands against the home directory, so a committed config travels between machines.
- **Vendored files inside knowledge roots**: `knowledge[].exclude` globs (`["engine/**"]`) skip non-knowledge at index time — listed by `akela check --json`, never silent.
- **CLI aliases**: `--skill`/`--ticket` are accepted for `--activity`/`--task`.

## Contract notes worth knowing

- `compile`'s **first output line is the slice path** — a contract; notices print below it.
- An empty compile warns loudly on stderr (naming known scope tokens) but exits 0.
- A closed run (one with an `outcome`) refuses further events, naming the run and how to open a new one; argument validation errors take precedence.
- Akela never writes knowledge files; your tool's write paths stay yours.

## What stays downstream

Config converters from your format, env-var aliases, deprecation shims for your old commands, and your test-expectation updates — transition costs that belong to the consumer, not the engine. QABuddy's migration (its RFC 0003) is the worked example of all four.
