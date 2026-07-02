import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'

// Applied before first paint so dark mode doesn't flash light on load. Guarded because
// some browser configs (Safari "Block All Cookies", managed profiles) throw synchronously
// on localStorage access — unguarded, that would throw before the app ever mounts.
try {
  if (localStorage.getItem('fieldservice_dark_mode') === 'yes') {
    document.documentElement.dataset.theme = 'dark'
  }
} catch { /* localStorage unavailable — default (light) theme */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
