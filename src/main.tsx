import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'

// Applied before first paint so a non-light theme doesn't flash light on load. Guarded
// because some browser configs (Safari "Block All Cookies", managed profiles) throw
// synchronously on localStorage access — unguarded, that would throw before the app
// ever mounts. The old dark-mode boolean key is read as a fallback so devices that
// enabled dark mode before the theme picker existed keep it without re-choosing.
try {
  let theme = localStorage.getItem('fieldservice_theme')
  if (!theme && localStorage.getItem('fieldservice_dark_mode') === 'yes') theme = 'dark'
  if (theme === 'dark' || theme === 'pastel' || theme === 'mark') {
    document.documentElement.dataset.theme = theme
  }
} catch { /* localStorage unavailable — default (light) theme */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
