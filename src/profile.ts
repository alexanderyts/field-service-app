// The user's own name — used only for on-device personalization and (later) optional
// sharing features. Stored as plain fieldservice_* localStorage keys, same convention as
// theme/credit-hours/tutorial-seen, so it needs no Dexie migration and rides along
// automatically with backup.ts exports/imports (its SETTINGS_BLOCKLIST is opt-out).
const FIRST_NAME_KEY = 'fieldservice_first_name'
const LAST_NAME_KEY = 'fieldservice_last_name'
const PROMPTED_KEY = 'fieldservice_profile_prompted'

export function getProfileName(): { firstName: string; lastName: string } {
  try {
    return {
      firstName: localStorage.getItem(FIRST_NAME_KEY) ?? '',
      lastName: localStorage.getItem(LAST_NAME_KEY) ?? '',
    }
  } catch {
    return { firstName: '', lastName: '' }
  }
}

export function saveProfileName(firstName: string, lastName: string) {
  try {
    localStorage.setItem(FIRST_NAME_KEY, firstName.trim())
    localStorage.setItem(LAST_NAME_KEY, lastName.trim())
  } catch { /* localStorage unavailable — nothing to persist to */ }
}

export function hasSeenProfilePrompt(): boolean {
  try { return localStorage.getItem(PROMPTED_KEY) === 'yes' } catch { return false }
}

export function markProfilePromptSeen() {
  try { localStorage.setItem(PROMPTED_KEY, 'yes') } catch {}
}
