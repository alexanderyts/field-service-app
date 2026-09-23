#!/usr/bin/env node
// One gate for humans, AI sessions, and CI: typecheck, lint, tests, build, then two checks on
// the built output. Every step is judged by its EXIT CODE only, never by parsing text — a shell
// hook in AI sessions rewrites `npm run lint`/`grep`/`cat` and has produced false failures
// (docs/review-2026-09-23.md, W1). Run as `node scripts/verify.mjs` (or `npm run verify`).
//
// Prints one line at the end: `VERIFY PASS …` or `VERIFY FAIL at <step>`. On failure the last
// 30 lines of that step's output are printed above it.
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAIN_CHUNK_BUDGET = 320 * 1024 // bytes; the eager chunk was cut from 452 kB to ~283 kB in 0.25.1
const bin = (name) => join('node_modules', '.bin', name)
const started = Date.now()
const summary = []

function run(label, cmd, args) {
  const t = Date.now()
  // One command string (not an args array) — `shell: true` is needed for the Windows .cmd
  // shims in node_modules/.bin, and Node deprecates combining it with an args array.
  const r = spawnSync([bin(cmd), ...args].join(' '), { shell: true, encoding: 'utf8', env: process.env })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) {
    console.log(out.split('\n').slice(-30).join('\n'))
    console.log(`VERIFY FAIL at ${label} (exit ${r.status ?? r.signal})`)
    process.exit(1)
  }
  summary.push(`${label}✓`)
  return { out, ms: Date.now() - t }
}

function fail(label, why) {
  console.log(why)
  console.log(`VERIFY FAIL at ${label}`)
  process.exit(1)
}

run('tsc', 'tsc', ['-b'])

// oxlint exits non-zero only on errors; warnings are counted for visibility. Off a terminal it
// prints one `file:line:col: warning …` line each and no summary, so count those lines.
const lint = run('lint', 'oxlint', ['src'])
summary[summary.length - 1] = `lint✓(${(lint.out.match(/: warning /g) ?? []).length}w)`

const tests = run('tests', 'vitest', ['run'])
const n = tests.out.match(/Tests\s+(\d+)\s+passed/)
summary[summary.length - 1] = `tests✓(${n ? n[1] : '?'})`

run('build', 'vite', ['build'])

// Bundle budget: the eager main chunk only. Lazy chunks (pdf-lib, Leaflet) are allowed to be big.
const assets = join('dist', 'assets')
const main = readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f))
if (main.length === 0) fail('bundle', 'No dist/assets/index-*.js found after build.')
for (const f of main) {
  const size = statSync(join(assets, f)).size
  if (size > MAIN_CHUNK_BUDGET) {
    fail('bundle', `${f} is ${(size / 1024).toFixed(0)} kB, over the ${MAIN_CHUNK_BUDGET / 1024} kB budget.`)
  }
  summary.push(`bundle✓(${(size / 1024).toFixed(0)}kB)`)
}

// CSP on the built page: present, and no inline <script> it would silently block (the sister
// project once shipped exactly that and passed every test).
const html = readFileSync(join('dist', 'index.html'), 'utf8')
if (!/http-equiv="Content-Security-Policy"/i.test(html)) fail('csp', 'dist/index.html has no Content-Security-Policy meta tag.')
const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>/gi)
if (inline) fail('csp', `dist/index.html has inline script(s) the CSP will block: ${inline.join(' ')}`)
summary.push('csp✓')

console.log(`VERIFY PASS ${summary.join(' ')} (${Math.round((Date.now() - started) / 1000)}s)`)
