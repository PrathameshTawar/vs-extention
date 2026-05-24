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
exports.AiIdeAwareness = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const IDE_CANDIDATES = [
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
class AiIdeAwareness {
    constructor(logger) {
        this.logger = logger;
    }
    async scan() {
        const entries = [];
        for (const candidate of IDE_CANDIDATES) {
            const entry = await this.scanCandidate(candidate);
            entries.push(entry);
        }
        const snapshot = {
            detectedAt: new Date().toISOString(),
            entries
        };
        this.logger.info('AI IDE awareness scan completed', {
            detectedCount: entries.filter((entry) => entry.detected).length
        });
        return snapshot;
    }
    async scanCandidate(candidate) {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        const matchedPaths = new Set();
        for (const root of workspaceFolders) {
            for (const directory of candidate.directories) {
                const directoryPath = path.join(root.uri.fsPath, directory);
                try {
                    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(directoryPath));
                    if (stat.type === vscode.FileType.Directory) {
                        matchedPaths.add(directoryPath);
                    }
                }
                catch {
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
    buildSummary(ide, artifacts, detected) {
        if (!detected || artifacts.length === 0) {
            return `${ide} artifacts not detected in the current workspace.`;
        }
        const latest = artifacts
            .map((artifact) => artifact.timestamp)
            .sort()
            .slice(-1)[0];
        return `${ide} artifacts detected (${artifacts.length} file(s)). Latest activity: ${latest ?? 'unknown'}.`;
    }
    async extractArtifacts(paths) {
        const artifacts = [];
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
            }
            catch {
                continue;
            }
        }
        return artifacts
            .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    }
    async readArtifactSummary(filePath) {
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
        }
        catch {
            return 'Artifact detected.';
        }
    }
    sanitizeText(text) {
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        return lines
            .filter((line) => !/(api[_-]?key|token|secret|password|authorization|bearer)/i.test(line))
            .slice(0, 12)
            .join(' ');
    }
    extractJsonSummary(value) {
        if (!value || typeof value !== 'object') {
            return '';
        }
        const record = value;
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
exports.AiIdeAwareness = AiIdeAwareness;
//# sourceMappingURL=ideAwareness.js.map