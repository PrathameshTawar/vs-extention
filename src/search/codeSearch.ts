import * as vscode from 'vscode';

import { Logger } from '../utils/logger';
import { safeReadFile, isTextPath } from '../utils/safeWorkspace';

export interface SearchResult {
    filePath: string;
    lineNumber: number;
    snippet: string;
}

export class CodeSearcher {
    private readonly logger: Logger;
    private readonly config: vscode.WorkspaceConfiguration;

    constructor(logger: Logger, config: vscode.WorkspaceConfiguration) {
        this.logger = logger;
        this.config = config;
    }

    public async searchCode(query: string): Promise<SearchResult[]> {
        const normalized = query.trim();

        if (!normalized) {
            return [];
        }

        const maxResults = this.config.get<number>('maxSearchResults', 50);
        const lowerCaseQuery = normalized.toLowerCase();
        const results: SearchResult[] = [];

        const files = await vscode.workspace.findFiles('**/*', '{node_modules,.git,dist,build}/**', maxResults * 5);

        for (const file of files) {
            if (!isTextPath(file.fsPath)) {
                continue;
            }

            const content = await safeReadFile(file.fsPath);
            if (!content) {
                continue;
            }

            const lines = content.split(/\r?\n/);
            for (let index = 0; index < lines.length; index += 1) {
                const line = lines[index];
                if (!line.toLowerCase().includes(lowerCaseQuery)) {
                    continue;
                }

                results.push({
                    filePath: file.fsPath,
                    lineNumber: index + 1,
                    snippet: line.trim()
                });

                if (results.length >= maxResults) {
                    this.logger.info('Code search completed', { query: normalized, maxResults });
                    return results;
                }
            }
        }

        this.logger.info('Code search completed', { query: normalized, resultCount: results.length });
        return results;
    }
}
