import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App.tsx'
import { useModel } from './store/modelStore'

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { threatMonster: useModel })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
