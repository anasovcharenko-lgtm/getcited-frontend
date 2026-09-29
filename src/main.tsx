import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import RuPage from './RuPage.tsx'
import Legal from './Legal.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/ru" element={<RuPage />} />

        <Route path="/legal/:slug" element={<Legal lang="en" />} />
        <Route path="/ru/legal/:slug" element={<Legal lang="ru" />} />

        {/* Short URLs, because these are the ones people type and link to */}
        <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/cookies" element={<Navigate to="/legal/cookies" replace />} />
        <Route path="/ru/privacy" element={<Navigate to="/ru/legal/privacy" replace />} />
        <Route path="/ru/terms" element={<Navigate to="/ru/legal/terms" replace />} />
        <Route path="/ru/cookies" element={<Navigate to="/ru/legal/cookies" replace />} />
        <Route path="/ru/consent" element={<Navigate to="/ru/legal/consent" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
