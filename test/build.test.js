const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  assignOutputFilenames,
  computeBacklinks,
  parseNote,
  readNotes,
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
