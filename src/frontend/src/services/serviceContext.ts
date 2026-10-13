import { createContext } from 'react'
import type { Session, HelpiNUSServices } from './contracts'

export interface ServiceContextValue {
  services: HelpiNUSServices
  session: Session | null
  loading: boolean
  error: string | null
  refreshSession: () => Promise<void>
}

export const ServiceContext = createContext<ServiceContextValue | null>(null)
