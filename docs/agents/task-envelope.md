# A2A Task Envelope — a repository-local convention

**Status:** proposed for maintainer review
**Document version:** 1.0
**Baseline:** `02f6e99` (main after #20)
**Related:** #22
**Implementation status:** documentation only — no runtime code, no dependency change

> **What this is.** A compact, machine-readable text envelope in which a human or an agent
> hands one task to an agent, plus a matching form for the answer.
>
> **What this is not.** It is a convention local to `agent-federation/contract-builder`. It is
> **not** a universal agent protocol and it makes **no** compatibility claim with any external
> "A2A" specification, vendor, model, tool or wire format. `A2A/0.1` is a local format marker
> whose only meaning is defined in this file. Nothing outside this repository is expected to
> read it, and no compatibility may be asserted anywhere until it has been tested here
> (invariant I4 of #22).

---

## 1. Why this exists

Agents and maintainers in this repository exchange tasks as prose. Prose is readable but it
loses the difference between *a fact*, *a limit* and *an acceptance criterion*: an instruction
buried in a paragraph is easy to miss, and a report that says "done" is easy to write without
saying what was verified.

This envelope fixes only that: it separates the parts of a task that a responder is bound by
from the parts that merely inform it, and it fixes the four words in which a responder may
answer. It deliberately stays small enough to write by hand and read without a parser.

The convention is used by coding agents working in this repository and by maintainers
reviewing their work. It does not replace `README.md`, `docs/architecture/*`, issue text,
repository rules or review — it is a way to state one task and one answer.

## 2. Scope, non-goals and non-claims

In scope:

- one task, stated once, by whoever assigns it (a human or an agent);
- one answer, stated once, by whoever did it;
- a grammar small enough to parse with string operations and to validate by hand (§9).

Out of scope, and not to be read into any message:

- **transport, storage, scheduling, retries, discovery** — the envelope is text, not a protocol;
- **authorization** — an envelope grants nothing. It is a plan, not a permission token; the
  repository rules and the environment still decide what may be changed;
- **identity, trust, signatures** — nothing here is authenticated;
- **execution** — steps are guidance, not an interpreter;
- **compatibility claims** — see the note above (I4). Do not describe this format as
  compatible with any model, vendor or external agent protocol unless that was tested in this
  repository and the test is cited.

## 3. Format at a glance

A minimal task message. This is a **skeleton**: its objective and its one acceptance entry
are placeholders that show the shape, not a real task. The examples that A3–A5 are checked
against are in §8.

```text
A2A/0.1 TASK
TASK {
  id: "CB-EXAMPLE-000"
  objective: "State one outcome in one sentence."
}
ACCEPT [
  "A1 One falsifiable condition."
]
REPORT {
  include: ["files_changed"]
}
END
```

The answer to that skeleton (also a skeleton):

```text
A2A/0.1 REPORT
REPORT {
  task_id: "CB-EXAMPLE-000"
  status: "done"
  files_changed: ["docs/agents/task-envelope.md"]
}
END
```

The header names the format, its version and the message form. Blocks follow in a fixed order,
and `END` closes the message. Everything is plain text: the Markdown code fence around a
message is a display device and is **not** part of the format (I6).

## 4. Grammar (normative)

### 4.1 Tokens, encoding and values

- The message is UTF-8 text with `LF` line endings.
- Whitespace — space, tab, line break — is **insignificant between tokens**. It is not
  insignificant inside a string.
- A **string** is a double-quoted run of characters: `"..."`. A string must not contain a raw
  line break. Three escapes exist and only three: `\"` (quote), `\\` (backslash), `\n` (line
  break). Any other backslash sequence is a format error.
- A block is a **mapping** (keys to values) or a **list of strings**. Every value is a string
  or — only where §5–§7 says so, as for `REPORT.include`, a report's `notes` and its `include`
  fields — a list of strings. There are no numbers, booleans or nulls: `"30"` and `"true"` are
  strings, and a reader must not convert them. This keeps a parser small and keeps "no
  implicit meaning" true.
- A **key** matches `[a-z][a-z0-9_]*` — lowercase snake case. Keys are case-sensitive.
- A **block name** is one of the fixed upper-case names in §4.2. Block names are
  case-sensitive.
- There are **no comments**. Explanations belong outside the message.
- Duplicate keys in one mapping, and duplicate blocks in one message, are format errors
  (§4.4).

### 4.2 Grammar

```text
message    = header , { block } , "END" ;
header     = "A2A/0.1" , ws , message-kind ;
message-kind = "TASK" | "REPORT" ;
block      = block-name , ( mapping | listing ) ;
mapping    = "{" , [ pair , { [ "," ] , pair } , [ "," ] ] , "}" ;
pair       = key , ":" , value ;
value      = string | listing ;
listing    = "[" , [ string , { [ "," ] , string } , [ "," ] ] , "]" ;
block-name = "TASK" | "CONTEXT" | "INPUTS" | "CONSTRAINTS"
           | "STEPS" | "ACCEPT" | "REPORT" | "HANDOFF" ;
```

`ws` means at least one whitespace character between the version marker and the message kind,
so `A2A/0.1TASK` is not a header. Everywhere else whitespace between tokens is optional.
`END` is a token, not a block: it must be the last token of the message, and only whitespace
may follow it.

The grammar says what a well-formed message looks like, not what a complete one contains.
A message is valid only if it also satisfies the semantic rules of §5–§7: which blocks and
keys are required, which values are allowed, and which report keys must pair with an
assignment. §9 is the checklist that covers both.

Commas inside a block are **optional separators**: a comma may sit between two adjacent
entries — list items or key/value pairs — and one may follow the last entry. Because entries
are delimited by their own syntax (a string ends a list item, a complete key/value pair ends a
pair), an optional comma introduces no ambiguity. The canonical layout (§4.3) puts one entry
per line and omits commas entirely.

Block order is fixed, and each block appears at most once:

- a **TASK** message: `TASK`, `CONTEXT`, `INPUTS`, `CONSTRAINTS`, `STEPS`, `ACCEPT`, `REPORT`,
  `HANDOFF`, `END` — optional blocks are simply omitted;
- a **REPORT** message: `REPORT`, `END`.

The grammar allows either shape for any block name. §5–§7 fix the shape of each block: `TASK`,
`CONTEXT`, `REPORT` and `HANDOFF` are mappings, `INPUTS`, `CONSTRAINTS`, `STEPS` and `ACCEPT`
are lists. A message that uses the wrong shape is invalid even though §4.2 accepts it (§9,
step 4).

### 4.3 Layout (recommendation, not normative)

The grammar above accepts a whole message on one line. For humans, write it as follows: the
header on the first line; each block name followed by its brace/bracket on its own line; one
key/value pair or list item per line, indented two spaces; commas omitted (they are optional
separators, §4.2). These are `SHOULD` rules for readability; a message is valid without them,
and a reader must not depend on line breaks.

### 4.4 Unknown-field policy: reject

**Policy chosen for this format: unknown fields are rejected.** The format is closed. A
message that contains anything not defined here is invalid, and a reader must say so rather
than ignore the extra part.

Rejected, in particular:

- a version marker other than `A2A/0.1`;
- a message kind other than `TASK` or `REPORT`;
- a block name outside the fixed set (including the spelling `DO` and `INVARIANTS`, which
  appear in the sketch that requested this document — see §10);
- a key outside the defined key set of `TASK`, `REPORT` or `HANDOFF`;
- a key repeated inside one mapping, or a block repeated inside one message;
- a status value outside the four in §7;
- trailing content after `END`.

**One explicit exception.** The `CONTEXT` block is open by design: it accepts any key matching
`[a-z][a-z0-9_]*` with a string value (§6.2). This is an allowance the format states, not an
"ignore unknown fields" mode.

**There is no permissive mode and no ignore-unknown mode.** The declared extension mechanism is
a version bump: a message that needs fields not defined here declares a different version
(`A2A/0.2`, …), and a reader that does not implement that version rejects the message. Why:
the failure mode of a task envelope is a silent misreading, where a requirement or a limit is
dropped without anyone noticing. Rejecting is the only behaviour that can be tested.

## 5. Field model

The ten fields of the envelope map onto blocks as follows. "Required" means the message is
invalid without it; "optional" means it may be absent, and absence means *unspecified* — a
responder must not invent a value for it.

| # | Field | Rendered as | Required | Type and constraints |
|---|---|---|---|---|
| 1 | `version` | header marker | required | literal `A2A/0.1`; no other version is accepted |
| 2 | `task_id` | `TASK.id` | required | string matching `[A-Z][A-Z0-9-]{2,31}`; stable; a repository-local identifier |
| 3 | `objective` | `TASK.objective` | required | string; one sentence stating the outcome and nothing else is the expected form (`SHOULD`, not enforced) |
| 4 | `context` | `CONTEXT` | optional | mapping; keys open (`[a-z][a-z0-9_]*`), values are strings; informs, never binds |
| 5 | `inputs` | `INPUTS` | optional | list of strings; each entry is a repository-relative path (slash-separated; no empty, `.` or `..` segment; no backslash or drive/UNC prefix) or an absolute `http`/`https` URL; the check is lexical, not filesystem containment, and provenance is not checkable (§6.3) |
| 6 | `constraints` | `CONSTRAINTS` | optional | list of strings; each entry a limit the task must respect |
| 7 | `steps` | `STEPS` | optional | ordered list of strings; the order is significant; guidance, not a mandate (§6.5) |
| 8 | `acceptance` | `ACCEPT` | required | non-empty list of strings; each entry falsifiable; the definition of the task's outcome — `done` requires every entry satisfied and no binding constraint broken (§7.1) |
| 9 | `report` | `REPORT` | required | mapping with `include` (required, non-empty list of strings); the reporting contract (§7) |
| 10 | `handoff` | `HANDOFF` | optional | mapping with `pr`, `merge`, `scope_guard`; the expected delivery (§6.8) |

Why this split: a task cannot be closed without an outcome (`objective`) and a way to tell
whether it happened (`acceptance`), and an answer cannot be compared without a reporting
contract (`report`). Context, inputs, limits, steps and delivery instructions are useful, but a
task without them is still a task. Conversely, an optional field that carries an obligation —
`CONSTRAINTS`, `HANDOFF`, `mode` — is honoured exactly as a required field is; the others
inform.

`TASK` also carries four optional metadata keys. They are **not** part of the ten fields
above: `kind` is added by this document, and `target`, `priority` and `mode` come from the
sketch that requested it. They say something useful about a task. Three of them are
information only; `mode` is the exception, because it states the expected write footprint and
binds the responder (§6.1).

| Key | Values | Meaning |
|---|---|---|
| `kind` | `"docs"`, `"code"`, `"review"`, `"investigation"` | the expected kind of work; a hint for routing, not an acceptance criterion |
| `target` | string | the artifact the task is expected to produce, e.g. a path |
| `priority` | `"low"`, `"normal"`, `"high"` | the order in which the assigner expects to see the task; not a deadline |
| `mode` | `"additive-only"`, `"modify"` | the expected write footprint: add files only, or existing files may change; not an authorization and not waivable by the responder |

## 6. Block semantics

Nothing in a message is inferred. If a fact is absent, it is absent: a responder must not fill
it from context, habit, or what "is obviously meant".

### 6.1 `TASK`

| Key | Required | Type | Meaning |
|---|---|---|---|
| `id` | yes | string `[A-Z][A-Z0-9-]{2,31}` | the identifier echoed in the report |
| `objective` | yes | string | the one outcome the task asks for |
| `kind` | no | enum, see §5 | expected kind of work |
| `target` | no | string | expected artifact |
| `priority` | no | enum, see §5 | expected order of work |
| `mode` | no | enum, see §5 | expected write footprint |

The objective is the whole ask. A responder is bound by `objective`, `CONSTRAINTS`, `ACCEPT`
and — when present — `mode`; `HANDOFF` governs delivery (§6.8). `CONTEXT`, `INPUTS`, `kind`,
`target` and `priority` are information. A requirement that appears only in `CONTEXT` is not a
requirement.

These can conflict — the obvious case is an `ACCEPT` entry that cannot be met without editing
a file while `mode: "additive-only"` forbids editing. A conflict is not resolved by the
responder: report `needs-decision`, name the conflicting items and the options (§7.1). Neither
a limit nor an acceptance entry may be dropped silently.

A responder must not widen the task: work that is not needed for `ACCEPT` and is not a step is
not part of the task.

### 6.2 `CONTEXT`

A mapping of facts about the surroundings: repository, track, area, audience, current state.
Keys are open (`[a-z][a-z0-9_]*`), values are strings. Conventional keys are `repo`,
`active_track`, `area`, `audience`; they are a convention, not a schema, and their absence
means nothing.

`CONTEXT` is where background goes. It cannot add a requirement; if something must be done,
it belongs in `CONSTRAINTS` or `ACCEPT`. `constraint` is the canonical anti-example: the open
key set accepts it, it binds nothing, and a limit written there is a limit the responder may
miss (§10).

### 6.3 `INPUTS`

A list of materials the task was given: repository-relative paths (such as
`spec/contract-builder.json`) or absolute URLs (such as an issue URL). Each entry is a
non-empty string of one of two forms, checked lexically (§9, step 4):

- a **repository-relative path** uses `/` as its only separator: it does not start with `/`,
  contains no `\`, does not start with a drive letter or a UNC prefix, and, split on `/`, has
  no empty, `.` or `..` segment;
- an **absolute URL** has the `http` or `https` scheme.

Anything else is a format error.

The check is **lexical only**. It rejects traversal syntax, but it does not resolve the path,
and it does not establish that following a symlink stays inside the repository. Filesystem
containment — including symlink resolution — belongs to the tooling that consumes the path,
not to this text format; the envelope makes no containment claim.

The entries should (`SHOULD`) name materials that were explicitly supplied to the task.
Whether a material was explicitly supplied is a fact about the assignment, not a property of
the string, so the responder reads it from the assignment and §9 checks only the shape.

An entry names a material to consult; it is not a requirement and it does not mean "read only
this" — repository rules about reading the codebase still apply.

### 6.4 `CONSTRAINTS`

A list of limits. Each entry should be falsifiable: "no new runtime dependencies" can be
checked; "be careful" cannot. Entries are conventionally numbered `I1`, `I2`, … so that a
report can cite them.

Constraints bind the responder. Overriding one is a failure, not a trade-off: a responder that
cannot satisfy one reports `blocked` or `needs-decision` (§7.1) instead of proceeding, and a
constraint violated while the work went ahead makes the report `partial` even when every
`ACCEPT` entry is met. Steps cannot relax a constraint.

### 6.5 `STEPS`

An ordered list of the moves the assigner expects: read this, change that, run those checks.
Order is significant. Steps are a **plan, not a mandate**: a responder may reach the same
`ACCEPT` along another route, and should then say so in its report `notes`. Conversely,
following every step does not make a task done — only `ACCEPT` does.

### 6.6 `ACCEPT`

A non-empty list of falsifiable criteria. Each entry should be checkable by a command, a file
lookup, or a reading of a named artifact; entries are conventionally numbered `A1`, `A2`, … so
a report can cite them.

`ACCEPT` defines the task's outcome. A task is not done because the steps were followed,
because the work was hard, or because nothing failed loudly — every entry must be satisfied and
evidenced in the report, and no binding constraint or `mode` may be broken (§7.1).

### 6.7 `REPORT` (in a `TASK` message)

The reporting contract: which fields the answer must carry.

| Key | Required | Type | Meaning |
|---|---|---|---|
| `include` | yes | non-empty list of strings | report keys the responder must fill |

`include` entries are lowercase snake-case keys, unique within the list, and they must not be
`task_id`, `status` or `notes` — those three are reserved by the report form (§7). In a `TASK`
message the `REPORT` block **must not** carry `status`; the status is the responder's answer,
not the assigner's. Its presence is a format error.

Example: `include: ["files_changed", "validation_method", "limitations"]` asks the responder
for three named fields, and nothing else.

### 6.8 `HANDOFF`

The expected delivery. All keys are optional, and the key set is closed.

| Key | Values | Meaning |
|---|---|---|
| `pr` | `"focused"`, `"split"` | one pull request for the whole task, or several scoped ones |
| `merge` | `"maintainer-review-required"`, `"auto-merge"` | whether the answer may be merged without a maintainer's decision |
| `scope_guard` | string | work the responder must not start or modify as part of this task |

`HANDOFF` states expectations; it does not overrule repository rules, and it is not an
authorization to merge anything. A responder that would deliver differently reports
`needs-decision`.

### 6.9 `END`

The terminator. Nothing but whitespace may follow it; the message is complete at `END`.

## 7. Reporting

A task is closed by a `REPORT` message of the same envelope family. Its header is
`A2A/0.1 REPORT`; it contains exactly one `REPORT` block and `END`.

| Key | Required | Type | Meaning |
|---|---|---|---|
| `task_id` | yes | string | must equal the assignment's `TASK.id` |
| `status` | yes | enum: `done`, `partial`, `blocked`, `needs-decision` | the outcome |
| `notes` | no | list of strings | anything a reader should know that the included fields do not cover |
| *(the keys listed in the assignment's `include`)* | yes | strings or lists of strings | the evidence the assignment asked for |

The key set is closed: `task_id`, `status`, `notes` and the assignment's `include` keys, and
nothing else. An `include` key that is missing is a format error, because a report that skips
part of the contract cannot be compared with another.

### 7.1 The four statuses

| Status | Meaning | The report must contain |
|---|---|---|
| `done` | every `ACCEPT` entry is satisfied and no binding constraint or `mode` was violated | the evidence for each entry, in the included fields |
| `partial` | at least one `ACCEPT` entry is unsatisfied, **or** every entry is satisfied but a binding constraint or `mode` was violated | each unsatisfied entry or violated constraint, named, with the reason and the evidence |
| `blocked` | the work cannot proceed at all | the exact blocking condition (missing dependency, unmerged prerequisite, environment or tooling failure) and what was attempted |
| `needs-decision` | work cannot continue until a human chooses | the decision, at least two options with their trade-offs, and a recommendation; a permission or access that only a maintainer can grant belongs here |

Rules that make the four words unambiguous:

- exactly one status per report; there is no "done with caveats" and no combined status;
- `done` with an unsatisfied or unverified `ACCEPT` entry, or with a violated constraint or
  `mode`, is a false report — use `partial`;
- a finished task that broke a binding constraint is `partial`, not `done` and not `blocked`:
  the work happened, so the failure is reported, not hidden behind "could not proceed";
- `partial` describes work that happened; when the work cannot proceed, the status is
  `blocked` or `needs-decision`;
- `blocked` names a condition, not a choice. "I would have to pick between A and B" is
  `needs-decision`; "the branch this depends on is not merged" is `blocked`;
- `needs-decision` states options and a recommendation; it must not present a guess as a
  decision;
- when both `blocked` and `needs-decision` could apply, use `blocked` if no answer could let
  the work continue, otherwise `needs-decision`;
- a report is the closing artifact: work is not finished until a report exists, and an
  unreported task is not done.

## 8. Examples

Both task examples are illustrative. Example 2 in particular is **not** authorized work: it is
fictional, and an envelope never authorizes anything by itself (§2).

The examples that A3–A5 are checked against are §8.1 and §8.3, plus the report in §8.5; the
two messages in §3 are skeletons.

### 8.1 Example 1 — a documentation-only task

This is #22 itself, restated in the format.

```text
A2A/0.1 TASK
TASK {
  id: "CB-A2A-001"
  kind: "docs"
  target: "docs/agents/task-envelope.md"
  objective: "Define a compact, machine-readable agent handoff envelope at docs/agents/task-envelope.md."
  priority: "low"
  mode: "additive-only"
}
CONTEXT {
  repo: "agent-federation/contract-builder"
  active_track: "M1"
  audience: "coding-agents, human-maintainers"
}
INPUTS [
  "https://github.com/agent-federation/contract-builder/issues/22"
]
CONSTRAINTS [
  "I1 No new runtime dependencies.",
  "I2 No changes to CORE-001 normative content.",
  "I3 No changes to build behaviour, schemas, fixtures or M1 implementation.",
  "I4 Do not claim compatibility with any model or vendor unless tested.",
  "I5 Unknown fields are rejected; the format is closed.",
  "I6 The format must remain readable as plain Markdown text."
]
STEPS [
  "Read the issue and the repository docs.",
  "Write the envelope document at the target path.",
  "Validate both task examples against the grammar.",
  "Open a focused pull request."
]
ACCEPT [
  "A1 docs/agents/task-envelope.md exists.",
  "A2 §9 lists a check for every rule stated in §4–§7, and §4–§7 state every rule §9 checks.",
  "A3 Both task examples in §8 parse against the documented grammar.",
  "A4 The examples carry explicit constraints and testable acceptance criteria.",
  "A5 The decodings in §8.2 and §8.4 mention every block of their example and no fact absent from it.",
  "A6 No existing file changed and no build behaviour changed."
]
REPORT {
  include: ["files_changed", "format_decisions", "validation_method", "limitations"]
}
HANDOFF {
  pr: "focused"
  merge: "maintainer-review-required"
  scope_guard: "Do not start or modify M1 implementation work."
}
END
```

### 8.2 Decoding Example 1 by hand

- **Message.** `A2A/0.1 TASK` — a task message in the local envelope format, version 0.1.
- **Who and what.** `CB-A2A-001` is expected to be documentation work delivering the file
  `docs/agents/task-envelope.md`, and asks for one sentence's worth of outcome: a compact
  machine-readable handoff envelope defined there. Priority is low, which is an expectation
  about order, not a deadline. The write footprint is `additive-only`, and `mode` binds: no
  existing file may change. The target file does not exist yet, so this is satisfiable.
- **Background.** The task lives in `agent-federation/contract-builder`, on the M1 track, and
  is written for coding agents and human maintainers. None of this is a requirement.
- **What it is given.** One input: the issue URL. Everything else must still be read from the
  repository; the input is not a permission to read only that.
- **What it must not do.** Six numbered limits: no new runtime dependencies; no touch of
  CORE-001 normative content; no touch of build behaviour, schemas, fixtures or M1
  implementation; no untested compatibility claims; unknown fields rejected (the format is
  closed); the result must stay readable as plain Markdown. Any of these broken makes the
  answer `partial` if the work was completed anyway, or `blocked`/`needs-decision` if it could
  not proceed — never `done`.
- **How it is expected to happen.** Four steps, in order: read, write the file, validate the
  examples, open one pull request. A different sequence that still reaches every acceptance
  entry is allowed and would be noted in the report.
- **When it is done.** Six conditions, each checkable: the file exists; every rule §9 checks is
  stated in §4–§7 and vice versa; both examples parse; the examples contain constraints and
  testable criteria; the decodings name every block and add no fact; and no existing file or
  build behaviour changed.
- **What the answer must contain.** Four named fields: files changed, format decisions,
  validation method, limitations.
- **Delivery.** One focused pull request, merged only after a maintainer decides, and M1
  implementation work must not be started or modified.

### 8.3 Example 2 — a code task with tests

Fictional, and not a request to do it.

```text
A2A/0.1 TASK
TASK {
  id: "CB-EXAMPLE-002"
  kind: "code"
  objective: "Reject a project manifest that declares the same input path twice, with ERR_MANIFEST_DUPLICATE_INPUT."
  mode: "modify"
}
CONTEXT {
  repo: "agent-federation/contract-builder"
  area: "spec/lib/manifest.ts"
  audience: "coding-agents"
}
INPUTS [
  "spec/lib/manifest.ts",
  "spec/contract-builder.json",
  "tests/manifest.test.ts"
]
CONSTRAINTS [
  "I1 No new runtime dependencies.",
  "I2 The CORE-001 golden artifact must not change.",
  "I3 The tests that pass today must keep passing.",
  "I4 Error codes are strings of the form ERR_UPPER_SNAKE.",
  "I5 Diagnostics keep the existing shape: a code and a message, no new fields."
]
STEPS [
  "Add the duplicate-path check where declared inputs are read.",
  "Add a test: a manifest listing the same input twice fails with the new code.",
  "Add a test: a manifest without duplicates still builds unchanged.",
  "Run bun test, bun run typecheck and bun run check.",
  "Open a focused pull request and report the tested commit."
]
ACCEPT [
  "A1 A manifest declaring one input twice fails with ERR_MANIFEST_DUPLICATE_INPUT.",
  "A2 A manifest without duplicates still builds unchanged.",
  "A3 The new failing-case test fails before the change and passes after it.",
  "A4 bun test, bun run typecheck and bun run check are green.",
  "A5 The golden artifact hash is unchanged."
]
REPORT {
  include: ["files_changed", "test_evidence", "blast_radius", "limitations"]
}
HANDOFF {
  pr: "focused"
  merge: "maintainer-review-required"
  scope_guard: "Do not start or modify M1 implementation work beyond this change."
}
END
```

### 8.4 Decoding Example 2 by hand

- **Message.** `A2A/0.1 TASK` — a task message, version 0.1.
- **Who and what.** `CB-EXAMPLE-002` is code work with a single outcome: a manifest that lists
  the same input path twice must fail with `ERR_MANIFEST_DUPLICATE_INPUT`. Existing files are
  expected to change (there is no `additive-only`).
- **Background.** Same repository, the manifest loader in `spec/lib/manifest.ts`, for a coding
  agent. Not a requirement.
- **What it is given.** Three files to start from: the loader, the real manifest, and the
  manifest tests. Again: a starting point, not a reading restriction.
- **What it must not do.** No new runtime dependencies; the golden artifact must not change;
  today's passing tests must keep passing; error codes follow `ERR_UPPER_SNAKE`; diagnostics
  keep their existing shape. Any of these broken makes the answer `partial` if the work was
  completed anyway, or `blocked`/`needs-decision` if it could not proceed.
- **How it is expected to happen.** Five steps: implement, add the failing-case test, add the
  unchanged-case test, run the three checks, open one pull request reporting the tested
  commit. Deviation is allowed and is reported.
- **When it is done.** Five checkable conditions. Note A3: the new test must *fail before* the
  change — a test that only passes is not evidence that it tests anything.
- **What the answer must contain.** Files changed, test evidence, blast radius, limitations.
- **Delivery.** One focused pull request, maintainer decision required, and M1 implementation
  work outside this change must not be touched.

### 8.5 Example 3 — the report for Example 1

```text
A2A/0.1 REPORT
REPORT {
  task_id: "CB-A2A-001"
  status: "done"
  files_changed: ["docs/agents/task-envelope.md"]
  format_decisions: [
    "D1 One format, two message forms, told apart by the header line.",
    "D2 Closed field set; unknown fields are rejected.",
    "D3 CONTEXT is the only open-key block; nothing in it is a requirement.",
    "D4 Values are strings or lists of strings only.",
    "D5 Fixed block order; duplicate block or key is an error.",
    "D6 Required: header, id, objective, ACCEPT, REPORT; the rest optional.",
    "D7 STEPS is a plan, not a mandate; a deviation is reported.",
    "D8 Four statuses, exactly one per report; no done-with-caveats.",
    "D9 One accepted version; extension is a version bump, not an ignore-unknown mode.",
    "D10 Plain text inside a Markdown fence; the fence is not part of the format."
  ]
  validation_method: [
    "A throwaway parser implementing sections 4 and 9 parsed all five A2A messages.",
    "Negative checks rejected a wrong version, a DO block, an unknown TASK key, an unknown status, a missing include key, a duplicate block and shape violations (ACCEPT as a mapping, id as a list, CONTEXT as a list).",
    "Both task examples were decoded by hand against section 8, without the parser."
  ]
  limitations: [
    "No validator ships with the repository; validation is a procedure, not a tool.",
    "Free-text quality of objectives and acceptance criteria is a convention, not enforced."
  ]
}
END
```

Read as: task `CB-A2A-001` is done; one file changed; ten format decisions were taken, listed;
validation was a parser run plus negative checks plus a manual decode; two limitations remain.

## 9. Validating a message

No validator ships in this repository. That is deliberate: shipping one would add a runtime
dependency and a build path, against I1 and I3. Validation is a procedure that a human or an
agent runs, and its result belongs in the report's `validation_method` field.

1. **Header.** The first tokens are exactly `A2A/0.1 TASK` or `A2A/0.1 REPORT`. Any other
   version or form: reject.
2. **Blocks.** Every block name is in the fixed set of §4.2; no name appears twice; the order
   is the one in §4.2; `END` is last and nothing but whitespace follows it.
3. **Required blocks.** A task message has `TASK`, `ACCEPT` and `REPORT`; a report message has
   `REPORT`.
4. **Keys and shapes.** `TASK`, `CONTEXT`, `REPORT` and `HANDOFF` are mappings; `INPUTS`,
   `CONSTRAINTS`, `STEPS` and `ACCEPT` are lists. In a mapping, a value is a string, except
   `REPORT.include` (a non-empty list of strings) and a report message's `notes` (a list of
   strings); in a report message the `include` fields may be strings or lists of strings. Every
   `INPUTS` entry is a non-empty string that is either a repository-relative path — its only
   separator is `/`, it does not start with `/`, contains no `\`, starts with no drive letter
   or UNC prefix, and has no empty, `.` or `..` segment — or an absolute `http`/`https` URL.
   That check is lexical; it neither resolves the path nor follows symlinks, and whether a
   material was explicitly supplied is not checkable (§6.3).
   `TASK`, `REPORT` and `HANDOFF` contain only their defined keys. `TASK.id` matches
   `[A-Z][A-Z0-9-]{2,31}`; `TASK` has `id` and `objective`; `ACCEPT` is non-empty; a task
   message's `REPORT` has `include` and no `status`, and its `include` entries are unique,
   match `[a-z][a-z0-9_]*`, and are not `task_id`, `status` or `notes`; a report message has
   `task_id` and `status`.
5. **CONTEXT.** Every key matches `[a-z][a-z0-9_]*`; every value is a string. No other check:
   the block is open.
6. **Enumerations.** `kind`, `priority`, `mode`, `HANDOFF.pr`, `HANDOFF.merge` and `status` use
   only their listed values.
7. **Report pairing.** A report's `task_id` equals the assignment's `TASK.id`; its keys are a
   subset of `task_id`, `status`, `notes` plus the assignment's `include` keys, and `task_id`,
   `status` and every `include` key are present.
8. **Strings.** Every value is double-quoted; only `\"`, `\\`, `\n` appear as escapes; no raw
   line break inside a string.
9. **Duplicates.** No key is repeated inside one mapping.
10. **Manual decode.** A human reads the message without a parser and can restate the ask, the
    limits, the done criteria and the expected answer. If not, the message is too compressed.

A parser is not the point of the format; a message that only a parser can explain has failed
I6.

### 9.1 How the examples in this document were validated

A throwaway parser implementing §4 and §9 (not committed, not a dependency) was run over the
five `A2A` messages in this document — §3's two skeletons and §8's three examples — and over
the negative cases in §9.2 plus the shape violations they imply (wrong value types, wrong
block shapes). The results are reported in the pull request for this document. The procedure
stays reproducible without that parser: §9 is the procedure, and the parser only automates it.

### 9.2 Negative cases a validator must reject

- `A2A/0.2 TASK` — unknown version.
- `A2A/0.1 TASK` with a `DO` or `INVARIANTS` block — unknown block name (§10).
- a `TASK` message with a key `owner` — unknown key.
- a `TASK` message whose `REPORT` block has `status` — reserved for the answer.
- a report with `status: "mostly-done"` — unknown status.
- a report missing one `include` key — incomplete contract.
- two `ACCEPT` blocks in one message — duplicate block.
- a `TASK` whose `id` is a list, or whose `ACCEPT` is a mapping — wrong value type, wrong block
  shape.
- a `CONTEXT` block written as a list — wrong block shape.
- an `include` entry named `status` — reserved report key.
- an `INPUTS` entry that is not a repository-relative path or an absolute `http`/`https` URL
  (§6.3): `/etc/passwd`, `""`, `../../outside.txt`, `C:\outside.txt`,
  `\\server\share\file.txt`, `a//b`, `./a`, `ftp://example.com/x`.

## 10. Relation to the brief in #22

The issue that requested this document is itself written in a draft sketch of the format. The
canonical form defined here differs from that sketch as follows:

| Sketch | Canonical (§4–§6) | Why |
|---|---|---|
| block `DO` | `STEPS` | the field being defined is `steps`; one name per concept |
| block `INVARIANTS` | `CONSTRAINTS` | the field being defined is `constraints`; limits are not all invariants |
| `TASK.kind` | kept, restricted to four values | a task should be able to say what kind of work it expects |
| `TASK.target`, `TASK.priority`, `TASK.mode` | kept as optional metadata keys | they say something useful about a task and cost nothing; `mode` binds (§6.1) |
| `CONTEXT.active_track`, `CONTEXT.constraint` | `CONTEXT` keys are open | context varies per task; a closed list would reject real cases. A `constraint` key is accepted but binds nothing — a real limit belongs in `CONSTRAINTS` (§6.2) |
| `REPORT.status` as a list of allowed values, and `REPORT.if_blocked` | `status` is a single outcome, present only in a report; the blocking rule is §7.1, not a field | direction determines meaning, and a rule belongs in the format text, not in a free-form key |

A message that uses `DO` or `INVARIANTS` is rejected, like any other unknown block name
(§4.4). The sketch is history, not a second format. The version marker stays `A2A/0.1` because
the sketch was never a message anyone parsed against, and there is no consumer of it in this
repository.

## 11. Format decisions

| # | Decision | Reason |
|---|---|---|
| D1 | one format, two message forms, told apart by the header line | a second format would duplicate the grammar; direction already decides what `REPORT` means |
| D2 | closed field set; unknown fields rejected | the failure mode is silent misreading, and rejection is testable |
| D3 | `CONTEXT` is the only open-key block | surround information varies; it never binds |
| D4 | values are strings or lists of strings | a parser is then plain string handling, no schema library, no new dependency (I1) |
| D5 | fixed block order; duplicate block or key rejected | determinism, and a diff that is easy to review |
| D6 | required: header, `id`, `objective`, `ACCEPT`, `REPORT`; everything else optional | a task needs an outcome, a way to falsify it, and a reporting contract |
| D7 | `STEPS` is a plan, not a mandate; deviation is reported | a sensible route should not be a format error, but a silent route change hides risk |
| D8 | four statuses, exactly one per report | "done" with caveats is the ambiguity the format exists to remove |
| D9 | one accepted version; extension is a version bump; no ignore-unknown mode | silent ignoring is exactly what D2 rejects |
| D10 | plain text inside a Markdown fence; the fence is not part of the format (I6) | the document stays readable without any tooling |

## 12. Limitations

- No validator, schema or machine-readable grammar file ships with this repository; §9 is a
  procedure, not a tool (I1, I3).
- Free-text quality is not enforced: an objective can be vague and an acceptance entry can be
  unfalsifiable while the message is structurally valid. Only step 10 of §9 catches that, by
  reading.
- A report can be validated only against its assignment, because the `include` keys come from
  that assignment. A report alone is not fully checkable.
- The envelope has no time, author, revision or signature: it is not tamper-evident and it
  cannot prove who wrote it.
- The examples' tasks are illustrative; Example 2 is fictional and authorized by nothing here.
- The format was designed and checked by hand plus a throwaway parser. It has not been used
  for a real multi-agent exchange yet; field usage may show gaps at version 0.2.

## 13. Invariants of #22, and where they are kept

| Invariant | Where it is kept |
|---|---|
| I1 No new runtime dependencies | documentation only; the throwaway validator was not committed (§9.1) |
| I2 No changes to CORE-001 normative content | no file outside `docs/agents/` changed |
| I3 No changes to build behaviour, schemas, fixtures or M1 implementation | no existing file changed; this document is additive |
| I4 No compatibility claim unless tested | §2: local convention, no external claim, testing required before any claim |
| I5 Unknown fields rejected or explicitly allowed — one documented policy | §4.4: rejected, with `CONTEXT` as the single stated exception |
| I6 Readable as plain Markdown | §3, §4.3, §8: plain text in fenced blocks, decodable by eye; step 10 of §9 makes that a check |
