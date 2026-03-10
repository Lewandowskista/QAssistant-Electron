import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useProjectStore } from "@/store/useProjectStore"
import { searchProjects, SearchResult } from "@/lib/search"
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import { Search, FileText, CheckCircle2, FlaskConical, Globe, Zap, Database, ClipboardCheck } from "lucide-react"

export default function SearchPalette() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [results, setResults] = useState<SearchResult[]>([])
    const { projects, setActiveProject } = useProjectStore()
    const navigate = useNavigate()

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }
        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

    useEffect(() => {
        if (query.length > 1) {
            setResults(searchProjects(projects, query))
        } else {
            setResults([])
        }
    }, [query, projects])

    const handleSelect = useCallback((result: SearchResult) => {
        setActiveProject(result.projectId)
        setOpen(false)

        switch (result.type) {
            case 'task': navigate('/tasks'); break
            case 'note': navigate('/notes'); break
            case 'testplan': 
            case 'testcase': navigate('/tests'); break
            case 'api': navigate('/api'); break
            case 'runbook': navigate('/runbooks'); break
            case 'testData': navigate('/test-data'); break
            case 'checklist': navigate('/checklists'); break
        }
    }, [navigate, setActiveProject])

    const getIcon = (type: SearchResult['type']) => {
        switch (type) {
            case 'task': return <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" />
            case 'note': return <FileText className="h-4 w-4 mr-2 text-blue-500" />
            case 'testplan': return <FlaskConical className="h-4 w-4 mr-2 text-purple-500" />
            case 'testcase': return <FlaskConical className="h-4 w-4 mr-2 text-pink-500" />
            case 'api': return <Globe className="h-4 w-4 mr-2 text-amber-500" />
            case 'runbook': return <Zap className="h-4 w-4 mr-2 text-indigo-500" />
            case 'testData': return <Database className="h-4 w-4 mr-2 text-cyan-500" />
            case 'checklist': return <ClipboardCheck className="h-4 w-4 mr-2 text-orange-500" />
            default: return <Search className="h-4 w-4 mr-2" />
        }
    }

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput
                placeholder="Search across all projects... (Cmd+K)"
                value={query}
                onValueChange={setQuery}
            />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                {results.length > 0 && (
                    <CommandGroup heading="Results">
                        {results.map((result) => (
                            <CommandItem
                                key={`${result.type}-${result.id}`}
                                onSelect={() => handleSelect(result)}
                                className="flex items-center justify-between"
                            >
                                <div className="flex items-center">
                                    {getIcon(result.type)}
                                    <div className="flex flex-col">
                                        <span>{result.title}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {result.projectName} • {result.type.toUpperCase()} {result.metadata ? ` • ${result.metadata}` : ''}
                                        </span>
                                    </div>
                                </div>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
            </CommandList>
        </CommandDialog>
    )
}
