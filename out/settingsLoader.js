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
exports.loadSettings = loadSettings;
exports.getAutoConnectSetting = getAutoConnectSetting;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
async function loadSettings() {
    try {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            throw new Error('No workspace folder open');
        }
        const workspaceRoot = folders[0].uri.fsPath;
        const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
        let raw;
        try {
            raw = (await vscode.workspace.fs.readFile(vscode.Uri.file(settingsPath))).toString();
        }
        catch (e) {
            throw new Error(`Unable to read ${settingsPath}: ${e instanceof Error ? e.message : String(e)}`);
        }
        const obj = JSON.parse(raw);
        // Expected keys: one-ai.token, one-ai.base_url (with fallbacks to old keys)
        return {
            token: obj['one-ai.token'] || obj.token,
            base_url: obj['one-ai.base_url'] || obj.base_url || obj.baseUrl || obj['base_url'],
            timeout: obj['one-ai.timeout'] || obj.timeout,
            debug: obj['one-ai.debug'] || obj.debug
        };
    }
    catch (e) {
        throw e instanceof Error ? e : new Error(String(e));
    }
}
function getAutoConnectSetting() {
    const config = vscode.workspace.getConfiguration('one-ai');
    return config.get('autoConnect', true);
}
//# sourceMappingURL=settingsLoader.js.map