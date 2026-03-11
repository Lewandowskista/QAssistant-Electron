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
        setNameError("")
    }, [editingPlan, open])

    const [nameError, setNameError] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!activeProjectId) return
        if (!name.trim()) {
            setNameError("Plan name is required.")
            return
        }
        setNameError("")

        if (editingPlan) {
            await updateTestPlan(activeProjectId, editingPlan.id, {
                name,
                description,
                isRegressionSuite: isRegression
            })
        } else {
            await addTestPlan(activeProjectId, name, description, isRegression)
        }
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px] p-0 border-none shadow-2xl overflow-hidden">
                <div className="h-2 bg-[#A78BFA] w-full" />
                <form onSubmit={handleSubmit} className="p-8">
                    <DialogHeader className="mb-6">
                        <div className="flex items-center gap-3 text-[#A78BFA]">
                            <div className="p-2 bg-[#A78BFA]/10 rounded-lg text-[#A78BFA]">
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
                                onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameError("") }}
                                placeholder="e.g. Core Regression v2.4"
                                className={cn("h-11 bg-background focus-visible:ring-[#A78BFA]/30 font-bold", nameError && "border-red-500/70")}
                            />
                            {nameError && <p className="text-xs text-red-400 px-1">{nameError}</p>}
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="plan-desc" className="text-[10px] font-black uppercase text-muted-foreground px-1 tracking-widest">Strategic Overview</Label>
                            <Textarea
                                id="plan-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Objectives, scope, and target components..."
                                className="bg-background focus-visible:ring-[#A78BFA]/30 resize-none min-h-[100px]"
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
                                isRegression ? "bg-[#A78BFA]/10 text-[#A78BFA] ring-[#A78BFA]/20" : "bg-[#2A2A3A] text-[#6B7280] ring-[#2A2A3A]"
                            )}>
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-black tracking-tight">Regression Suite</div>
                                <div className="text-[10px] font-bold text-muted-foreground leading-tight">Muted plans won't appear in baseline health checks.</div>
                            </div>
                            <div className={cn("w-10 h-5 rounded-full relative transition-all p-1",
                                isRegression ? "bg-[#A78BFA]" : "bg-[#2A2A3A]"
                            )}>
                                <div className={cn("bg-[#E2E8F0] w-3 h-3 rounded-full shadow-sm transition-all",
                                    isRegression ? "translate-x-5" : "translate-x-0"
                                )} />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="mt-8 pt-6 border-t border-[#2A2A3A] gap-2 bg-[#13131A]">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="font-bold">
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-[#A78BFA] hover:bg-[#9271e0] text-[#0F0F13] font-black px-8">
                            {editingPlan ? "Sync Blueprint" : "Establish Suite"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
