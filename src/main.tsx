import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { ModalLockGuard } from '@/hooks/useModalLockGuard'
import './index.css'

import MainLayout from '@/layouts/MainLayout'
import { AppAuthBoundary } from '@/components/auth/AppAuthBoundary'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RequireProject } from '@/components/RequireProject'
import { RequireRole } from '@/components/RequireRole'
import { Loader2 } from 'lucide-react'
import {
  SkeletonDashboard,
  SkeletonKanban,
  SkeletonPage,
  SkeletonSplitPane,
} from '@/components/ui/skeleton'
import { recordRendererMetric } from '@/lib/perf'

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
const ReleaseQueuePage = lazy(() => import('@/pages/ReleaseQueuePage'))
const ActivityFeedPage = lazy(() => import('@/pages/ActivityFeedPage'))
const ExploratoryTestingPage = lazy(() => import('@/pages/ExploratoryTestingPage'))
const DocsPage = lazy(() => import('@/pages/DocsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

/**
 * Global reporting for errors React boundaries can't see (async callbacks,
 * event handlers, rejected promises). These are logged, never rendered over
 * the running UI — a mounted app stays usable, and render errors are handled
 * by the per-route ErrorBoundary instead.
 */
let appMounted = false

function reportGlobalError(label: string, detail: unknown) {
  console.error(`[global] ${label}:`, detail)
  if (appMounted) return
  // The app never mounted, so nothing else can show this. Render a minimal,
  // themed recovery notice rather than leaving a blank window.
  const root = document.getElementById('root')
  if (!root) return
  root.replaceChildren()
  const wrapper = document.createElement('div')
  wrapper.style.cssText =
    'display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:32px;font:14px/1.6 Inter,system-ui,sans-serif'
  const heading = document.createElement('h1')
  heading.textContent = "QAssistant couldn't start"
  heading.style.cssText = 'margin:0;font-size:18px;font-weight:600'
  const body = document.createElement('p')
  body.textContent = 'Reload the app to try again. If it keeps happening, check the logs in Settings → Diagnostics.'
  body.style.cssText = 'margin:0;opacity:0.75;max-width:52ch'
  const details = document.createElement('pre')
  details.textContent = String(detail instanceof Error ? (detail.stack ?? detail.message) : detail)
  details.style.cssText =
    'margin:0;max-width:100%;max-height:40vh;overflow:auto;font-size:12px;opacity:0.6;white-space:pre-wrap'
  wrapper.append(heading, body, details)
  root.appendChild(wrapper)
}

window.addEventListener('error', (event) => reportGlobalError('Uncaught error', event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => reportGlobalError('Unhandled rejection', event.reason))

/** Route shell: one error boundary and one route-shaped loading skeleton. */
function Screen({
  name,
  fallback,
  children,
}: {
  name: string
  fallback: ReactNode
  children: ReactNode
}) {
  return (
    <ErrorBoundary name={name}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  )
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error("Root element not found")

createRoot(rootElement).render(
  <AppAuthBoundary>
    {/* Backstop against an orphaned Radix modal lock freezing all input. */}
    <ModalLockGuard />
    <HashRouter>
      <Suspense fallback={
        <div className="flex items-center justify-center h-full w-full bg-background">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      }>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Screen name="Dashboard" fallback={<SkeletonDashboard />}><DashboardPage /></Screen>} />
            <Route path="tasks" element={<Screen name="Tasks" fallback={<SkeletonKanban />}><RequireProject><TasksPage /></RequireProject></Screen>} />
            <Route path="tests" element={<Screen name="Tests" fallback={<SkeletonPage panels={2} />}><RequireProject><TestsPage /></RequireProject></Screen>} />
            <Route path="test-data" element={<Screen name="Test Data" fallback={<SkeletonSplitPane />}><RequireProject><TestDataPage /></RequireProject></Screen>} />
            <Route path="checklists" element={<Screen name="Checklists" fallback={<SkeletonPage />}><RequireProject><ChecklistsPage /></RequireProject></Screen>} />
            <Route path="sap" element={<Screen name="SAP" fallback={<SkeletonPage panels={2} />}><RequireProject><SapPage /></RequireProject></Screen>} />
            <Route path="api" element={<Screen name="API" fallback={<SkeletonSplitPane />}><RequireProject><ApiPage /></RequireProject></Screen>} />
            <Route path="runbooks" element={<Screen name="Runbooks" fallback={<SkeletonPage />}><RequireProject><RunbooksPage /></RequireProject></Screen>} />
            <Route path="notes" element={<Screen name="Notes" fallback={<SkeletonSplitPane />}><RequireProject><NotesPage /></RequireProject></Screen>} />
            <Route path="files" element={<Screen name="Files" fallback={<SkeletonPage />}><RequireProject><FilesPage /></RequireProject></Screen>} />
            <Route path="environments" element={<Screen name="Environments" fallback={<SkeletonSplitPane />}><RequireProject><EnvironmentsPage /></RequireProject></Screen>} />
            <Route path="github" element={<Screen name="GitHub" fallback={<SkeletonPage />}><RequireProject><GitHubPage /></RequireProject></Screen>} />
            <Route path="code-reviews" element={<Screen name="Code Reviews" fallback={<SkeletonPage />}><RequireRole role="dev"><CodeReviewsPage /></RequireRole></Screen>} />
            <Route path="deployments" element={<Screen name="Deployments" fallback={<SkeletonPage />}><RequireProject><RequireRole role="dev"><DeploymentsPage /></RequireRole></RequireProject></Screen>} />
            <Route path="release-queue" element={<Screen name="Release Queue" fallback={<SkeletonPage />}><RequireProject><ReleaseQueuePage /></RequireProject></Screen>} />
            <Route path="activity" element={<Screen name="Activity Feed" fallback={<SkeletonPage />}><RequireProject><ActivityFeedPage /></RequireProject></Screen>} />
            <Route path="exploratory" element={<Screen name="Exploratory Testing" fallback={<SkeletonSplitPane />}><RequireProject><ExploratoryTestingPage /></RequireProject></Screen>} />
            <Route path="reports" element={<Screen name="Reports" fallback={<SkeletonSplitPane />}><RequireProject><ReportBuilderPage /></RequireProject></Screen>} />
            <Route path="docs" element={<Screen name="Docs" fallback={<SkeletonSplitPane />}><DocsPage /></Screen>} />
            <Route path="settings" element={<Screen name="Settings" fallback={<SkeletonPage />}><SettingsPage /></Screen>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  </AppAuthBoundary>,
)

appMounted = true

void recordRendererMetric('rendererBootstrapMs', performance.now())
