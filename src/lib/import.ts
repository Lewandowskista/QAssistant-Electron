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
    'displayId': ['Test Case ID', 'ID', 'TC ID', 'Key', 'TC_ID'],
    'preConditions': ['Pre-conditions', 'Preconditions', 'Setup', 'Prerequisites'],
    'testSteps': ['Test Steps', 'Steps', 'Action', 'Actions', 'Execution Steps'],
    'testData': ['Test Data', 'Data', 'Input Data'],
    'expectedResult': ['Expected Result', 'Expected', 'Expected Outcome'],
    'actualResult': ['Actual Result', 'Actual', 'Result'],
    'status': ['Status', 'State', 'Result Status'],
    'priority': ['Priority', 'Severity', 'Importance'],
    'sourceIssueId': ['Source Issue ID', 'Jira ID', 'Linear ID', 'Ticket ID', 'Issue Key']
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
            Papa.parse<Record<string, string>>(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve({
                        headers: results.meta.fields || [],
                        rows: results.data,
                        fileName: file.name
                    })
                },
                error: (error) => {
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
