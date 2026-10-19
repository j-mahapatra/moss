// First: configures zod before any module parses with it.
import './zod-config'
import '@fontsource-variable/instrument-sans/wght.css'
import '@fontsource-variable/spline-sans-mono/wght.css'
import './ui/tokens.css'
import './ui/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createWorkspaceStore } from './state/workspace'
import { applyTheme } from './ui/theme'

const store = createWorkspaceStore(window.api)
// The store's default 'system' applies until settings load, so system users see no flash.
const theme = applyTheme(() => store.getState().theme)
let lastTheme = store.getState().theme
store.subscribe((s) => {
  if (s.theme === lastTheme) return
  lastTheme = s.theme
  theme.refresh()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>
)
