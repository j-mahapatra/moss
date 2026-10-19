// First: configures zod before any module parses with it.
import './zod-config'
import '@fontsource-variable/instrument-sans/wght.css'
import '@fontsource-variable/spline-sans-mono/wght.css'
import './ui/tokens.css'
import './ui/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme } from './ui/theme'

applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
