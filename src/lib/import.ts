import Papa from 'papaparse'
import readXlsxFile from 'read-excel-file'
import { TestCase } from '@/store/useProjectStore'

export interface ParsedImportData {
    headers: string[]
    rows: Record<string, string>[]
    fileName: string
}

const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_IMPORT_ROWS = 5000

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

    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
        throw new Error('File is too large. Maximum supported size is 10MB.')
    }

    if (ext === 'csv') {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results: any) => {
                    if (results.data.length > MAX_IMPORT_ROWS) {
                        reject(new Error(`File has too many rows. Maximum supported rows is ${MAX_IMPORT_ROWS}.`))
                        return
                    }

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
    } else if (ext === 'xlsx') {
        const sheetRows = await readXlsxFile(file)

        if (sheetRows.length === 0) {
            return { headers: [], rows: [], fileName: file.name }
        }

        if (sheetRows.length - 1 > MAX_IMPORT_ROWS) {
            throw new Error(`File has too many rows. Maximum supported rows is ${MAX_IMPORT_ROWS}.`)
        }

        const [headerRow, ...dataRows] = sheetRows
        const headers = headerRow.map((cell, index) => {
            const header = String(cell ?? '').trim()
            return header || `Column ${index + 1}`
        })

        const rows = dataRows
            .filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''))
            .map(row => {
                const parsedRow: Record<string, string> = {}
                headers.forEach((header, index) => {
                    const cell = row[index]
                    parsedRow[header] = cell === null || cell === undefined ? '' : String(cell)
                })
                return parsedRow
            })

        return {
            headers,
            rows,
            fileName: file.name
        }
    } else if (ext === 'xls') {
        throw new Error('Legacy .xls files are no longer supported. Please resave as .xlsx or .csv.')
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
