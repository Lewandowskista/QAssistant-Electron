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
    readJsonFile: (args: { filePath: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
    
    // Credentials
    secureStoreSet: (key: string, value: string) => Promise<{ success: boolean; error?: string }>;
    secureStoreGet: (key: string) => Promise<string | null>;
    secureStoreDelete: (key: string) => Promise<{ success: boolean; error?: string }>;
    secureStoreList: () => Promise<any[]>;

    // File operations
    selectFile: () => Promise<string | null>;
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
    sapHacRequest: (opts: any) => Promise<{ success: boolean; status?: number; body?: string; error?: string }>;

    // Automation API
    automationApiStart: (args: any) => Promise<any>;
    automationApiStop: () => Promise<any>;
    automationApiRestart: (args: any) => Promise<any>;
    automationApiStatus: () => Promise<any>;

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
    githubCheckScope: () => Promise<{ hasRepoScope: boolean; scopes: string } | { __isError: boolean; message: string }>;
    githubGetRepos: (args?: { forceRefresh?: boolean }) => Promise<GitHubRepo[] | { __isError: boolean; message: string }>;
    githubGetPullRequests: (args: { owner: string; repo: string; state?: string; forceRefresh?: boolean }) => Promise<GitHubPullRequest[] | { __isError: boolean; message: string }>;
    githubGetPrDetail: (args: { owner: string; repo: string; prNumber: number }) => Promise<GitHubPrDetail | { __isError: boolean; message: string }>;
    githubGetPrReviews: (args: { owner: string; repo: string; prNumber: number }) => Promise<GitHubReview[] | { __isError: boolean; message: string }>;
    githubGetPrCheckStatus: (args: { owner: string; repo: string; ref: string }) => Promise<string | null | { __isError: boolean; message: string }>;
    githubGetCommits: (args: { owner: string; repo: string; branch?: string; forceRefresh?: boolean }) => Promise<GitHubCommit[] | { __isError: boolean; message: string }>;
    githubGetBranches: (args: { owner: string; repo: string; forceRefresh?: boolean }) => Promise<{ name: string; sha: string }[] | { __isError: boolean; message: string }>;
    githubGetReviewRequests: (args?: { forceRefresh?: boolean }) => Promise<GitHubSearchItem[] | { __isError: boolean; message: string }>;
    githubGetMyOpenPrs: (args?: { forceRefresh?: boolean }) => Promise<GitHubSearchItem[] | { __isError: boolean; message: string }>;
    githubGetWorkflowRuns: (args: { owner: string; repo: string; forceRefresh?: boolean }) => Promise<GitHubWorkflowRun[] | { __isError: boolean; message: string }>;
    githubGetDeployments: (args: { owner: string; repo: string; forceRefresh?: boolean }) => Promise<GitHubDeployment[] | { __isError: boolean; message: string }>;
    githubRerunWorkflow: (args: { owner: string; repo: string; runId: number }) => Promise<{ success: boolean } | { __isError: boolean; message: string }>;
    githubGetPrComments: (args: { owner: string; repo: string; prNumber: number }) => Promise<GitHubComment[] | { __isError: boolean; message: string }>;
    githubGetWorkflowJobs: (args: { owner: string; repo: string; runId: number }) => Promise<GitHubWorkflowJob[] | { __isError: boolean; message: string }>;
    githubGetWorkflowsList: (args: { owner: string; repo: string }) => Promise<GitHubWorkflow[] | { __isError: boolean; message: string }>;
    githubDispatchWorkflow: (args: { owner: string; repo: string; workflowId: number; ref: string }) => Promise<{ success: boolean } | { __isError: boolean; message: string }>;

    // Report Builder (M1)
    generateCustomReport: (args: { project: any; template: any }) => Promise<{ success: boolean; html?: string; error?: string }>;
    exportCustomReportPdf: (args: { project: any; template: any }) => Promise<{ success: boolean; path?: string; error?: string }>;

    // AI Accuracy Testing
    readDocumentText: (args: { filePath: string }) => Promise<{ success: boolean; text?: string; chunkCount?: number; error?: string }>;
    aiAccuracyExtractClaims: (args: { apiKey: string; agentResponse: string; modelName?: string }) => Promise<Array<{ claimText: string; claimType: string }>>;
    aiAccuracyVerifyClaims: (args: { apiKey: string; claims: Array<{ claimText: string; claimType: string }>; refChunks: Array<{ id: string; content: string }>; modelName?: string }) => Promise<Array<{ claimIndex: number; verdict: string; confidence: number; sourceChunkIds: string[]; reasoning: string }>>;
    aiAccuracyScoreDimensions: (args: { apiKey: string; question: string; agentResponse: string; claimVerdicts: Array<{ claimText: string; verdict: string; reasoning: string }>; refChunks: Array<{ id: string; content: string }>; modelName?: string }) => Promise<{ factualAccuracy: { score: number; confidence: number; reasoning: string }; completeness: { score: number; confidence: number; reasoning: string }; faithfulness: { score: number; confidence: number; reasoning: string }; relevance: { score: number; confidence: number; reasoning: string } }>;

    // System
    showNotification: (title: string, body: string) => void;
    setAlwaysOnTop: (flag: boolean) => void;
    getAppVersion: () => Promise<string>;
    getSystemInfo: () => Promise<{ platform: string; arch: string; nodeVersion: string; electronVersion: string; appVersion: string }>;
    isMinimizedToTray: () => Promise<boolean>;
    appQuit: () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
