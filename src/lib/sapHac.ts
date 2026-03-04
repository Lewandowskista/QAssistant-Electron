// shared types for SAP HAC feature used in renderer

export type CronJobEntry = {
    Code: string;
    Status: string;
    LastResult: string;
    NextActivationTime: string;
    TriggerActive: string;
};

export type FlexibleSearchResult = {
    Headers: string[];
    Rows: string[][];
    Error: string;
};

export type ImpExResult = {
    Success: boolean;
    Log: string;
};
