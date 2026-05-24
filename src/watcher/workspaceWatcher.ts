import * as vscode from 'vscode';

import { Logger } from '../utils/logger';
import { getWorkspaceTree, isAllowedPath } from '../utils/safeWorkspace';

export interface WorkspaceEvent {
    type: 'file-added' | 'file-changed' | 'file-deleted' | 'active-editor' | 'open-document' | 'save-document' | 'workspace-folder-changed';
    path: string;
    timestamp: string;
    reason?: string;
}

export interface WorkspaceSnapshot {
    workspaceFolders: string[];
    activeFile?: string;
    openedFiles: string[];
    recentEvents: WorkspaceEvent[];
    projectTree: string[];
}

export class WorkspaceWatcher {
    private readonly logger: Logger;
    private readonly recentEvents: WorkspaceEvent[] = [];
    private readonly openedFiles = new Set<string>();
    private readonly pendingEvents = new Map<string, NodeJS.Timeout>();
    private readonly disposables: vscode.Disposable[] = [];
    private activeFile?: string;
    private projectTree: string[] = [];

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public start(): void {
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

    public stop(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }

        this.disposables.length = 0;

        for (const timeout of this.pendingEvents.values()) {
            clearTimeout(timeout);
        }

        this.pendingEvents.clear();
    }

    public async refreshSnapshot(): Promise<void> {
        const projectTree = await getWorkspaceTree();
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
            .filter((path) => isAllowedPath(path));

        this.openedFiles.clear();
        for (const documentPath of currentDocuments) {
            this.openedFiles.add(documentPath);
        }

        this.activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

        while (this.recentEvents.length > 100) {
            this.recentEvents.pop();
        }
    }

    public getSnapshot(): WorkspaceSnapshot {
        return {
            workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
            activeFile: this.activeFile,
            openedFiles: Array.from(this.openedFiles),
            recentEvents: [...this.recentEvents].slice(0, 100),
            projectTree: this.projectTree
        };
    }

    private queueEvent(type: WorkspaceEvent['type'], pathValue: string, reason: string): void {
        if (!isAllowedPath(pathValue)) {
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

    private commitEvent(type: WorkspaceEvent['type'], pathValue: string, reason: string): void {
        const event: WorkspaceEvent = {
            type,
            path: pathValue,
            timestamp: new Date().toISOString(),
            reason
        };

        this.recentEvents.unshift(event);
        this.recentEvents.splice(100);

        if (type === 'file-deleted') {
            this.openedFiles.delete(pathValue);
        } else {
            this.openedFiles.add(pathValue);
        }

        if (type === 'active-editor' || type === 'open-document') {
            this.activeFile = pathValue;
        }

        this.logger.debug('Workspace event tracked', { event });
    }
}
