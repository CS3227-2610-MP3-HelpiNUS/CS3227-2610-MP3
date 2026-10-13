/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly VITE_FIREBASE_ENV?: 'development' | 'production'
  readonly VITE_USE_FIREBASE_EMULATORS?: string
  readonly VITE_FIREBASE_DEV_API_KEY?: string
  readonly VITE_FIREBASE_DEV_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_DEV_PROJECT_ID?: string
  readonly VITE_FIREBASE_DEV_APP_ID?: string
  readonly VITE_FIREBASE_DEV_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_PROD_API_KEY?: string
  readonly VITE_FIREBASE_PROD_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROD_PROJECT_ID?: string
  readonly VITE_FIREBASE_PROD_APP_ID?: string
  readonly VITE_FIREBASE_PROD_MESSAGING_SENDER_ID?: string
  readonly [key: string]: string | boolean | undefined
}

interface ImportMeta { readonly env: ImportMetaEnv }
