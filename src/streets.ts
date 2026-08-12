import { db, uniqueStreetName } from './db'

// Street identity, kept out of the component that happens to render streets. These are the
// operations that decide when two traces are the same road and when they're different ones —
// the rule the Streets list, the territory flows, and the share importer all have to agree on.
// Living inside StreetEntries.tsx meant share.ts couldn't import `ensureStreetEntry` and
// re-implemented it inline instead, with a different result.

/**
 * The id of the StreetEntry backing a territory street, creating one if this street isn't
 * linked to one yet. This is what makes a street managed identically whether it's standalone
 * or inside a territory — the group/import/manage flows all funnel through here so a street
 * always has a real StreetEntry behind it.
 *
 * Reuse is by the explicit `entryId` link only, never by name: two traces of the same road are
 * deliberately kept as separate entries, with the second getting a "(2)"/"(3)" suffix so they
 * can be told apart (AUDIT F002). `extra` optionally seeds city/state/zip.
 */
export async function ensureStreetEntry(
  street: { entryId?: number; name: string; points?: { lat: number; lng: number }[]; assignedTo?: string },
  extra?: { city?: string; state?: string; zip?: string }
): Promise<number> {
  const entries = await db.streetEntries.toArray()
  if (street.entryId != null) {
    const linked = entries.find((e) => e.id === street.entryId)
    if (linked) return linked.id
  }
  return (await db.streetEntries.add({
    name: uniqueStreetName(street.name, entries.map((e) => e.name)),
    city: extra?.city,
    state: extra?.state,
    zip: extra?.zip,
    houses: [],
    points: street.points,
    assignedTo: street.assignedTo,
    createdAt: Date.now(),
  })) as number
}

/**
 * Best-effort lookup of a traced street matching a Ministry-tab entry, across every territory
 * — used to offer "Jump to Map" for streets that have a real trace. Returns the midpoint of
 * its points.
 *
 * Matches by name because legacy entries predate the `entryId` link; that fallback is the
 * known false-positive behind AUDIT F003.
 */
export async function findStreetTraceMidpoint(streetName: string): Promise<{ lat: number; lng: number } | null> {
  const target = streetName.trim().toLowerCase()
  const territories = await db.territories.toArray()
  for (const t of territories) {
    const match = t.streets.find((s) => s.name.trim().toLowerCase() === target)
    if (match && match.points.length > 0) {
      const mid = match.points[Math.floor(match.points.length / 2)]
      return { lat: mid.lat, lng: mid.lng }
    }
  }
  return null
}
