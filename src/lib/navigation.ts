import {
    Activity,
    BarChart3,
    BookOpen,
    CheckSquare,
    ClipboardCheck,
    Compass,
    Database,
    FileText,
    FlaskConical,
    Globe,
    GitBranch,
    LayoutDashboard,
    ListChecks,
    MessageSquare,
    Rocket,
} from "lucide-react"

export type NavItem = {
    name: string
    href: string
    icon: typeof LayoutDashboard
    roles?: Array<"qa" | "dev">
}

/**
 * Single source of truth for workspace navigation. The sidebar rail and the
 * command palette both consume these lists, so labels always match.
 */
export const PRIMARY_ITEMS: NavItem[] = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Tests", href: "/tests", icon: FlaskConical, roles: ["qa"] },
    { name: "Code Reviews", href: "/code-reviews", icon: MessageSquare, roles: ["dev"] },
    { name: "Notes", href: "/notes", icon: FileText },
    { name: "Files", href: "/files", icon: FileText },
    { name: "Release Queue", href: "/release-queue", icon: ClipboardCheck },
    { name: "Activity Feed", href: "/activity", icon: Activity },
]

export const UTILITY_ITEMS: NavItem[] = [
    { name: "Exploratory", href: "/exploratory", icon: Compass, roles: ["qa"] },
    { name: "Test Data", href: "/test-data", icon: Database, roles: ["qa"] },
    { name: "Checklists", href: "/checklists", icon: ListChecks, roles: ["qa"] },
    { name: "Reports", href: "/reports", icon: BarChart3, roles: ["qa"] },
    { name: "GitHub", href: "/github", icon: GitBranch },
    { name: "Environments", href: "/environments", icon: Globe },
    { name: "Runbooks", href: "/runbooks", icon: BookOpen },
    { name: "Deployments", href: "/deployments", icon: Rocket, roles: ["dev"] },
    { name: "Docs", href: "/docs", icon: BookOpen },
]

export function matchesRole(item: NavItem, activeRole: "qa" | "dev") {
    return !item.roles || item.roles.includes(activeRole)
}

export function isItemActive(pathname: string, href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
