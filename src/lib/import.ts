import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { TestCase } from '@/store/useProjectStore'

export interface ParsedImportData {
    headers: string[]
    rows: Record<string, string>[]
    fileName: string
}

export const TEST_CASE_IMPORT_FIELDS = [
    { field: '(Ignore)', display: '(Ignore)' },
    { field: 'title', display: 'Title' },
    { field: 'displayId', display: 'Test Case ID' },
    { field: 'preConditions', display: 'Pre-Conditions' },
    { field: 'testSteps', display: 'Test Steps' },
    { field: 'testData', display: 'Test Data' },
    { field: 'expectedResult', display: 'Expected Result' },
    { field: 'actualResult', display: 'Actual Result' },
    { field: 'status', display: 'Status' },
    { field: 'priority', display: 'Priority' },
    { field: 'sourceIssueId', display: 'Source Issue ID' }
]

const AUTO_MAP_ALIASES: Record<string, string[]> = {
    'title': ['Title', 'Name', 'Summary', 'Test Name', 'Test Case Name', 'Test Case', 'Subject'],
    'displayId': ['Test Case ID', 'Test ID', 'ID', 'TC ID', 'TestCaseId', 'Identifier', 'Key', 'Case ID', 'Ref', 'Number'],
    'preConditions': ['Pre-conditions', 'Preconditions', 'Pre Conditions', 'Setup', 'Prerequisites'],
    'testSteps': ['Test Steps', 'Steps', 'Steps to Reproduce', 'Actions', 'Test Actions', 'Action', 'Execution Steps'],
    'testData': ['Test Data', 'Data', 'Input Data', 'Test Input', 'Inputs'],
    'expectedResult': ['Expected Result', 'Expected', 'Expected Outcome', 'Expected Output', 'Pass Criteria', 'Expected Behaviour'],
    'actualResult': ['Actual Result', 'Actual', 'Actual Outcome', 'Actual Output'],
    'status': ['Status', 'Result', 'Test Result', 'Execution Status', 'Outcome', 'Run Status'],
    'priority': ['Priority', 'Severity', 'Importance', 'Level', 'Criticality'],
    'sourceIssueId': ['Source Issue ID', 'Issue ID', 'Issue Key', 'Linked Issue', 'Related Issue', 'Jira ID', 'Linear ID', 'Requirement']
}

export function autoDetectMappings(headers: string[]): Record<string, string> {
    const map: Record<string, string> = {}
    for (const header of headers) {
        const h = header.trim().toLowerCase()
        let matched = false
        for (const [field, aliases] of Object.entries(AUTO_MAP_ALIASES)) {
            if (aliases.some(a => a.toLowerCase() === h)) {
                map[header] = field
                matched = true
                break
            }
        }
        if (!matched) {
            map[header] = '(Ignore)'
        }
    }
    return map
}

export async function parseImportFile(file: File): Promise<ParsedImportData> {
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv') {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results: any) => {
                    resolve({
                        headers: results.meta.fields || [],
                        rows: results.data,
                        fileName: file.name
                    })
                },
                error: (error: any) => {
                    reject(error)
                }
            })
        })
    } else if (ext === 'xlsx' || ext === 'xls') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer)
                    const workbook = XLSX.read(data, { type: 'array' })

                    if (workbook.SheetNames.length === 0) {
                        reject(new Error("No sheets found in workbook"))
                        return
                    }

                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
                    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: "" })

                    if (rows.length === 0) {
                        resolve({ headers: [], rows: [], fileName: file.name })
                        return
                    }

                    const headers = Object.keys(rows[0])
                    const stringRows = rows.map(r => {
                        const strRow: Record<string, string> = {}
                        for (const key of headers) {
                            strRow[key] = String(r[key] !== undefined && r[key] !== null ? r[key] : "")
                        }
                        return strRow
                    })

                    resolve({
                        headers,
                        rows: stringRows,
                        fileName: file.name
                    })
                } catch (error) {
                    reject(error)
                }
            }
            reader.onerror = (error) => reject(error)
            reader.readAsArrayBuffer(file)
        })
    }

    throw new Error(`Unsupported file type: .${ext}. Please use .csv or .xlsx`)
}

export function prepareImportData(
    parsedData: ParsedImportData,
    mappings: Record<string, string>
): Partial<TestCase>[] {
    const result: Partial<TestCase>[] = []

    for (const row of parsedData.rows) {
        // Skip completely empty rows
        if (Object.values(row).every(v => !v || typeof v !== 'string' || !v.trim())) continue

        const tc: Partial<TestCase> = {}
        let hasValidData = false

        for (const [csvHeader, internalField] of Object.entries(mappings)) {
            if (internalField === '(Ignore)') continue

            const val = row[csvHeader]
            if (val && typeof val === 'string' && val.trim()) {
                (tc as any)[internalField] = val.trim()
                hasValidData = true
            }
        }

        if (hasValidData) {
            // Provide deafults for critical fields if missing
            if (!tc.title) tc.title = "Untitled Imported Task"
            if (!tc.status) tc.status = "not-run"
            result.push(tc)
        }
    }

    return result
}
