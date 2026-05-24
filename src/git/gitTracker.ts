import { simpleGit, SimpleGit } from 'simple-git';
import * as vscode from 'vscode';

import { Logger } from '../utils/logger';

export interface GitSnapshot {
    repositoryRoot: string | null;
    latestCommit: string | null;
    changedFiles: string[];
    currentDiff: string | null;
}

export class GitTracker {
    private readonly logger: Logger;
    private git: SimpleGit | null = null;
    private repositoryRoot: string | null = null;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async initialize(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceFolder) {
            this.logger.warn('No workspace folder was available for Git tracking');
            return;
        }

        try {
            const git = simpleGit({ baseDir: workspaceFolder });
            await git.revparse(['--is-inside-work-tree']);
            this.git = git;
            this.repositoryRoot = workspaceFolder;
            this.logger.info('Git tracking initialized', { repositoryRoot: workspaceFolder });
        } catch (error) {
            this.logger.warn('Git repository detection failed', { error: String(error) });
            this.git = null;
            this.repositoryRoot = null;
        }
    }

    public async getLatestCommit(): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        try {
            const log = await this.git.log({ maxCount: 1 });
            return log.latest?.hash ?? null;
        } catch (error) {
            this.logger.warn('Unable to fetch latest Git commit', { error: String(error) });
            return null;
        }
    }

    public async getChangedFiles(): Promise<string[]> {
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
        } catch (error) {
            this.logger.warn('Unable to read Git status', { error: String(error) });
            return [];
        }
    }

    public async getCurrentDiff(): Promise<string | null> {
        if (!this.git) {
            return null;
        }

        try {
            const diff = await this.git.diff();
            return diff || null;
        } catch (error) {
            this.logger.warn('Unable to fetch Git diff', { error: String(error) });
            return null;
        }
    }

    public async getSnapshot(): Promise<GitSnapshot> {
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
