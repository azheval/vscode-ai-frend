"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatHistory = exports.ChatMessage = void 0;
class ChatMessage {
    text;
    isUser;
    timestamp;
    constructor(text, isUser) {
        this.text = text;
        this.isUser = isUser;
        this.timestamp = new Date();
    }
}
exports.ChatMessage = ChatMessage;
class ChatHistory {
    id;
    name;
    messages;
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.messages = [];
    }
}
exports.ChatHistory = ChatHistory;
//# sourceMappingURL=chatModels.js.map