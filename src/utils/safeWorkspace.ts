import * as path from 'path';
import * as vscode from 'vscode';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SECRET_PATTERNS = [
    '.env',
    '.pem',
    '.key',
    'credentials.json',
    'token.json',
    'id_rsa'
];

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build']);
const TEXT_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.json',
    '.md',
    '.yaml',
    '.yml',
    '.txt',
    '.css',
    '.scss',
    '.html',
    '.htm',
    '.java',
    '.py',
    '.go',
    '.rs',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.cs',
    '.php',
    '.rb',
    '.sh',
    '.sql'
]);

function normalizeSeparators(value: string): string {
    return value.replace(/\\/g, '/');
}

function containsSecretName(filePath: string): boolean {
    const normalized = normalizeSeparators(filePath).toLowerCase();
    return SECRET_PATTERNS.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function shouldIgnorePath(filePath: string): boolean {
    const normalized = normalizeSeparators(filePath);
    return Array.from(IGNORED_DIRECTORIES).some((directory) => normalized.includes(`/${directory}/`) || normalized.endsWith(`/${directory}`));
}

function isBinaryBuffer(buffer: Uint8Array): boolean {
    return buffer.includes(0);
}

export function isAllowedPath(filePath: string): boolean {
    if (!filePath) {
        return false;
    }

    if (containsSecretName(filePath) || shouldIgnorePath(filePath)) {
        return false;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
        return false;
    }

    const normalizedFilePath = normalizeSeparators(path.resolve(filePath));

    return workspaceFolders.some((folder) => {
        const folderPath = normalizeSeparators(path.resolve(folder.uri.fsPath));
        return normalizedFilePath === folderPath || normalizedFilePath.startsWith(`${folderPath}/`);
    });
}

export async function safeReadFile(filePath: string): Promise<string | null> {
    if (!isAllowedPath(filePath)) {
        return null;
    }

    const uri = vscode.Uri.file(filePath);

    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.length > MAX_FILE_BYTES) {
            return null;
        }

        if (isBinaryBuffer(bytes)) {
            return null;
        }

        return Buffer.from(bytes).toString('utf8');
    } catch {
        return null;
    }
}

export async function getWorkspaceTree(): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const tree: string[] = [];

    if (workspaceFolders.length === 0) {
        return tree;
    }

    const maxFiles = 500;

    for (const folder of workspaceFolders) {
        await walkFolder(folder.uri.fsPath, folder.uri.fsPath, tree, maxFiles);
        if (tree.length >= maxFiles) {
            break;
        }
    }

    return tree.sort();
}

async function walkFolder(rootPath: string, currentPath: string, tree: string[], maxFiles: number): Promise<void> {
    if (tree.length >= maxFiles) {
        return;
    }

    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));

    for (const [name, type] of entries) {
        const fullPath = path.join(currentPath, name);
        const relativePath = normalizeSeparators(path.relative(rootPath, fullPath));

        if (shouldIgnorePath(fullPath)) {
            continue;
        }

        if (type === vscode.FileType.Directory) {
            await walkFolder(rootPath, fullPath, tree, maxFiles);
            continue;
        }

        if (tree.length >= maxFiles) {
            return;
        }

        if (!TEXT_EXTENSIONS.has(path.extname(name).toLowerCase())) {
            continue;
        }

        tree.push(relativePath);
    }
}

export function isTextPath(filePath: string): boolean {
    return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
