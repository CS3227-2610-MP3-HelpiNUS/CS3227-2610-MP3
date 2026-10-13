import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

export function ErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) ? error.statusText : 'The page could not be loaded.'
  return <main className="error-screen"><span className="error-code">Something went wrong</span><h1>We couldn’t open this page</h1><p>{message}</p><a className="button button-primary" href="/student/dashboard">Go to dashboard</a></main>
}
