import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { dataLayer } from './infrastructure/db/repositories'
import { BackupService } from './services/backupService'

void new BackupService(dataLayer).ensureDailySnapshot().catch((error) => {
  console.error('自动快照创建失败', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
