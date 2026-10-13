import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { firebaseEnvironment, getFirebaseConfig, isEmulatorConnectionAllowed } from './firebaseConfig'

const firebaseConfig = getFirebaseConfig()
const firebaseApp = firebaseConfig
  ? getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
  : null

export const firebase = firebaseApp
  ? {
      auth: getAuth(firebaseApp),
      firestore: getFirestore(firebaseApp),
      functions: getFunctions(firebaseApp, 'asia-southeast1'),
    }
  : null

const emulatorAllowed = Boolean(
  firebase &&
    isEmulatorConnectionAllowed({
      isDevelopment: firebaseEnvironment === 'development',
      isDevBuild: import.meta.env.DEV,
      enabled: import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true',
      hostname: window.location.hostname,
    }),
)

if (firebase && emulatorAllowed) {
  connectAuthEmulator(firebase.auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firebase.firestore, '127.0.0.1', 8080)
  connectFunctionsEmulator(firebase.functions, '127.0.0.1', 5001)
}
