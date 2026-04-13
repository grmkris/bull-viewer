#!/usr/bin/env bun
/**
 * Bundle size guard. Reads dist/lib/*.js, gzips each, fails if any exceeds
 * its budget. Run via `bun --filter @bull-viewer/ui bundle-guard` after a
 * build.
 *
 * Budgets per the M6 plan:
 *   embed-XXX.js          ≤ 220 KB gz   (base bundle, always loaded)
 *   JsonViewer-XXX.js     ≤ 200 KB gz   (lazy, M4 — original 170 was too tight)
 *   FlowGraph-XXX.js      ≤ 110 KB gz   (lazy, M5)
 *   QueueOverview-XXX.js  ≤  60 KB gz   (lazy, M3)
 */
import { gzipSync } from "node:zlib"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

interface Budget {
  pattern: RegExp
  label: string
  maxKB: number
}

const BUDGETS: Budget[] = [
  { pattern: /^embed-.*\.js$/, label: "base", maxKB: 220 },
  { pattern: /^JsonViewer-.*\.js$/, label: "JsonViewer (CodeMirror)", maxKB: 200 },
  { pattern: /^FlowGraph-.*\.js$/, label: "FlowGraph (React Flow)", maxKB: 110 },
  { pattern: /^QueueOverview-.*\.js$/, label: "QueueOverview (uPlot)", maxKB: 60 },
]

const DIST = join(import.meta.dir ?? ".", "..", "dist", "lib")

const files = readdirSync(DIST).filter((f) => f.endsWith(".js"))
let failed = false

for (const budget of BUDGETS) {
  const file = files.find((f) => budget.pattern.test(f))
  if (!file) {
    console.error(`✗ ${budget.label}: no matching file in dist/lib (looking for ${budget.pattern})`)
    failed = true
    continue
  }
  const path = join(DIST, file)
  const raw = readFileSync(path)
  const gz = gzipSync(raw).byteLength
  const kb = gz / 1024
  const status = kb <= budget.maxKB ? "✓" : "✗"
  const line = `${status} ${budget.label.padEnd(28)} ${file.padEnd(36)} ${kb.toFixed(1).padStart(6)} KB gz  (≤${budget.maxKB})`
  if (kb > budget.maxKB) {
    failed = true
    console.error(line)
  } else {
    console.log(line)
  }
}

if (failed) {
  console.error("\nbundle guard FAILED")
  process.exit(1)
}
console.log("\nbundle guard ok")
