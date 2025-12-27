const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

let currentPanel = null;
let currentConnector = null;
let currentConversationId = null;
let __nextReqId = 1;

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// OneCAiConnector: minimal JS implementation mirroring Python OneCAiConnector
class OneCAiConnector {
  constructor(token, base_url = 'https://code.1c.ai', timeout = 30, debug = false) {
    this.base_url = base_url;
    this.headers = {
      'Authorization': token,
      'Content-Type': 'application/json'
    };
    this.timeout = timeout * 1000;
    this.debug = debug;
  }

  async _doPostJSON(path, payload) {
    const url = new URL(path, this.base_url);
    const body = JSON.stringify(payload);
    const https = require(url.protocol === 'https:' ? 'https' : 'http');

    return new Promise((resolve, reject) => {
      const opts = {
        method: 'POST',
        headers: Object.assign({}, this.headers, { 'Content-Length': Buffer.byteLength(body) })
      };
      const req = https.request(url, opts, (res) => {
        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ statusCode: res.statusCode, headers: res.headers, body: text });
        });
      });
      req.on('error', (e) => reject(e));
      req.setTimeout(this.timeout, () => {
        req.destroy(new Error('timeout'));
      });
      req.write(body);
      req.end();
    });
  }

  async _doPostStream(path, payload, onLine) {
    const url = new URL(path, this.base_url);
    const body = JSON.stringify(payload);
    const https = require(url.protocol === 'https:' ? 'https' : 'http');

    return new Promise((resolve, reject) => {
      const opts = {
        method: 'POST',
        headers: Object.assign({}, this.headers, { 'Content-Length': Buffer.byteLength(body), 'Accept': 'text/event-stream' })
      };
      const req = https.request(url, opts, (res) => {
        if (res.statusCode !== 200) {
          let buf = [];
          res.on('data', (c) => buf.push(c));
          res.on('end', () => reject(new Error(`Status ${res.statusCode}: ${Buffer.concat(buf).toString('utf8')}`)));
          return;
        }

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          let lines = buffer.split(/\n/);
          buffer = lines.pop();
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('data: ')) {
              const jsonText = trimmed.slice(6);
              onLine(jsonText);
            }
          }
        });
        res.on('end', () => resolve());
      });
      req.on('error', (e) => reject(e));
      req.setTimeout(this.timeout, () => {
        req.destroy(new Error('timeout'));
      });
      req.write(body);
      req.end();
    });
  }

  async start_conversation() {
    // Must follow ConversationInit model: include skill_name and is_chat
    const payload = { skill_name: 'custom', is_chat: true };
    const path = '/chat_api/v1/conversations/';
    const r = await this._doPostJSON(path, payload);
    if (r.statusCode !== 200) throw new Error(`Failed to init conversation: ${r.statusCode} ${r.body}`);
    const json = JSON.parse(r.body);
    const conv_id = json.uuid;
    return conv_id;
  }

  async ask_question(conv_id, text, onDelta) {
    // Triple-Nest Message Structure (role + MessageEnvelope)
    // Include parent_uuid field (null) to match Python model serialization (prevents 422 validation)
    const envelope = { role: 'user', content: { content: { instruction: text } }, parent_uuid: null };
    const path = `/chat_api/v1/conversations/${conv_id}/messages`;
    let full = '';
    await this._doPostStream(path, envelope, (jsonText) => {
      try {
        const data = JSON.parse(jsonText);
        if (data.content_delta && data.content_delta.content) {
          full += data.content_delta.content;
          if (onDelta) onDelta(full);
        } else if (data.content && data.content.content) {
          const final = data.content.content;
          if (typeof final === 'string' && final.length > full.length) {
            full = final;
            if (onDelta) onDelta(full);
          }
        }
      } catch (e) {
        if (this.debug) console.error('parse chunk failed', e);
      }
    });
    return full.trim();
  }
}

async function loadSettings() {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('No workspace folder open');
    }
    const workspaceRoot = folders[0].uri.fsPath;
    const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
    let raw = null;
    try {
      raw = await fs.promises.readFile(settingsPath, 'utf8');
    } catch (e) {
      throw new Error(`Unable to read ${settingsPath}: ${e && e.message}`);
    }
    const obj = JSON.parse(raw);
    // Expected keys: token, base_url
    return {
      token: obj.token,
      base_url: obj.base_url || obj.baseUrl || obj['base_url'],
      timeout: obj.timeout,
      debug: obj.debug
    };
  } catch (e) {
    throw e;
  }
}

function getAutoConnectSetting() {
  const config = vscode.workspace.getConfiguration('vscode-ai-frend');
  return config.get('autoConnect', true);
}

function _getHtmlForWebview(webview, extensionUri) {
  const nonce = getNonce();
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chat.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'chat.js'));

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link href="${styleUri}" rel="stylesheet">
<title>1C.ai Assistant Chat</title>
</head>
<body>
  <div class="chat-container">    <div class="toolbar">
     <div class="conn-status-container" title="Connection status">
       <div id="connIndicator" class="conn-indicator"></div>
       <span id="connStatusText" class="conn-status-text">Disconnected</span>
     </div>
     <div class="service-menu">
       <button id="serviceMenuBtn" class="service-menu-btn" title="Service menu">
         <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
           <circle cx="3" cy="8" r="1.5" fill="currentColor"/>
           <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
           <circle cx="13" cy="8" r="1.5" fill="currentColor"/>
         </svg>
       </button>
       <div id="serviceMenuDropdown" class="service-menu-dropdown hidden">
         <button id="connectBtn" title="Connect to 1C.ai">Connect</button>
         <button id="openForm" title="Открыть форму">Открыть форму</button>
       </div>
     </div>
   </div>
    <div id="history" class="history" aria-live="polite"></div>
    <div class="composer">
     <button id="newChatBtn" title="New Chat">New Chat</button>
     <textarea id="input" rows="4" placeholder="Введите сообщение (Enter — отправить; Shift+Enter — новая строка)" aria-label="Сообщение"></textarea>
     <button id="send">Отправить</button>
   </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
  </script>
  <script src="${scriptUri}" nonce="${nonce}"></script>
</body>
</html>`;
}

function activate(context) {
  const openChatCommand = vscode.commands.registerCommand('vscode-ai-frend.openChat', () => {
    if (currentPanel) {
      currentPanel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel('vscode-ai-frend.panel', '1C.ai Chat', vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    });
    currentPanel = panel;

    panel.webview.html = _getHtmlForWebview(panel.webview, context.extensionUri);

    // Send initial theme to the webview
    try {
      const t = vscode.window.activeColorTheme;
      const kindStr = t.kind === vscode.ColorThemeKind.Dark ? 'dark' : t.kind === vscode.ColorThemeKind.HighContrast ? 'high-contrast' : 'light';
      panel.webview.postMessage({ command: 'vscodeThemeChanged', theme: kindStr });
    } catch (e) {}

    // Post initial connection status and attempt to load settings and auto-connect
    panel.webview.postMessage({ command: 'connStatus', status: 'disconnected', text: 'Disconnected' });
    (async () => {
      // Check auto-connect setting
      const shouldAutoConnect = getAutoConnectSetting();
      if (shouldAutoConnect) {
        try {
          const cfg = await loadSettings();
          if (cfg && cfg.token) {
            currentConnector = new OneCAiConnector(cfg.token, cfg.base_url || 'https://code.1c.ai', cfg.timeout || 30, cfg.debug || false);
            currentConversationId = null;
            panel.webview.postMessage({ command: 'connStatus', status: 'connected', text: 'Connected (from .vscode/settings.json)' });
          } else {
            panel.webview.postMessage({ command: 'connStatus', status: 'disconnected', text: 'Missing token in .vscode/settings.json' });
          }
        } catch (e) {
          panel.webview.postMessage({ command: 'connStatus', status: 'error', text: `Failed to load settings: ${e && e.message}` });
        }
      }
    })();

    panel.onDidDispose(() => { currentPanel = null; });

    panel.webview.onDidReceiveMessage(async (message) => {
      try {
        if (message.command === 'send') {
          // Post user message to UI immediately
          panel.webview.postMessage({ command: 'append', who: 'me', text: message.text });

          if (!currentConnector) {
            panel.webview.postMessage({ command: 'connStatus', status: 'disconnected', text: 'Not connected' });
            return;
          }

          // Ensure conversation exists
          if (!currentConversationId) {
            panel.webview.postMessage({ command: 'connStatus', status: 'starting-conversation', text: 'Starting conversation...' });
            try {
              const conv = await currentConnector.start_conversation();
              currentConversationId = conv;
              panel.webview.postMessage({ command: 'connStatus', status: 'conversation-started', text: `Conversation ${conv}` });
            } catch (e) {
              panel.webview.postMessage({ command: 'connStatus', status: 'error', text: `Conversation failed: ${e && e.message}` });
              return;
            }
          }

          // Ask question and stream responses
          panel.webview.postMessage({ command: 'connStatus', status: 'processing', text: 'Sending message...' });
          try {
            let partial = '';
            await currentConnector.ask_question(currentConversationId, message.text, (partialText) => {
              partial = partialText;
              // stream partial updates to webview (replace last bot text)
              panel.webview.postMessage({ command: 'stream', text: partial });
            });
            // final message
            panel.webview.postMessage({ command: 'final', text: partial });
            panel.webview.postMessage({ command: 'connStatus', status: 'connected', text: 'Idle' });
          } catch (e) {
            panel.webview.postMessage({ command: 'connStatus', status: 'error', text: `Send failed: ${e && e.message}` });
          }

        } else if (message.command === 'openForm') {
          // Ensure panel is visible
          panel.reveal(vscode.ViewColumn.One);
        } else if (message.command === 'connect') {
          // Toggle connect/disconnect
          if (currentConnector) {
            try {
              currentConnector = null;
              currentConversationId = null;
              panel.webview.postMessage({ command: 'connStatus', status: 'disconnected', text: 'Disconnected' });
            } catch (e) {
              panel.webview.postMessage({ command: 'connStatus', status: 'error', text: `Disconnect failed: ${e && e.message}` });
            }
            return;
          }

          panel.webview.postMessage({ command: 'connStatus', status: 'connecting', text: 'Connecting...' });
          try {
            const cfg = await loadSettings();
            if (!cfg || !cfg.token) {
              panel.webview.postMessage({ command: 'connStatus', status: 'error', text: 'Missing token in .vscode/settings.json' });
            } else {
              currentConnector = new OneCAiConnector(cfg.token, cfg.base_url || 'https://code.1c.ai', cfg.timeout || 30, cfg.debug || false);
              currentConversationId = null;
              panel.webview.postMessage({ command: 'connStatus', status: 'connected', text: 'Connected' });
            }
          } catch (e) {
            panel.webview.postMessage({ command: 'connStatus', status: 'error', text: `Connect failed: ${e && e.message}` });
          }
        } else if (message.command === 'newChat') {
          // Start a new conversation without showing ID
          if (currentConnector) {
            try {
              currentConversationId = await currentConnector.start_conversation();
              panel.webview.postMessage({ command: 'connStatus', status: 'connected', text: 'Connected' }); // Keep connection status only
              panel.webview.postMessage({ command: 'newConversationStarted', conversationId: currentConversationId });
            } catch (e) {
              panel.webview.postMessage({ command: 'connStatus', status: 'error', text: `Failed to start new conversation: ${e && e.message}` });
            }
          } else {
            panel.webview.postMessage({ command: 'connStatus', status: 'disconnected', text: 'Not connected' });
          }
        } else if (message.command === 'prefill') {
          // handled in webview
        }
      } catch (e) {
        console.error('message handler error', e);
      }
    });
  });

  // Register new chat command
  const newChatCommand = vscode.commands.registerCommand('vscode-ai-frend.newChat', () => {
    // If there's no panel open, open the chat first
    if (!currentPanel) {
      vscode.commands.executeCommand('vscode-ai-frend.openChat');
      return;
    }

    // If panel exists, send message to start a new conversation
    currentPanel.webview.postMessage({ command: 'newChat' });
  });

  context.subscriptions.push(openChatCommand);
  context.subscriptions.push(newChatCommand);

  // Register command to open chat panel from sidebar
  const openChatPanelFromSidebarCommand = vscode.commands.registerCommand('vscode-ai-frend.openChatPanelFromSidebar', () => {
    vscode.commands.executeCommand('vscode-ai-frend.openChat');
  });
  context.subscriptions.push(openChatPanelFromSidebarCommand);

  // Command: send the current editor selection to the chat (prefill input)
  const sendSelectionDisposable = vscode.commands.registerCommand('vscode-ai-frend.sendSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Open an editor and select some text to send to the chat.');
      return;
    }
    const sel = editor.selection;
    let text = editor.document.getText(sel);
    if (!text) {
      // fallback: current line
      text = editor.document.lineAt(sel.active.line).text || '';
    }

    // Ensure panel exists
    if (!currentPanel) {
      await vscode.commands.executeCommand('vscode-ai-frend.openChat');
      // small delay to let the panel initialize
      await new Promise((r) => setTimeout(r, 100));
    }

    if (currentPanel) {
      currentPanel.reveal(vscode.ViewColumn.One);
      currentPanel.webview.postMessage({ command: 'prefill', text });
    } else {
      vscode.window.showInformationMessage('Chat panel is not available.');
    }
  });
  context.subscriptions.push(sendSelectionDisposable);

  // Forward theme changes to the webview (so the UI can react immediately)
  const themeListener = vscode.window.onDidChangeActiveColorTheme((theme) => {
    if (currentPanel) {
      const kindStr = theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : theme.kind === vscode.ColorThemeKind.HighContrast ? 'high-contrast' : 'light';
      currentPanel.webview.postMessage({ command: 'vscodeThemeChanged', theme: kindStr });
    }
  });
  context.subscriptions.push(themeListener);
}

function deactivate() {}

module.exports = { activate, deactivate };