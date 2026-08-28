# Why is a QA reference library in here?

This is not Akela documentation — it is the **test corpus**. Akela was extracted from
[QABuddy](https://github.com/timothyhan/QABuddy), and `qa-refs/` is a snapshot of QABuddy's real
reference library: the exact markdown Akela's engine originally ran against in production.

The parity block in `../run.js` compiles this corpus under the `qa` domain pack and asserts that
Akela's indexing, selection, tier ordering, and verbatim body extraction behave **identically to
the origin engine on the origin's own content** — section ids, packed/dropped sets, and bodies,
byte for byte. A synthetic fixture could not prove that, and real-world-shaped markdown (nested
folders, tag variants, sections running to end-of-file, README/index exclusions) catches parsing
edge cases invented fixtures miss.

The *content* of these files is irrelevant to the tests; the *structure* is the test.
Nothing in this directory ships in the npm package.
