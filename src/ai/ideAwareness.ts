import * as path from 'path';
import * as vscode from 'vscode';

import { Logger } from '../utils/logger';

export type IdeName = 'Cursor' | 'Windsurf' | 'Copilot' | 'OpenClaw' | 'Antigravity';

export interface IdeArtifactMetadata {
    path: string;
    timestamp: string;
    summary: string;
}

export interface IdeAwarenessEntry {
    ide: IdeName;
    detected: boolean;
    confidence: 'high' | 'medium' | 'low';
    relatedFiles: string[];
    timestamps: string[];
    summary: string;
    artifacts: IdeArtifactMetadata[];
}

export interface IdeAwarenessSnapshot {
    detectedAt: string;
    entries: IdeAwarenessEntry[];
}

interface IdeCandidate {
    ide: IdeName;
    directories: string[];
    patterns: string[];
}

const IDE_CANDIDATES: IdeCandidate[] = [
    {
        ide: 'Cursor',
        directories: ['.cursor'],
        patterns: ['**/.cursor/**', '**/.cursorignore']
    },
    {
        ide: 'Windsurf',
        directories: ['.windsurf'],
        patterns: ['**/.windsurf/**']
    },
    {
        ide: 'Copilot',
        directories: ['.github'],
        patterns: ['**/.github/copilot-instructions.md', '**/.github/chatmodes/**', '**/.github/copilot*']
    },
    {
        ide: 'OpenClaw',
        directories: ['.openclaw'],
        patterns: ['**/.openclaw/**', '**/*openclaw*', '**/*openclaw*.json']
    },
    {
        ide: 'Antigravity',
        directories: ['.antigravity'],
        patterns: ['**/.antigravity/**', '**/*antigravity*']
    }
];

export class AiIdeAwareness {
    private readonly logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async scan(): Promise<IdeAwarenessSnapshot> {
        const entries: IdeAwarenessEntry[] = [];

        for (const candidate of IDE_CANDIDATES) {
            const entry = await this.scanCandidate(candidate);
            entries.push(entry);
        }

        const snapshot: IdeAwarenessSnapshot = {
            detectedAt: new Date().toISOString(),
            entries
        };

        this.logger.info('AI IDE awareness scan completed', {
            detectedCount: entries.filter((entry) => entry.detected).length
        });

        return snapshot;
    }

    private async scanCandidate(candidate: IdeCandidate): Promise<IdeAwarenessEntry> {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        const matchedPaths = new Set<string>();

        for (const root of workspaceFolders) {
            for (const directory of candidate.directories) {
                const directoryPath = path.join(root.uri.fsPath, directory);
                try {
                    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(directoryPath));
                    if (stat.type === vscode.FileType.Directory) {
                        matchedPaths.add(directoryPath);
                    }
                } catch {
                    // Ignore missing directories.
                }
            }
        }

        for (const pattern of candidate.patterns) {
            const matches = await vscode.workspace.findFiles(pattern, '{node_modules,.git,dist,build}/**', 200);
            for (const match of matches) {
                matchedPaths.add(match.fsPath);
            }
        }

        const artifacts = await this.extractArtifacts(Array.from(matchedPaths));
        const relatedFiles = artifacts.map((artifact) => artifact.path);
        const timestamps = artifacts.map((artifact) => artifact.timestamp).filter(Boolean);

        const detected = artifacts.length > 0;
        const confidence = detected
            ? (candidate.directories.some((directory) => relatedFiles.some((filePath) => filePath.includes(`/${directory}`))) ? 'high' : 'medium')
            : 'low';

        const summary = this.buildSummary(candidate.ide, artifacts, detected);

        return {
            ide: candidate.ide,
            detected,
            confidence,
            relatedFiles,
            timestamps,
            summary,
            artifacts
        };
    }

    private buildSummary(ide: IdeName, artifacts: IdeArtifactMetadata[], detected: boolean): string {
        if (!detected || artifacts.length === 0) {
            return `${ide} artifacts not detected in the current workspace.`;
        }

        const latest = artifacts
            .map((artifact) => artifact.timestamp)
            .sort()
            .slice(-1)[0];

        return `${ide} artifacts detected (${artifacts.length} file(s)). Latest activity: ${latest ?? 'unknown'}.`;
    }

    private async extractArtifacts(paths: string[]): Promise<IdeArtifactMetadata[]> {
        const artifacts: IdeArtifactMetadata[] = [];

        for (const filePath of paths) {
            try {
                const uri = vscode.Uri.file(filePath);
                const stat = await vscode.workspace.fs.stat(uri);
                const timestamp = new Date(stat.mtime).toISOString();
                const summary = await this.readArtifactSummary(filePath);

                artifacts.push({
                    path: filePath,
                    timestamp,
                    summary
                });
            } catch {
                continue;
            }
        }

        return artifacts
            .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    }

    private async readArtifactSummary(filePath: string): Promise<string> {
        if (filePath.includes('/node_modules/') || filePath.includes('/.git/') || filePath.includes('/dist/') || filePath.includes('/build/')) {
            return 'Ignored artifact path.';
        }

        const ext = path.extname(filePath).toLowerCase();

        if (!['.json', '.md', '.txt', '.yaml', '.yml'].includes(ext) && !filePath.endsWith('.cursorignore')) {
            return 'Artifact detected.';
        }

        try {
            const uri = vscode.Uri.file(filePath);
            const bytes = await vscode.workspace.fs.readFile(uri);
            if (bytes.length > 20000) {
                return 'Artifact detected; content is large and was not read.';
            }

            if (bytes.includes(0)) {
                return 'Artifact detected; binary content omitted.';
            }

            const text = Buffer.from(bytes).toString('utf8');
            const sanitized = this.sanitizeText(text);

            if (sanitized.length === 0) {
                return 'Artifact detected; no readable metadata.';
            }

            if (ext === '.json') {
                const parsed = JSON.parse(sanitized);
                const summary = this.extractJsonSummary(parsed);
                return summary || 'Artifact detected. JSON metadata present.';
            }

            return sanitized.slice(0, 240);
        } catch {
            return 'Artifact detected.';
        }
    }

    private sanitizeText(text: string): string {
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        return lines
            .filter((line) => !/(api[_-]?key|token|secret|password|authorization|bearer)/i.test(line))
            .slice(0, 12)
            .join(' ');
    }

    private extractJsonSummary(value: unknown): string {
        if (!value || typeof value !== 'object') {
            return '';
        }

        const record = value as Record<string, unknown>;
        const timestamp = [
            record.updatedAt,
            record.lastUpdated,
            record.timestamp,
            record.createdAt
        ].find((item) => typeof item === 'string' || typeof item === 'number');

        const related = [
            record.relatedFiles,
            record.recentFiles,
            record.files,
            record.workspace
        ].find((item) => Array.isArray(item));

        const activity = typeof record.summary === 'string'
            ? record.summary
            : typeof record.activity === 'string'
                ? record.activity
                : '';

        const parts = [
            timestamp ? `timestamp=${String(timestamp)}` : '',
            activity ? `activity=${activity.slice(0, 160)}` : '',
            Array.isArray(related) && related.length > 0 ? `related=${related.slice(0, 5).join(', ')}` : ''
        ].filter(Boolean);

        return parts.join(' | ');
    }
}
