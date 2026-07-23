#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { marked } = require("marked");

const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const LEVEL_ONE_HEADING_PATTERN = /^(?: {0,3})#\s+(.+?)(?:\s+#+)?\s*$/m;

function outputStem(title) {
  const safeStem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeStem || "note";
}

function extractWikilinks(markdown) {
  return Array.from(markdown.matchAll(WIKILINK_PATTERN), ([, label]) => label);
}

function normalizeLookupKey(value) {
  return value.trim().toLowerCase();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseNote(filename, fullPath, rawMarkdown) {
  const headingMatch = LEVEL_ONE_HEADING_PATTERN.exec(rawMarkdown);
  const filenameStem = path.basename(filename, ".md");
  const title = headingMatch ? headingMatch[1].trim() : filenameStem;
  // Remove the displayed title heading so pages do not render it twice in Batch 4.
  const body = headingMatch
    ? rawMarkdown.slice(0, headingMatch.index) + rawMarkdown.slice(headingMatch.index + headingMatch[0].length).replace(/^\r?\n/, "")
    : rawMarkdown;

  return {
    filename,
    fullPath,
    filenameStem,
    rawMarkdown,
    title,
    body,
    wikilinks: extractWikilinks(rawMarkdown),
  };
}

function assignOutputFilenames(notes) {
  const usedStems = new Map();

  for (const note of notes) {
    const baseStem = outputStem(note.title);
    const count = usedStems.get(baseStem) || 0;
    usedStems.set(baseStem, count + 1);
    // Sorted filenames make collision suffixes stable across builds.
    note.outputFilename = `${baseStem}${count === 0 ? "" : `-${count + 1}`}.html`;
  }

  return notes;
}

function buildNoteLookup(notes) {
  const lookup = new Map();

  for (const note of notes) {
    for (const key of [note.title, note.filenameStem]) {
      const normalizedKey = normalizeLookupKey(key);
      if (!lookup.has(normalizedKey)) {
        // Notes are filename-sorted, so the first filename deterministically wins duplicate keys.
        lookup.set(normalizedKey, note);
      }
    }
  }

  return lookup;
}

function computeBacklinks(notes, lookup = buildNoteLookup(notes)) {
  for (const note of notes) {
    note.backlinks = [];
  }

  for (const sourceNote of notes) {
    const linkedSources = new Set();

    for (const label of sourceNote.wikilinks) {
      const targetNote = lookup.get(normalizeLookupKey(label));
      if (!targetNote || linkedSources.has(targetNote.filename)) {
        continue;
      }

      linkedSources.add(targetNote.filename);
      targetNote.backlinks.push({
        filename: sourceNote.filename,
        outputFilename: sourceNote.outputFilename,
        title: sourceNote.title,
      });
    }
  }

  for (const note of notes) {
    note.backlinks.sort((left, right) => {
      const titleComparison = left.title.localeCompare(right.title);
      return titleComparison || left.filename.localeCompare(right.filename);
    });
  }

  return notes;
}

function renderNoteBody(note, lookup) {
  const transformedMarkdown = note.body.replace(WIKILINK_PATTERN, (match, label) => {
    const target = lookup.get(normalizeLookupKey(label));
    const escapedLabel = escapeHtml(label);

    if (!target) {
      return `<span class="unresolved">${escapedLabel}</span>`;
    }

    return `<a href="${escapeHtml(target.outputFilename)}">${escapedLabel}</a>`;
  });

  return marked.parse(transformedMarkdown);
}

function renderNoteBodies(notes) {
  const lookup = buildNoteLookup(notes);

  for (const note of notes) {
    note.renderedBody = renderNoteBody(note, lookup);
  }

  return notes;
}

async function readNotes(notesDirectory) {
  const resolvedDirectory = path.resolve(notesDirectory);

  try {
    await fs.access(resolvedDirectory, fs.constants.R_OK);
    const stats = await fs.stat(resolvedDirectory);
    if (!stats.isDirectory()) {
      throw new Error("not a directory");
    }
  } catch (error) {
    const reason = error.message === "not a directory" ? "is not a directory" : "does not exist or is not readable";
    throw new Error(`Input notes directory "${notesDirectory}" ${reason}.`);
  }

  let entries;
  try {
    entries = await fs.readdir(resolvedDirectory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read input notes directory "${notesDirectory}": ${error.message}`);
  }

  const markdownFilenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const notes = await Promise.all(
    markdownFilenames.map(async (filename) => {
      const fullPath = path.join(resolvedDirectory, filename);
      const rawMarkdown = await fs.readFile(fullPath, "utf8");
      return parseNote(filename, fullPath, rawMarkdown);
    }),
  );

  const preparedNotes = assignOutputFilenames(notes);
  computeBacklinks(preparedNotes);
  return renderNoteBodies(preparedNotes);
}

async function main() {
  const [, , notesDirectory, outputDirectory] = process.argv;

  if (!notesDirectory || !outputDirectory) {
    console.error("Usage: node build.js <notes-dir> <output-dir>");
    process.exitCode = 1;
    return;
  }

  const notes = await readNotes(notesDirectory);
  console.log(JSON.stringify(notes, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Sprout: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  assignOutputFilenames,
  buildNoteLookup,
  computeBacklinks,
  escapeHtml,
  extractWikilinks,
  normalizeLookupKey,
  parseNote,
  readNotes,
  renderNoteBodies,
  renderNoteBody,
};
