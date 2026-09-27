#!/usr/bin/env node
// =============================================================================
// Slice a Markdown document with `#### Phase N` headers into per-phase files.
//
// Assumes a PHASES.md produced by /kelo:code-phases with structure:
//   ## 1. 개요
//   ## 2. 기술 스택
//   ## 3. 아키텍처 요약
//   ## 4. 적용 컨벤션 요약
//   ## 5. Phase 목록
//   ## 6. Phase 상세
//     #### Phase 0
//     #### Phase 0.5   (decimal numbers supported for insertions)
//     ...
//   ## 7. 의존 관계 그래프
//   ## 8. 재정렬/수정 이력
//   ## 9. 리스크
//
// Full slices contain:
//   - Common header (everything before the first `#### Phase N`)
//   - The Phase N section (until the next `#### Phase` or any `## ` heading)
//   - Common footer (any sections after the last Phase)
//
// Compact slices contain:
//   - Minimal common context (sections 1~4)
//   - Current Phase row from section 5
//   - The Phase N section under `## Phase 상세`
//   - Related risks row from section 9 (if present)
//
// Slice metadata:
//   <!-- sliced from <input> @ sha <12-char SHA-1> at <ISO 8601 UTC> -->
//   <!-- phase-id: Phase N -->
//   <!-- slice-mode: compact -->  # compact mode only
//
// The harness uses the embedded SHA to detect stale slices.
// =============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const HELP = `Usage: slice-phases.mjs --mode full|compact <input-md> <output-dir>

Splits a Markdown document with \`#### Phase N\` headers into per-phase slices.

Arguments:
  <input-md>     Source Markdown (e.g., code-harness/PHASES.md)
  <output-dir>   Output directory for slices (e.g., code-harness/phases/)

Options:
  --mode full     Full header + phase + footer
  --mode compact  Execution-oriented compact slice

Examples:
  ./scripts/slice-phases.mjs --mode compact code-harness/PHASES.md code-harness/phases/
  ./scripts/slice-phases.mjs --mode full    code-harness/PHASES.md code-harness/phases/

Output filenames:
  Phase IDs sanitized: "Phase 1" -> "Phase-1.md", "Phase 0.5" -> "Phase-0.5.md"

Stale slices (Phase IDs no longer present in <input-md>) are removed.
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const rest = argv.slice(2);
  let mode = "";

  if (rest[0] === "--mode") {
    if (rest.length !== 4) usage();
    mode = rest[1];
    rest.splice(0, 2);
  } else if (rest[0] === "--full") {
    mode = "full";
    rest.shift();
  } else if (rest[0] === "--compact") {
    mode = "compact";
    rest.shift();
  }

  if (rest.length !== 2) usage();
  const [input, outputDir] = rest;

  if (mode !== "full" && mode !== "compact") {
    process.stderr.write(`Error: invalid mode: ${mode}\n`);
    usage();
  }

  return { mode, input, outputDir };
}

// Split input into awk-compatible records. `a\nb\n` yields ["a", "b"].
function readLines(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function sha1Prefix(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);
}

function utcNowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

const PHASE_HEADER_RE = /^#### Phase [0-9]+(\.[0-9]+)?/;
const H2_RE = /^## /;
const H1_RE = /^# /;
const PHASE_ID_RE = /Phase [0-9]+(\.[0-9]+)?/;

// Walk the Markdown lines and build the same buffers the awk script builds.
function sliceBuffers(lines) {
  let state = "header";
  let preambleBuf = "";
  let headerBuf = "";
  let footerBuf = "";
  let currentH2 = "";
  let currentH2Buf = "";
  const headerSections = {};
  const headerOrder = [];
  let footerH2 = "";
  let footerH2Buf = "";
  const footerSections = {};
  const footerOrder = [];
  let currentPhase = "";
  let currentBuf = "";
  const phases = {};
  const phaseOrder = [];

  const storeHeaderSection = () => {
    if (currentH2 !== "") {
      headerSections[currentH2] = currentH2Buf;
      headerOrder.push(currentH2);
      currentH2 = "";
      currentH2Buf = "";
    }
  };
  const storeFooterSection = () => {
    if (footerH2 !== "") {
      footerSections[footerH2] = footerH2Buf;
      footerOrder.push(footerH2);
      footerH2 = "";
      footerH2Buf = "";
    }
  };

  for (const line of lines) {
    // Rule 1: Phase header (runs in any state).
    if (PHASE_HEADER_RE.test(line)) {
      if (state === "header") {
        storeHeaderSection();
      }
      const m = line.match(PHASE_ID_RE);
      const phaseId = m[0];

      if (state === "phase" && currentPhase !== "") {
        phases[currentPhase] = currentBuf;
        phaseOrder.push(currentPhase);
      }

      state = "phase";
      currentPhase = phaseId;
      currentBuf = line + "\n";
      continue;
    }

    // Rule 2: h2 while in phase -> close phase, open footer.
    if (state === "phase" && H2_RE.test(line)) {
      if (currentPhase !== "") {
        phases[currentPhase] = currentBuf;
        phaseOrder.push(currentPhase);
        currentPhase = "";
      }
      state = "footer";
      footerH2 = line;
      footerBuf += line + "\n";
      footerH2Buf = line + "\n";
      continue;
    }

    // Rule 3: header fallback.
    if (state === "header") {
      headerBuf += line + "\n";
      if (H2_RE.test(line)) {
        storeHeaderSection();
        currentH2 = line;
        currentH2Buf = line + "\n";
      } else if (currentH2 !== "") {
        currentH2Buf += line + "\n";
      } else {
        preambleBuf += line + "\n";
      }
      continue;
    }

    // Rule 4: phase body.
    if (state === "phase") {
      currentBuf += line + "\n";
      continue;
    }

    // Rule 5: footer body.
    if (state === "footer") {
      footerBuf += line + "\n";
      if (H2_RE.test(line)) {
        storeFooterSection();
        footerH2 = line;
        footerH2Buf = line + "\n";
      } else if (footerH2 !== "") {
        footerH2Buf += line + "\n";
      }
      continue;
    }
  }

  // END block.
  if (state === "header") {
    storeHeaderSection();
  } else if (state === "footer") {
    storeFooterSection();
  }
  if (state === "phase" && currentPhase !== "") {
    phases[currentPhase] = currentBuf;
    phaseOrder.push(currentPhase);
  }

  return {
    preambleBuf,
    headerBuf,
    footerBuf,
    headerSections,
    headerOrder,
    footerSections,
    footerOrder,
    phases,
    phaseOrder,
  };
}

function sectionWithPrefix(sections, order, prefix) {
  for (const key of order) {
    if (key.startsWith(prefix)) return sections[key];
  }
  return "";
}

function h1FromPreamble(buf) {
  for (const line of buf.split("\n")) {
    if (H1_RE.test(line)) return line;
  }
  return "# Phase Slice";
}

function phaseTableRow(section, pid) {
  if (section === "") return "";
  let out = "## 현재 Phase 위치\n\n";
  for (const line of section.split("\n")) {
    if (/^\| # \|/.test(line) || /^\|---/.test(line)) {
      out += line + "\n";
    } else if (/^\|/.test(line) && line.includes(pid)) {
      out += line + "\n";
    }
  }
  out += "\n";
  return out;
}

function relatedRisks(section, pid) {
  if (section === "") return "";
  let out = "## 관련 리스크\n\n";
  let added = false;
  for (const line of section.split("\n")) {
    if (
      /^\| ID \|/.test(line) ||
      /^\| # \|/.test(line) ||
      /^\|---/.test(line)
    ) {
      out += line + "\n";
    } else if (/^\|/.test(line) && line.includes(pid)) {
      out += line + "\n";
      added = true;
    }
  }
  if (!added) return "";
  return out + "\n";
}

function maybeSection(buffers, prefix) {
  const s = sectionWithPrefix(
    buffers.headerSections,
    buffers.headerOrder,
    prefix,
  );
  if (s !== "") return s + "\n";
  return "";
}

function writeFull(outPath, pid, meta, buffers) {
  let out = "";
  out += `<!-- sliced from ${meta.input} @ sha ${meta.sha} at ${meta.ts} -->\n`;
  out += `<!-- phase-id: ${pid} -->\n\n`;
  if (buffers.headerBuf !== "") {
    out += buffers.headerBuf + "\n";
  }
  out += buffers.phases[pid];
  if (buffers.footerBuf !== "") {
    out += "\n" + buffers.footerBuf;
  }
  fs.writeFileSync(outPath, out);
}

function writeCompact(outPath, pid, meta, buffers) {
  const overview = maybeSection(buffers, "## 1.");
  const tech = maybeSection(buffers, "## 2.");
  const arch = maybeSection(buffers, "## 3.");
  const conv = maybeSection(buffers, "## 4.");
  const phaseList = phaseTableRow(
    sectionWithPrefix(buffers.headerSections, buffers.headerOrder, "## 5."),
    pid,
  );
  const risks = relatedRisks(
    sectionWithPrefix(buffers.footerSections, buffers.footerOrder, "## 9."),
    pid,
  );

  let out = "";
  out += `<!-- sliced from ${meta.input} @ sha ${meta.sha} at ${meta.ts} -->\n`;
  out += `<!-- phase-id: ${pid} -->\n`;
  out += `<!-- slice-mode: compact -->\n\n`;
  out += `${h1FromPreamble(buffers.preambleBuf)}\n\n`;
  out += overview;
  out += tech;
  out += arch;
  out += conv;
  out += phaseList;
  out += `## Phase 상세\n\n`;
  out += buffers.phases[pid];
  if (risks !== "") {
    out += "\n" + risks;
  }
  fs.writeFileSync(outPath, out);
}

function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(args.input)) {
    process.stderr.write(`Error: input file not found: ${args.input}\n`);
    process.exit(1);
  }

  fs.mkdirSync(args.outputDir, { recursive: true });

  const meta = {
    input: args.input,
    sha: sha1Prefix(args.input),
    ts: utcNowIso(),
  };

  const lines = readLines(args.input);
  const buffers = sliceBuffers(lines);

  if (buffers.phaseOrder.length === 0) {
    process.stderr.write(
      `ERROR: no \`#### Phase N\` headers found in ${args.input}\n`,
    );
    process.exit(1);
  }

  const emittedBasenames = new Set();
  for (const pid of buffers.phaseOrder) {
    const fname = pid.replaceAll(" ", "-");
    const outPath = path.join(args.outputDir, `${fname}.md`);
    if (args.mode === "compact") {
      writeCompact(outPath, pid, meta, buffers);
    } else {
      writeFull(outPath, pid, meta, buffers);
    }
    emittedBasenames.add(`${fname}.md`);
  }

  process.stdout.write(
    `Slicing complete: ${args.input} -> ${args.outputDir}/\n`,
  );
  process.stdout.write(`  Mode:          ${args.mode}\n`);

  // Remove stale slices.
  let removed = 0;
  for (const entry of fs.readdirSync(args.outputDir)) {
    if (!/^Phase-.*\.md$/.test(entry)) continue;
    if (!emittedBasenames.has(entry)) {
      fs.unlinkSync(path.join(args.outputDir, entry));
      process.stdout.write(`  - removed stale: ${entry}\n`);
      removed++;
    }
  }

  process.stdout.write(`  Total slices: ${emittedBasenames.size}\n`);
  if (removed > 0) {
    process.stdout.write(`  Removed stale: ${removed}\n`);
  }
  process.stdout.write(`  Source SHA:   ${meta.sha}\n`);
}

main();
