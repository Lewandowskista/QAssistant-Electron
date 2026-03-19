import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react"
import { Search, ChevronRight, Lightbulb, ArrowLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { SplitPaneShell } from "@/components/ui/split-pane-shell"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DOC_SECTIONS, type DocSection, type DocSubsection } from "@/data/docs-content"
import { cn } from "@/lib/utils"

// ── Lightweight inline text renderer ─────────────────────────────────────────

function renderInlineText(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  // Split into paragraphs first
  const paragraphs = text.split("\n\n")

  paragraphs.forEach((para, pi) => {
    if (pi > 0) parts.push(<div key={`br-${pi}`} className="h-3" />)

    // Check if paragraph is a bullet list
    const lines = para.split("\n")
    const isList = lines.every(l => l.trimStart().startsWith("- ") || l.trim() === "")

    if (isList) {
      const items = lines.filter(l => l.trimStart().startsWith("- "))
      parts.push(
        <ul key={`ul-${pi}`} className="space-y-1.5 ml-1">
          {items.map((item, li) => (
            <li key={li} className="flex gap-2 text-sm text-[#CBD5E1] leading-relaxed">
              <span className="text-primary/60 mt-1.5 shrink-0">•</span>
              <span>{renderInline(item.replace(/^\s*-\s*/, ""))}</span>
            </li>
          ))}
        </ul>,
      )
    } else {
      parts.push(
        <p key={`p-${pi}`} className="text-sm text-[#CBD5E1] leading-relaxed">
          {renderInline(para.replace(/\n/g, " "))}
        </p>,
      )
    }
  })

  return parts
}

/** Render **bold** and `code` within a single line */
function renderInline(text: string): ReactNode[] {
  const tokens: ReactNode[] = []
  // Match **bold**, `code`, or plain text
  const regex = /(\*\*(.+?)\*\*|`([^`]+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      // bold
      tokens.push(<strong key={match.index} className="font-semibold text-[#E2E8F0]">{match[2]}</strong>)
    } else if (match[3]) {
      // code
      tokens.push(
        <code key={match.index} className="px-1.5 py-0.5 rounded-md bg-[#1E1B2E] text-primary text-xs font-mono">
          {match[3]}
        </code>,
      )
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex))
  }
  return tokens
}

// ── Search helper ────────────────────────────────────────────────────────────

interface SearchResult {
  sectionId: string
  sectionTitle: string
  subsectionId: string
  subsectionTitle: string
  icon: DocSection["icon"]
}

function searchDocs(query: string): SearchResult[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const results: SearchResult[] = []

  for (const section of DOC_SECTIONS) {
    for (const sub of section.subsections) {
      if (
        section.title.toLowerCase().includes(q) ||
        sub.title.toLowerCase().includes(q) ||
        sub.content.toLowerCase().includes(q) ||
        section.description.toLowerCase().includes(q)
      ) {
        results.push({
          sectionId: section.id,
          sectionTitle: section.title,
          subsectionId: sub.id,
          subsectionTitle: sub.title,
          icon: section.icon,
        })
      }
    }
  }
  return results
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function DocsPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSection, setActiveSection] = useState(DOC_SECTIONS[0]?.id ?? "")
  const contentRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())

  // Build a map from subsection id → parent section id so the scroll spy
  // always highlights the parent section in the sidebar.
  const subsectionToSection = useMemo(() => {
    const map = new Map<string, string>()
    for (const section of DOC_SECTIONS) {
      map.set(section.id, section.id)
      for (const sub of section.subsections) {
        map.set(sub.id, section.id)
      }
    }
    return map
  }, [])

  // Scroll spy via IntersectionObserver
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-section-id")
            if (id) setActiveSection(subsectionToSection.get(id) ?? id)
          }
        }
      },
      { root: container, rootMargin: "-10% 0px -80% 0px", threshold: 0 },
    )

    // Observe all section headings
    for (const el of sectionRefs.current.values()) {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [subsectionToSection])

  const registerSection = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el)
    else sectionRefs.current.delete(id)
  }, [])

  const scrollTo = useCallback((id: string) => {
    const el = sectionRefs.current.get(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
      setSearchQuery("")
    }
  }, [])

  const searchResults = useMemo(() => searchDocs(searchQuery), [searchQuery])
  const isSearching = searchQuery.trim().length > 0

  // ── Sidebar ──────────────────────────────────────────────────────────────

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: "hsl(var(--border-default))" }}>
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-ui hover:text-foreground" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-bold text-foreground tracking-tight">Documentation</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-ui pointer-events-none" />
          <Input
            placeholder="Search docs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 text-xs rounded-lg"
          />
        </div>
      </div>

      {/* TOC or Search Results */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {isSearching ? (
          searchResults.length === 0 ? (
            <p className="text-xs text-muted-ui px-4 py-6 text-center">No results found</p>
          ) : (
            <div className="space-y-0.5 px-2">
              {searchResults.map((r) => {
                const Icon = r.icon
                return (
                  <button
                    key={r.subsectionId}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-[hsl(var(--surface-selected)/0.5)] transition-colors"
                    onClick={() => scrollTo(r.subsectionId)}
                  >
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <Icon className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                      {r.sectionTitle}
                    </div>
                    <p className="text-muted-ui ml-5.5 mt-0.5">{r.subsectionTitle}</p>
                  </button>
                )
              })}
            </div>
          )
        ) : (
          <nav className="space-y-0.5 px-2">
            {DOC_SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id
              return (
                <div key={section.id}>
                  <button
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-[#CBD5E1] hover:bg-[hsl(var(--surface-selected)/0.5)] hover:text-foreground",
                    )}
                    onClick={() => scrollTo(section.id)}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-muted-ui")} />
                    {section.title}
                  </button>
                  {isActive && (
                    <div className="ml-6 mt-0.5 mb-1 space-y-0.5">
                      {section.subsections.map((sub) => (
                        <button
                          key={sub.id}
                          className="w-full text-left px-3 py-1 rounded-md text-[11px] text-muted-ui hover:text-foreground hover:bg-[hsl(var(--surface-selected)/0.3)] transition-colors flex items-center gap-1.5"
                          onClick={() => scrollTo(sub.id)}
                        >
                          <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-50" />
                          {sub.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        )}
      </div>
    </div>
  )

  // ── Content ──────────────────────────────────────────────────────────────

  const content = (
    <div ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto px-8 py-8">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">QAssistant Documentation</h1>
          <p className="text-sm text-muted-ui mt-2 leading-relaxed">
            Complete guide to every feature, integration, and workflow in QAssistant.
            Use the sidebar to navigate or search for specific topics.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-12">
          {DOC_SECTIONS.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              registerSection={registerSection}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 mb-8 pt-8 border-t" style={{ borderColor: "hsl(var(--border-default))" }}>
          <p className="text-xs text-muted-ui text-center">
            QAssistant — QA Collaboration & Test Management Platform
          </p>
        </div>
      </div>
    </div>
  )

  return <SplitPaneShell sidebar={sidebar} content={content} />
}

// ── Section Block ────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  registerSection,
}: {
  section: DocSection
  registerSection: (id: string, el: HTMLElement | null) => void
}) {
  const Icon = section.icon

  return (
    <section>
      {/* Section heading */}
      <div
        ref={(el) => registerSection(section.id, el)}
        data-section-id={section.id}
        id={section.id}
        className="scroll-mt-8"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
        </div>
        <p className="text-sm text-[#94A3B8] leading-relaxed mb-6">{section.description}</p>
      </div>

      {/* Subsections */}
      <div className="space-y-6 ml-1">
        {section.subsections.map((sub) => (
          <SubsectionBlock key={sub.id} sub={sub} registerSection={registerSection} />
        ))}
      </div>
    </section>
  )
}

function SubsectionBlock({
  sub,
  registerSection,
}: {
  sub: DocSubsection
  registerSection: (id: string, el: HTMLElement | null) => void
}) {
  return (
    <div
      ref={(el) => registerSection(sub.id, el)}
      data-section-id={sub.id}
      id={sub.id}
      className="scroll-mt-8 app-panel p-5"
    >
      <h3 className="text-sm font-semibold text-foreground mb-3">{sub.title}</h3>
      <div>{renderInlineText(sub.content)}</div>
      {sub.tips && sub.tips.length > 0 && (
        <div className="mt-4 space-y-2">
          {sub.tips.map((tip, i) => (
            <div
              key={i}
              className="flex gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
            >
              <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-[#CBD5E1] leading-relaxed">{renderInline(tip)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
