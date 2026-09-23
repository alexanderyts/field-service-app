import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { APP_VERSION } from './version'

// The version shown in More and stamped into backups must match package.json — they drifted
// by hand before `scripts/release.mjs` existed (package-lock.json sat at 0.19.0 for months).
describe('APP_VERSION', () => {
  it('matches package.json and package-lock.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
    expect(APP_VERSION).toBe(pkg.version)
    expect(lock.version).toBe(pkg.version)
  })
})
