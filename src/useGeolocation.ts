import { useState } from 'react'

export function useCurrentLocation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function getLocation(): Promise<{ lat: number; lng: number } | null> {
    setLoading(true)
    setError(null)
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setError('Geolocation not supported on this device')
        setLoading(false)
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoading(false)
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        },
        (err) => {
          // Friendly, actionable copy instead of the raw browser string (AUDIT F045).
          setError(
            err.code === err.PERMISSION_DENIED
              ? "Location is turned off for Meleo. You can turn it on in your browser's site settings."
              : err.code === err.POSITION_UNAVAILABLE
                ? "Couldn't find your location — try again outdoors."
                : err.code === err.TIMEOUT
                  ? 'Finding your location is taking too long — try again.'
                  : "Couldn't get your location."
          )
          setLoading(false)
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  return { getLocation, loading, error }
}
