import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import { getTheme } from './settings'

// Applied before first paint so a non-light theme doesn't flash light on load. `getTheme`
// is total — it swallows a throwing localStorage (Safari "Block All Cookies", managed
// profiles) and an unrecognized stored value, and falls back to the legacy dark-mode
// boolean — so this can't throw before the app ever mounts. Light is the default and
// carries no attribute.
const theme = getTheme()
if (theme !== 'light') document.documentElement.dataset.theme = theme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
