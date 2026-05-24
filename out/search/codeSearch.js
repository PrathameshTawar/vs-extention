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
exports.CodeSearcher = void 0;
const vscode = __importStar(require("vscode"));
const safeWorkspace_1 = require("../utils/safeWorkspace");
class CodeSearcher {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
    }
    async searchCode(query) {
        const normalized = query.trim();
        if (!normalized) {
            return [];
        }
        const maxResults = this.config.get('maxSearchResults', 50);
        const lowerCaseQuery = normalized.toLowerCase();
        const results = [];
        const files = await vscode.workspace.findFiles('**/*', '{node_modules,.git,dist,build}/**', maxResults * 5);
        for (const file of files) {
            if (!(0, safeWorkspace_1.isTextPath)(file.fsPath)) {
                continue;
            }
            const content = await (0, safeWorkspace_1.safeReadFile)(file.fsPath);
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
exports.CodeSearcher = CodeSearcher;
//# sourceMappingURL=codeSearch.js.map