import * as vscode from 'vscode';
import * as path from 'path';

export interface Settings {
    token?: string;
    base_url?: string;
    timeout?: number;
    debug?: boolean;
}

export async function loadSettings(): Promise<Settings> {
    try {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            throw new Error('No workspace folder open');
        }
        const workspaceRoot = folders[0].uri.fsPath;
        const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');

        let raw: string | undefined;
        try {
            raw = (await vscode.workspace.fs.readFile(vscode.Uri.file(settingsPath))).toString();
        } catch (e) {
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
    } catch (e) {
        throw e instanceof Error ? e : new Error(String(e));
    }
}

export function getAutoConnectSetting(): boolean {
    const config = vscode.workspace.getConfiguration('one-ai');
    return config.get<boolean>('autoConnect', true);
}