# Sprout Implementation Plan

This document divides `SPEC.md` into ordered implementation batches. Complete and verify each batch before starting the next one. Do not begin any stretch-goal batch until the full MVP release gate passes.

## Working Rules

- Keep Sprout a Node.js build script, not a web server. Do not add Express or another backend framework.
- Use one lightweight Markdown library such as `marked`; do not write a Markdown parser.
- Generate static HTML and CSS only for the MVP. No client-side framework is needed.
- Keep changes small and focused on the current batch. Do not refactor working code without a concrete reason.
- Resolve wikilinks case-insensitively against note titles and filenames.
- Render missing wikilink targets as visibly unresolved text or links and continue the build.
- For ambiguous cases, choose a deterministic default, document it with a one-line code comment, and continue unless blocked.
- Run the current batch's checks before moving forward. Re-run all earlier checks when changing shared behavior.

## Target Structure

```text
sprout/
  build.js
  package.json
  .gitignore
  sample-notes/
    gardening.md
    compost.md
    soil-health.md
    reading-list.md
    missing-link-example.md
  templates/
    page.html
    style.css
  dist/                 # generated; do not commit
  README.md
```

The exact sample note names may differ, but keep four or five small notes with cross-links, at least one backlink, and one unresolved link.

## Batch 0: Project Setup and Test Fixture

**Goal:** Establish a runnable CLI project and a small, predictable note vault for all later verification.

### Tasks

1. Create `package.json` with the project metadata and the selected Markdown dependency.
2. Add `dist/` to `.gitignore` because it is generated output.
3. Create `build.js` with CLI argument validation for:
   - input notes directory
   - output directory
4. For missing arguments, print a concise usage message such as `node build.js <notes-dir> <output-dir>` and exit with a non-zero status.
5. Create `sample-notes/` with four or five short Markdown files that cover:
   - a title from the first `# Heading`
   - a note with no level-one heading, so its title must come from its filename
   - multiple notes linking to one note
   - mixed-case wikilink text
   - a link to a nonexistent note
6. Create the `templates/` directory. Template contents may remain minimal until the rendering batch.

### Verification

- Dependency installation completes successfully.
- Running `node build.js` without arguments prints usage help and fails cleanly.
- `sample-notes/` contains enough links to test outgoing links, backlinks, case-insensitive matching, and unresolved links.

### Completion Gate

The project installs, the CLI entry point runs, and the sample fixture represents every important link case needed by the MVP.

## Batch 1: Read and Parse Notes

**Goal:** Load all top-level `.md` files from the input directory and convert each file into a consistent in-memory note record.

### Tasks

1. Validate that the input path exists and is a readable directory. Report a clear error and exit non-zero if it is invalid.
2. Read only files ending in `.md`; ignore unrelated files.
3. Use a deterministic order, such as sorting filenames, so generated output is stable.
4. For every Markdown file, collect at least:
   - source filename and full path
   - filename without `.md`
   - raw Markdown
   - title
   - Markdown body
   - outgoing wikilink labels
   - output filename or slug
5. Extract the title from the first level-one Markdown heading (`# Heading`). If none exists, derive the title from the filename.
6. Decide whether the title heading remains in the rendered body or is removed to avoid showing the title twice. Apply the decision consistently.
7. Detect all `[[Note Name]]` occurrences with a simple regex and retain their original display text.
8. Choose a deterministic output filename strategy that produces safe `.html` paths. If two notes collide on the same title or output filename, use and document a reasonable deterministic winner or suffix strategy.

### Verification

- All sample `.md` files are loaded and non-Markdown files are ignored.
- Heading-based and filename-based titles are both correct.
- Every wikilink in the sample notes is detected, including repeated and mixed-case links.
- Parsing the same input twice produces the same note order and output filenames.
- Invalid input paths fail with a useful message instead of a stack trace alone.

### Completion Gate

The script can print or otherwise inspect a complete note record for every sample file, with correct titles, bodies, wikilinks, and stable output filenames. HTML output is not required yet.

## Batch 2: Markdown Rendering and Wikilink Resolution

**Goal:** Convert note content to HTML while turning resolvable wikilinks into valid links and preserving broken links safely.

### Tasks

1. Build a lookup map for each note using normalized, case-insensitive keys.
2. Register both the note title and filename without `.md` as lookup keys so either can be used in a wikilink.
3. Define and document deterministic behavior when duplicate normalized keys exist. Do not allow filesystem order to choose unpredictably.
4. Replace each resolvable `[[Note Name]]` with Markdown or HTML that points to the target note's generated `.html` file.
5. Replace each unresolved wikilink with safe, distinguishable markup such as `<span class="unresolved">Note Name</span>`.
6. Escape wikilink labels and generated attributes so note content cannot accidentally break generated HTML.
7. Pass the transformed Markdown through the chosen Markdown library.
8. Preserve normal Markdown behavior for headings, paragraphs, lists, emphasis, and ordinary Markdown links.

### Verification

- A valid sample wikilink produces an `<a>` whose `href` matches the target output filename.
- Matching works regardless of letter case.
- Links can resolve by heading title and by source filename.
- The missing sample target produces `.unresolved` markup and does not stop the build.
- Regular Markdown renders correctly around wikilinks.

### Completion Gate

Every sample note has rendered body HTML, valid wikilinks point to the correct generated filenames, and unresolved links remain visible without causing an error.

## Batch 3: Backlink Computation

**Goal:** Compute which notes link to each note before any page is written.

### Tasks

1. Initialize an empty backlink collection for every note.
2. Walk each note's outgoing wikilinks and resolve them with the same lookup logic used during rendering.
3. Add the source note to the resolved target's backlink collection.
4. Ignore unresolved links when computing backlinks.
5. Prevent duplicate backlink entries when one source note links to the same target multiple times.
6. Sort backlinks deterministically, preferably by title and then filename.

### Verification

- A target linked by two different sample notes reports both source notes.
- Repeated links from one source produce only one backlink entry.
- A note with no backlinks has an empty collection.
- Unresolved links create no backlink entries and cause no errors.
- Backlink ordering is stable across builds.

### Completion Gate

Every in-memory note record contains an accurate, deduplicated, and deterministic backlink list.

## Batch 4: Note Pages and Shared Styling

**Goal:** Render one complete, browsable HTML page per note.

### Tasks

1. Create a shared page template, either in `templates/page.html` or as one clearly defined template function.
2. Include valid document structure: doctype, language, character encoding, viewport metadata, page title, and stylesheet link.
3. Render the note title and rendered body content.
4. Add a `Linked mentions` section to every note page.
5. For each backlink, render a link to the source note page using its title.
6. When there are no backlinks, show a clear empty state such as `No linked mentions.`
7. Add simple readable CSS in `templates/style.css`, including a visibly different style for unresolved wikilinks.
8. Include navigation back to `index.html` from every note page.
9. Escape all template-inserted text that did not already come from the Markdown renderer.

### Verification

- One complete HTML string is produced for every sample note.
- Page titles, content, stylesheet paths, and index navigation are correct.
- Linked mentions point back to the correct source pages.
- Notes without backlinks render a valid empty state.
- Unresolved links are visibly distinct.
- Pages have no obvious broken HTML structure when opened in a browser.

### Completion Gate

All sample notes can be represented as complete pages containing readable content, working page-relative links, and correct linked mentions.

## Batch 5: Index and Filesystem Output

**Goal:** Write the complete static site to the requested output directory.

### Tasks

1. Create the output directory recursively when it does not exist.
2. Define rebuild behavior for an existing output directory. Prefer removing stale generated files before writing so deleted notes do not leave orphaned pages; never delete outside the exact requested output directory.
3. Write one `.html` file per note using the output filename chosen in Batch 1.
4. Generate `index.html` with a deterministic list of all notes linking to their pages.
5. Copy or write the shared stylesheet to the output directory.
6. Wait for all filesystem operations and surface failures with useful context.
7. Print a concise success summary containing the number of notes generated and the output path.

### Verification

Run:

```bash
node build.js ./sample-notes ./dist
```

Then confirm:

- The command exits successfully.
- `dist/index.html` exists and lists every sample note exactly once.
- One generated HTML page exists for every sample note.
- `dist/style.css` exists.
- Links from the index to notes, between notes, from backlinks, and back to the index all point to existing files.
- The unresolved wikilink remains visible and does not point to a generated note page.
- Running the build a second time succeeds.
- Removing a copied sample note and rebuilding does not leave its old generated page behind.

### Completion Gate

The generated `dist/` directory is a complete static site that can be opened directly in a browser and navigated without a server.

## Batch 6: MVP Hardening and Documentation

**Goal:** Confirm the entire MVP against the specification and document normal use.

### Tasks

1. Add focused automated tests if a test runner is already justified, or a small Node-based verification script if that is sufficient. Do not introduce a large framework only for a few checks.
2. Cover the highest-risk behavior:
   - heading and filename title fallback
   - case-insensitive title and filename resolution
   - unresolved links
   - deduplicated backlinks
   - safe output filenames
   - stale output cleanup
3. Test paths containing spaces if the filesystem and command invocation support them.
4. Ensure errors for invalid input and unwritable output are understandable.
5. Write `README.md` with:
   - what Sprout does
   - prerequisites and installation
   - the exact sample build command
   - how to point the CLI at a personal notes folder
   - supported `[[wikilink]]` syntax
   - title fallback behavior
   - unresolved-link behavior
   - generated output description
6. Rebuild `dist/` from a clean state and manually browse the full sample site.

### MVP Release Gate

Do not start stretch goals until all of these are true:

- `node build.js ./sample-notes ./dist` runs without errors.
- `dist/index.html` lists every sample note and links to each page.
- Every note page renders its Markdown content.
- Every resolvable `[[wikilink]]` becomes a working link to the correct note page.
- Every note page includes an accurate `Linked mentions` section.
- A nonexistent target is rendered as unresolved and does not crash the build.
- Rebuilding is deterministic and does not leave stale note pages.
- `README.md` explains how to build both the sample vault and a user's own vault.

## Stretch Batch 1: Nested-List Link Graph

**Start only after the MVP release gate passes.**

### Goal

Add the lowest-cost graph representation before considering visualization libraries.

### Tasks

1. Generate a graph page or index section listing every note and its outgoing resolved links.
2. Clearly show notes with no outgoing links.
3. Ignore or separately label unresolved links.
4. Add navigation to the graph from the index and note pages.

### Completion Gate

The graph is fully usable without JavaScript and all graph links point to generated pages.

## Stretch Batch 2: Tag Support

### Goal

Extract `#tag` values and provide tag-based navigation.

### Tasks

1. Define tag syntax carefully so Markdown headings are not treated as tags.
2. Extract and normalize tags from each note.
3. Render tags on note pages.
4. Generate a tag index and one listing per tag, or equivalent anchor sections.
5. Test case normalization, duplicates, and notes with no tags.

### Completion Gate

Users can navigate from a note to a tag listing and from that listing to every note carrying the tag.

## Stretch Batch 3: Client-Side Search

### Goal

Add a small search box that filters generated note data in the browser.

### Tasks

1. Generate the minimum safe search data needed for note titles and content.
2. Add a plain JavaScript search input; do not introduce a client framework.
3. Filter results case-insensitively and link each result to its note page.
4. Provide clear initial, no-results, and JavaScript-disabled behavior.

### Completion Gate

Search returns relevant sample notes by title and body text without requiring a server.

## Stretch Batch 4: Watch Mode

### Goal

Support `--watch` while preserving the existing one-shot CLI behavior.

### Tasks

1. Parse `--watch` without breaking `node build.js <notes-dir> <output-dir>`.
2. Perform an initial full build before watching.
3. Rebuild on Markdown file additions, edits, and deletions.
4. Debounce duplicate filesystem events.
5. Keep watching after a recoverable build error and report the error clearly.

### Completion Gate

One edit, addition, or deletion in the sample vault produces one successful refreshed output without restarting the command.

## Stretch Batch 5: Theme Toggle

### Goal

Provide dark and light themes without compromising no-JavaScript readability.

### Tasks

1. Define both themes with CSS custom properties and respect `prefers-color-scheme` by default.
2. Add a small toggle to generated pages.
3. Persist the explicit user choice locally.
4. Prevent an obvious incorrect-theme flash where practical.
5. Verify contrast and unresolved-link visibility in both themes.

### Completion Gate

Every page is readable in both themes, follows the system default initially, and remembers an explicit choice.

## Stretch Batch 6: Interactive Visual Graph

**Treat this as the final and most optional batch. Skip it if time or budget is limited.**

### Goal

Add an interactive graph only after the nested-list graph has proven the underlying graph data is correct.

### Tasks

1. Evaluate the smallest suitable visualization library and its generated bundle cost before adding it.
2. Reuse the same resolved-link graph data as the nested-list graph.
3. Render notes as nodes and resolved wikilinks as edges.
4. Make nodes link to note pages and provide basic keyboard-accessible navigation or an accessible list fallback.
5. Keep the static nested-list graph available when JavaScript is unavailable.
6. Test performance with a larger synthetic vault before calling the feature complete.

### Completion Gate

The graph loads from static files, navigates to note pages, remains usable with a moderately sized vault, and retains a non-interactive fallback.
