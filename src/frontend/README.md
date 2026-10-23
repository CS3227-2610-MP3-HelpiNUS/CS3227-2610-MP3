# HelpiNUS frontend

React, TypeScript, Vite, Tailwind CSS, React Router, and Firebase Web SDK client
foundation. React components use the adapter boundary in `src/services`; local
mock adapters keep route and dashboard work independent of backend integration.

## Run locally

Use Node.js 22 (see the repository `.nvmrc`). From the repository root:

```sh
npm install
npm run dev -w src/frontend
```

With no Firebase configuration, the app uses the sample Student workspace.
Copy `.env.example` to `.env.local` to configure a Firebase web app. Values
prefixed with `VITE_` are public browser configuration and must not contain
service-account credentials or other secrets. Use the `VITE_FIREBASE_DEV_*`
values for `helpinus-dev` and `VITE_FIREBASE_PROD_*` for `helpinus-prod`.
Choose the active project with `VITE_FIREBASE_ENV`. Emulator connections require
`VITE_USE_FIREBASE_EMULATORS=true`, a development build, and a loopback browser
host; emulator ports are Auth `9099`, Firestore `8080`, and Functions `5001`.

## Frontend checks

```sh
npm run lint -w src/frontend
npm run typecheck -w src/frontend
npm run test -w src/frontend
npm run build -w src/frontend
```

Dashboard and route scaffolds intentionally use sample data until the auth,
Firestore query, and callable adapters are integrated. AI routes do not send
prompts or call a model in this sprint.
