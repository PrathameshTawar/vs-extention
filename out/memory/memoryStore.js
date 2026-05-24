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
exports.LocalMemoryStore = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class LocalMemoryStore {
    constructor(context) {
        this.entries = [];
        this.context = context;
        this.filePath = path.join(context.globalStorageUri.fsPath, 'akhrot-memory.json');
    }
    async initialize() {
        await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
        await this.load();
    }
    async saveSummary(content, metadata) {
        await this.addEntry('workspace-summary', content, metadata);
    }
    async saveSnippet(snippet) {
        await this.addEntry(snippet.category, snippet.content, snippet.metadata, snippet.timestamp);
    }
    async saveChange(change) {
        await this.addEntry('change', JSON.stringify(change.payload), { type: change.type }, change.timestamp);
    }
    async loadEntries() {
        await this.load();
        return [...this.entries];
    }
    async addEntry(category, content, metadata, timestamp = new Date().toISOString()) {
        await this.load();
        this.entries.unshift({
            id: `${category}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            category,
            content,
            timestamp,
            metadata
        });
        const maxEntries = vscode.workspace.getConfiguration('akhrotWorkspace').get('maxMemoryEntries', 200);
        this.entries = this.entries.slice(0, maxEntries);
        await this.persist();
    }
    async load() {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                this.entries = parsed;
            }
        }
        catch {
            this.entries = [];
        }
    }
    async persist() {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(this.entries, null, 2), 'utf8');
    }
}
exports.LocalMemoryStore = LocalMemoryStore;
//# sourceMappingURL=memoryStore.js.map