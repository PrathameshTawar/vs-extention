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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const logger_1 = require("./utils/logger");
const workspaceWatcher_1 = require("./watcher/workspaceWatcher");
const gitTracker_1 = require("./git/gitTracker");
const codeSearch_1 = require("./search/codeSearch");
const memoryStore_1 = require("./memory/memoryStore");
const toolRegistry_1 = require("./mcp/toolRegistry");
const sidebarProvider_1 = require("./ui/sidebarProvider");
const ideAwareness_1 = require("./ai/ideAwareness");
function activate(context) {
    const logger = new logger_1.Logger('akhrot-workspace');
    const config = vscode.workspace.getConfiguration('akhrotWorkspace');
    logger.info('Activating Akhrot Workspace extension');
    const memoryStore = new memoryStore_1.LocalMemoryStore(context);
    const watcher = new workspaceWatcher_1.WorkspaceWatcher(logger);
    const gitTracker = new gitTracker_1.GitTracker(logger);
    const searcher = new codeSearch_1.CodeSearcher(logger, config);
    const aiAwareness = new ideAwareness_1.AiIdeAwareness(logger);
    const mcpRegistry = new toolRegistry_1.McpToolRegistry(logger, watcher, searcher, gitTracker, memoryStore);
    const sidebarProvider = new sidebarProvider_1.SidebarProvider(logger, watcher, gitTracker, searcher, memoryStore, aiAwareness);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarProvider_1.SidebarProvider.viewType, sidebarProvider), vscode.commands.registerCommand('akhrotWorkspace.refreshWorkspace', async () => {
        await watcher.refreshSnapshot();
        const snapshot = watcher.getSnapshot();
        await memoryStore.saveChange({
            type: 'workspace-refresh',
            payload: snapshot,
            timestamp: new Date().toISOString()
        });
        await sidebarProvider.refresh();
        vscode.window.showInformationMessage(`Akhrot refreshed ${snapshot.workspaceFolders.length} workspace folder(s).`);
    }), vscode.commands.registerCommand('akhrotWorkspace.searchCode', async () => {
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
    }), vscode.commands.registerCommand('akhrotWorkspace.getWorkspaceSummary', async () => {
        const snapshot = watcher.getSnapshot();
        const summary = JSON.stringify(snapshot, null, 2);
        await memoryStore.saveSummary(summary);
        await sidebarProvider.refresh();
        vscode.window.showInformationMessage('Workspace summary saved locally.');
        logger.info('Workspace summary generated', { summaryLength: summary.length });
    }), vscode.commands.registerCommand('akhrotWorkspace.getRecentChanges', async () => {
        const recent = watcher.getSnapshot().recentEvents;
        await memoryStore.saveChange({
            type: 'recent-changes-request',
            payload: recent,
            timestamp: new Date().toISOString()
        });
        await sidebarProvider.refresh();
        vscode.window.showInformationMessage(`Recorded ${recent.length} recent change event(s).`);
    }), vscode.commands.registerCommand('akhrotWorkspace.getLatestGitDiff', async () => {
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
    }), vscode.commands.registerCommand('akhrotWorkspace.listMcpTools', async () => {
        const tools = mcpRegistry.listTools();
        vscode.window.showInformationMessage(`Available MCP tools: ${tools.join(', ')}`);
    }));
    if (config.get('enableWatcher', true)) {
        watcher.start();
    }
    context.subscriptions.push({ dispose: () => watcher.stop() }, vscode.window.onDidChangeActiveTextEditor(() => void sidebarProvider.refresh()), vscode.workspace.onDidOpenTextDocument(() => void sidebarProvider.refresh()), vscode.workspace.onDidSaveTextDocument(() => void sidebarProvider.refresh()), vscode.workspace.onDidChangeWorkspaceFolders(() => void sidebarProvider.refresh()));
    if (config.get('enableGitTracking', true)) {
        void gitTracker.initialize();
    }
    void memoryStore.initialize();
    void aiAwareness.scan();
    logger.info('Akhrot Workspace extension activated');
}
function deactivate() {
    // Extension cleanup is handled by disposables when they are registered.
}
//# sourceMappingURL=extension.js.map