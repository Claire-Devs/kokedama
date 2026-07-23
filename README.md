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

Open `dist/index.html` directly in a browser. The output directory contains `index.html`, one `.html` page per note, and `style.css`.

## Build your own notes

Pass a directory containing top-level `.md` files and a destination directory:

```bash
node build.js "/path/to/my notes" ./my-garden
```

Kokedama reads only top-level Markdown files and recreates its generated HTML and stylesheet files on each build, so removed notes do not leave stale pages behind. Other files in the output directory are left untouched.

## Wikilinks and titles

Use `[[Note Name]]` anywhere in a note. Links resolve case-insensitively against both a note's title and its source filename without the `.md` extension. For example, `[[Garden Ideas]]` and `[[garden-ideas]]` can both resolve to `garden-ideas.md` when its title is `Garden Ideas`.

The first level-one heading, such as `# Garden Ideas`, becomes the note title. Notes without a level-one heading use their filename without `.md` as their title.

If no matching note exists, Kokedama keeps the label visible as an unresolved, distinctly styled item and continues building the site. Unresolved links do not create backlinks.

## Verification

Run the focused MVP checks with:

```bash
npm test
```
