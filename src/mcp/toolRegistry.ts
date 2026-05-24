import * as vscode from 'vscode';

import { GitTracker } from '../git/gitTracker';
import { LocalMemoryStore } from '../memory/memoryStore';
import { CodeSearcher } from '../search/codeSearch';
import { Logger } from '../utils/logger';
import { getWorkspaceTree, safeReadFile } from '../utils/safeWorkspace';
import { WorkspaceWatcher } from '../watcher/workspaceWatcher';

export interface ToolResponse {
    ok: boolean;
    tool: string;
    data?: unknown;
    error?: string;
}

export class McpToolRegistry {
    private readonly logger: Logger;
    private readonly watcher: WorkspaceWatcher;
    private readonly searcher: CodeSearcher;
    private readonly gitTracker: GitTracker;
    private readonly memoryStore: LocalMemoryStore;

    constructor(
        logger: Logger,
        watcher: WorkspaceWatcher,
        searcher: CodeSearcher,
        gitTracker: GitTracker,
        memoryStore: LocalMemoryStore
    ) {
        this.logger = logger;
        this.watcher = watcher;
        this.searcher = searcher;
        this.gitTracker = gitTracker;
        this.memoryStore = memoryStore;
    }

    public listTools(): string[] {
        return [
            'list_projects',
            'get_project_tree',
            'read_file',
            'search_code',
            'get_recent_changes',
            'get_latest_git_diff',
            'get_workspace_summary'
        ];
    }

    public async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResponse> {
        try {
            switch (toolName) {
                case 'list_projects':
                    return { ok: true, tool: toolName, data: this.watcher.getSnapshot().workspaceFolders };
                case 'get_project_tree':
                    return { ok: true, tool: toolName, data: await getWorkspaceTree() };
                case 'read_file': {
                    const filePath = String(args.filePath ?? '');
                    const content = await safeReadFile(filePath);
                    if (!content) {
                        return { ok: false, tool: toolName, error: 'Unable to read the requested file.' };
                    }

                    return { ok: true, tool: toolName, data: { filePath, content } };
                }
                case 'search_code': {
                    const query = String(args.query ?? '');
                    return { ok: true, tool: toolName, data: await this.searcher.searchCode(query) };
                }
                case 'get_recent_changes':
                    return { ok: true, tool: toolName, data: this.watcher.getSnapshot().recentEvents };
                case 'get_latest_git_diff':
                    return { ok: true, tool: toolName, data: await this.gitTracker.getCurrentDiff() };
                case 'get_workspace_summary': {
                    const summary = this.watcher.getSnapshot();
                    const gitSnapshot = await this.gitTracker.getSnapshot();
                    const memoryEntries = await this.memoryStore.loadEntries();
                    return {
                        ok: true,
                        tool: toolName,
                        data: {
                            workspace: summary,
                            git: gitSnapshot,
                            memoryEntries
                        }
                    };
                }
                default:
                    return { ok: false, tool: toolName, error: 'Unknown MCP tool.' };
            }
        } catch (error) {
            this.logger.error('MCP tool execution failed', { toolName, error: String(error) });
            return { ok: false, tool: toolName, error: String(error) };
        }
    }
}
