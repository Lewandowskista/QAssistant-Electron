/**
 * Report Builder Page
 * Allows QA leads to create, edit, and manage custom report templates
 */

import { useState, useEffect } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Download, Copy, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  if (!project) return <div className="p-4">No project selected</div>

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
    try {
      if (format === 'pdf') {
        const result = await window.electronAPI.exportCustomReportPdf({
          project,
          template: selectedTemplate
        })
        if (!result.success) {
          alert(`Export failed: ${result.error || 'Unknown error'}`)
        }
      } else if (format === 'html') {
        const result = await window.electronAPI.generateCustomReport({
          project,
          template: selectedTemplate
        })
        if (result.success && result.html) {
          const res = await window.electronAPI.saveFileDialog({
            defaultName: `${project.name.replace(/\s+/g, '-')}-${selectedTemplate.name.replace(/\s+/g, '-')}.html`,
            content: result.html
          })
          if (!res.success) {
            alert(`Save failed: ${res.error || 'Unknown error'}`)
          }
        } else {
          alert(`Report generation failed: ${result.error || 'Unknown error'}`)
        }
      } else if (format === 'markdown') {
        const result = await window.electronAPI.generateCustomReport({
          project,
          template: selectedTemplate
        })
        if (result.success && result.html) {
          const res = await window.electronAPI.saveFileDialog({
            defaultName: `${project.name.replace(/\s+/g, '-')}-${selectedTemplate.name.replace(/\s+/g, '-')}.md`,
            content: result.html
          })
          if (!res.success) {
            alert(`Save failed: ${res.error || 'Unknown error'}`)
          }
        } else {
          alert(`Report generation failed: ${result.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert(`Export error: ${String(error)}`)
    }
  }

  return (
    <div className="flex h-full gap-4 bg-[hsl(var(--surface-overlay))] p-6 text-[hsl(var(--text-primary))]">
      {/* Left: Template List */}
      <div className="w-72 flex flex-col gap-4 border-r border-[hsl(var(--border-default))] pr-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Templates</h2>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={showDefaults ? 'default' : 'outline'}
              onClick={() => setShowDefaults(!showDefaults)}
              title="Toggle default templates"
            >
              {showDefaults ? 'Hide' : 'Show'} Defaults
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCreating(!isCreating)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isCreating && (
          <div className="space-y-2 rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))] p-3">
            <input
              type="text"
              placeholder="Template name..."
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTemplate()}
              className="w-full rounded border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-overlay))] px-3 py-2 text-sm text-[hsl(var(--text-primary))]"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateTemplate}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Show default templates when no saved templates or when toggled */}
        {showDefaults && (
          <div className="space-y-2 border-b border-[hsl(var(--border-default))] pb-4">
            <p className="px-1 text-xs font-semibold text-[hsl(var(--text-secondary))]">DEFAULT TEMPLATES</p>
            {DEFAULT_TEMPLATES.map((template, idx) => (
              <div
                key={idx}
                className="rounded border border-dashed border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))] p-3 transition-colors hover:bg-[hsl(var(--surface-elevated))]"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-[hsl(var(--text-secondary))]">{template.description}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleCreateFromDefault(template)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Use Template
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Saved templates */}
        {templates.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-2">
            <p className="px-1 text-xs font-semibold text-[hsl(var(--text-secondary))]">SAVED TEMPLATES</p>
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className={cn(
                  'p-3 rounded cursor-pointer transition-colors',
                  selectedTemplate?.id === template.id
                    ? 'border border-primary bg-primary/10'
                    : 'bg-[hsl(var(--surface-card-alt))] hover:bg-[hsl(var(--surface-elevated))]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{template.name}</div>
                    <div className="text-xs text-text-secondary">{template.sections?.length || 0} sections · {template.format}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteTemplate(template.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Template Editor / Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTemplate ? (
          <div className="space-y-4 overflow-y-auto flex-1">
            <div className="sticky top-0 border-b border-[hsl(var(--border-default))] bg-[hsl(var(--surface-overlay))] pb-4 pt-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h1 className="text-2xl font-bold">{selectedTemplate.name}</h1>
                  <p className="mt-1 text-sm text-[hsl(var(--text-secondary))]">{selectedTemplate.description || 'Custom report template'}</p>
                </div>
                <Button onClick={handleExportReport} className="gap-2 whitespace-nowrap">
                  <Download className="h-4 w-4" />
                  Export {(selectedTemplate.format || 'html').toUpperCase()}
                </Button>
              </div>
            </div>

            {/* Format Selection */}
            <div className="rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))] p-4">
              <h3 className="font-semibold mb-3 text-sm">Export Format</h3>
              <div className="flex flex-wrap gap-2">
                {REPORT_FORMATS.map((format) => (
                  <Button
                    key={format}
                    size="sm"
                    variant={(selectedTemplate.format || 'html') === format ? 'default' : 'outline'}
                    onClick={() => handleUpdateFormat(format)}
                  >
                    {format.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Sections Configuration */}
            <div className="rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))] p-4">
              <h3 className="font-semibold mb-3 text-sm">Sections ({selectedTemplate.sections?.filter((s: any) => s.enabled).length}/{selectedTemplate.sections?.length})</h3>
              <div className="space-y-2">
                {selectedTemplate.sections?.map((section: any) => (
                  <div key={section.id} className="flex items-center gap-3 rounded border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-overlay))] p-3 transition-colors hover:border-[hsl(var(--border-strong))]">
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      onChange={(e) => handleToggleSection(section.id, e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-[hsl(var(--border-default))]"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{section.label}</div>
                      <div className="text-xs text-[hsl(var(--text-secondary))]">{section.type}</div>
                    </div>
                  </div>
                ))}
              </div>
              {(!selectedTemplate.sections || selectedTemplate.sections.length === 0) && (
                <div className="py-4 text-center text-sm text-[hsl(var(--text-secondary))]">No sections added</div>
              )}
            </div>

            {/* Add More Sections */}
            <div className="rounded-lg border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-card-alt))] p-4">
              <h3 className="font-semibold mb-3 text-sm">Add Sections</h3>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_SECTIONS.map((section) => {
                  const exists = selectedTemplate.sections?.some((s: any) => s.type === section.type)
                  return (
                    <Button
                      key={section.type}
                      size="sm"
                      variant={exists ? 'outline' : 'default'}
                      disabled={exists}
                      onClick={() => handleAddSection(section.type)}
                      className="text-xs"
                    >
                      {exists ? '✓ ' : '+ '}{section.label}
                    </Button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[hsl(var(--text-secondary))]">
            <div className="text-center">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <div className="text-lg font-semibold mb-2">No template selected</div>
              <p className="mb-4">Select a template or create a new one to get started</p>
              {templates.length === 0 && (
                <Button onClick={() => setShowDefaults(true)}>View Default Templates</Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
