"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowedPath = isAllowedPath;
exports.safeReadFile = safeReadFile;
exports.getWorkspaceTree = getWorkspaceTree;
exports.isTextPath = isTextPath;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
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
function normalizeSeparators(value) {
    return value.replace(/\\/g, '/');
}
function containsSecretName(filePath) {
    const normalized = normalizeSeparators(filePath).toLowerCase();
    return SECRET_PATTERNS.some((pattern) => normalized.includes(pattern.toLowerCase()));
}
function shouldIgnorePath(filePath) {
    const normalized = normalizeSeparators(filePath);
    return Array.from(IGNORED_DIRECTORIES).some((directory) => normalized.includes(`/${directory}/`) || normalized.endsWith(`/${directory}`));
}
function isBinaryBuffer(buffer) {
    return buffer.includes(0);
}
function isAllowedPath(filePath) {
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
async function safeReadFile(filePath) {
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
    }
    catch {
        return null;
    }
}
async function getWorkspaceTree() {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const tree = [];
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
async function walkFolder(rootPath, currentPath, tree, maxFiles) {
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
function isTextPath(filePath) {
    return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
//# sourceMappingURL=safeWorkspace.js.map