import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, HelpiNUSServices } from './contracts'
import { isFirebaseConfigured } from './firebaseConfig'
import { firebaseServiceProxy } from './firebaseServiceProxy'
import { mockServices } from './mockServices'
import { ServiceContext } from './serviceContext'

const defaultServices: HelpiNUSServices = isFirebaseConfigured ? firebaseServiceProxy : mockServices

export function ServiceProvider({ children, servicesOverride }: { children: ReactNode; servicesOverride?: HelpiNUSServices }) {
  const currentServices = servicesOverride ?? defaultServices
  const [session, setSession] = useState<Session | null>(null)
  const [sessionServices, setSessionServices] = useState(currentServices)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const epoch = useRef(0)
  const servicesRef = useRef(currentServices)
  const publishedUid = useRef<string | null>(null)
  useEffect(() => {
    if (servicesRef.current === currentServices) return
    ++epoch.current
    servicesRef.current = currentServices
    queueMicrotask(() => {
      setSessionServices(currentServices)
      publishedUid.current = null
      setSession(null)
      setLoading(true)
      setError(null)
    })
  }, [currentServices])
  const refreshSession = useCallback(async () => {
    const requestEpoch = ++epoch.current
    setLoading(true)
    setError(null)
    try {
      const next = await currentServices.session.getCurrent()
      if (epoch.current === requestEpoch && servicesRef.current === currentServices) {
        setSessionServices(currentServices)
        publishedUid.current = next?.user?.id ?? null
        setSession(next)
      }
    } catch {
      if (epoch.current === requestEpoch && servicesRef.current === currentServices) setError('We could not load your account. Check your connection and try again.')
    } finally {
      if (epoch.current === requestEpoch && servicesRef.current === currentServices) setLoading(false)
    }
  }, [currentServices])
  useEffect(() => {
    let active = true
    const unsubscribe = currentServices.session.subscribe((value) => {
      if (!active) return
      const requestEpoch = ++epoch.current
      if (!value.user || value.user.status !== 'ACTIVE') {
        setSessionServices(currentServices)
        publishedUid.current = value.user?.id ?? null
        setSession(value)
        setError(null)
        setLoading(false)
        return
      }
      if (value.user.id !== publishedUid.current) {
        setSessionServices(currentServices)
        publishedUid.current = null
        setSession(null)
        setLoading(true)
      }
      void currentServices.session.getCurrent().then((fresh) => {
        if (active && epoch.current === requestEpoch && servicesRef.current === currentServices) { setSessionServices(currentServices); publishedUid.current = fresh?.user?.id ?? null; setSession(fresh); setError(null); setLoading(false) }
      }).catch(() => {
        if (active && epoch.current === requestEpoch && servicesRef.current === currentServices) { setSessionServices(currentServices); publishedUid.current = null; setSession(null); setError('We could not load your account. Check your connection and try again.'); setLoading(false) }
      })
    }, () => { if (active) { ++epoch.current; setSessionServices(currentServices); publishedUid.current = null; setSession(null); setError('We could not load your account. Check your connection and try again.'); setLoading(false) } })
    const currentEpoch = epoch
    return () => { active = false; ++currentEpoch.current; unsubscribe() }
  // Session publication is revalidated by getCurrent; callback payload is never eligible state.
  }, [currentServices])
  const sameServices = sessionServices === currentServices
  const value = useMemo(() => ({
    services: currentServices,
    session: sameServices ? session : null,
    loading: sameServices ? loading : true,
    error: sameServices ? error : null,
    refreshSession,
  }), [currentServices, sameServices, session, loading, error, refreshSession])
  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>
}
