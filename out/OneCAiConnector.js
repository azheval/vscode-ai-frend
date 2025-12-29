"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OneCAiConnector = void 0;
// OneCAiConnector: minimal JS implementation mirroring Python OneCAiConnector
class OneCAiConnector {
    baseUrl;
    headers;
    timeout;
    debug;
    constructor(token, baseUrl = 'https://code.1c.ai', timeout = 30, debug = false) {
        this.baseUrl = baseUrl;
        this.headers = {
            'Authorization': token,
            'Content-Type': 'application/json'
        };
        this.timeout = timeout * 1000;
        this.debug = debug;
    }
    async _doPostJSON(path, payload) {
        const url = new URL(path, this.baseUrl);
        const body = JSON.stringify(payload);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: { ...this.headers, 'Content-Length': Buffer.byteLength(body).toString() },
                body: body,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const text = await response.text();
            return { statusCode: response.status, headers: response.headers, body: text };
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('timeout');
            }
            throw error;
        }
    }
    async _doPostStream(path, payload, onLine) {
        const url = new URL(path, this.baseUrl);
        const body = JSON.stringify(payload);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    ...this.headers,
                    'Content-Length': Buffer.byteLength(body).toString(),
                    'Accept': 'text/event-stream'
                },
                body: body,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.status !== 200) {
                const errorBody = await response.text();
                throw new Error(`Status ${response.status}: ${errorBody}`);
            }
            if (!response.body) {
                throw new Error('No response body');
            }
            let buffer = '';
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\n/);
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    if (trimmed.startsWith('data: ')) {
                        const jsonText = trimmed.slice(6);
                        onLine(jsonText);
                    }
                }
            }
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('timeout');
            }
            throw error;
        }
    }
    async start_conversation() {
        // Must follow ConversationInit model: include skill_name and is_chat
        const payload = { skill_name: 'custom', is_chat: true };
        const path = '/chat_api/v1/conversations/';
        const r = await this._doPostJSON(path, payload);
        if (r.statusCode !== 200)
            throw new Error(`Failed to init conversation: ${r.statusCode} ${r.body}`);
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
                    if (onDelta)
                        onDelta(full);
                }
                else if (data.content && data.content.content) {
                    const final = data.content.content;
                    if (typeof final === 'string' && final.length > full.length) {
                        full = final;
                        if (onDelta)
                            onDelta(full);
                    }
                }
            }
            catch (e) {
                if (this.debug)
                    console.error('parse chunk failed', e);
            }
        });
        return full.trim();
    }
}
exports.OneCAiConnector = OneCAiConnector;
//# sourceMappingURL=OneCAiConnector.js.map