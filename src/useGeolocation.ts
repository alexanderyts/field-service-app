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
          setError(err.message)
          setLoading(false)
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  return { getLocation, loading, error }
}
