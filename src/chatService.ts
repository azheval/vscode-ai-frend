import * as vscode from 'vscode';
import { ChatMessage, ChatHistory } from './chatModels';
import { OneCAiConnector } from './OneCAiConnector';
import { loadSettings, getAutoConnectSetting } from './settingsLoader';

export class ChatService {
	private chats: Map<string, ChatHistory> = new Map();
	private context: vscode.ExtensionContext;
	private connector: OneCAiConnector | null = null;
	private currentConversationId: string | null = null;
	private isConnected: boolean = false;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		// Initialize with default chat
		const defaultChat = new ChatHistory('default', 'Default Chat');
		this.chats.set('default', defaultChat);
	}

	public async initializeConnection() {
		// Check auto-connect setting
		const shouldAutoConnect = getAutoConnectSetting();
		if (shouldAutoConnect) {
			try {
				const cfg = await loadSettings();
				if (cfg && cfg.token) {
					this.connector = new OneCAiConnector(
						cfg.token, 
						cfg.base_url || 'https://code.1c.ai', 
						cfg.timeout || 30, 
						cfg.debug || false
					);
					try {
						this.currentConversationId = await this.connector.start_conversation();
						this.isConnected = true;
						return { status: 'connected', text: 'Connected and conversation started' };
					} catch (e) {
						this.connector = null; // Disconnect if conversation fails
						this.isConnected = false;
						return { status: 'error', text: `Conversation start failed: ${e instanceof Error ? e.message : String(e)}` };
					}
				} else {
					return { status: 'disconnected', text: 'Missing token in .vscode/settings.json' };
				}
			} catch (e) {
				return { status: 'error', text: `Failed to load settings: ${e instanceof Error ? e.message : String(e)}` };
			}
		}
		return { status: 'disconnected', text: 'Disconnected' };
	}

	public async toggleConnection(): Promise<{ status: string; text: string }> {
		if (this.connector) {
			// Disconnect
			this.connector = null;
			this.currentConversationId = null;
			this.isConnected = false;
			return { status: 'disconnected', text: 'Disconnected' };
		} else {
			// Connect
			try {
				const cfg = await loadSettings();
				if (!cfg || !cfg.token) {
					return { status: 'error', text: 'Missing token in .vscode/settings.json' };
				} else {
					this.connector = new OneCAiConnector(
						cfg.token, 
						cfg.base_url || 'https://code.1c.ai', 
						cfg.timeout || 30, 
						cfg.debug || false
					);
					try {
						this.currentConversationId = await this.connector.start_conversation();
						this.isConnected = true;
						return { status: 'connected', text: 'Connected' };
					} catch (e) {
						this.connector = null;
						this.isConnected = false;
						return { status: 'error', text: `Conversation start failed: ${e instanceof Error ? e.message : String(e)}` };
					}
				}
			} catch (e) {
				return { status: 'error', text: `Connect failed: ${e instanceof Error ? e.message : String(e)}` };
			}
		}
	}

	public getConnectionStatus() {
		return {
			isConnected: this.isConnected,
			connector: this.connector,
			currentConversationId: this.currentConversationId
		};
	}

	public async loadChats() {
		const serializedChats = this.context.globalState.get<any[]>('chatPanel.chats') || [];
		
		this.chats.clear();
		
		serializedChats.forEach(data => {
			const chat = new ChatHistory(data.id, data.name);
			chat.messages = data.messages.map((msgData: any) => {
				const msg = new ChatMessage(msgData.text, msgData.isUser);
				msg.timestamp = new Date(msgData.timestamp);
				return msg;
			});
			this.chats.set(data.id, chat);
		});
		
		// If no default chat exists, create one
		if (!this.chats.has('default')) {
			const defaultChat = new ChatHistory('default', 'Default Chat');
			this.chats.set('default', defaultChat);
		}
	}
	
	public async loadChatsFromData(data: any[]) {
		this.chats.clear();
		
		data.forEach(chatData => {
			const chat = new ChatHistory(chatData.id, chatData.name);
			chat.messages = chatData.messages.map((msgData: any) => {
				const msg = new ChatMessage(msgData.text, msgData.isUser);
				msg.timestamp = new Date(msgData.timestamp);
				return msg;
			});
			this.chats.set(chatData.id, chat);
		});
		
		// Save the loaded chats to global state
		await this.saveChats();
	}
	
	public async saveChats() {
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

	public getChats() {
		return this.chats;
	}

	public getChat(chatId: string) {
		return this.chats.get(chatId);
	}

	public addChat(chatId: string, chatName: string) {
		const newChat = new ChatHistory(chatId, chatName);
		this.chats.set(chatId, newChat);
		return newChat;
	}

	public deleteChat(chatId: string) {
		return this.chats.delete(chatId);
	}

	public async handleSendMessage(chatId: string, text: string, onPartialResponse?: (partialText: string) => void): Promise<{ success: boolean; response?: string; error?: string; }> {
		// Get or create the chat if it doesn't exist
		if (!this.chats.has(chatId)) {
			const chatName = `Chat ${this.chats.size}`;
			this.addChat(chatId, chatName);
		}

		// Get the chat
		const chat = this.chats.get(chatId)!;
		
		// Add user message to chat history
		chat.messages.push(new ChatMessage(text, true));
		
		// Check if we have a connector
		if (!this.connector) {
			const error = 'Not connected to 1C.ai service';
			chat.messages.push(new ChatMessage(error, false));
			await this.saveChats();
			return { success: false, error };
		}

		try {
			// Ensure conversation exists
			if (!this.currentConversationId) {
				try {
					const conv = await this.connector.start_conversation();
					this.currentConversationId = conv;
				} catch (e) {
					const error = `Conversation failed: ${e instanceof Error ? e.message : String(e)}`;
					chat.messages.push(new ChatMessage(error, false));
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
			chat.messages.push(new ChatMessage(fullResponse, false));
			
			// Save the chat history
			await this.saveChats();
			
			return { success: true, response: fullResponse };
		} catch (e) {
			const error = `Send failed: ${e instanceof Error ? e.message : String(e)}`;
			chat.messages.push(new ChatMessage(error, false));
			await this.saveChats();
			return { success: false, error };
		}
	}

	public async startNewChat() {
		if (!this.connector) {
			return { success: false, error: 'Not connected to 1C.ai service' };
		}

		try {
			this.currentConversationId = await this.connector.start_conversation();
			return { success: true, conversationId: this.currentConversationId };
		} catch (e) {
			return { success: false, error: `Failed to start new conversation: ${e instanceof Error ? e.message : String(e)}` };
		}
	}
}
