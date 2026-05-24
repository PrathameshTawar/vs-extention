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
exports.GitTracker = void 0;
const simple_git_1 = require("simple-git");
const vscode = __importStar(require("vscode"));
class GitTracker {
    constructor(logger) {
        this.git = null;
        this.repositoryRoot = null;
        this.logger = logger;
    }
    async initialize() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            this.logger.warn('No workspace folder was available for Git tracking');
            return;
        }
        try {
            const git = (0, simple_git_1.simpleGit)({ baseDir: workspaceFolder });
            await git.revparse(['--is-inside-work-tree']);
            this.git = git;
            this.repositoryRoot = workspaceFolder;
            this.logger.info('Git tracking initialized', { repositoryRoot: workspaceFolder });
        }
        catch (error) {
            this.logger.warn('Git repository detection failed', { error: String(error) });
            this.git = null;
            this.repositoryRoot = null;
        }
    }
    async getLatestCommit() {
        if (!this.git) {
            return null;
        }
        try {
            const log = await this.git.log({ maxCount: 1 });
            return log.latest?.hash ?? null;
        }
        catch (error) {
            this.logger.warn('Unable to fetch latest Git commit', { error: String(error) });
            return null;
        }
    }
    async getChangedFiles() {
        if (!this.git) {
            return [];
        }
        try {
            const status = await this.git.status();
            return [
                ...status.not_added,
                ...status.modified,
                ...status.deleted,
                ...status.renamed.map((entry) => entry.to)
            ];
        }
        catch (error) {
            this.logger.warn('Unable to read Git status', { error: String(error) });
            return [];
        }
    }
    async getCurrentDiff() {
        if (!this.git) {
            return null;
        }
        try {
            const diff = await this.git.diff();
            return diff || null;
        }
        catch (error) {
            this.logger.warn('Unable to fetch Git diff', { error: String(error) });
            return null;
        }
    }
    async getSnapshot() {
        const [latestCommit, changedFiles, currentDiff] = await Promise.all([
            this.getLatestCommit(),
            this.getChangedFiles(),
            this.getCurrentDiff()
        ]);
        return {
            repositoryRoot: this.repositoryRoot,
            latestCommit,
            changedFiles,
            currentDiff
        };
    }
}
exports.GitTracker = GitTracker;
//# sourceMappingURL=gitTracker.js.map