export interface ElectronAPI {
    // Project & Store
    secureStoreGet: (key: string) => Promise<string | null>;
    secureStoreSet: (key: string, value: string) => Promise<void>;
    
    // SAP HAC
    sapHacLogin: (baseUrl: string, user: string, pass: string, force: boolean) => Promise<any>;
    sapHacGetCronJobs: (baseUrl: string) => Promise<any>;
    sapHacFlexibleSearch: (baseUrl: string, query: string, maxResults: number) => Promise<any>;
    sapHacImportImpEx: (baseUrl: string, script: string, enableCode: boolean) => Promise<any>;
    sapHacGetCatalogIds: (baseUrl: string) => Promise<any>;
    sapHacGetCatalogSyncDiff: (baseUrl: string, catalogId: string, limit: number) => Promise<any>;
    
    // SAP CCv2
    ccv2GetEnvironments: (params: { subscriptionCode: string, apiToken: string }) => Promise<any>;
    ccv2GetDeployments: (params: { subscriptionCode: string, apiToken: string, environmentCode: string }) => Promise<any>;
    ccv2GetBuild: (params: { subscriptionCode: string, apiToken: string, buildCode: string }) => Promise<any>;
    
    // External Services (Linear, Jira, Gemini)
    getLinearComments: (params: any) => Promise<any>;
    getJiraComments: (params: any) => Promise<any>;
    getLinearHistory: (params: any) => Promise<any>;
    getJiraHistory: (params: any) => Promise<any>;
    createLinearIssue: (params: any) => Promise<string | null>;
    createJiraIssue: (params: any) => Promise<string | null>;
    syncLinear: (params: any) => Promise<any>;
    syncJira: (params: any) => Promise<any>;
    getLinearWorkflowStates: (params: any) => Promise<any>;
    updateLinearStatus: (params: any) => Promise<any>;
    transitionJiraIssue: (params: any) => Promise<any>;
    addLinearComment: (params: any) => Promise<any>;
    addJiraComment: (params: any) => Promise<any>;
    
    // AI
    aiAnalyzeIssue: (params: any) => Promise<string>;
    generateBugReportTask: (params: any) => Promise<any>;
    
    // OS Utils
    openUrl: (url: string) => void;
    openFile: (path: string) => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
