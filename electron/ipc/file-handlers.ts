import type Electron from 'electron'

export function registerFileHandlers(ipcMain: Electron.IpcMain, deps: {
    isValidExternalUrl: (url: string) => boolean
    isPathWithin: (target: string, base: string) => boolean
    saveFile: (sourcePath: string) => Promise<any>
    saveBytes: (bytes: Uint8Array, fileName: string) => Promise<any>
    deleteFile: (filePath: string) => Promise<boolean>
    report: any
    reportBuilder: any
    bugReport: any
    getMainWindow: () => any
    dialog: any
    BrowserWindow: any
    shell: any
    ATTACHMENTS_DIR: string
    APP_DATA_DIR: string
    fsp: typeof import('node:fs/promises')
    fs: typeof import('node:fs')
    path: typeof import('node:path')
    assertString: (v: unknown, name: string, maxLen?: number) => void
    assertObject: (v: unknown, name: string) => void
    assertArray: (v: unknown, name: string, maxLen?: number) => void
    errMsg: (err: unknown) => string
}): void {
    ipcMain.handle('select-file', async (_e: any, filters?: Electron.FileFilter[]) => {
        const mainWindow = deps.getMainWindow();
        if (!mainWindow) return null;
        const res = await deps.dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            ...(filters && filters.length > 0 ? { filters } : {})
        });
        return res.canceled ? null : res.filePaths[0];
    });
    ipcMain.handle('open-url', async (_e: any, url: any) => {
        try {
            if (deps.isValidExternalUrl(url)) {
                await deps.shell.openExternal(url);
                return { success: true };
            } else {
                return { success: false, error: 'Invalid URL protocol' };
            }
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // File/Attachment Management
    ipcMain.handle('copy-to-attachments', async (_e: any, sourcePath: string) => {
        // We allow copying FROM anywhere (user selects file), but we validate destination in saveFile
        return await deps.saveFile(sourcePath);
    });
    ipcMain.handle('save-bytes-attachment', async (_e: any, { bytes, fileName }: any) => await deps.saveBytes(bytes, fileName));
    ipcMain.handle('delete-attachment', async (_e: any, payload: any) => {
        const filePath = typeof payload === 'string' ? payload : payload?.filePath;
        if (typeof filePath !== 'string') return { success: false, error: 'Invalid file path' };
        if (deps.isPathWithin(filePath, deps.ATTACHMENTS_DIR)) {
            const success = await deps.deleteFile(filePath);
            return success ? { success: true } : { success: false, error: 'Delete failed' };
        }
        console.warn('Blocked attempt to delete file outside attachments:', filePath);
        return { success: false, error: 'Access denied' };
    });
    ipcMain.handle('read-attachment-preview', async (_e: any, payload: any) => {
        const filePath = typeof payload === 'string' ? payload : payload?.filePath;
        if (typeof filePath !== 'string') return { success: false, error: 'Invalid file path' };
        if (!deps.isPathWithin(filePath, deps.ATTACHMENTS_DIR)) {
            console.warn('Blocked attempt to read attachment preview outside attachments:', filePath);
            return { success: false, error: 'Access denied' };
        }

        try {
            if (!deps.fs.existsSync(filePath)) {
                return { success: false, error: 'File not found' };
            }

            const buffer = await deps.fsp.readFile(filePath);
            const ext = deps.path.extname(filePath).toLowerCase();
            let mimeType = 'application/octet-stream';
            switch (ext) {
                case '.png': mimeType = 'image/png'; break;
                case '.jpg':
                case '.jpeg': mimeType = 'image/jpeg'; break;
                case '.gif': mimeType = 'image/gif'; break;
                case '.bmp': mimeType = 'image/bmp'; break;
                case '.webp': mimeType = 'image/webp'; break;
                case '.svg': mimeType = 'image/svg+xml'; break;
            }

            return {
                success: true,
                dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    // Attachment cleanup
    ipcMain.handle('scan-orphaned-attachments', async (_e: any, { referencedPaths }: { referencedPaths: string[] }) => {
        try {
            if (!deps.fs.existsSync(deps.ATTACHMENTS_DIR)) return { orphaned: [], totalSize: 0 };
            const referenced = new Set(referencedPaths.map(p => deps.path.normalize(p)));
            const files = await deps.fsp.readdir(deps.ATTACHMENTS_DIR);
            const orphaned: { filePath: string; fileName: string; fileSizeBytes: number }[] = [];
            let totalSize = 0;
            for (const file of files) {
                const filePath = deps.path.join(deps.ATTACHMENTS_DIR, file);
                const stat = await deps.fsp.stat(filePath).catch(() => null);
                if (!stat || !stat.isFile()) continue;
                if (!referenced.has(deps.path.normalize(filePath))) {
                    orphaned.push({ filePath, fileName: file, fileSizeBytes: stat.size });
                    totalSize += stat.size;
                }
            }
            return { orphaned, totalSize };
        } catch (e: unknown) {
            return { __isError: true, message: deps.errMsg(e) };
        }
    });
    ipcMain.handle('delete-orphaned-attachments', async (_e: any, { filePaths }: { filePaths: string[] }) => {
        let deleted = 0;
        for (const filePath of filePaths) {
            if (!deps.isPathWithin(filePath, deps.ATTACHMENTS_DIR)) continue;
            const success = await deps.deleteFile(filePath);
            if (success) deleted++;
        }
        return { deleted };
    });

    // Bug Reporting
    ipcMain.handle('generate-bug-report-task', async (_e: any, { task, environment, reporter, aiAnalysis }: any) => {
        const md = deps.bugReport.generateBugReportFromTask(task, environment, reporter, aiAnalysis);
        const fileName = `BugReport_Task_${Date.now()}.md`;
        return await deps.saveBytes(new TextEncoder().encode(md), fileName);
    });
    ipcMain.handle('generate-bug-report-testcase', async (_e: any, { tc, testPlanName, environment, reporter, executions, aiAnalysis }: any) => {
        const md = deps.bugReport.generateBugReportFromTestCase(tc, testPlanName, environment, reporter, executions, aiAnalysis);
        const fileName = `BugReport_TC_${Date.now()}.md`;
        return await deps.saveBytes(new TextEncoder().encode(md), fileName);
    });

    ipcMain.handle('read-json-file', async (_e: any, { filePath }: any) => {
        try {
            if (!deps.isPathWithin(filePath, deps.APP_DATA_DIR) && !deps.isPathWithin(filePath, deps.ATTACHMENTS_DIR)) {
                return { success: false, error: 'Access denied: Path outside application data directory' };
            }
            const content = await deps.fsp.readFile(filePath, 'utf8');
            return { success: true, data: JSON.parse(content) };
        }
        catch (e: any) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('open-file', (_e: any, { filePath }: any) => {
        if (deps.fs.existsSync(filePath)) {
            if (!deps.isPathWithin(filePath, deps.APP_DATA_DIR) && !deps.isPathWithin(filePath, deps.ATTACHMENTS_DIR)) {
                console.warn('Blocked attempt to open file outside app data:', filePath);
                return;
            }
            deps.shell.openPath(filePath);
        }
    });

    // Report Handlers
    ipcMain.handle('generate-test-cases-csv', (_e: any, { project: p }: any) => deps.report.generateTestCasesCsv(p));
    ipcMain.handle('generate-executions-csv', (_e: any, { project: p }: any) => deps.report.generateExecutionsCsv(p));
    ipcMain.handle('generate-test-summary-markdown', (_e: any, { project: p, filterPlanIds, aiResult }: any) => deps.report.generateTestSummaryMarkdown(p, filterPlanIds, aiResult));
    ipcMain.handle('export-test-summary-pdf', async (_e: any, { project: p, filterPlanIds, aiResult }: any) => {
        const mainWindow = deps.getMainWindow();
        if (!mainWindow) return { success: false, error: 'No main window' };
        const html = deps.report.generateTestSummaryHtml(p, filterPlanIds, aiResult);
        const res = await deps.dialog.showSaveDialog(mainWindow, { defaultPath: `${p.name.replace(/\s+/g, '-')}-test-summary.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
        if (res.canceled) return { success: false };
        const printWindow = new deps.BrowserWindow({ show: false });
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const data = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
        await deps.fsp.writeFile(res.filePath!, data);
        printWindow.close();
        return { success: true, path: res.filePath };
    });

    // Report Builder Handlers (M1: Custom Report Templates)
    ipcMain.handle('generate-custom-report', async (_e: any, { project: p, template }: any) => {
        try {
            deps.assertObject(p, 'project');
            deps.assertObject(template, 'template');
            deps.assertString(template.name as string, 'template.name', 500);
            deps.assertArray(template.sections, 'template.sections', 100);
            const html = deps.reportBuilder.generateCustomReport(p as any, template as any);
            return { success: true, html };
        } catch (err: any) {
            return { success: false, error: deps.errMsg(err) };
        }
    });

    ipcMain.handle('export-custom-report-pdf', async (_e: any, { project: p, template }: any) => {
        try {
            const mainWindow = deps.getMainWindow();
            if (!mainWindow) return { success: false, error: 'No main window' };
            deps.assertObject(p, 'project');
            deps.assertObject(template, 'template');
            deps.assertString(template.name as string, 'template.name', 500);
            deps.assertArray(template.sections, 'template.sections', 100);
            const html = deps.reportBuilder.generateCustomReport(p as any, template as any);
            const res = await deps.dialog.showSaveDialog(mainWindow, {
                defaultPath: `${(p.name as string).replace(/\s+/g, '-')}-${(template.name as string).replace(/\s+/g, '-')}.pdf`,
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });
            if (res.canceled) return { success: false };
            const printWindow = new deps.BrowserWindow({ show: false });
            await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
            const data = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
            await deps.fsp.writeFile(res.filePath!, data);
            printWindow.close();
            return { success: true, path: res.filePath };
        } catch (err: any) {
            return { success: false, error: deps.errMsg(err) };
        }
    });

    // File/CSV Handlers
    ipcMain.handle('read-csv-file', async (_e: any, { filePath }: any) => {
        try {
            deps.assertString(filePath, 'filePath', 1000);
            const resolvedPath = deps.path.resolve(filePath);
            const ext = deps.path.extname(resolvedPath).toLowerCase();
            const ALLOWED_EXTENSIONS = ['.csv', '.txt', '.tsv'];
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                return { success: false, error: `File type '${ext}' is not allowed. Only CSV/TXT/TSV files may be imported.` };
            }
            const content = deps.fs.readFileSync(resolvedPath, 'utf8');
            // If it looks like a design doc (not strictly CSV), just return the raw string
            if (!content.includes(',') && content.split('\n').length > 5) return content;
            const { headers, rows } = deps.report.parseCsvString(content);
            const mappings = deps.report.autoDetectCsvMappings(headers);
            return { success: true, headers, rows, mappings, content }; // return content too for design doc legacy
        } catch (e: any) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('save-file-dialog', async (_e: any, { defaultName, content }: any) => {
        const mainWindow = deps.getMainWindow();
        if (!mainWindow) return { success: false };
        const res = await deps.dialog.showSaveDialog(mainWindow, { defaultPath: defaultName });
        if (res.canceled) return { success: false };
        if (!res.filePath) return { success: false, error: 'No file path selected.' };
        await deps.fsp.writeFile(res.filePath, content);
        return { success: true, path: res.filePath };
    });

    ipcMain.handle('import-test-results', async (_e: any, { filePath }: any) => {
        try {
            deps.assertString(filePath, 'filePath', 2000);
            const resolvedPath = deps.path.resolve(filePath);
            const ext = deps.path.extname(resolvedPath).toLowerCase();
            if (!['.xml', '.json'].includes(ext)) {
                return { success: false, error: `Unsupported file type '${ext}'. Use JUnit XML (.xml) or Playwright JSON (.json).` };
            }
            const content = await deps.fsp.readFile(resolvedPath, 'utf8');

            if (ext === '.xml') {
                // Parse JUnit XML — minimal regex-based parser (no dependencies)
                const suites: any[] = [];
                const suiteRe = /<testsuite([^>]*)>([\s\S]*?)<\/testsuite>/g;
                const caseRe = /<testcase([^>]*)>([\s\S]*?)<\/testcase>|<testcase([^>]*)\/>/g;
                const attrRe = /(\w+)="([^"]*)"/g;

                const parseAttrs = (str: string) => {
                    const attrs: Record<string, string> = {};
                    let m;
                    while ((m = attrRe.exec(str)) !== null) attrs[m[1]] = m[2];
                    attrRe.lastIndex = 0;
                    return attrs;
                };

                let sm;
                while ((sm = suiteRe.exec(content)) !== null) {
                    const suiteAttrs = parseAttrs(sm[1]);
                    const body = sm[2];
                    const cases: any[] = [];
                    let cm;
                    while ((cm = caseRe.exec(body)) !== null) {
                        const cAttrs = parseAttrs(cm[1] || cm[3] || '');
                        const cBody = cm[2] || '';
                        let result: string = 'passed';
                        let failureMsg = '';
                        if (/<failure/i.test(cBody)) { result = 'failed'; const fm = cBody.match(/<failure[^>]*>([\s\S]*?)<\/failure>/i); failureMsg = fm ? fm[1].trim().substring(0, 500) : ''; }
                        else if (/<error/i.test(cBody)) { result = 'failed'; const em = cBody.match(/<error[^>]*>([\s\S]*?)<\/error>/i); failureMsg = em ? em[1].trim().substring(0, 500) : ''; }
                        else if (/<skipped/i.test(cBody)) result = 'skipped';
                        const durationSeconds = cAttrs.time ? parseFloat(cAttrs.time) : undefined;
                        cases.push({ externalId: cAttrs.classname ? `${cAttrs.classname}.${cAttrs.name}` : cAttrs.name, title: cAttrs.name || 'Unnamed', result, actualResult: failureMsg, durationSeconds });
                    }
                    suites.push({ name: suiteAttrs.name || 'Imported Suite', cases });
                }
                return { success: true, format: 'junit', suites };
            } else {
                // Parse Playwright JSON report
                let pw: any;
                try { pw = JSON.parse(content); } catch { return { success: false, error: 'Invalid JSON file.' }; }
                // Playwright report has: { suites: [{ title, specs: [{ title, tests: [{ results: [{ status, duration, error }] }] }] }] }
                const suites: any[] = [];
                const flattenSuites = (node: any, parentTitle = '') => {
                    if (!node) return;
                    const title = parentTitle ? `${parentTitle} > ${node.title}` : (node.title || '');
                    if (node.specs && Array.isArray(node.specs)) {
                        const cases: any[] = [];
                        for (const spec of node.specs) {
                            const specTitle = spec.title || 'Unnamed';
                            let result: string = 'passed';
                            let actualResult = '';
                            let durationSeconds: number | undefined;
                            if (spec.tests && spec.tests.length > 0) {
                                const test = spec.tests[0];
                                if (test.results && test.results.length > 0) {
                                    const res = test.results[0];
                                    const st = (res.status || '').toLowerCase();
                                    result = st === 'passed' ? 'passed' : st === 'skipped' ? 'skipped' : 'failed';
                                    if (res.error?.message) actualResult = res.error.message.substring(0, 500);
                                    if (res.duration) durationSeconds = res.duration / 1000;
                                }
                            }
                            cases.push({ externalId: `${title}.${specTitle}`, title: specTitle, result, actualResult, durationSeconds });
                        }
                        if (cases.length > 0) suites.push({ name: title || 'Imported Suite', cases });
                    }
                    if (node.suites && Array.isArray(node.suites)) {
                        for (const s of node.suites) flattenSuites(s, title);
                    }
                };
                const rootSuites = pw.suites || (Array.isArray(pw) ? pw : [pw]);
                for (const s of rootSuites) flattenSuites(s);
                return { success: true, format: 'playwright', suites };
            }
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
}
