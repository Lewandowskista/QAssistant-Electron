import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'

import MainLayout from '@/layouts/MainLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RequireProject } from '@/components/RequireProject'
import { RequireRole } from '@/components/RequireRole'
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
const GitHubPage = lazy(() => import('@/pages/GitHubPage'))
const CodeReviewsPage = lazy(() => import('@/pages/CodeReviewsPage'))
const DeploymentsPage = lazy(() => import('@/pages/DeploymentsPage'))
const ReportBuilderPage = lazy(() => import('@/pages/ReportBuilderPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

const PageLoader = () => (
    <div className="flex items-center justify-center h-full w-full bg-surface-overlay">
        <Loader2 className="h-8 w-8 text-qa-purple animate-spin" />
    </div>
)

window.onerror = (msg, url, line, col, error) => {
  const root = document.getElementById('root')
  if (root) {
    const pre = document.createElement('pre')
    pre.textContent = `${msg}\n${url}:${line}:${col}\n${error?.stack ?? ''}`
    const h1 = document.createElement('h1')
    h1.textContent = 'Runtime Error'
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'padding:20px;color:red'
    wrapper.appendChild(h1)
    wrapper.appendChild(pre)
    root.replaceChildren(wrapper)
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
            <Route index element={<ErrorBoundary name="Dashboard"><DashboardPage /></ErrorBoundary>} />
            <Route path="tasks" element={<ErrorBoundary name="Tasks"><RequireProject><TasksPage /></RequireProject></ErrorBoundary>} />
            <Route path="tests" element={<ErrorBoundary name="Tests"><RequireProject><TestsPage /></RequireProject></ErrorBoundary>} />
            <Route path="test-data" element={<ErrorBoundary name="Test Data"><RequireProject><TestDataPage /></RequireProject></ErrorBoundary>} />
            <Route path="checklists" element={<ErrorBoundary name="Checklists"><RequireProject><ChecklistsPage /></RequireProject></ErrorBoundary>} />
            <Route path="sap" element={<ErrorBoundary name="SAP"><RequireProject><SapPage /></RequireProject></ErrorBoundary>} />
            <Route path="api" element={<ErrorBoundary name="API"><RequireProject><ApiPage /></RequireProject></ErrorBoundary>} />
            <Route path="runbooks" element={<ErrorBoundary name="Runbooks"><RequireProject><RunbooksPage /></RequireProject></ErrorBoundary>} />
            <Route path="notes" element={<ErrorBoundary name="Notes"><RequireProject><NotesPage /></RequireProject></ErrorBoundary>} />
            <Route path="files" element={<ErrorBoundary name="Files"><RequireProject><FilesPage /></RequireProject></ErrorBoundary>} />
            <Route path="environments" element={<ErrorBoundary name="Environments"><RequireProject><EnvironmentsPage /></RequireProject></ErrorBoundary>} />
            <Route path="github" element={<ErrorBoundary name="GitHub"><RequireProject><RequireRole role="dev"><GitHubPage /></RequireRole></RequireProject></ErrorBoundary>} />
            <Route path="code-reviews" element={<ErrorBoundary name="Code Reviews"><RequireProject><RequireRole role="dev"><CodeReviewsPage /></RequireRole></RequireProject></ErrorBoundary>} />
            <Route path="deployments" element={<ErrorBoundary name="Deployments"><RequireProject><RequireRole role="dev"><DeploymentsPage /></RequireRole></RequireProject></ErrorBoundary>} />
            <Route path="reports" element={<ErrorBoundary name="Reports"><RequireProject><ReportBuilderPage /></RequireProject></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary name="Settings"><SettingsPage /></ErrorBoundary>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  </StrictMode>,
)
