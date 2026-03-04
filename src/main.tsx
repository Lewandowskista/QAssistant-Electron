import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'

import MainLayout from '@/layouts/MainLayout'
import DashboardPage from '@/pages/DashboardPage'
import TasksPage from '@/pages/TasksPage'
import SettingsPage from '@/pages/SettingsPage'
import LinksPage from '@/pages/LinksPage'
import NotesPage from '@/pages/NotesPage'
import TestsPage from '@/pages/TestsPage'
import FilesPage from '@/pages/FilesPage'
import EnvironmentsPage from '@/pages/EnvironmentsPage'
import TestDataPage from '@/pages/TestDataPage'
import ChecklistsPage from '@/pages/ChecklistsPage'
import ApiPage from '@/pages/ApiPage'
import SapPage from '@/pages/SapPage'
import RunbooksPage from '@/pages/RunbooksPage'

console.log("App starting...")

window.onerror = (msg, url, line, col, error) => {
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `<div style="padding: 20px; color: red;"><h1>Runtime Error</h1><pre>${msg}\n${url}:${line}:${col}\n${error?.stack}</pre></div>`
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error("Root element not found")

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="links" element={<LinksPage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="test-data" element={<TestDataPage />} />
          <Route path="checklists" element={<ChecklistsPage />} />
          <Route path="sap" element={<SapPage />} />
          <Route path="api" element={<ApiPage />} />
          <Route path="runbooks" element={<RunbooksPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="environments" element={<EnvironmentsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
)
