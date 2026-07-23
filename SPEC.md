# Project Spec: Sprout — a digital garden generator

## How to use this file
Save this as `SPEC.md` in your project root, then tell OpenCode: *"Read SPEC.md and build the MVP first, in order. Don't start on stretch goals until the MVP is fully working end-to-end."*

## Overview
A CLI tool that takes a folder of your own markdown notes — using `[[Note Name]]` style links between them — and generates a static, browsable website: rendered pages, working links between notes, and a "linked mentions" (backlinks) section on every page. Point it at your notes, get a personal wiki out the other side.

## Why this scope
It's a real, satisfying artifact (you can actually browse your own notes as a website when it's done) but the moving parts are bounded: no server, no database, no auth — just markdown in, static HTML out. The riskiest, most expensive part (an interactive visual graph) is pushed to stretch goals so the core build stays cheap and finishable.

## Tech stack
- **Runtime:** Node.js, run as a CLI script (`node build.js ./notes ./dist`)
- **Markdown parsing:** one lightweight library (e.g. `marked`) — don't hand-roll a markdown parser
- **Wikilink detection:** a simple regex for `[[Note Name]]`, matched case-insensitively against note filenames/titles — no need for anything fancier
- **Templating:** plain HTML template strings or one shared template file — no templating engine needed for this scope
- **Output:** static HTML + CSS files only, no client-side framework, no build step for the reader

## MVP feature list (build in this order, verify each before moving on)
1. Read all `.md` files from an input folder
2. Parse each note: title (from first `# Heading` or filename), body content, and any `[[wikilinks]]` inside it
3. Convert each note's markdown body to HTML
4. Resolve `[[wikilinks]]` into real `<a>` tags pointing at the matching note's generated page
5. Compute backlinks: for each note, which other notes link to it
6. Render one HTML page per note: content + a "Linked mentions" section listing backlinks
7. Render an `index.html` listing all notes, linking to each page
8. Write everything to an output folder (e.g. `dist/`)

Include 4-5 small sample `.md` files with a few cross-links in the repo so the whole pipeline can be tested early, instead of debugging against someone's real (messy) note vault.

## Stretch goals — only after the MVP fully works
- Simple nested-list "graph" (which notes link to which) before attempting a real visual graph
- A real interactive visual graph view (only if budget clearly allows — this is the most expensive stretch item, skip it first if money's tight)
- `#tag` support with a tag index page
- Client-side search box (simple JS filter over note titles/content)
- `--watch` mode that rebuilds on file changes
- Dark/light theme toggle

## Constraints for the agent (this is what keeps cost down)
- This is a build script, not a web server — don't add Express or any backend framework
- Handle broken links (a `[[link]]` to a note that doesn't exist) gracefully — render it as a distinguishable "unresolved" link, don't crash the build
- If a design decision is ambiguous (e.g. two notes with the same title), pick a reasonable default, leave a one-line comment explaining the choice, and keep moving — don't stop to ask unless genuinely blocked
- Don't refactor working code preemptively
- Default reasoning effort is enough for this project; no need for max/ultra mode

## Suggested file structure
```
sprout/
  build.js
  package.json
  sample-notes/
    note-1.md
    note-2.md
    note-3.md
  templates/
    page.html
    style.css
  dist/            (generated — gitignore this)
  README.md
```

## Done means
- `node build.js ./sample-notes ./dist` runs with no errors
- `dist/index.html` lists every note
- Each note page renders its content and shows a working "Linked mentions" section
- `[[wikilinks]]` in note text become working links between generated pages
- A link to a nonexistent note doesn't crash the build
- README explains how to point it at your own notes folder