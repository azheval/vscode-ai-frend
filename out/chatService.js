"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const chatModels_1 = require("./chatModels");
const OneCAiConnector_1 = require("./OneCAiConnector");
const settingsLoader_1 = require("./settingsLoader");
class ChatService {
    chats = new Map();
    context;
    connector = null;
    currentConversationId = null;
    isConnected = false;
    constructor(context) {
        this.context = context;
        // Initialize with default chat
        const defaultChat = new chatModels_1.ChatHistory('default', 'Default Chat');
        this.chats.set('default', defaultChat);
    }
    async initializeConnection() {
        // Check auto-connect setting
        const shouldAutoConnect = (0, settingsLoader_1.getAutoConnectSetting)();
        if (shouldAutoConnect) {
            try {
                const cfg = await (0, settingsLoader_1.loadSettings)();
                if (cfg && cfg.token) {
                    this.connector = new OneCAiConnector_1.OneCAiConnector(cfg.token, cfg.base_url || 'https://code.1c.ai', cfg.timeout || 30, cfg.debug || false);
                    try {
                        this.currentConversationId = await this.connector.start_conversation();
                        this.isConnected = true;
                        return { status: 'connected', text: 'Connected and conversation started' };
                    }
                    catch (e) {
                        this.connector = null; // Disconnect if conversation fails
                        this.isConnected = false;
                        return { status: 'error', text: `Conversation start failed: ${e instanceof Error ? e.message : String(e)}` };
                    }
                }
                else {
                    return { status: 'disconnected', text: 'Missing token in .vscode/settings.json' };
                }
            }
            catch (e) {
                return { status: 'error', text: `Failed to load settings: ${e instanceof Error ? e.message : String(e)}` };
            }
        }
        return { status: 'disconnected', text: 'Disconnected' };
    }
    async toggleConnection() {
        if (this.connector) {
            // Disconnect
            this.connector = null;
            this.currentConversationId = null;
            this.isConnected = false;
            return { status: 'disconnected', text: 'Disconnected' };
        }
        else {
            // Connect
            try {
                const cfg = await (0, settingsLoader_1.loadSettings)();
                if (!cfg || !cfg.token) {
                    return { status: 'error', text: 'Missing token in .vscode/settings.json' };
                }
                else {
                    this.connector = new OneCAiConnector_1.OneCAiConnector(cfg.token, cfg.base_url || 'https://code.1c.ai', cfg.timeout || 30, cfg.debug || false);
                    try {
                        this.currentConversationId = await this.connector.start_conversation();
                        this.isConnected = true;
                        return { status: 'connected', text: 'Connected' };
                    }
                    catch (e) {
                        this.connector = null;
                        this.isConnected = false;
                        return { status: 'error', text: `Conversation start failed: ${e instanceof Error ? e.message : String(e)}` };
                    }
                }
            }
            catch (e) {
                return { status: 'error', text: `Connect failed: ${e instanceof Error ? e.message : String(e)}` };
            }
        }
    }
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            connector: this.connector,
            currentConversationId: this.currentConversationId
        };
    }
    async loadChats() {
        const serializedChats = this.context.globalState.get('chatPanel.chats') || [];
        this.chats.clear();
        serializedChats.forEach(data => {
            const chat = new chatModels_1.ChatHistory(data.id, data.name);
            chat.messages = data.messages.map((msgData) => {
                const msg = new chatModels_1.ChatMessage(msgData.text, msgData.isUser);
                msg.timestamp = new Date(msgData.timestamp);
                return msg;
            });
            this.chats.set(data.id, chat);
        });
        // If no default chat exists, create one
        if (!this.chats.has('default')) {
            const defaultChat = new chatModels_1.ChatHistory('default', 'Default Chat');
            this.chats.set('default', defaultChat);
        }
    }
    async loadChatsFromData(data) {
        this.chats.clear();
        data.forEach(chatData => {
            const chat = new chatModels_1.ChatHistory(chatData.id, chatData.name);
            chat.messages = chatData.messages.map((msgData) => {
                const msg = new chatModels_1.ChatMessage(msgData.text, msgData.isUser);
                msg.timestamp = new Date(msgData.timestamp);
                return msg;
            });
            this.chats.set(chatData.id, chat);
        });
        // Save the loaded chats to global state
        await this.saveChats();
    }
    async saveChats() {
        const serializedChats = Array.from(this.chats.entries()).map(([id, chat]) => ({
            id,
            name: chat.name,
            messages: chat.messages.map(msg => ({
                text: msg.text,
                isUser: msg.isUser,
                timestamp: msg.timestamp
            }))
        }));
        await this.context.globalState.update('chatPanel.chats', serializedChats);
    }
    getChats() {
        return this.chats;
    }
    getChat(chatId) {
        return this.chats.get(chatId);
    }
    addChat(chatId, chatName) {
        const newChat = new chatModels_1.ChatHistory(chatId, chatName);
        this.chats.set(chatId, newChat);
        return newChat;
    }
    deleteChat(chatId) {
        return this.chats.delete(chatId);
    }
    async handleSendMessage(chatId, text, onPartialResponse) {
        // Get or create the chat if it doesn't exist
        if (!this.chats.has(chatId)) {
            const chatName = `Chat ${this.chats.size}`;
            this.addChat(chatId, chatName);
        }
        // Get the chat
        const chat = this.chats.get(chatId);
        // Add user message to chat history
        chat.messages.push(new chatModels_1.ChatMessage(text, true));
        // Check if we have a connector
        if (!this.connector) {
            const error = 'Not connected to 1C.ai service';
            chat.messages.push(new chatModels_1.ChatMessage(error, false));
            await this.saveChats();
            return { success: false, error };
        }
        try {
            // Ensure conversation exists
            if (!this.currentConversationId) {
                try {
                    const conv = await this.connector.start_conversation();
                    this.currentConversationId = conv;
                }
                catch (e) {
                    const error = `Conversation failed: ${e instanceof Error ? e.message : String(e)}`;
                    chat.messages.push(new chatModels_1.ChatMessage(error, false));
                    await this.saveChats();
                    return { success: false, error };
                }
            }
            // Ask question and stream responses
            let fullResponse = '';
            await this.connector.ask_question(this.currentConversationId, text, (partialText) => {
                fullResponse = partialText;
                if (onPartialResponse) {
                    onPartialResponse(fullResponse);
                }
            });
            // Add bot response to chat history
            chat.messages.push(new chatModels_1.ChatMessage(fullResponse, false));
            // Save the chat history
            await this.saveChats();
            return { success: true, response: fullResponse };
        }
        catch (e) {
            const error = `Send failed: ${e instanceof Error ? e.message : String(e)}`;
            chat.messages.push(new chatModels_1.ChatMessage(error, false));
            await this.saveChats();
            return { success: false, error };
        }
    }
    async startNewChat() {
        if (!this.connector) {
            return { success: false, error: 'Not connected to 1C.ai service' };
        }
        try {
            this.currentConversationId = await this.connector.start_conversation();
            return { success: true, conversationId: this.currentConversationId };
        }
        catch (e) {
            return { success: false, error: `Failed to start new conversation: ${e instanceof Error ? e.message : String(e)}` };
        }
    }
}
exports.ChatService = ChatService;
//# sourceMappingURL=chatService.js.map