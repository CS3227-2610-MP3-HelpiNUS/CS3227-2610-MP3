import type { FirebaseOptions } from 'firebase/app'

export const firebaseEnvironment = import.meta.env.VITE_FIREBASE_ENV === 'production' ? 'production' : 'development'

export function getFirebaseConfig(): FirebaseOptions | null {
  const prefix = firebaseEnvironment === 'production' ? 'VITE_FIREBASE_PROD' : 'VITE_FIREBASE_DEV'
  const values: FirebaseOptions = {
    apiKey: import.meta.env[`${prefix}_API_KEY`],
    authDomain: import.meta.env[`${prefix}_AUTH_DOMAIN`],
    projectId: import.meta.env[`${prefix}_PROJECT_ID`],
    appId: import.meta.env[`${prefix}_APP_ID`],
    messagingSenderId: import.meta.env[`${prefix}_MESSAGING_SENDER_ID`],
  }
  if (!values.apiKey || !values.authDomain || !values.projectId || !values.appId) return null
  if (firebaseEnvironment === 'development' && values.projectId !== 'helpinus-dev') {
    throw new Error('Development Firebase must use project helpinus-dev.')
  }
  if (firebaseEnvironment === 'production' && values.projectId !== 'helpinus-prod') {
    throw new Error('Production Firebase must use project helpinus-prod.')
  }
  return values
}

export const isFirebaseConfigured = Boolean(getFirebaseConfig())

export function isEmulatorConnectionAllowed({
  isDevelopment,
  isDevBuild,
  enabled,
  hostname,
}: {
  isDevelopment: boolean
  isDevBuild: boolean
  enabled: boolean
  hostname: string
}): boolean {
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
  return isDevelopment && isDevBuild && enabled && loopback
}
