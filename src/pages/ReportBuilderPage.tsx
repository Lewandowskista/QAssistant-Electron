/**
 * Report Builder Page
 * Allows QA leads to create, edit, and manage custom report templates
 */

import { useState, useEffect } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FullBleedHeader } from '@/components/ui/workspace'
import { Plus, Trash2, Download, Copy, Eye, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { safeInvoke } from '@/lib/safeInvoke'

const generateSectionId = () => `section-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const DEFAULT_TEMPLATES = [
  {
    name: 'Executive Summary',
    description: 'High-level test metrics and health status',
    sections: [
      { id: 'overview_stats_1', type: 'overview_stats', label: 'Overview Stats', enabled: true, order: 0, config: {} },
      { id: 'status_breakdown_1', type: 'status_breakdown', label: 'Status Breakdown', enabled: true, order: 1, config: {} },
      { id: 'health_score_1', type: 'health_score', label: 'Health Score', enabled: true, order: 2, config: {} },
    ]
  },
  {
    name: 'Full Test Report',
    description: 'Comprehensive test details with execution history',
    sections: [
      { id: 'overview_stats_2', type: 'overview_stats', label: 'Overview Stats', enabled: true, order: 0, config: {} },
      { id: 'status_breakdown_2', type: 'status_breakdown', label: 'Status Breakdown', enabled: true, order: 1, config: {} },
      { id: 'test_plan_details_1', type: 'test_plan_details', label: 'Test Plan Details', enabled: true, order: 2, config: {} },
      { id: 'session_summary_1', type: 'session_summary', label: 'Session Summary', enabled: true, order: 3, config: {} },
      { id: 'task_summary_1', type: 'task_summary', label: 'Open Tasks', enabled: true, order: 4, config: {} },
    ]
  },
  {
    name: 'Risk Assessment',
    description: 'Focus on health, impact, and uncovered issues',
    sections: [
      { id: 'health_score_2', type: 'health_score', label: 'Health Score', enabled: true, order: 0, config: {} },
      { id: 'impact_assessment_1', type: 'impact_assessment', label: 'Impact Assessment', enabled: true, order: 1, config: {} },
      { id: 'status_breakdown_3', type: 'status_breakdown', label: 'Status Breakdown', enabled: true, order: 2, config: {} },
    ]
  },
]

const REPORT_FORMATS = ['html', 'pdf', 'markdown', 'csv'] as const
const FORMAT_LABELS: Record<(typeof REPORT_FORMATS)[number], string> = {
  html: 'HTML',
  pdf: 'PDF',
  markdown: 'Markdown',
  csv: 'CSV',
}
const AVAILABLE_SECTIONS = [
  { type: 'overview_stats', label: 'Overview Stats' },
  { type: 'status_breakdown', label: 'Status Breakdown' },
  { type: 'health_score', label: 'Health Score' },
  { type: 'impact_assessment', label: 'Impact Assessment' },
  { type: 'test_plan_details', label: 'Test Plan Details' },
  { type: 'execution_history', label: 'Execution History' },
  { type: 'session_summary', label: 'Session Summary' },
  { type: 'task_summary', label: 'Open Tasks' },
  { type: 'flaky_tests', label: 'Flaky Tests' },
  { type: 'coverage_matrix', label: 'Coverage Matrix' },
]

export default function ReportBuilderPage() {
  const project = useProjectStore((s) => s.projects.find(p => p.id === s.activeProjectId))
  const { addReportTemplate, updateReportTemplate, deleteReportTemplate } = useProjectStore()

  const [templates, setTemplates] = useState<any[]>(project?.reportTemplates || [])
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [showDefaults, setShowDefaults] = useState(templates.length === 0)

  useEffect(() => {
    if (project) {
      setTemplates(project.reportTemplates || [])
    }
  }, [project?.id])

  if (!project) return <div className="h-full flex items-center justify-center text-muted-ui bg-app">Select a project to build reports.</div>

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return
    const templateId = await addReportTemplate(
      project.id,
      newTemplateName,
      '',
      [
        { id: generateSectionId(), type: 'overview_stats', label: 'Overview Stats', enabled: true, order: 0, config: {} },
        { id: generateSectionId(), type: 'status_breakdown', label: 'Status Breakdown', enabled: true, order: 1, config: {} },
      ]
    )
    setNewTemplateName('')
    setIsCreating(false)
    const updated = useProjectStore.getState().projects.find(p => p.id === project.id)
    if (updated) {
      setTemplates(updated.reportTemplates || [])
      const newTemplate = updated.reportTemplates?.find((t: any) => t.id === templateId)
      if (newTemplate) setSelectedTemplate(newTemplate)
    }
  }

  const handleCreateFromDefault = async (defaultTemplate: typeof DEFAULT_TEMPLATES[0]) => {
    const templateId = await addReportTemplate(
      project.id,
      defaultTemplate.name,
      defaultTemplate.description,
      defaultTemplate.sections
    )
    const updated = useProjectStore.getState().projects.find(p => p.id === project.id)
    if (updated) {
      setTemplates(updated.reportTemplates || [])
      const newTemplate = updated.reportTemplates?.find((t: any) => t.id === templateId)
      if (newTemplate) {
        setSelectedTemplate(newTemplate)
        setShowDefaults(false)
      }
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    await deleteReportTemplate(project.id, templateId)
    const updated = useProjectStore.getState().projects.find(p => p.id === project.id)
    if (updated) {
      setTemplates(updated.reportTemplates || [])
      if (selectedTemplate?.id === templateId) setSelectedTemplate(null)
    }
  }

  const handleUpdateFormat = async (format: string) => {
    if (!selectedTemplate) return
    const updated = { ...selectedTemplate, format }
    setSelectedTemplate(updated)
    await updateReportTemplate(project.id, selectedTemplate.id, { format })
  }

  const handleToggleSection = async (sectionId: string, enabled: boolean) => {
    if (!selectedTemplate) return
    const updated = {
      ...selectedTemplate,
      sections: selectedTemplate.sections.map((s: any) =>
        s.id === sectionId ? { ...s, enabled } : s
      )
    }
    setSelectedTemplate(updated)
    await updateReportTemplate(project.id, selectedTemplate.id, { sections: updated.sections })
  }

  const handleAddSection = async (sectionType: string) => {
    if (!selectedTemplate) return
    const availableSection = AVAILABLE_SECTIONS.find(s => s.type === sectionType)
    if (!availableSection) return

    const newSection = {
      id: generateSectionId(),
      type: sectionType,
      label: availableSection.label,
      enabled: true,
      order: Math.max(...selectedTemplate.sections.map((s: any) => s.order || 0), -1) + 1,
      config: {}
    }

    const updated = {
      ...selectedTemplate,
      sections: [...selectedTemplate.sections, newSection]
    }
    setSelectedTemplate(updated)
    await updateReportTemplate(project.id, selectedTemplate.id, { sections: updated.sections })
  }

  const handleExportReport = async () => {
    if (!selectedTemplate) return
    const format = selectedTemplate.format || 'html'
    if (format === 'pdf') {
      const result = await safeInvoke(
        () => window.electronAPI.exportCustomReportPdf({ project, template: selectedTemplate }),
        'Export failed'
      )
      if (result && !result.success) {
        toast.error(`Export failed: ${result.error || 'Unknown error'}`)
      }
    } else if (format === 'html' || format === 'markdown') {
      const ext = format === 'html' ? 'html' : 'md'
      const result = await safeInvoke(
        () => window.electronAPI.generateCustomReport({ project, template: selectedTemplate }),
        'Report generation failed'
      )
      if (!result) return
      if (result.success && result.html) {
        const res = await safeInvoke(
          () => window.electronAPI.saveFileDialog({
            defaultName: `${project.name.replace(/\s+/g, '-')}-${selectedTemplate.name.replace(/\s+/g, '-')}.${ext}`,
            content: result.html!
          }),
          'Save failed'
        )
        if (res && !res.success) {
          toast.error(`Save failed: ${res.error || 'Unknown error'}`)
        }
      } else if (result) {
        toast.error(`Report generation failed: ${result.error || 'Unknown error'}`)
      }
    }
  }

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-overlay))] text-[hsl(var(--text-primary))]">
      <FullBleedHeader
        icon={FileText}
        title="Report Builder"
        description="Create, edit, and export custom report templates"
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setIsCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New template
          </Button>
        }
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: Template List */}
      <div className="w-80 flex flex-col flex-none border-r border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border-default))]">
          <h2 className="app-section-label">Templates</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowDefaults(!showDefaults)}
              aria-pressed={showDefaults}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                showDefaults
                  ? 'bg-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))]'
                  : 'bg-transparent text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--border-default))]'
              )}
            >
              {showDefaults ? 'Hide defaults' : 'Show defaults'}
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 rounded-full"
              onClick={() => setIsCreating(!isCreating)}
              title="New template"
              aria-label="New template"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isCreating && (
            <div className="mx-4 mt-4 space-y-2 rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-overlay))] p-3">
              <input
                type="text"
                placeholder="Template name…"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTemplate()}
                className="w-full rounded border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-overlay))] px-3 py-2 text-sm text-[hsl(var(--text-primary))] outline-none focus:border-[hsl(var(--border-strong))]"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateTemplate} className="flex-1">Create</Button>
                <Button size="sm" variant="outline" onClick={() => setIsCreating(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          )}

          {/* Default templates section */}
          {showDefaults && (
            <div className="px-4 pt-4">
              <p className="app-section-label mb-2">Default templates</p>
              <div className="space-y-2">
                {DEFAULT_TEMPLATES.map((template, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-overlay))] p-3 transition-colors hover:border-[hsl(var(--border-strong))]"
                  >
                    <div className="mb-2.5">
                      <div className="font-medium text-sm leading-tight">{template.name}</div>
                      <div className="mt-0.5 text-xs text-[hsl(var(--text-secondary))] leading-snug">{template.description}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5"
                      onClick={() => handleCreateFromDefault(template)}
                    >
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      Use template
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saved templates section */}
          {templates.length > 0 && (
            <div className={cn('px-4 pb-4', showDefaults ? 'mt-4 pt-4 border-t border-[hsl(var(--border-default))]' : 'pt-4')}>
              <p className="app-section-label mb-2">Saved templates</p>
              <div className="space-y-1.5">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={cn(
                      'group flex items-center justify-between gap-2 rounded-lg p-3 cursor-pointer transition-colors',
                      selectedTemplate?.id === template.id
                        ? 'bg-primary/15 border border-primary/40'
                        : 'border border-transparent hover:bg-[hsl(var(--surface-overlay))] hover:border-[hsl(var(--border-default))]'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{template.name}</div>
                      <div className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">{template.sections?.length || 0} sections · {template.format || 'html'}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteTemplate(template.id)
                      }}
                      className="flex-none opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded text-state-danger hover:bg-state-danger-soft transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {templates.length === 0 && !showDefaults && (
            <div className="px-4 pt-8 text-center text-sm text-[hsl(var(--text-secondary))]">
              <p className="mb-3">No saved templates yet.</p>
              <Button variant="link" size="sm" onClick={() => setShowDefaults(true)}>
                Browse default templates
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right: Template Editor / Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTemplate ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Sticky header */}
            <div className="flex-none flex items-center justify-between gap-4 border-b border-[hsl(var(--border-default))] px-6 py-4 bg-[hsl(var(--surface-overlay))]">
              <div>
                <h2 className="text-lg font-semibold leading-tight">{selectedTemplate.name}</h2>
                <p className="text-sm text-[hsl(var(--text-secondary))] mt-0.5">{selectedTemplate.description || 'Custom report template'}</p>
              </div>
              <Button onClick={handleExportReport} className="gap-2 whitespace-nowrap flex-none">
                <Download className="h-4 w-4" />
                Export {FORMAT_LABELS[(selectedTemplate.format || 'html') as keyof typeof FORMAT_LABELS] ?? selectedTemplate.format}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Format Selection */}
              <div className="rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))] p-4">
                <h3 className="app-section-label mb-3">Export format</h3>
                <div className="flex flex-wrap gap-2">
                  {REPORT_FORMATS.map((format) => (
                    <button
                      key={format}
                      onClick={() => handleUpdateFormat(format)}
                      className={cn(
                        'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                        (selectedTemplate.format || 'html') === format
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--border-strong))] hover:text-[hsl(var(--text-primary))]'
                      )}
                    >
                      {FORMAT_LABELS[format]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sections Configuration */}
              <div className="rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="app-section-label">Sections</h3>
                  <span className="text-xs text-[hsl(var(--text-secondary))]">
                    {selectedTemplate.sections?.filter((s: any) => s.enabled).length} / {selectedTemplate.sections?.length} enabled
                  </span>
                </div>
                <div className="space-y-1.5">
                  {selectedTemplate.sections?.map((section: any) => (
                    <label
                      key={section.id}
                      className="flex items-center gap-3 rounded-md border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-overlay))] px-3 py-2.5 cursor-pointer transition-colors hover:border-[hsl(var(--border-strong))]"
                    >
                      <input
                        type="checkbox"
                        checked={section.enabled}
                        onChange={(e) => handleToggleSection(section.id, e.target.checked)}
                        className="h-4 w-4 cursor-pointer rounded accent-primary"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{section.label}</div>
                        <div className="text-xs text-[hsl(var(--text-secondary))]">{section.type}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {(!selectedTemplate.sections || selectedTemplate.sections.length === 0) && (
                  <div className="py-6 text-center text-sm text-[hsl(var(--text-secondary))]">No sections added yet</div>
                )}
              </div>

              {/* Add More Sections */}
              <div className="rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))] p-4">
                <h3 className="app-section-label mb-3">Add sections</h3>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_SECTIONS.map((section) => {
                    const exists = selectedTemplate.sections?.some((s: any) => s.type === section.type)
                    return (
                      <button
                        key={section.type}
                        disabled={exists}
                        onClick={() => handleAddSection(section.type)}
                        className={cn(
                          'rounded-md px-3 py-2 text-xs font-medium text-left transition-colors',
                          exists
                            ? 'border border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] opacity-50 cursor-not-allowed'
                            : 'border border-[hsl(var(--border-default))] text-[hsl(var(--text-primary))] hover:bg-[hsl(var(--surface-overlay))] hover:border-[hsl(var(--border-strong))]'
                        )}
                      >
                        <span className={cn('mr-1', exists ? 'text-state-success' : 'text-[hsl(var(--text-secondary))]')}>
                          {exists ? '✓' : '+'}
                        </span>
                        {section.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={Eye}
              title="No template selected"
              description="Select a template from the list or create a new one to get started."
              actions={
                templates.length === 0 ? (
                  <Button variant="outline" onClick={() => setShowDefaults(true)}>View default templates</Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
