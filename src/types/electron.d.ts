import { Project, TestCase, Task, Attachment } from './project';

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
    readCsvFile: (args: { filePath: string }) => Promise<any>;
    saveFileDialog: (args: { defaultName: string; content: string } | string) => Promise<{ success: boolean; path?: string; error?: string }>;

    // AI / Gemini
    aiGenerateCases: (args: any) => Promise<TestCase[]>;
    aiListModels: (args: { apiKey: string }) => Promise<any>;
    aiAnalyzeIssue: (args: any) => Promise<string>;
    aiAnalyze: (args: any) => Promise<string>;
    aiCriticality: (args: any) => Promise<string>;
    aiTestRunSuggestions: (args: any) => Promise<string>;
    aiSmokeSubset: (args: any) => Promise<string[]>;

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
    ccv2GetEnvironments: (args: any) => Promise<any>;
    ccv2GetDeployments: (args: any) => Promise<any>;
    ccv2GetBuild: (args: any) => Promise<any>;
    sapHacLogin: (baseUrl: string, user: string, pass: string, ignoreSsl?: boolean) => Promise<{ success: boolean; error?: string }>;
    sapHacGetCronJobs: (baseUrl: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    sapHacFlexibleSearch: (baseUrl: string, query: string, max?: number) => Promise<{ success: boolean; result?: any; error?: string }>;
    sapHacImportImpEx: (baseUrl: string, script: string, enableCode?: boolean) => Promise<{ success: boolean; result?: any; error?: string }>;
    sapHacGetCatalogVersions: (baseUrl: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
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
