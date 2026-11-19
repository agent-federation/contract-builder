import { test } from "node:test";
import assert from "node:assert/strict";
import { Diagnostics, type Diagnostic } from "../spec/lib/diagnostics.js";

const toSnapshot = (diagnostic: Diagnostic) => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  file: diagnostic.file,
  pointer: diagnostic.pointer,
  message: diagnostic.message,
});

test("golden: emissionOrder() returns a copy and cannot mutate the collector", () => {
  const diagnostics = new Diagnostics();
  diagnostics.add("warning", "WARN_SENTINEL", "sentinel.yml", "/sentinel", {
    en: "sentinel message",
    ru: "sentinel message",
  });

  const first = diagnostics.emissionOrder();
  first.reverse();
  first[0]!.code = "MUTATED";
  first[0]!.message = "mutated";

  const second = diagnostics.emissionOrder();
  assert.equal(second.length, 1);
  assert.equal(second[0]!.code, "WARN_SENTINEL");
  assert.equal(second[0]!.message, "sentinel message");
  assert.deepEqual(diagnostics.sorted().map(toSnapshot), [
    {
      code: "WARN_SENTINEL",
      severity: "warning",
      file: "sentinel.yml",
      pointer: "/sentinel",
      message: "sentinel message",
    },
  ]);
});
