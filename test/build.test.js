const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  assignOutputFilenames,
  computeBacklinks,
  extractTags,
  parseNote,
  readNotes,
  renderGraphPage,
  renderTagIndexPage,
  renderTagPage,
  renderTags,
  writeSite,
} = require("../build.js");

async function makeTempDirectory(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("parses a heading title and falls back to the filename", () => {
  const headingNote = parseNote("heading.md", "/notes/heading.md", "# Display Title\n\nBody");
  const filenameNote = parseNote("filename-title.md", "/notes/filename-title.md", "Body");

  assert.equal(headingNote.title, "Display Title");
  assert.equal(headingNote.body, "Body");
  assert.equal(filenameNote.title, "filename-title");
  assert.equal(filenameNote.body, "Body");
});

test("resolves title and filename wikilinks case-insensitively and deduplicates backlinks", async () => {
  const notesDirectory = await makeTempDirectory("kokedama-resolution-");
  await fs.writeFile(path.join(notesDirectory, "source.md"), "# Source\n\n[[TARGET TITLE]] [[target-title]] [[Target Title]]");
  await fs.writeFile(path.join(notesDirectory, "target-title.md"), "# Target Title\n\nContent");

  const notes = await readNotes(notesDirectory);
  const source = notes.find((note) => note.filename === "source.md");
  const target = notes.find((note) => note.filename === "target-title.md");

  assert.match(source.renderedBody, /href="target-title\.html">TARGET TITLE/);
  assert.match(source.renderedBody, /href="target-title\.html">target-title/);
  assert.equal(target.backlinks.length, 1);
  assert.equal(target.backlinks[0].title, "Source");
});

test("renders unresolved wikilinks without creating backlinks", async () => {
  const notesDirectory = await makeTempDirectory("kokedama-unresolved-");
  await fs.writeFile(path.join(notesDirectory, "source.md"), "# Source\n\n[[Missing Note]]");
  await fs.writeFile(path.join(notesDirectory, "target.md"), "# Target\n\nContent");

  const notes = await readNotes(notesDirectory);
  const source = notes.find((note) => note.filename === "source.md");
  const target = notes.find((note) => note.filename === "target.md");

  assert.match(source.renderedBody, /<span class="unresolved">Missing Note<\/span>/);
  assert.deepEqual(target.backlinks, []);
});

test("extracts normalized unique inline tags without treating headings as tags", () => {
  const tags = extractTags("# A heading\n\n#Garden #garden #soil-health #soil_health #123\n\nnot#a-tag");

  assert.deepEqual(new Set(tags), new Set(["123", "garden", "soil-health", "soil_health"]));
});

test("renders tag links, indexes, and tag listings while supporting untagged notes", () => {
  const tagged = parseNote("tagged.md", "/notes/tagged.md", "# Tagged\n\n#Garden #soil");
  const untagged = parseNote("untagged.md", "/notes/untagged.md", "# Untagged\n\nContent");
  const notes = assignOutputFilenames([tagged, untagged]);
  const tagIndex = new Map([
    ["garden", [tagged]],
    ["soil", [tagged]],
  ]);

  assert.match(renderTags(tagged.tags), /href="tag-garden\.html">#garden/);
  assert.equal(renderTags(untagged.tags), "<p>No tags.</p>");
  assert.match(renderTagIndexPage(tagIndex), /href="tag-garden\.html">#garden<\/a> \(1\)/);
  assert.match(renderTagPage("garden", [tagged]), /href="tagged\.html">Tagged/);
});

test("renders a static graph with resolved links, unresolved labels, and empty states", () => {
  const source = parseNote("source.md", "/notes/source.md", "# Source\n\n[[Target]] [[Target]] [[Missing]]");
  const target = parseNote("target.md", "/notes/target.md", "# Target\n\nContent");
  const isolated = parseNote("isolated.md", "/notes/isolated.md", "# Isolated\n\nContent");
  const notes = assignOutputFilenames([isolated, source, target]);

  const graph = renderGraphPage(notes);

  assert.match(graph, /<a href="source\.html">Source<\/a>/);
  assert.match(graph, /<a href="target\.html">Target<\/a>/);
  // The target appears once as its own node and once as Source's deduplicated outgoing edge.
  assert.equal((graph.match(/href="target\.html"/g) || []).length, 2);
  assert.match(graph, /<span class="unresolved">Missing<\/span>/);
  assert.match(graph, /<a href="isolated\.html">Isolated<\/a>\n<p>No outgoing links\.<\/p>/);
  assert.match(graph, /href="index\.html">All notes/);
});

test("generates safe, deterministic output filenames for collisions", () => {
  const notes = [
    { title: "A / Note" },
    { title: "A Note" },
    { title: "!!!" },
  ];

  assignOutputFilenames(notes);

  assert.deepEqual(
    notes.map((note) => note.outputFilename),
    ["a-note.html", "a-note-2.html", "note.html"],
  );
});

test("removes stale generated pages without removing unrelated output files", async () => {
  const outputDirectory = await makeTempDirectory("kokedama-output-");
  const note = parseNote("fresh.md", "/notes/fresh.md", "# Fresh\n\nContent");
  assignOutputFilenames([note]);
  computeBacklinks([note]);
  note.renderedBody = "<p>Content</p>\n";
  note.renderedPage = "<!doctype html><title>Fresh</title>";
  await fs.writeFile(path.join(outputDirectory, "stale.html"), "stale");
  await fs.writeFile(path.join(outputDirectory, "keep.txt"), "keep");

  await writeSite([note], outputDirectory);

  await assert.rejects(fs.access(path.join(outputDirectory, "stale.html")));
  assert.equal(await fs.readFile(path.join(outputDirectory, "keep.txt"), "utf8"), "keep");
  await fs.access(path.join(outputDirectory, "fresh.html"));
  await fs.access(path.join(outputDirectory, "graph.html"));
  await fs.access(path.join(outputDirectory, "tags.html"));
});

test("writes navigable tag pages for tagged notes", async () => {
  const notesDirectory = await makeTempDirectory("kokedama-tags-");
  const outputDirectory = await makeTempDirectory("kokedama-tag-site-");
  await fs.writeFile(path.join(notesDirectory, "first.md"), "# First\n\n#Garden #garden");
  await fs.writeFile(path.join(notesDirectory, "second.md"), "# Second\n\n#GARDEN");
  await fs.writeFile(path.join(notesDirectory, "third.md"), "# Third\n\nNo tags.");

  await writeSite(await readNotes(notesDirectory), outputDirectory);

  const tagIndex = await fs.readFile(path.join(outputDirectory, "tags.html"), "utf8");
  const gardenPage = await fs.readFile(path.join(outputDirectory, "tag-garden.html"), "utf8");
  const firstPage = await fs.readFile(path.join(outputDirectory, "first.html"), "utf8");
  const thirdPage = await fs.readFile(path.join(outputDirectory, "third.html"), "utf8");

  assert.equal((tagIndex.match(/tag-garden\.html/g) || []).length, 1);
  assert.match(gardenPage, /href="first\.html">First/);
  assert.match(gardenPage, /href="second\.html">Second/);
  assert.match(firstPage, /href="tag-garden\.html">#garden/);
  assert.match(thirdPage, /<p>No tags\.<\/p>/);
});

test("supports paths containing spaces and reports understandable CLI errors", async () => {
  const temporaryDirectory = await makeTempDirectory("kokedama paths ");
  const notesDirectory = path.join(temporaryDirectory, "notes with spaces");
  const outputDirectory = path.join(temporaryDirectory, "site with spaces");
  await fs.mkdir(notesDirectory);
  await fs.writeFile(path.join(notesDirectory, "note.md"), "# Space Note\n\nContent");

  const build = spawnSync(process.execPath, ["build.js", notesDirectory, outputDirectory], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  const invalidInput = spawnSync(process.execPath, ["build.js", path.join(temporaryDirectory, "missing"), outputDirectory], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  const outputFile = path.join(temporaryDirectory, "not-a-directory");
  await fs.writeFile(outputFile, "file");
  const invalidOutput = spawnSync(process.execPath, ["build.js", notesDirectory, outputFile], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });

  assert.equal(build.status, 0, build.stderr);
  await fs.access(path.join(outputDirectory, "space-note.html"));
  assert.equal(invalidInput.status, 1);
  assert.match(invalidInput.stderr, /Input notes directory .* does not exist or is not readable/);
  assert.equal(invalidOutput.status, 1);
  assert.match(invalidOutput.stderr, /Could not create output directory/);
});
