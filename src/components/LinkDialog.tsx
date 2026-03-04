import { useState, useEffect } from "react"
import { ProjectLink } from "@/store/useProjectStore"
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

interface LinkDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    link?: ProjectLink
    onSave: (title: string, url: string) => void
}

export function LinkDialog({ open, onOpenChange, link, onSave }: LinkDialogProps) {
    const [title, setTitle] = useState("")
    const [url, setUrl] = useState("")

    useEffect(() => {
        if (link) {
            setTitle(link.title)
            setUrl(link.url)
        } else {
            setTitle("")
            setUrl("https://")
        }
    }, [link, open])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim() || !url.trim()) return
        onSave(title, url)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{link ? "Edit Link" : "Add Link"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Documentation, Linear, etc."
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="url">URL</Label>
                        <Input
                            id="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com"
                        />
                    </div>
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">
                            {link ? "Save Changes" : "Add Link"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
