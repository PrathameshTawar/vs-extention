import * as vscode from 'vscode';

import { Logger } from './utils/logger';
import { WorkspaceWatcher } from './watcher/workspaceWatcher';
import { GitTracker } from './git/gitTracker';
import { CodeSearcher } from './search/codeSearch';
import { LocalMemoryStore } from './memory/memoryStore';
import { McpToolRegistry } from './mcp/toolRegistry';
import { SidebarProvider } from './ui/sidebarProvider';
import { AiIdeAwareness } from './ai/ideAwareness';

export function activate(context: vscode.ExtensionContext): void {
    const logger = new Logger('akhrot-workspace');
    const config = vscode.workspace.getConfiguration('akhrotWorkspace');

    logger.info('Activating Akhrot Workspace extension');

    const memoryStore = new LocalMemoryStore(context);
    const watcher = new WorkspaceWatcher(logger);
    const gitTracker = new GitTracker(logger);
    const searcher = new CodeSearcher(logger, config);
    const aiAwareness = new AiIdeAwareness(logger);
    const mcpRegistry = new McpToolRegistry(logger, watcher, searcher, gitTracker, memoryStore);
    const sidebarProvider = new SidebarProvider(logger, watcher, gitTracker, searcher, memoryStore, aiAwareness);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider),
        vscode.commands.registerCommand('akhrotWorkspace.refreshWorkspace', async () => {
            await watcher.refreshSnapshot();
            const snapshot = watcher.getSnapshot();
            await memoryStore.saveChange({
                type: 'workspace-refresh',
                payload: snapshot,
                timestamp: new Date().toISOString()
            });
            await sidebarProvider.refresh();
            vscode.window.showInformationMessage(`Akhrot refreshed ${snapshot.workspaceFolders.length} workspace folder(s).`);
        }),
        vscode.commands.registerCommand('akhrotWorkspace.searchCode', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search workspace code',
                placeHolder: 'e.g. function activate'
            });

            if (!query) {
                return;
            }

            const results = await searcher.searchCode(query);
            const summary = results.length > 0
                ? `${results.length} result(s) found for "${query}".`
                : `No results found for "${query}".`;

            vscode.window.showInformationMessage(summary);
            await memoryStore.saveSummary(`Code search for ${query}: ${results.length} result(s).`);
            await sidebarProvider.refresh();
        }),
        vscode.commands.registerCommand('akhrotWorkspace.getWorkspaceSummary', async () => {
            const snapshot = watcher.getSnapshot();
            const summary = JSON.stringify(snapshot, null, 2);
            await memoryStore.saveSummary(summary);
            await sidebarProvider.refresh();
            vscode.window.showInformationMessage('Workspace summary saved locally.');
            logger.info('Workspace summary generated', { summaryLength: summary.length });
        }),
        vscode.commands.registerCommand('akhrotWorkspace.getRecentChanges', async () => {
            const recent = watcher.getSnapshot().recentEvents;
            await memoryStore.saveChange({
                type: 'recent-changes-request',
                payload: recent,
                timestamp: new Date().toISOString()
            });
            await sidebarProvider.refresh();
            vscode.window.showInformationMessage(`Recorded ${recent.length} recent change event(s).`);
        }),
        vscode.commands.registerCommand('akhrotWorkspace.getLatestGitDiff', async () => {
            const diff = await gitTracker.getCurrentDiff();
            if (!diff) {
                vscode.window.showWarningMessage('No Git repository or diff was available.');
                return;
            }

            await memoryStore.saveSnippet({
                category: 'git-diff',
                content: diff,
                timestamp: new Date().toISOString()
            });
            await sidebarProvider.refresh();
            vscode.window.showInformationMessage('Latest Git diff saved locally.');
        }),
        vscode.commands.registerCommand('akhrotWorkspace.listMcpTools', async () => {
            const tools = mcpRegistry.listTools();
            vscode.window.showInformationMessage(`Available MCP tools: ${tools.join(', ')}`);
        })
    );

    if (config.get<boolean>('enableWatcher', true)) {
        watcher.start();
    }

    context.subscriptions.push(
        { dispose: () => watcher.stop() },
        vscode.window.onDidChangeActiveTextEditor(() => void sidebarProvider.refresh()),
        vscode.workspace.onDidOpenTextDocument(() => void sidebarProvider.refresh()),
        vscode.workspace.onDidSaveTextDocument(() => void sidebarProvider.refresh()),
        vscode.workspace.onDidChangeWorkspaceFolders(() => void sidebarProvider.refresh())
    );

    if (config.get<boolean>('enableGitTracking', true)) {
        void gitTracker.initialize();
    }

    void memoryStore.initialize();
    void aiAwareness.scan();

    logger.info('Akhrot Workspace extension activated');
}

export function deactivate(): void {
    // Extension cleanup is handled by disposables when they are registered.
}
