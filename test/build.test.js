const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  assignOutputFilenames,
  computeBacklinks,
  buildVisualGraphData,
  extractTags,
  parseNote,
  parseCliArguments,
  readNotes,
  renderGraphPage,
  renderVisualGraphPage,
  renderSearchPage,
  renderTagIndexPage,
  renderTagPage,
  renderTags,
  writeSite,
} = require("../build.js");

async function makeTempDirectory(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function waitFor(check, description, timeout = 3_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

test("parses a heading title and falls back to the filename", () => {
  const headingNote = parseNote("heading.md", "/notes/heading.md", "# Display Title\n\nBody");
  const filenameNote = parseNote("filename-title.md", "/notes/filename-title.md", "Body");

  assert.equal(headingNote.title, "Display Title");
  assert.equal(headingNote.body, "Body");
  assert.equal(filenameNote.title, "filename-title");
  assert.equal(filenameNote.body, "Body");
});

test("parses the optional watch flag without changing one-shot arguments", () => {
  assert.deepEqual(parseCliArguments(["notes", "site"]), {
    notesDirectory: "notes",
    outputDirectory: "site",
    watch: false,
  });
  assert.deepEqual(parseCliArguments(["--watch", "notes", "site"]), {
    notesDirectory: "notes",
    outputDirectory: "site",
    watch: true,
  });
  assert.deepEqual(parseCliArguments(["notes", "site", "--watch"]), {
    notesDirectory: "notes",
    outputDirectory: "site",
    watch: true,
  });
  assert.equal(parseCliArguments(["--unknown", "notes", "site"]), null);
  assert.equal(parseCliArguments(["notes"]), null);
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

test("renders a safe search page with complete no-JavaScript results", () => {
  const first = parseNote("first.md", "/notes/first.md", "# First Note\n\nA unique body phrase.");
  const second = parseNote("second.md", "/notes/second.md", "# Second Note\n\n<script>unsafe</script>");
  const notes = assignOutputFilenames([first, second]);
  const search = renderSearchPage(notes);

  assert.match(search, /Search titles and note content/);
  assert.match(search, /<noscript><p>Search filtering requires JavaScript/);
  assert.match(search, /href="first-note\.html">First Note/);
  assert.match(search, /href="second-note\.html">Second Note/);
  assert.match(search, /note\.title \+ " " \+ note\.text/);
  assert.match(search, /toLowerCase\(\)\.includes\(query\)/);
  assert.match(search, /No notes match your search\./);
  assert.doesNotMatch(search, /<script>unsafe<\/script>/);
  assert.match(search, /\\u003cscript\\u003eunsafe\\u003c\/script\\u003e/);
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

test("renders an interactive graph from resolved links with an accessible static fallback", () => {
  const source = parseNote("source.md", "/notes/source.md", "# Source\n\n[[Target]] [[Target]] [[Missing]]");
  const target = parseNote("target.md", "/notes/target.md", "# Target\n\nContent");
  const notes = assignOutputFilenames([source, target]);
  const graphData = buildVisualGraphData(notes);
  const graph = renderVisualGraphPage(notes);

  assert.deepEqual(graphData, {
    nodes: [
      { title: "Source", outputFilename: "source.html" },
      { title: "Target", outputFilename: "target.html" },
    ],
    edges: [{ source: "source.html", target: "target.html" }],
  });
  assert.match(graph, /id="visual-graph"/);
  assert.match(graph, /class: "visual-graph-node"/);
  assert.match(graph, /href: node\.outputFilename/);
  assert.match(graph, /Open " \+ node\.title/);
  assert.match(graph, /This interactive graph requires JavaScript/);
  assert.match(graph, /href="graph\.html">Link graph/);
  assert.match(graph, /"source":"source\.html","target":"target\.html"/);
  assert.doesNotMatch(graph, /Missing/);
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
  await fs.access(path.join(outputDirectory, "visual-graph.html"));
  await fs.access(path.join(outputDirectory, "tags.html"));
  await fs.access(path.join(outputDirectory, "search.html"));
});

test("writes a search page with every note in its static fallback", async () => {
  const notesDirectory = await makeTempDirectory("kokedama-search-");
  const outputDirectory = await makeTempDirectory("kokedama-search-site-");
  await fs.writeFile(path.join(notesDirectory, "first.md"), "# First\n\nFindable body text.");
  await fs.writeFile(path.join(notesDirectory, "second.md"), "# Second\n\nOther text.");

  await writeSite(await readNotes(notesDirectory), outputDirectory);

  const search = await fs.readFile(path.join(outputDirectory, "search.html"), "utf8");
  assert.match(search, /href="first\.html">First/);
  assert.match(search, /href="second\.html">Second/);
  assert.match(search, /Findable body text\./);
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

test("generates a system-aware persistent theme toggle on every page type", async () => {
  const notesDirectory = await makeTempDirectory("kokedama-theme-notes-");
  const outputDirectory = await makeTempDirectory("kokedama-theme-site-");
  await fs.writeFile(path.join(notesDirectory, "first.md"), "# First\n\n#Garden [[Second]]");
  await fs.writeFile(path.join(notesDirectory, "second.md"), "# Second\n\n[[Missing]]");

  await writeSite(await readNotes(notesDirectory), outputDirectory);

  for (const filename of ["first.html", "index.html", "graph.html", "visual-graph.html", "tags.html", "tag-garden.html", "search.html"]) {
    const page = await fs.readFile(path.join(outputDirectory, filename), "utf8");
    assert.match(page, /localStorage\.getItem\("kokedama-theme"\)/);
    assert.match(page, /class="theme-toggle"/);
    assert.match(page, /localStorage\.setItem\("kokedama-theme", theme\)/);
  }

  const stylesheet = await fs.readFile(path.join(outputDirectory, "style.css"), "utf8");
  assert.match(stylesheet, /@media \(prefers-color-scheme: dark\)/);
  assert.match(stylesheet, /:root\[data-theme="light"\]/);
  assert.match(stylesheet, /:root\[data-theme="dark"\]/);
  assert.match(stylesheet, /\.unresolved[\s\S]*var\(--unresolved-background\)/);
});

test("generates a compact visual graph for a larger vault", () => {
  const notes = Array.from({ length: 100 }, (_, index) => parseNote(
    `note-${index}.md`,
    `/notes/note-${index}.md`,
    `# Note ${index}\n\n${index === 0 ? "" : `[[Note ${index - 1}]]`}`,
  ));
  assignOutputFilenames(notes);
  const graph = renderVisualGraphPage(notes);

  assert.equal(buildVisualGraphData(notes).nodes.length, 100);
  assert.equal(buildVisualGraphData(notes).edges.length, 99);
  assert.ok(Buffer.byteLength(graph) < 100_000);
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

test("watch mode rebuilds after Markdown edits, additions, and deletions", async () => {
  const notesDirectory = await makeTempDirectory("kokedama-watch-notes-");
  const outputDirectory = await makeTempDirectory("kokedama-watch-site-");
  const buildPath = path.join(__dirname, "..", "build.js");
  await fs.writeFile(path.join(notesDirectory, "first.md"), "# First\n\nInitial content");

  const watcher = spawn(process.execPath, [buildPath, "--watch", notesDirectory, outputDirectory]);
  let output = "";
  watcher.stdout.on("data", (chunk) => {
    output += chunk;
  });
  watcher.stderr.on("data", (chunk) => {
    output += chunk;
  });

  try {
    await waitFor(() => output.includes("Watching"), "watch mode to start");
    await fs.writeFile(path.join(notesDirectory, "first.md"), "# First Updated\n\nEdited content");
    await waitFor(async () => {
      try {
        return (await fs.readFile(path.join(outputDirectory, "first-updated.html"), "utf8")).includes("Edited content");
      } catch {
        return false;
      }
    }, "edited note output");

    await fs.writeFile(path.join(notesDirectory, "second.md"), "# Second\n\nAdded content");
    await waitFor(async () => {
      try {
        await fs.access(path.join(outputDirectory, "second.html"));
        return true;
      } catch {
        return false;
      }
    }, "added note output");

    await fs.unlink(path.join(notesDirectory, "second.md"));
    await waitFor(async () => {
      try {
        await fs.access(path.join(outputDirectory, "second.html"));
        return false;
      } catch {
        return true;
      }
    }, "deleted note output cleanup");
  } finally {
    watcher.kill();
  }
});
