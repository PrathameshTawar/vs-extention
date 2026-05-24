import * as vscode from 'vscode';

import { GitTracker } from '../git/gitTracker';
import { LocalMemoryStore } from '../memory/memoryStore';
import { CodeSearcher } from '../search/codeSearch';
import { Logger } from '../utils/logger';
import { WorkspaceWatcher } from '../watcher/workspaceWatcher';
import { AiIdeAwareness, IdeAwarenessSnapshot } from '../ai/ideAwareness';

interface SidebarState {
    workspaceFolders: string[];
    activeFile?: string;
    openedFiles: string[];
    recentEvents: Array<{ type: string; path: string; timestamp: string; reason?: string }>;
    projectTree: string[];
    git: {
        repositoryRoot: string | null;
        latestCommit: string | null;
        changedFiles: string[];
        currentDiff: string | null;
    };
    memoryEntries: Array<{ category: string; content: string; timestamp: string }>;
    searchResults: Array<{ filePath: string; lineNumber: number; snippet: string }>;
    aiAwareness: IdeAwarenessSnapshot;
    status: string;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'akhrotWorkspaceSidebar';

    private readonly logger: Logger;
    private readonly watcher: WorkspaceWatcher;
    private readonly gitTracker: GitTracker;
    private readonly searcher: CodeSearcher;
    private readonly memoryStore: LocalMemoryStore;
    private readonly aiAwareness: AiIdeAwareness;
    private webviewView?: vscode.WebviewView;
    private refreshPending = false;

    constructor(
        logger: Logger,
        watcher: WorkspaceWatcher,
        gitTracker: GitTracker,
        searcher: CodeSearcher,
        memoryStore: LocalMemoryStore,
        aiAwareness: AiIdeAwareness
    ) {
        this.logger = logger;
        this.watcher = watcher;
        this.gitTracker = gitTracker;
        this.searcher = searcher;
        this.memoryStore = memoryStore;
        this.aiAwareness = aiAwareness;
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'refresh') {
                await this.refresh();
                return;
            }

            if (message.type === 'search') {
                const query = typeof message.query === 'string' ? message.query.trim() : '';
                const results = query ? await this.searcher.searchCode(query) : [];
                const state = await this.getState();
                state.searchResults = results;
                state.status = query ? `${results.length} result(s) found.` : 'Search workspace context';
                this.postState(state);
                return;
            }

            if (message.type === 'openFile') {
                const filePath = typeof message.filePath === 'string' ? message.filePath : '';
                if (!filePath) {
                    return;
                }

                try {
                    const document = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(document, { preview: false });
                } catch (error) {
                    this.logger.error('Unable to open file from sidebar', { error: String(error), filePath });
                }
            }
        });

        void this.refresh();
    }

    public async refresh(): Promise<void> {
        if (this.refreshPending || !this.webviewView) {
            return;
        }

        this.refreshPending = true;

        try {
            const state = await this.getState();
            this.postState(state);
        } finally {
            this.refreshPending = false;
        }
    }

    private async getState(): Promise<SidebarState> {
        await this.watcher.refreshSnapshot();
        const snapshot = this.watcher.getSnapshot();
        const git = await this.gitTracker.getSnapshot();
        const memoryEntries = await this.memoryStore.loadEntries();
        const aiAwareness = await this.aiAwareness.scan();

        return {
            workspaceFolders: snapshot.workspaceFolders,
            activeFile: snapshot.activeFile,
            openedFiles: snapshot.openedFiles,
            recentEvents: snapshot.recentEvents,
            projectTree: snapshot.projectTree,
            git,
            memoryEntries,
            searchResults: [],
            aiAwareness,
            status: 'Workspace snapshot loaded'
        };
    }

    private postState(state: SidebarState): void {
        if (!this.webviewView) {
            return;
        }

        this.webviewView.webview.postMessage({
            type: 'state',
            payload: state
        });
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Akhrot Workspace</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
    }

    body {
      margin: 0;
      padding: 12px;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-foreground);
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .hero {
      padding: 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 60%, transparent);
      border: 1px solid var(--vscode-panel-border);
    }

    .hero h1 {
      margin: 0 0 6px;
      font-size: 1rem;
    }

    .hero p {
      margin: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9rem;
    }

    .controls {
      display: flex;
      gap: 8px;
    }

    .controls input {
      flex: 1;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }

    .controls button {
      border: 0;
      border-radius: 8px;
      padding: 8px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }

    .controls button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      padding: 12px;
      background: var(--vscode-editor-background);
    }

    .card h2 {
      margin: 0 0 8px;
      font-size: 0.95rem;
    }

    .value-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin: 6px 0;
      font-size: 0.9rem;
    }

    .value-row span:last-child {
      color: var(--vscode-descriptionForeground);
      text-align: right;
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }

    .item {
      border-radius: 8px;
      padding: 8px;
      background: color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
    }

    .item strong {
      display: block;
      margin-bottom: 4px;
      font-size: 0.9rem;
    }

    .item small,
    .muted {
      color: var(--vscode-descriptionForeground);
    }

    .link-button {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      padding: 0;
      text-align: left;
      cursor: pointer;
    }

    .empty {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="panel">
    <section class="hero">
      <h1>Akhrot Workspace</h1>
      <p id="statusText">Loading workspace context…</p>
    </section>

    <section class="card">
      <h2>Search workspace</h2>
      <div class="controls">
        <input id="searchInput" type="text" placeholder="Search code, memory, or files" />
        <button id="searchButton">Search</button>
      </div>
      <div id="searchResults" class="list"></div>
    </section>

    <section class="card">
      <h2>Workspace overview</h2>
      <div class="value-row"><span>Folders</span><span id="workspaceFolders">0</span></div>
      <div class="value-row"><span>Open files</span><span id="openedFiles">0</span></div>
      <div class="value-row"><span>Active file</span><span id="activeFile">None</span></div>
      <div class="value-row"><span>Project tree</span><span id="projectTreeCount">0</span></div>
    </section>

    <section class="card">
      <h2>Recent activity</h2>
      <div id="recentEvents" class="list"></div>
    </section>

    <section class="card">
      <h2>Git status</h2>
      <div class="value-row"><span>Repository</span><span id="repoRoot">None</span></div>
      <div class="value-row"><span>Latest commit</span><span id="latestCommit">None</span></div>
      <div class="value-row"><span>Changed files</span><span id="changedFiles">0</span></div>
      <div id="gitDiff" class="muted"></div>
    </section>

    <section class="card">
      <h2>Local memory</h2>
      <div id="memoryEntries" class="list"></div>
    </section>

    <section class="card">
      <h2>AI IDE awareness</h2>
      <div id="aiAwareness" class="list"></div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = { searchResults: [] };

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderRecentEvents(events) {
      const container = document.getElementById('recentEvents');
      container.innerHTML = '';

      if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty">No recent events tracked yet.</div>';
        return;
      }

      events.slice(0, 8).forEach((event) => {
        const item = document.createElement('div');
        item.className = 'item';
        item.innerHTML = '<strong>' + escapeHtml(event.type) + '</strong>' +
          '<div>' + escapeHtml(event.path) + '</div>' +
          '<small>' + escapeHtml(new Date(event.timestamp).toLocaleString()) + '</small>';
        container.appendChild(item);
      });
    }

    function renderSearchResults(results) {
      const container = document.getElementById('searchResults');
      container.innerHTML = '';

      if (!results || results.length === 0) {
        container.innerHTML = '<div class="empty">No results yet. Search to populate the workspace context.</div>';
        return;
      }

      results.slice(0, 8).forEach((result) => {
        const item = document.createElement('div');
        item.className = 'item';
        item.innerHTML = '<strong><button class="link-button" data-file="' + escapeHtml(result.filePath) + '">' + escapeHtml(result.filePath) + '</button></strong>' +
          '<div>' + escapeHtml(result.snippet) + '</div>' +
          '<small>Line ' + escapeHtml(result.lineNumber) + '</small>';
        container.appendChild(item);
      });

      container.querySelectorAll('[data-file]').forEach((element) => {
        element.addEventListener('click', () => {
          vscode.postMessage({ type: 'openFile', filePath: element.dataset.file });
        });
      });
    }

    function renderMemory(entries) {
      const container = document.getElementById('memoryEntries');
      container.innerHTML = '';

      if (!entries || entries.length === 0) {
        container.innerHTML = '<div class="empty">No local memory yet. Use the refresh or summary commands to populate it.</div>';
        return;
      }

      entries.slice(0, 8).forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'item';
        item.innerHTML = '<strong>' + escapeHtml(entry.category) + '</strong>' +
          '<div>' + escapeHtml(entry.content.slice(0, 240)) + '</div>' +
          '<small>' + escapeHtml(new Date(entry.timestamp).toLocaleString()) + '</small>';
        container.appendChild(item);
      });
    }

    function renderAiAwareness(snapshot) {
      const container = document.getElementById('aiAwareness');
      container.innerHTML = '';

      if (!snapshot || !snapshot.entries || snapshot.entries.length === 0) {
        container.innerHTML = '<div class="empty">No AI IDE artifacts detected in the current workspace.</div>';
        return;
      }

      snapshot.entries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'item';
        const related = entry.relatedFiles.slice(0, 4).map((value) => escapeHtml(value.split(/[\\/]/).pop())).join(', ');
        const timestamps = entry.timestamps.slice(0, 3).map((value) => escapeHtml(new Date(value).toLocaleString())).join(' • ');
        item.innerHTML = '<strong>' + escapeHtml(entry.ide) + '</strong>' +
          '<div>' + escapeHtml(entry.summary) + '</div>' +
          '<div class="muted">Confidence: ' + escapeHtml(entry.confidence) + '</div>' +
          '<div class="muted">Related: ' + (related || 'No readable metadata') + '</div>' +
          '<div class="muted">Timestamps: ' + (timestamps || 'Unknown') + '</div>';
        container.appendChild(item);
      });
    }

    function renderState(payload) {
      document.getElementById('statusText').textContent = payload.status || 'Workspace snapshot loaded';
      document.getElementById('workspaceFolders').textContent = String(payload.workspaceFolders?.length ?? 0);
      document.getElementById('openedFiles').textContent = String(payload.openedFiles?.length ?? 0);
      document.getElementById('activeFile').textContent = payload.activeFile ? payload.activeFile.split(/[\\/]/).pop() : 'None';
      document.getElementById('projectTreeCount').textContent = String(payload.projectTree?.length ?? 0);
      document.getElementById('repoRoot').textContent = payload.git?.repositoryRoot ? payload.git.repositoryRoot.split(/[\\/]/).pop() : 'None';
      document.getElementById('latestCommit').textContent = payload.git?.latestCommit ? payload.git.latestCommit.slice(0, 8) : 'None';
      document.getElementById('changedFiles').textContent = String(payload.git?.changedFiles?.length ?? 0);
      document.getElementById('gitDiff').textContent = payload.git?.currentDiff ? payload.git.currentDiff.slice(0, 320) : 'No diff available.';
      renderRecentEvents(payload.recentEvents);
      renderMemory(payload.memoryEntries);
      renderSearchResults(payload.searchResults || []);
      renderAiAwareness(payload.aiAwareness);
    }

    document.getElementById('searchButton').addEventListener('click', () => {
      const query = document.getElementById('searchInput').value;
      vscode.postMessage({ type: 'search', query });
    });

    document.getElementById('searchInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const query = document.getElementById('searchInput').value;
        vscode.postMessage({ type: 'search', query });
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        renderState(message.payload);
      }
    });

    vscode.postMessage({ type: 'refresh' });
  </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let index = 0; index < 32; index += 1) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}
