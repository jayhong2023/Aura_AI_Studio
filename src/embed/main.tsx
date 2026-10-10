import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { EmbedApp } from './EmbedApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EmbedApp />
  </StrictMode>,
)
