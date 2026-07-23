# Kokedama

Kokedama turns a folder of Markdown notes into a static digital garden. It renders each note as an HTML page, resolves `[[wikilinks]]`, and adds a **Linked mentions** section for backlinks.

## Prerequisites and installation

- Node.js 18 or later

Install the dependency from the project directory:

```bash
npm install
```

## Build the sample vault

```bash
node build.js ./sample-notes ./dist
```

Open `dist/index.html` directly in a browser. The output directory contains `index.html`, `graph.html`, `tags.html`, `search.html`, one `.html` page per note and tag, and `style.css`.

## Build your own notes

Pass a directory containing top-level `.md` files and a destination directory:

```bash
node build.js "/path/to/my notes" ./my-garden
```

Kokedama reads only top-level Markdown files and recreates its generated HTML and stylesheet files on each build, so removed notes do not leave stale pages behind. Other files in the output directory are left untouched.

## Watch mode

To rebuild automatically after top-level Markdown notes are added, edited, or deleted, run:

```bash
node build.js --watch ./sample-notes ./dist
```

Kokedama completes one full build before it starts watching. Filesystem events are briefly debounced, and a failed rebuild is reported without stopping watch mode.

## Themes

Pages follow the operating system light or dark preference by default. The `Toggle theme` button stores an explicit choice in the browser, while pages remain readable with JavaScript disabled.

## Wikilinks and titles

Use `[[Note Name]]` anywhere in a note. Links resolve case-insensitively against both a note's title and its source filename without the `.md` extension. For example, `[[Garden Ideas]]` and `[[garden-ideas]]` can both resolve to `garden-ideas.md` when its title is `Garden Ideas`.

The first level-one heading, such as `# Garden Ideas`, becomes the note title. Notes without a level-one heading use their filename without `.md` as their title.

If no matching note exists, Kokedama keeps the label visible as an unresolved, distinctly styled item and continues building the site. Unresolved links do not create backlinks.

## Link graph

`graph.html` is a static, no-JavaScript view of every note and its unique resolved outgoing links. Notes without resolved destinations display `No outgoing links.` Unresolved targets are shown separately and do not appear as graph destinations.

## Tags

Use inline tags such as `#gardening`, `#soil-health`, or `#soil_health`. Tags are case-insensitive, normalized to lowercase, and listed once per note. A tag must start with a letter or number and may contain letters, numbers, hyphens, and underscores. Markdown headings such as `# Heading` are not tags because the `#` is followed by whitespace.

Each note page lists its tags. `tags.html` links to a page for every tag, and each tag page lists all notes carrying that tag.

## Search

`search.html` filters note titles and Markdown content case-insensitively in the browser. It initially lists all notes, shows a clear no-results message, and remains a navigable complete note list when JavaScript is disabled.

## Verification

Run the focused MVP checks with:

```bash
npm test
```
