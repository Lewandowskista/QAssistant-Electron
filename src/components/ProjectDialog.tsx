import { useState, useEffect } from "react"
import { useProjectStore, Project } from "@/store/useProjectStore"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface ProjectDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    project?: Project
}

export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
    const { addProject, updateProject } = useProjectStore()
    const [name, setName] = useState("")
    const [color, setColor] = useState("bg-blue-500")

    const colors = [
        { name: "Blue", value: "bg-blue-500" },
        { name: "Purple", value: "bg-purple-500" },
        { name: "Green", value: "bg-green-500" },
        { name: "Yellow", value: "bg-yellow-500" },
        { name: "Pink", value: "bg-pink-500" },
        { name: "Red", value: "bg-red-500" },
        { name: "Indigo", value: "bg-indigo-500" },
        { name: "Orange", value: "bg-orange-500" },
    ]

    useEffect(() => {
        if (project) {
            setName(project.name)
            setColor(project.color)
        } else {
            setName("")
            setColor("bg-blue-500")
        }
    }, [project, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        if (project) {
            await updateProject(project.id, { name, color })
        } else {
            await addProject(name, color)
        }
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Project Name</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Awesome Project"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Color Tag</Label>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {colors.map((c) => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setColor(c.value)}
                                    className={`w-8 h-8 rounded-full transition-all ${c.value} ${color === c.value
                                            ? "ring-2 ring-ring ring-offset-2 ring-offset-background scale-110"
                                            : "opacity-60 hover:opacity-100"
                                        }`}
                                    title={c.name}
                                />
                            ))}
                        </div>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">
                            {project ? "Save Changes" : "Create Project"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
