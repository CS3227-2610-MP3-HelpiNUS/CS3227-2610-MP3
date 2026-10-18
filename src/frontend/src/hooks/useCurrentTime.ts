import { useEffect, useState } from 'react'

export function useCurrentTime(refreshMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), refreshMs)
    return () => window.clearInterval(interval)
  }, [refreshMs])

  return now
}
