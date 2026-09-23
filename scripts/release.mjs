#!/usr/bin/env node
// Cut a version in one step:  npm run release -- <patch|minor|major> "Title"   (add --dry-run to preview)
//
// 1. Refuses unless the working tree is clean and CHANGELOG "## Unreleased" has entries.
// 2. Bumps package.json + package-lock.json (`npm version --no-git-tag-version`) and APP_VERSION.
// 3. Turns "## Unreleased" into "## X.Y.Z — Title · YYYY-MM-DD" and opens a fresh Unreleased.
// 4. Runs scripts/verify.mjs and writes .git/RELEASE_MSG for `git commit -F .git/RELEASE_MSG`.
//
// It never commits and never pushes: a push to master deploys the app.
import { execSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const [bump, ...titleParts] = args.filter((a) => a !== '--dry-run')
const title = titleParts.join(' ').trim()
const die = (msg) => { console.error(`release: ${msg}`); process.exit(1) }

if (!['patch', 'minor', 'major'].includes(bump) || !title) {
  die('usage: npm run release -- <patch|minor|major> "Title" [--dry-run]')
}

const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
if (dirty && !dry) die(`working tree is not clean — commit first:\n${dirty}`)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const m = changelog.match(/^## Unreleased\n([\s\S]*?)(?=^## )/m)
if (!m) die('CHANGELOG.md has no "## Unreleased" section above the last release')
const notes = m[1].trim()
if (!notes) die('"## Unreleased" is empty — add the bullets for this release first')

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const [maj, min, pat] = pkg.version.split('.').map(Number)
const next = bump === 'major' ? `${maj + 1}.0.0` : bump === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`
const d = new Date()
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const heading = `## ${next} — ${title} · ${date}`

if (dry) {
  console.log(`would release ${pkg.version} → ${next}\n${heading}\n${notes}`)
  process.exit(0)
}

execSync(`npm version ${bump} --no-git-tag-version`, { stdio: 'ignore' })

const versionTs = readFileSync('src/version.ts', 'utf8')
if (!/APP_VERSION = '[^']*'/.test(versionTs)) die('APP_VERSION not found in src/version.ts')
writeFileSync('src/version.ts', versionTs.replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${next}'`))

writeFileSync(
  'CHANGELOG.md',
  changelog
    .replace(/^## Unreleased\n/m, `## Unreleased\n\n${heading}\n`)
    .replace(/\*\*Current version: `[^`]*`\.\*\*/, `**Current version: \`${next}\`.**`)
)

const verify = spawnSync(process.execPath, ['scripts/verify.mjs'], { encoding: 'utf8' })
const verifyLine = (verify.stdout ?? '').trim().split('\n').pop()
console.log(verifyLine)
if (verify.status !== 0) die('verify failed — files are bumped but not committed; fix, re-run verify, then commit')

writeFileSync('.git/RELEASE_MSG', `${next} — ${title}\n\n${notes}\n\n${verifyLine}\n`)
console.log(`\nReleased ${next} locally. Next:\n  git add -A && git commit -F .git/RELEASE_MSG\n(push only when you mean to deploy)`)
