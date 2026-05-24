"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpToolRegistry = void 0;
const safeWorkspace_1 = require("../utils/safeWorkspace");
class McpToolRegistry {
    constructor(logger, watcher, searcher, gitTracker, memoryStore) {
        this.logger = logger;
        this.watcher = watcher;
        this.searcher = searcher;
        this.gitTracker = gitTracker;
        this.memoryStore = memoryStore;
    }
    listTools() {
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
    async executeTool(toolName, args) {
        try {
            switch (toolName) {
                case 'list_projects':
                    return { ok: true, tool: toolName, data: this.watcher.getSnapshot().workspaceFolders };
                case 'get_project_tree':
                    return { ok: true, tool: toolName, data: await (0, safeWorkspace_1.getWorkspaceTree)() };
                case 'read_file': {
                    const filePath = String(args.filePath ?? '');
                    const content = await (0, safeWorkspace_1.safeReadFile)(filePath);
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
        }
        catch (error) {
            this.logger.error('MCP tool execution failed', { toolName, error: String(error) });
            return { ok: false, tool: toolName, error: String(error) };
        }
    }
}
exports.McpToolRegistry = McpToolRegistry;
//# sourceMappingURL=toolRegistry.js.map