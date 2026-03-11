import fs from 'fs'
import path from 'path'
import { shell } from 'electron'

// Lazily initialized by initFileStorage() called from app.whenReady()
let _attachmentsDir = ''

export function initFileStorage(attachmentsDir: string): void {
    _attachmentsDir = attachmentsDir
    if (!fs.existsSync(_attachmentsDir)) {
        fs.mkdirSync(_attachmentsDir, { recursive: true })
    }
}

// Executable/script extensions that should never be stored or launched.
export const BLOCKED_EXTENSIONS: Set<string> = new Set([
    '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.msp',
    '.ps1', '.psm1', '.psd1', '.vbs', '.vbe', '.js', '.jse',
    '.wsf', '.wsh', '.scr', '.pif', '.hta', '.cpl', '.inf',
    '.reg', '.lnk', '.url', '.appref-ms'
])

export interface StoredAttachment {
    fileName: string
    filePath: string
    mimeType: string
    fileSizeBytes: number
}

function getMimeType(ext: string): string {
    switch (ext.toLowerCase()) {
        case '.png': return 'image/png'
        case '.jpg':
        case '.jpeg': return 'image/jpeg'
        case '.gif': return 'image/gif'
        case '.bmp': return 'image/bmp'
        case '.webp': return 'image/webp'
        case '.svg': return 'image/svg+xml'
        case '.mp4': return 'video/mp4'
        case '.webm': return 'video/webm'
        case '.avi': return 'video/x-msvideo'
        case '.mov': return 'video/quicktime'
        case '.mkv': return 'video/x-matroska'
        case '.mp3': return 'audio/mpeg'
        case '.wav': return 'audio/wav'
        case '.ogg': return 'audio/ogg'
        case '.flac': return 'audio/flac'
        case '.m4a': return 'audio/mp4'
        case '.pdf': return 'application/pdf'
        case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        case '.txt': return 'text/plain'
        case '.zip': return 'application/zip'
        default: return 'application/octet-stream'
    }
}

export async function saveFile(sourcePath: string): Promise<{ success: boolean; attachment?: StoredAttachment; error?: string }> {
    try {
        if (!sourcePath || typeof sourcePath !== 'string') {
            return { success: false, error: 'No file path provided.' }
        }

        // Normalize: strip file:// URI prefix and decode percent-encoding
        if (sourcePath.startsWith('file://')) {
            sourcePath = decodeURIComponent(sourcePath.replace(/^file:\/\/\/?/, ''))
        }

        if (!fs.existsSync(sourcePath)) {
            return { success: false, error: 'Source file does not exist.' }
        }

        const ext = path.extname(sourcePath).toLowerCase()
        if (BLOCKED_EXTENSIONS.has(ext)) {
            return { success: false, error: `File type '${ext}' is not allowed for security reasons.` }
        }

        const stats = fs.statSync(sourcePath)
        // optional limit 50MB as C# example didn't have but main.ts previously added
        if (stats.size > 50 * 1024 * 1024) {
            return { success: false, error: 'File size exceeds 50MB limit.' }
        }

        const uniqueName = `${Date.now()}-${path.basename(sourcePath)}`
        const destPath = path.join(_attachmentsDir, uniqueName)
        await fs.promises.copyFile(sourcePath, destPath)

        const attachment: StoredAttachment = {
            fileName: path.basename(sourcePath),
            filePath: destPath,
            mimeType: getMimeType(ext),
            fileSizeBytes: stats.size
        }

        return { success: true, attachment }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function saveBytes(bytes: Uint8Array, fileName: string): Promise<{ success: boolean; attachment?: StoredAttachment; error?: string }> {
    try {
        const ext = path.extname(fileName).toLowerCase()
        if (BLOCKED_EXTENSIONS.has(ext)) {
            return { success: false, error: `File type '${ext}' is not allowed for security reasons.` }
        }

        const uniqueName = `${Date.now()}-${fileName}`
        const destPath = path.join(_attachmentsDir, uniqueName)
        await fs.promises.writeFile(destPath, bytes)

        const attachment: StoredAttachment = {
            fileName,
            filePath: destPath,
            mimeType: getMimeType(ext),
            fileSizeBytes: bytes.length
        }
        return { success: true, attachment }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export function deleteFile(filePath: string): { success: boolean; error?: string } {
    try {
        const full = path.resolve(filePath)
        if (!_attachmentsDir || !full.startsWith(_attachmentsDir + path.sep)) {
            return { success: false, error: 'Access denied' }
        }
        if (fs.existsSync(full)) fs.unlinkSync(full)
        return { success: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function openFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
        await shell.openPath(filePath)
        return { success: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}
