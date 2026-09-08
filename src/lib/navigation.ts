import {
    Activity,
    BarChart3,
    BookOpen,
    CheckSquare,
    ClipboardCheck,
    Compass,
    Database,
    FlaskConical,
    FolderOpen,
    GitBranch,
    GitPullRequest,
    Globe,
    LayoutDashboard,
    ListChecks,
    NotebookPen,
    Rocket,
    ScrollText,
    Settings,
} from "lucide-react"

export type Role = "qa" | "dev"

export type NavItem = {
    name: string
    href: string
    icon: typeof LayoutDashboard
    roles?: Role[]
}

export type NavGroup = {
    id: string
    label: string
    items: NavItem[]
}

/**
 * Single source of truth for workspace navigation. The sidebar rail, the
 * command palette and the topbar's page title all read from here, so a label
 * can never disagree with itself.
 *
 * Grouped by the question a person is answering, not by how central the page
 * felt when it was added. The previous split was "Work" (8 items) and
 * "Utilities" (9) — a bucket named after nothing, holding half the app, which
 * meant the only way to find a page was to read all seventeen labels. Four
 * groups of three to five keep every group scannable in one glance.
 *
 * Icons are unique across the whole rail: Notes/Files both used FileText and
 * Runbooks/Docs both used BookOpen, so two pairs of rail rows were
 * indistinguishable once the rail was collapsed to icons only.
 */
export const NAV_GROUPS: NavGroup[] = [
    {
        id: "plan",
        label: "Plan",
        items: [
            { name: "Dashboard", href: "/", icon: LayoutDashboard },
            { name: "Tasks", href: "/tasks", icon: CheckSquare },
            { name: "Release Queue", href: "/release-queue", icon: ClipboardCheck },
            { name: "Activity Feed", href: "/activity", icon: Activity },
        ],
    },
    {
        id: "quality",
        label: "Quality",
        items: [
            { name: "Tests", href: "/tests", icon: FlaskConical, roles: ["qa"] },
            { name: "Exploratory", href: "/exploratory", icon: Compass, roles: ["qa"] },
            { name: "Checklists", href: "/checklists", icon: ListChecks, roles: ["qa"] },
            { name: "Test Data", href: "/test-data", icon: Database, roles: ["qa"] },
            { name: "Reports", href: "/reports", icon: BarChart3, roles: ["qa"] },
        ],
    },
    {
        id: "delivery",
        label: "Delivery",
        items: [
            { name: "Code Reviews", href: "/code-reviews", icon: GitPullRequest, roles: ["dev"] },
            { name: "GitHub", href: "/github", icon: GitBranch },
            { name: "Deployments", href: "/deployments", icon: Rocket, roles: ["dev"] },
            { name: "Environments", href: "/environments", icon: Globe },
            { name: "Runbooks", href: "/runbooks", icon: ScrollText },
        ],
    },
    {
        id: "workspace",
        label: "Workspace",
        items: [
            { name: "Notes", href: "/notes", icon: NotebookPen },
            { name: "Files", href: "/files", icon: FolderOpen },
            { name: "Docs", href: "/docs", icon: BookOpen },
        ],
    },
]

/** Reachable from the rail's footer rather than a group, but still a page. */
export const SETTINGS_ITEM: NavItem = { name: "Settings", href: "/settings", icon: Settings }

export const ALL_NAV_ITEMS: NavItem[] = [
    ...NAV_GROUPS.flatMap((group) => group.items),
    SETTINGS_ITEM,
]

export function matchesRole(item: NavItem, activeRole: Role) {
    return !item.roles || item.roles.includes(activeRole)
}

export function isItemActive(pathname: string, href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

export function visibleGroups(activeRole: Role): NavGroup[] {
    return NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => matchesRole(item, activeRole)),
    })).filter((group) => group.items.length > 0)
}

/**
 * The page the topbar names. Pages no longer print their own title, so this
 * must resolve for every route — including Settings, which was absent from the
 * old lists and left the topbar blank.
 */
export function resolveNavItem(pathname: string, activeRole: Role): NavItem | null {
    const matches = ALL_NAV_ITEMS
        .filter((item) => matchesRole(item, activeRole))
        .filter((item) => isItemActive(pathname, item.href))
    // Longest href wins, so /test-data doesn't resolve to /tests' neighbour and
    // "/" only ever matches exactly.
    return matches.sort((a, b) => b.href.length - a.href.length)[0] ?? null
}
