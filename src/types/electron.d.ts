import { Project, TestCase, Attachment } from './project';
import { UserProfile } from './user';
import { GitHubRepo, GitHubPullRequest, GitHubPrDetail, GitHubCommit, GitHubReview, GitHubWorkflowRun, GitHubDeployment, GitHubSearchItem, GitHubComment, GitHubWorkflowJob, GitHubWorkflow } from './github';
import { AiAnalyzeIssueRequest, AiAnalyzeProjectRequest, AiChatRequest, AiCriticalityRequest, AiGenerateCasesRequest, AiSmokeSubsetRequest, AiTestRunSuggestionsRequest } from './ai';
import { CronJobEntry, FlexibleSearchResult, ImpExResult } from '@/lib/sapHac';

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

export interface ElectronAPI {
    // Window controls
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    onMaximizedStatus: (callback: (status: boolean) => void) => () => void;
    
    // Shortcuts / Events
    onCommandPalette: (callback: () => void) => () => void;
    onAddTask: (callback: () => void) => () => void;
    onOpenSettings: (callback: () => void) => () => void;

    // Data persistence
    getAppDataPath: () => Promise<string>;
    readProjectsFile: () => Promise<Project[]>;
    writeProjectsFile: (data: Project[]) => Promise<{ success: boolean; error?: string }>;
    readSettingsFile: () => Promise<any>;
    writeSettingsFile: (data: any) => Promise<{ success: boolean; error?: string }>;
    readJsonFile: (args: { filePath: string } | string) => Promise<{ success: boolean; data?: any; error?: string }>;
    
    // Credentials
    getCredentialStorageStatus: () => Promise<{ mode: 'keychain' | 'safeStorage' | 'plaintext'; encrypted: boolean }>;
    scanOrphanedAttachments: (referencedPaths: string[]) => Promise<{ orphaned: { filePath: string; fileName: string; fileSizeBytes: number }[]; totalSize: number }>;
    deleteOrphanedAttachments: (filePaths: string[]) => Promise<{ deleted: number }>;
    secureStoreSet: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
    secureStoreGet: (key: string) => Promise<string | null>;
    secureStoreDelete: (key: string) => Promise<{ success: boolean; error?: string }>;
    secureStoreList: () => Promise<any[]>;

    // File operations
    selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
    openUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
    openFile: (args: { filePath: string } | string) => Promise<void>;
    copyToAttachments: (sourcePath: string) => Promise<{ success: boolean; attachment?: Attachment; error?: string }>;
    saveBytesAttachment: (bytes: Uint8Array, fileName: string) => Promise<{ success: boolean; attachment?: Attachment; error?: string }>;
    deleteAttachment: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    readAttachmentPreview: (args: { filePath: string } | string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
    readCsvFile: (args: { filePath: string }) => Promise<any>;
    saveFileDialog: (args: { defaultName: string; content: string } | string) => Promise<{ success: boolean; path?: string; error?: string }>;

    // AI / Gemini
    aiGenerateCases: (args: AiGenerateCasesRequest) => Promise<TestCase[]>;
    aiListModels: (args: { apiKey: string }) => Promise<any>;
    aiAnalyzeIssue: (args: AiAnalyzeIssueRequest) => Promise<string>;
    aiAnalyze: (args: AiAnalyzeProjectRequest) => Promise<string>;
    aiCriticality: (args: AiCriticalityRequest) => Promise<string>;
    aiTestRunSuggestions: (args: AiTestRunSuggestionsRequest) => Promise<string>;
    aiSmokeSubset: (args: AiSmokeSubsetRequest) => Promise<string[]>;
    aiChat: (args: AiChatRequest) => Promise<string>;

    // Integrations (Linear)
    syncLinear: (args: any) => Promise<any>;
    getLinearComments: (args: any) => Promise<any[]>;
    addLinearComment: (args: any) => Promise<{ success: boolean }>;
    getLinearWorkflowStates: (args: any) => Promise<any[]>;
    updateLinearStatus: (args: any) => Promise<{ success: boolean }>;
    getLinearHistory: (args: any) => Promise<any[]>;
    createLinearIssue: (args: any) => Promise<string | null>;
    testLinearConnection: (args: any) => Promise<{ success: boolean; error?: string }>;

    // Integrations (Jira)
    syncJira: (args: any) => Promise<any>;
    getJiraComments: (args: any) => Promise<any[]>;
    addJiraComment: (args: any) => Promise<{ success: boolean }>;
    transitionJiraIssue: (args: any) => Promise<{ success: boolean }>;
    getJiraHistory: (args: any) => Promise<any[]>;
    getJiraStatuses: (args: any) => Promise<any[]>;
    createJiraIssue: (args: any) => Promise<string | null>;
    testJiraConnection: (args: any) => Promise<{ success: boolean; error?: string }>;

    // SAP
    ccv2GetEnvironments: (args: any) => Promise<any[]>;
    ccv2GetDeployments: (args: any) => Promise<any[]>;
    ccv2GetBuild: (args: any) => Promise<any | null>;
    sapHacLogin: (baseUrl: string, user: string, pass: string, ignoreSsl?: boolean) => Promise<{ success: boolean; error?: string }>;
    sapHacGetCronJobs: (baseUrl: string) => Promise<ApiResponse<CronJobEntry[]>>;
    sapHacFlexibleSearch: (baseUrl: string, query: string, max?: number) => Promise<ApiResponse<FlexibleSearchResult>>;
    sapHacImportImpEx: (baseUrl: string, script: string, enableCode?: boolean) => Promise<ApiResponse<ImpExResult>>;
    sapHacGetCatalogVersions: (baseUrl: string) => Promise<ApiResponse<any[]>>;
    sapHacGetCatalogIds: (baseUrl: string) => Promise<{ success: boolean; data?: string[]; error?: string }>;
    sapHacGetCatalogSyncDiff: (baseUrl: string, catalogId: string, maxMissing?: number) => Promise<{ success: boolean; data?: any; error?: string }>;

    // Automation API
    automationApiStart: (args: { apiKey: string; port?: number }) => Promise<any>;
    automationApiStop: () => Promise<any>;
    automationApiRestart: (args: { apiKey: string; port?: number }) => Promise<any>;
    automationApiStatus: () => Promise<{ running: boolean; port: number | null }>;

    // Bug Reporting
    generateBugReportTask: (args: any) => Promise<any>;
    generateBugReportTestcase: (args: any) => Promise<any>;

    // Health
    checkEnvironmentsHealth: (environments: any[]) => Promise<any>;
    startHealthService: (environments: any[], intervalMs?: number) => Promise<void>;
    stopHealthService: () => Promise<void>;

    // User profile
    readUserProfile: () => Promise<UserProfile | null>;
    writeUserProfile: (data: UserProfile) => Promise<boolean>;

    // OAuth
    oauthStart: (provider: string) => Promise<{ success: boolean; error?: string }>;
    oauthLogout: (provider: string) => Promise<{ success: boolean; error?: string }>;
    oauthGetStatus: (provider: string) => Promise<{ connected: boolean }>;
    onOAuthComplete: (callback: (data: { provider: string; userInfo: any }) => void) => () => void;

    // GitHub Integration
    githubCheckScope: () => Promise<{ hasRepoScope: boolean; scopes: string }>;
    githubGetRepos: (args?: { forceRefresh?: boolean }) => Promise<GitHubRepo[]>;
    githubGetPullRequests: (args: { owner: string; repo: string; state?: string; forceRefresh?: boolean }) => Promise<GitHubPullRequest[]>;
    githubGetPrDetail: (args: { owner: string; repo: string; prNumber: number }) => Promise<GitHubPrDetail>;
    githubGetPrReviews: (args: { owner: string; repo: string; prNumber: number }) => Promise<GitHubReview[]>;
    githubGetPrCheckStatus: (args: { owner: string; repo: string; ref: string }) => Promise<string | null>;
    githubGetCommits: (args: { owner: string; repo: string; branch?: string; forceRefresh?: boolean }) => Promise<GitHubCommit[]>;
    githubGetBranches: (args: { owner: string; repo: string; forceRefresh?: boolean }) => Promise<{ name: string; sha: string }[]>;
    githubGetReviewRequests: (args?: { forceRefresh?: boolean }) => Promise<GitHubSearchItem[]>;
    githubGetMyOpenPrs: (args?: { forceRefresh?: boolean }) => Promise<GitHubSearchItem[]>;
    githubGetWorkflowRuns: (args: { owner: string; repo: string; forceRefresh?: boolean }) => Promise<GitHubWorkflowRun[]>;
    githubGetDeployments: (args: { owner: string; repo: string; forceRefresh?: boolean }) => Promise<GitHubDeployment[]>;
    githubRerunWorkflow: (args: { owner: string; repo: string; runId: number }) => Promise<{ success: boolean }>;
    githubGetPrComments: (args: { owner: string; repo: string; prNumber: number }) => Promise<GitHubComment[]>;
    githubGetWorkflowJobs: (args: { owner: string; repo: string; runId: number }) => Promise<GitHubWorkflowJob[]>;
    githubGetWorkflowsList: (args: { owner: string; repo: string }) => Promise<GitHubWorkflow[]>;
    githubDispatchWorkflow: (args: { owner: string; repo: string; workflowId: number; ref: string }) => Promise<{ success: boolean }>;

    // Reports / exports
    generateTestSummaryMarkdown: (project: any, filterPlanIds?: string[], aiResult?: string) => Promise<string>;
    generateTestCasesCsv: (project: any) => Promise<string>;
    generateExecutionsCsv: (project: any) => Promise<string>;
    exportTestSummaryPdf: (project: any, filterPlanIds?: string[], aiResult?: string) => Promise<{ success: boolean; path?: string; error?: string }>;

    // Report Builder (M1)
    generateCustomReport: (args: { project: any; template: any }) => Promise<{ success: boolean; html?: string; error?: string }>;
    exportCustomReportPdf: (args: { project: any; template: any }) => Promise<{ success: boolean; path?: string; error?: string }>;

    // AI Accuracy Testing
    readDocumentText: (args: { filePath: string }) => Promise<{ success: boolean; text?: string; chunkCount?: number; error?: string }>;
    aiAccuracyExtractClaims: (args: { apiKey: string; agentResponse: string; modelName?: string; expectedAnswer?: string }) => Promise<Array<{ claimText: string; claimType: string }>>;
    aiAccuracyVerifyClaims: (args: { apiKey: string; claims: Array<{ claimText: string; claimType: string }>; refChunks: Array<{ id: string; content: string }>; modelName?: string; expectedAnswer?: string }) => Promise<Array<{ claimIndex: number; verdict: string; confidence: number; sourceChunkIds: string[]; reasoning: string }>>;
    aiAccuracyScoreDimensions: (args: { apiKey: string; question: string; agentResponse: string; expectedAnswer?: string; claimVerdicts: Array<{ claimText: string; verdict: string; reasoning: string }>; refChunks: Array<{ id: string; content: string }>; modelName?: string }) => Promise<{ factualAccuracy: { score: number; confidence: number; reasoning: string }; completeness: { score: number; confidence: number; reasoning: string }; faithfulness: { score: number; confidence: number; reasoning: string }; relevance: { score: number; confidence: number; reasoning: string } }>;
    aiAccuracyRerankChunks: (args: { apiKey: string; question: string; agentResponse: string; chunks: Array<{ id: string; content: string }>; topK?: number; modelName?: string }) => Promise<string[]>;

    // System
    showNotification: (title: string, body: string) => void;
    setAlwaysOnTop: (flag: boolean) => void;
    getAppVersion: () => Promise<string>;
    getSystemInfo: () => Promise<{ platform: string; arch: string; nodeVersion: string; electronVersion: string; appVersion: string }>;
    isMinimizedToTray: () => Promise<boolean>;
    appQuit: () => void;

    // Cloud Sync (Phase 2)
    syncGetConfig: () => Promise<{ configured: boolean; url?: string; workspaceId?: string; userId?: string; email?: string; displayName?: string }>;
    syncGetStatus: () => Promise<{ status: string; workspaceId: string | null; userId: string | null; error: string | null; pendingCount: number }>;
    syncInit: () => Promise<{ ok: boolean; status: string }>;
    syncCreateWorkspace: (args: { supabaseUrl: string; supabaseAnonKey: string; userEmail: string; userPassword: string; workspaceName: string; displayName: string }) => Promise<{ ok: boolean; workspaceId?: string; inviteCode?: string; error?: string }>;
    syncJoinWorkspace: (args: { supabaseUrl: string; supabaseAnonKey: string; userEmail: string; userPassword: string; inviteCode: string; displayName: string }) => Promise<{ ok: boolean; workspaceId?: string; workspaceName?: string; error?: string }>;
    syncDisconnect: () => Promise<{ ok: boolean; error?: string }>;
    syncGetWorkspaceInfo: () => Promise<{ workspaceId: string | null; workspaceName?: string; inviteCode?: string; members?: Array<{ user_id: string; email: string; display_name: string; role: string }> }>;
    syncManual: () => Promise<{ ok: boolean; error?: string }>;
    onSyncStatusChanged: (callback: (status: { status: string; workspaceId: string | null; userId: string | null; error: string | null; pendingCount: number; lastSyncedAt: number | null }) => void) => () => void;
    onSyncDataUpdated: (callback: (data: { table?: string; id?: string } | null) => void) => () => void;
    syncPushTaskCollab: (args: { projectId: string; taskId: string; collabState: string; activeHandoffId?: string | null; updatedAt?: number }) => Promise<{ ok: boolean; error?: string }>;
    syncPushHandoff: (args: { projectId: string; handoff: any }) => Promise<{ ok: boolean; error?: string }>;
    syncPushCollabEvent: (args: { projectId: string; event: any }) => Promise<{ ok: boolean; error?: string }>;
    syncPushArtifactLink: (args: { projectId: string; link: any }) => Promise<{ ok: boolean; error?: string }>;
    getTaskById: (taskId: string) => Promise<any | null>;
    getHandoffById: (handoffId: string) => Promise<any | null>;
    onSyncConflictDetected: (callback: (data: { table: string; id: string }) => void) => () => void;
    onSyncMutationFailed: (callback: (data: { message: string }) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
