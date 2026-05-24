import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

export interface StoredEntry {
    id: string;
    category: string;
    content: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

export class LocalMemoryStore {
    private readonly context: vscode.ExtensionContext;
    private readonly filePath: string;
    private entries: StoredEntry[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.filePath = path.join(context.globalStorageUri.fsPath, 'akhrot-memory.json');
    }

    public async initialize(): Promise<void> {
        await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
        await this.load();
    }

    public async saveSummary(content: string, metadata?: Record<string, unknown>): Promise<void> {
        await this.addEntry('workspace-summary', content, metadata);
    }

    public async saveSnippet(snippet: { category: string; content: string; timestamp?: string; metadata?: Record<string, unknown> }): Promise<void> {
        await this.addEntry(snippet.category, snippet.content, snippet.metadata, snippet.timestamp);
    }

    public async saveChange(change: { type: string; payload: unknown; timestamp?: string }): Promise<void> {
        await this.addEntry('change', JSON.stringify(change.payload), { type: change.type }, change.timestamp);
    }

    public async loadEntries(): Promise<StoredEntry[]> {
        await this.load();
        return [...this.entries];
    }

    private async addEntry(category: string, content: string, metadata?: Record<string, unknown>, timestamp = new Date().toISOString()): Promise<void> {
        await this.load();

        this.entries.unshift({
            id: `${category}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            category,
            content,
            timestamp,
            metadata
        });

        const maxEntries = vscode.workspace.getConfiguration('akhrotWorkspace').get<number>('maxMemoryEntries', 200);
        this.entries = this.entries.slice(0, maxEntries);

        await this.persist();
    }

    private async load(): Promise<void> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                this.entries = parsed as StoredEntry[];
            }
        } catch {
            this.entries = [];
        }
    }

    private async persist(): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(this.entries, null, 2), 'utf8');
    }
}
