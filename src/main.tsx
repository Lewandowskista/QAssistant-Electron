import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'

import MainLayout from '@/layouts/MainLayout'
import { Loader2 } from 'lucide-react'

// Lazy load pages for performance
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const TasksPage = lazy(() => import('@/pages/TasksPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const NotesPage = lazy(() => import('@/pages/NotesPage'))
const TestsPage = lazy(() => import('@/pages/TestsPage'))
const FilesPage = lazy(() => import('@/pages/FilesPage'))
const EnvironmentsPage = lazy(() => import('@/pages/EnvironmentsPage'))
const TestDataPage = lazy(() => import('@/pages/TestDataPage'))
const ChecklistsPage = lazy(() => import('@/pages/ChecklistsPage'))
const ApiPage = lazy(() => import('@/pages/ApiPage'))
const SapPage = lazy(() => import('@/pages/SapPage'))
const RunbooksPage = lazy(() => import('@/pages/RunbooksPage'))

const PageLoader = () => (
    <div className="flex items-center justify-center h-full w-full bg-[#0F0F13]">
        <Loader2 className="h-8 w-8 text-[#A78BFA] animate-spin" />
    </div>
)

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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="tasks" element={<TasksPage />} />
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
      </Suspense>
    </HashRouter>
  </StrictMode>,
)
