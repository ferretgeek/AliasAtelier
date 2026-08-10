"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../assets/alias-core.js");

test("parses single-line records and preserves opaque metadata", () => {
  const result = core.parseInput("artist@gmail.example----[example-only]----client-demo", { format: "single" });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].metadata, "[example-only]----client-demo");
});

test("pairs Gmail two-line records in automatic mode", () => {
  const result = core.parseInput("artist@gmail.example\n[example-only]\n", { format: "auto" });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].metadata, "[example-only]");
});

test("explicit paired mode consumes email-shaped metadata as opaque data", () => {
  const result = core.parseInput("artist@gmail.example\nmetadata@example.invalid\n", { format: "paired" });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].metadata, "metadata@example.invalid");
});

test("does not pair Microsoft records implicitly", () => {
  const result = core.parseInput("artist@outlook.example\nnot-an-account\n", { format: "auto" });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].metadata, "");
  assert.equal(result.ignored, 1);
});

test("auto mode generates only documented Gmail and Microsoft profiles", () => {
  const input = core.parseInput([
    "first@gmail.example",
    "second@outlook.example",
    "third@icloud.example",
    "fourth@example.test"
  ].join("\n"), { format: "single" });
  const result = core.generate(input.records, { provider: "auto", count: 2, prefix: "note" });
  assert.equal(result.stats.generated, 4);
  assert.equal(result.stats.skipped, 2);
  assert.match(result.text, /first\+note1@gmail\.example/);
  assert.doesNotMatch(result.text, /third\+/);
});

test("metadata is omitted by default and masked in previews when retained", () => {
  const records = core.parseInput("artist@gmail.example----[private-value]", { format: "single" }).records;
  const safe = core.generate(records, { provider: "gmail", count: 1, prefix: "g" });
  assert.doesNotMatch(safe.text, /private-value/);
  const retained = core.generate(records, {
    provider: "gmail", count: 1, prefix: "g", keepMetadata: true
  });
  assert.match(retained.text, /private-value/);
  assert.doesNotMatch(retained.preview[0], /private-value/);
});

test("paired output keeps metadata on the following line", () => {
  const records = core.parseInput("artist@gmail.example\n[example-only]", { format: "paired" }).records;
  const result = core.generate(records, {
    provider: "gmail", count: 1, prefix: "g", keepMetadata: true, outputFormat: "paired"
  });
  assert.equal(result.text, "artist+g1@gmail.example\n[example-only]\n");
  assert.equal(result.outputLines, 2);
});

test("duplicate aliases are collapsed case-insensitively", () => {
  const records = core.parseInput("Artist@gmail.example\nartist@gmail.example", { format: "single" }).records;
  const result = core.generate(records, { provider: "gmail", count: 1, prefix: "g" });
  assert.equal(result.stats.generated, 1);
  assert.equal(result.stats.duplicates, 1);
});

test("unsafe prefixes and oversized jobs are rejected", () => {
  const records = core.parseInput("artist@gmail.example", { format: "single" }).records;
  assert.throws(() => core.generate(records, { count: 1, prefix: "bad tag" }), /标签前缀/);
  assert.throws(
    () => core.generate(Array(5).fill(records[0]), { count: 50000, prefix: "g" }),
    /超过/
  );
});

test("input lines, diagnostics, and output bytes are independently bounded", () => {
  assert.throws(
    () => core.parseInput("x\n".repeat(core.MAX_INPUT_LINES + 1), { format: "single" }),
    /行安全上限/
  );
  const invalid = core.parseInput("not-an-email\n".repeat(500), { format: "single" });
  assert.equal(invalid.ignored, 500);
  assert.equal(invalid.diagnostics.length, 200);
  const record = core.parseInput(`artist@gmail.example----${"m".repeat(4000)}`, { format: "single" }).records[0];
  assert.throws(
    () => core.generate([record], { provider: "gmail", count: 10000, prefix: "g", keepMetadata: true }),
    /32 MiB/
  );
});
