import { fetchWithTimeout } from '../../fetchWithTimeout'

export async function geocodeAddress(street: string, city: string, state: string, zip: string): Promise<{ lat: number; lng: number } | null> {
  const q = [street, city, state, zip].filter(Boolean).join(', ')
  if (!q) return null
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'FieldServiceApp/1.0' } }
    )
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    // Geocoding is best-effort; fail silently
  }
  return null
}
export interface AddressSuggestion {
  label: string
  street?: string
  city?: string
  state?: string
  zip?: string
  lat: number
  lng: number
}
/** Looks up real, deliverable addresses matching what's typed so far, for autocorrecting street entry. */
export async function searchAddress(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 4) return []
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`,
      { headers: { 'User-Agent': 'FieldServiceApp/1.0' } }
    )
    const data = await res.json()
    return data.map((d: Record<string, unknown>) => {
      const addr = (d.address ?? {}) as Record<string, string>
      return {
        label: d.display_name as string,
        street: [addr.house_number, addr.road].filter(Boolean).join(' ') || undefined,
        city: addr.city || addr.town || addr.village || addr.hamlet || undefined,
        state: addr.state || undefined,
        zip: addr.postcode || undefined,
        lat: parseFloat(d.lat as string),
        lng: parseFloat(d.lon as string),
      }
    })
  } catch {
    return []
  }
}
