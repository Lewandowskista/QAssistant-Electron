import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useProjectStore, TestPlan } from "@/store/useProjectStore"
import { Layers, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

interface TestPlanDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    editingPlan: TestPlan | null
}

export default function TestPlanDialog({ open, onOpenChange, editingPlan }: TestPlanDialogProps) {
    const { activeProjectId, addTestPlan, updateTestPlan } = useProjectStore()
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [isRegression, setIsRegression] = useState(false)

    useEffect(() => {
        if (editingPlan) {
            setName(editingPlan.name)
            setDescription(editingPlan.description)
            setIsRegression(editingPlan.isRegressionSuite || false)
        } else {
            setName("")
            setDescription("")
            setIsRegression(false)
        }
    }, [editingPlan, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!activeProjectId || !name.trim()) return

        if (editingPlan) {
            await updateTestPlan(activeProjectId, editingPlan.id, {
                name,
                description,
                isRegressionSuite: isRegression
            })
        } else {
            // Note: addTestPlan helper in store currently doesn't take isRegressionSuite,
            // we'll fix it if needed but let's assume it defaults to false or we update it.
            // Actually I'll just use updateTestPlan if I need to set it, but I'll update store action first
            await addTestPlan(activeProjectId, name, description)
            // If it was supposed to be a regression suite, we can update it immediately
            if (isRegression) {
                const projects = useProjectStore.getState().projects
                const proj = projects.find(p => p.id === activeProjectId)
                const newPlan = proj?.testPlans.find(p => p.name === name)
                if (newPlan) {
                    await updateTestPlan(activeProjectId, newPlan.id, { isRegressionSuite: true })
                }
            }
        }
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px] p-0 border-none shadow-2xl overflow-hidden">
                <div className="h-2 bg-indigo-600 w-full" />
                <form onSubmit={handleSubmit} className="p-8">
                    <DialogHeader className="mb-6">
                        <div className="flex items-center gap-3 text-indigo-600">
                            <div className="p-2 bg-indigo-600/10 rounded-lg text-indigo-600">
                                <Layers className="h-6 w-6" />
                            </div>
                            <DialogTitle className="text-2xl font-black tracking-tight">
                                {editingPlan ? "Edit Suite Blueprint" : "Initialize Test Plan"}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="mt-2 text-muted-foreground font-medium">
                            Group your test scenarios into focused execution suites.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-6">
                        <div className="grid gap-2">
                            <Label htmlFor="plan-name" className="text-[10px] font-black uppercase text-muted-foreground px-1 tracking-widest">Plan Designation</Label>
                            <Input
                                id="plan-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Core Regression v2.4"
                                className="h-11 bg-background focus-visible:ring-indigo-500/30 font-bold"
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="plan-desc" className="text-[10px] font-black uppercase text-muted-foreground px-1 tracking-widest">Strategic Overview</Label>
                            <Textarea
                                id="plan-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Objectives, scope, and target components..."
                                className="bg-background focus-visible:ring-indigo-500/30 resize-none min-h-[100px]"
                            />
                        </div>

                        <div
                            className={cn(
                                "flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer",
                                isRegression
                                    ? "bg-green-500/5 border-green-500/20 shadow-lg shadow-green-500/5"
                                    : "bg-muted/30 border-transparent opacity-60 grayscale"
                            )}
                            onClick={() => setIsRegression(!isRegression)}
                        >
                            <div className={cn("p-2 rounded-xl ring-1 transition-all",
                                isRegression ? "bg-green-100 text-green-600 ring-green-600/20" : "bg-zinc-100 text-zinc-400 ring-zinc-400/20"
                            )}>
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-black tracking-tight">Regression Suite</div>
                                <div className="text-[10px] font-bold text-muted-foreground leading-tight">Muted plans won't appear in baseline health checks.</div>
                            </div>
                            <div className={cn("w-10 h-5 rounded-full relative transition-all p-1",
                                isRegression ? "bg-green-500" : "bg-zinc-300"
                            )}>
                                <div className={cn("bg-white w-3 h-3 rounded-full shadow-sm transition-all",
                                    isRegression ? "translate-x-5" : "translate-x-0"
                                )} />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-8 pt-6 border-t border-border/50 gap-2 bg-[#13131A]">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold">
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8">
                            {editingPlan ? "Sync Blueprint" : "Establish Suite"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
