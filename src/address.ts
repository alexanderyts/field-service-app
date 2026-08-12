/**
 * Address comparison, kept apart from the contact form so it can be tested directly.
 *
 * A contact's `lat`/`lng` is derived from its address, so the two only stay meaningful
 * together. The form clears the coordinate as soon as any address field is typed in — a
 * stale pin for a changed address is worse than no pin, since it sends someone to the wrong
 * door. But "typed in" is not the same as "changed": opening a contact, touching the street
 * field and undoing it, or retyping a value identically, all clear a perfectly valid
 * coordinate. This decides whether the address a save is about to write is genuinely the
 * same one the stored coordinate was derived from.
 */
export interface AddressParts {
  street?: string
  city?: string
  state?: string
  zip?: string
}

/** Case-insensitive, whitespace-tolerant; a missing field and an empty one are the same thing. */
function norm(v: string | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function sameAddress(a: AddressParts, b: AddressParts): boolean {
  return (
    norm(a.street) === norm(b.street) &&
    norm(a.city) === norm(b.city) &&
    norm(a.state) === norm(b.state) &&
    norm(a.zip) === norm(b.zip)
  )
}
