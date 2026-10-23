import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ServiceProvider } from './services/ServiceProvider'
import { appRoutes } from './routes/appRoutes'

const router = createBrowserRouter(appRoutes)

export default function App() {
  return <ServiceProvider><RouterProvider router={router} /></ServiceProvider>
}
