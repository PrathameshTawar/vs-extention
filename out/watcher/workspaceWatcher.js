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
exports.WorkspaceWatcher = void 0;
const vscode = __importStar(require("vscode"));
const safeWorkspace_1 = require("../utils/safeWorkspace");
class WorkspaceWatcher {
    constructor(logger) {
        this.recentEvents = [];
        this.openedFiles = new Set();
        this.pendingEvents = new Map();
        this.disposables = [];
        this.projectTree = [];
        this.logger = logger;
    }
    start() {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
        watcher.onDidCreate((uri) => this.queueEvent('file-added', uri.fsPath, 'watcher'));
        watcher.onDidChange((uri) => this.queueEvent('file-changed', uri.fsPath, 'watcher'));
        watcher.onDidDelete((uri) => this.queueEvent('file-deleted', uri.fsPath, 'watcher'));
        this.disposables.push(watcher);
        this.disposables.push(vscode.workspace.onDidOpenTextDocument((document) => this.queueEvent('open-document', document.uri.fsPath, 'editor-open')));
        this.disposables.push(vscode.workspace.onDidSaveTextDocument((document) => this.queueEvent('save-document', document.uri.fsPath, 'editor-save')));
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) {
                return;
            }
            this.queueEvent('active-editor', editor.document.uri.fsPath, 'active-editor');
        }));
        this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => this.queueEvent('workspace-folder-changed', vscode.workspace.rootPath ?? 'workspace', 'workspace-folders')));
        this.refreshSnapshot().catch((error) => {
            this.logger.error('Failed to refresh workspace snapshot', { error: String(error) });
        });
    }
    stop() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        for (const timeout of this.pendingEvents.values()) {
            clearTimeout(timeout);
        }
        this.pendingEvents.clear();
    }
    async refreshSnapshot() {
        const projectTree = await (0, safeWorkspace_1.getWorkspaceTree)();
        const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
        this.projectTree = projectTree;
        this.logger.debug('Workspace snapshot refreshed', {
            workspaceFolders,
            projectTreeSize: projectTree.length
        });
        if (workspaceFolders.length === 0) {
            return;
        }
        const currentDocuments = vscode.workspace.textDocuments
            .map((document) => document.uri.fsPath)
            .filter((path) => (0, safeWorkspace_1.isAllowedPath)(path));
        this.openedFiles.clear();
        for (const documentPath of currentDocuments) {
            this.openedFiles.add(documentPath);
        }
        this.activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
        while (this.recentEvents.length > 100) {
            this.recentEvents.pop();
        }
    }
    getSnapshot() {
        return {
            workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
            activeFile: this.activeFile,
            openedFiles: Array.from(this.openedFiles),
            recentEvents: [...this.recentEvents].slice(0, 100),
            projectTree: this.projectTree
        };
    }
    queueEvent(type, pathValue, reason) {
        if (!(0, safeWorkspace_1.isAllowedPath)(pathValue)) {
            return;
        }
        const key = `${type}:${pathValue}`;
        const existingTimeout = this.pendingEvents.get(key);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        const timeout = setTimeout(() => {
            this.pendingEvents.delete(key);
            this.commitEvent(type, pathValue, reason);
        }, 250);
        this.pendingEvents.set(key, timeout);
    }
    commitEvent(type, pathValue, reason) {
        const event = {
            type,
            path: pathValue,
            timestamp: new Date().toISOString(),
            reason
        };
        this.recentEvents.unshift(event);
        this.recentEvents.splice(100);
        if (type === 'file-deleted') {
            this.openedFiles.delete(pathValue);
        }
        else {
            this.openedFiles.add(pathValue);
        }
        if (type === 'active-editor' || type === 'open-document') {
            this.activeFile = pathValue;
        }
        this.logger.debug('Workspace event tracked', { event });
    }
}
exports.WorkspaceWatcher = WorkspaceWatcher;
//# sourceMappingURL=workspaceWatcher.js.map