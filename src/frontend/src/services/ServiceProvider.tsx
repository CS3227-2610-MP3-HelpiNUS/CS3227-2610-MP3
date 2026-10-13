import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, HelpiNUSServices } from './contracts'
import { isFirebaseConfigured } from './firebaseConfig'
import { firebaseServiceProxy } from './firebaseServiceProxy'
import { mockServices } from './mockServices'
import { ServiceContext } from './serviceContext'

const defaultServices: HelpiNUSServices = isFirebaseConfigured ? firebaseServiceProxy : mockServices

export function ServiceProvider({ children, servicesOverride }: { children: ReactNode; servicesOverride?: HelpiNUSServices }) {
  const currentServices = servicesOverride ?? defaultServices
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshSession = useCallback(async () => {
    setLoading(true)
    setError(null)
    try { setSession(await currentServices.session.getCurrent()) }
    catch { setError('We could not load your account. Check your connection and try again.') }
    finally { setLoading(false) }
  }, [currentServices])
  useEffect(() => {
    let active = true
    const unsubscribe = currentServices.session.subscribe((value) => {
      if (active) { setSession(value); setError(null); setLoading(false) }
    }, () => { if (active) { setError('We could not load your account. Check your connection and try again.'); setLoading(false) } })
    return () => { active = false; unsubscribe() }
  }, [currentServices])
  const value = useMemo(() => ({ services: currentServices, session, loading, error, refreshSession }), [currentServices, session, loading, error, refreshSession])
  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>
}
