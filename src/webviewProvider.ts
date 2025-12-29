import * as vscode from 'vscode';
import * as path from 'path';
import { ChatService } from './chatService';
import { ChatMessage } from './chatModels';

export class ChatPanel implements vscode.WebviewViewProvider {
	public static readonly viewType = 'oneai.chatPanel';
	private view?: vscode.WebviewView;
	private chatService: ChatService;
	private currentChatId: string = 'default';
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.chatService = new ChatService(context);
		this.context = context;
	}

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true
		};
		webviewView.webview.html = this.getWebviewContent();

		// Initialize connection status
		const connectionStatus = await this.chatService.initializeConnection();
		if (this.view) {
			this.view.webview.postMessage({
				command: 'updateConnectionStatus',
				isConnected: connectionStatus.status === 'connected',
				statusText: connectionStatus.text
			});
		}

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'sendMessage':
					this.handleSendMessage(message.chatId, message.text);
					return;
				case 'newChat':
					this.handleNewChat(message.chatId, message.chatName);
					return;
				case 'switchChat':
					this.handleSwitchChat(message.chatId);
					return;
				case 'deleteChat':
					this.handleDeleteChat(message.chatId);
					return;
				case 'confirmDeleteChat':
					this.handleConfirmDeleteChat(message.chatId);
					return;
				case 'saveChatToFile':
					this.handleSaveChatToFile();
					return;
				case 'loadChatFromFile':
					this.handleLoadChatFromFile();
					return;
				case 'saveCurrentChatToFile':
					this.handleSaveCurrentChatToFile(message.chatId);
					return;
				case 'loadCurrentChatFromFile':
					this.handleLoadCurrentChatFromFile();
					return;
				case 'saveAllChatsToFile':
					this.handleSaveChatToFile();
					return;
				case 'loadAllChatsFromFile':
					this.handleLoadChatFromFile();
					return;
				case 'deleteAllChats':
					this.handleDeleteAllChats();
					return;
				case 'toggleConnection':
					this.handleToggleConnection();
					return;
			}
		});
	}

	private getWebviewContent(): string {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Chat Panel</title>
				<style>
					:root {
						--vscode-input-background: var(--vscode-input-background, #3c3c3c);
						--vscode-input-foreground: var(--vscode-input-foreground, #cccccc);
						--vscode-input-border: var(--vscode-input-border, #454545);
						--vscode-button-background: var(--vscode-button-background, #0e639c);
						--vscode-button-foreground: var(--vscode-button-foreground, #ffffff);
						--vscode-button-hoverBackground: var(--vscode-button-hoverBackground, #1177bb);
						--vscode-dropdown-background: var(--vscode-dropdown-background, #3c3c3c);
						--vscode-dropdown-foreground: var(--vscode-dropdown-foreground, #cccccc);
						--vscode-dropdown-border: var(--vscode-dropdown-border, #454545);
						--vscode-panel-background: var(--vscode-panel-background, #1e1e1e);
						--vscode-panel-border: var(--vscode-panel-border, #454545);
						--vscode-panelTitle-inactiveForeground: var(--vscode-panelTitle-inactiveForeground, #9d9d9d);
						--vscode-panelTitle-activeForeground: var(--vscode-panel-titleActiveForeground, #ffffff);
						--vscode-editorWidget-background: var(--vscode-editorWidget-background, #252526);
						--vscode-scrollbarSlider-background: var(--vscode-scrollbarSlider-background, #7979796);
						--vscode-scrollbarSlider-hoverBackground: var(--vscode-scrollbarSlider-hoverBackground, #646464b3);
						--vscode-scrollbarSlider-activeBackground: var(--vscode-scrollbarSlider-activeBackground, #bfbf66);
						--vscode-foreground: var(--vscode-foreground, #cccccc);
					}

					body {
						padding: 0;
						margin: 0;
						display: flex;
						flex-direction: column;
						height: 100vh;
						background-color: var(--vscode-panel-background);
						color: var(--vscode-foreground);
						font-family: var(--vscode-font-family);
					}
					.header {
						display: flex;
						justify-content: space-between;
						align-items: center;
						padding: 10px;
						background-color: var(--vscode-panel-background);
					}
					.connection-indicator {
						display: inline-block;
						width: 12px;
						height: 12px;
						border-radius: 50%;
						margin-right: 8px;
					}
					.connection-status {
						display: flex;
						align-items: center;
						margin-right: 10px;
						font-size: 14px;
					}
					.connected {
						background-color: #4caf50; /* Green */
					}
					.disconnected {
						background-color: #f44336; /* Red */
					}
					.chat-selector {
						flex: 1;
						margin-right: 10px;
						background-color: var(--vscode-dropdown-background);
						color: var(--vscode-dropdown-foreground);
						border: 1px solid var(--vscode-dropdown-border);
						padding: 4px 6px;
						border-radius: 2px;
					}
					.chat-menu-button {
						padding: 5px 10px;
						border: 1px solid var(--vscode-dropdown-border);
						background-color: var(--vscode-dropdown-background);
						color: var(--vscode-dropdown-foreground);
						border-radius: 4px;
						cursor: pointer;
						margin-left: 5px;
					}
					.chat-menu-button:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
					.dropdown {
						position: relative;
						display: inline-block;
					}
					.dropdown-content {
						display: none;
						position: absolute;
						right: 0;
						background-color: var(--vscode-dropdown-background);
						min-width: 180px;
						box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
						z-index: 1;
						border: 1px solid var(--vscode-dropdown-border);
						border-radius: 4px;
						padding: 5px 0;
					}
					.dropdown-content button {
						display: block;
						width: 100%;
						padding: 8px 16px;
						border: none;
						background-color: transparent;
						color: var(--vscode-dropdown-foreground);
						text-align: left;
						cursor: pointer;
						font-size: 14px;
					}
					.dropdown-content button:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
					.dropdown-content.show {
						display: block;
					}
					.new-chat-button, .delete-chat-button, .save-chat-button, .load-chat-button {
						padding: 5px 10px;
						border: none;
						border-radius: 4px;
						cursor: pointer;
						margin: 2px 5px;
						color: var(--vscode-button-foreground);
					}
					.new-chat-button, .save-chat-button, .load-chat-button {
						background-color: var(--vscode-button-background);
					}
					.new-chat-button:hover, .save-chat-button:hover, .load-chat-button:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
					.delete-chat-button {
						background-color: #be1100;
					}
					.delete-chat-button:hover {
						background-color: #dc3545;
					}
					.button-group {
						display: flex;
					}
					#chat-history {
						flex: 1;
						overflow-y: auto;
						padding: 10px;
						background-color: var(--vscode-panel-background);
					}
					.message {
						margin-bottom: 10px;
						padding: 5px;
						border-radius: 5px;
						white-space: pre-wrap; /* Preserves whitespace and newlines */
						color: var(--vscode-foreground);
					}
					.user-message {
						background-color: var(--vscode-editorWidget-background);
						margin-left: 20%;
					}
					.bot-message {
						background-color: var(--vscode-editorWidget-background);
						margin-right: 20%;
					}
					.input-container {
						display: flex;
						padding: 10px;
						flex-direction: column;
						border-top: 1px solid var(--vscode-panel-border);
						background-color: var(--vscode-panel-background);
					}
					#message-input {
						flex: 1;
						padding: 8px;
						border: 1px solid var(--vscode-input-border);
						border-radius: 4px;
						resize: vertical;
						min-height: 60px;
						max-height: 200px;
						color: var(--vscode-input-foreground);
						background-color: var(--vscode-input-background);
					}
					.button-container {
						display: flex;
						justify-content: space-between;
						margin-top: 10px;
					}
					#send-button {
						padding: 8px 15px;
						background-color: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						border-radius: 4px;
						cursor: pointer;
					}
					#send-button:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
				</style>
			</head>
			<body>
				<div class="header">
					<div class="connection-status">
						<div class="connection-indicator" id="connection-indicator"></div>
						<span id="connection-text">Connecting...</span>
					</div>
					<select class="chat-selector" id="chat-selector">
						<option value="default">Default Chat</option>
					</select>
					<div class="button-group">
						<div class="dropdown">
							<button class="chat-menu-button" id="chat-menu-button">Chat</button>
							<div class="dropdown-content" id="dropdown-content">
								<button class="connection-button" id="connection-button">Disconnect</button>
								<button class="new-chat-button" id="new-chat-button">New Chat</button>
								<button class="save-all-chats-button" id="save-all-chats-button">Save All Chats</button>
								<button class="load-all-chats-button" id="load-all-chats-button">Load All Chats</button>
								<button class="save-current-chat-button" id="save-current-chat-button">Save Current Chat</button>
								<button class="load-current-chat-button" id="load-current-chat-button">Load Current Chat</button>
								<button class="delete-all-chats-button" id="delete-all-chats-button">Delete All Chats</button>
								<button class="delete-chat-button" id="delete-chat-button">Delete Current Chat</button>
							</div>
						</div>
					</div>
				</div>
				<div id="chat-history"></div>
				<div class="input-container">
					<textarea id="message-input" placeholder="Type your message here..."></textarea>
					<div class="button-container">
						<button id="send-button">Send</button>
					</div>
				</div>
				<script>
					const vscode = acquireVsCodeApi();
					const chatHistory = document.getElementById('chat-history');
					const messageInput = document.getElementById('message-input');
					const sendButton = document.getElementById('send-button');
					const newChatButton = document.getElementById('new-chat-button');
					const deleteChatButton = document.getElementById('delete-chat-button');
					const saveAllChatsButton = document.getElementById('save-all-chats-button');
					const loadAllChatsButton = document.getElementById('load-all-chats-button');
					const saveCurrentChatButton = document.getElementById('save-current-chat-button');
					const loadCurrentChatButton = document.getElementById('load-current-chat-button');
					const deleteAllChatsButton = document.getElementById('delete-all-chats-button');
					const connectionButton = document.getElementById('connection-button');
					const chatSelector = document.getElementById('chat-selector');
					const chatMenuButton = document.getElementById('chat-menu-button');
					const dropdownContent = document.getElementById('dropdown-content');
					const connectionIndicator = document.getElementById('connection-indicator');
					const connectionText = document.getElementById('connection-text');

					// Initialize with default chat
					let currentChatId = 'default';
					let isConnected = false;

					// Function to add a message to the chat history
					function addMessage(text, isUser) {
						const messageElement = document.createElement('div');
						messageElement.classList.add('message');
						messageElement.classList.add(isUser ? 'user-message' : 'bot-message');
						messageElement.textContent = text;
						chatHistory.appendChild(messageElement);
						chatHistory.scrollTop = chatHistory.scrollHeight;
					}

					// Function to clear chat history
					function clearChatHistory() {
						chatHistory.innerHTML = '';
					}

					// Function to update chat selector with new chat list
					function updateChatSelector(chatList) {
						// Clear existing options except the default one
						chatSelector.innerHTML = '';

						// Add all chats from the list
						chatList.forEach(chat => {
							const option = document.createElement('option');
							option.value = chat.id;
							option.textContent = chat.name;
							chatSelector.appendChild(option);
						});

						// Set the current selection
						chatSelector.value = currentChatId;
					}

					// Function to create a new chat
					function createNewChat() {
						const newChatId = 'chat_' + Date.now();
						const chatName = 'Chat ' + (chatSelector.options.length + 1);
						const option = document.createElement('option');
						option.value = newChatId;
						option.textContent = chatName;
						chatSelector.appendChild(option);
						chatSelector.value = newChatId;
						currentChatId = newChatId;
						clearChatHistory();

						// Notify extension about the new chat
						vscode.postMessage({
							command: 'newChat',
							chatId: newChatId,
							chatName: chatName
						});

						// Close dropdown after action
						dropdownContent.classList.remove('show');

						// Focus the input field after creating a new chat
						messageInput.focus();
					}

					// Function to delete current chat
					function deleteCurrentChat() {
						if (currentChatId === 'default') {
							// Don't allow deletion of default chat
							alert('Cannot delete the default chat.');
							return;
						}

						// Notify extension about the chat deletion
						vscode.postMessage({
							command: 'confirmDeleteChat',
							chatId: currentChatId
						});

						// Close dropdown after action
						dropdownContent.classList.remove('show');
					}

					// Function to save all chats to file
					function saveAllChatsToFile() {
						vscode.postMessage({
							command: 'saveChatToFile'
						});

						// Close dropdown after action
						dropdownContent.classList.remove('show');
					}

					// Function to load all chats from file
					function loadAllChatsFromFile() {
						vscode.postMessage({
							command: 'loadChatFromFile'
						});

						// Close dropdown after action
						dropdownContent.classList.remove('show');
					}

					// Function to save current chat to file
					function saveCurrentChatToFile() {
						vscode.postMessage({
							command: 'saveCurrentChatToFile',
							chatId: currentChatId
						});

						// Close dropdown after action
						dropdownContent.classList.remove('show');
					}

					// Function to load current chat from file
					function loadCurrentChatFromFile() {
						vscode.postMessage({
							command: 'loadCurrentChatFromFile'
						});

						// Close dropdown after action
						dropdownContent.classList.remove('show');
					}

					// Function to delete all chats
					function deleteAllChats() {
						vscode.postMessage({
							command: 'deleteAllChats'
						});

						// Close dropdown after action
						dropdownContent.classList.remove('show');
					}

					// Function to toggle connection
					function toggleConnection() {
						vscode.postMessage({
							command: 'toggleConnection'
						});

						// Close dropdown after action
						dropdownContent.classList.remove('show');
					}

					// Send message function
					function sendMessage() {
						const text = messageInput.value.trim();
						if (text) {
							// Add user's message to chat
							addMessage(text, true);

							// Send message to extension
							vscode.postMessage({
								command: 'sendMessage',
								chatId: currentChatId,
								text: text
							});

							// Clear input
							messageInput.value = '';
							// Reset textarea height
							messageInput.style.height = 'auto';
						}
					}

					// Event listener for send button
					sendButton.addEventListener('click', sendMessage);

					// Event listener for new chat button
					newChatButton.addEventListener('click', createNewChat);

					// Event listener for delete chat button
					deleteChatButton.addEventListener('click', deleteCurrentChat);

					// Event listener for save all chats button
					saveAllChatsButton.addEventListener('click', saveAllChatsToFile);

					// Event listener for load all chats button
					loadAllChatsButton.addEventListener('click', loadAllChatsFromFile);

					// Event listener for save current chat button
					saveCurrentChatButton.addEventListener('click', saveCurrentChatToFile);

					// Event listener for load current chat button
					loadCurrentChatButton.addEventListener('click', loadCurrentChatFromFile);

					// Event listener for delete all chats button
					deleteAllChatsButton.addEventListener('click', deleteAllChats);

					// Event listener for connection button
					connectionButton.addEventListener('click', toggleConnection);

					// Event listener for chat selector
					chatSelector.addEventListener('change', function() {
						currentChatId = this.value;
						vscode.postMessage({
							command: 'switchChat',
							chatId: currentChatId
						});
					});

					// Toggle dropdown visibility when menu button is clicked
					chatMenuButton.addEventListener('click', function() {
						dropdownContent.classList.toggle('show');
					});

					// Close dropdown when clicking outside
					window.addEventListener('click', function(event) {
						if (!event.target.matches('#chat-menu-button')) {
							const dropdowns = document.getElementsByClassName('dropdown-content');
							for (let i = 0; i < dropdowns.length; i++) {
								const openDropdown = dropdowns[i];
								if (openDropdown.classList.contains('show')) {
									openDropdown.classList.remove('show');
								}
							}
						}
					});

					// Event listener for Enter key (to send message) and Shift+Enter (for new line)
					messageInput.addEventListener('keydown', (event) => {
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault(); // Prevent new line
							sendMessage();
						}
						// Shift+Enter adds a new line
					});

					// Auto-resize textarea as user types
					messageInput.addEventListener('input', function() {
						this.style.height = 'auto';
						this.style.height = Math.min(this.scrollHeight, 200) + 'px';
					});

					// Function to insert text into the input field
					function insertTextToInput(text) {
						const input = document.getElementById('message-input');
						if (input) {
							// Get current selection/cursor position
							const start = input.selectionStart || input.value.length;
							const end = input.selectionEnd || input.value.length;
							
							// Insert the text at the cursor position
							const before = input.value.substring(0, start);
							const after = input.value.substring(end);
							
							input.value = before + text + after;
							
							// Set cursor position after the inserted text
							const newCursorPos = start + text.length;
							input.setSelectionRange(newCursorPos, newCursorPos);
							
							// Auto-resize the textarea
							input.style.height = 'auto';
							input.style.height = Math.min(input.scrollHeight, 200) + 'px';
							
							// Focus the input field
							input.focus();
						}
					}
					
					// Listen for messages from the extension
					window.addEventListener('message', event => {
						const message = event.data;
						switch (message.command) {
							case 'displayResponse':
								addMessage(message.text, false);
								break;
							case 'loadChatHistory':
								clearChatHistory();
								if (message.history && message.history.length > 0) {
									message.history.forEach(msg => {
										addMessage(msg.text, msg.isUser);
									});
								}
								break;
							case 'updateChatList':
								updateChatSelector(message.chats);
								break;
							case 'switchChat':
								chatSelector.value = message.chatId;
								currentChatId = message.chatId;
								break;
							case 'updateConnectionStatus':
								isConnected = message.isConnected;
								connectionIndicator.className = 'connection-indicator';
								if (isConnected) {
									connectionIndicator.classList.add('connected');
									connectionButton.textContent = 'Disconnect';
									connectionText.textContent = 'Connected';
								} else {
									connectionIndicator.classList.add('disconnected');
									connectionButton.textContent = 'Connect';
									connectionText.textContent = 'Disconnected';
								}
								break;
							case 'insertTextToInput':
								insertTextToInput(message.text);
								break;
						}
					});

					// Initialize connection status after a short delay to show "Connecting..."
					setTimeout(() => {
						if (!isConnected) {
							connectionText.textContent = 'Disconnected';
							connectionIndicator.className = 'connection-indicator disconnected';
							connectionButton.textContent = 'Connect';
						}
					}, 2000);
				</script>
			</body>
			</html>
	`;
	}

	private async handleSendMessage(chatId: string, text: string) {
		// Check if we have a connector for streaming
		const connectionStatus = this.chatService.getConnectionStatus();
		if (connectionStatus.connector) {
			if (this.view) {
				// Send a message to indicate we're processing
				this.view.webview.postMessage({
					command: 'updateConnectionStatus',
					isConnected: true,
					statusText: 'Processing...'
				});
			}

			// Handle the message with streaming capability
			// Create a callback to send partial responses to the UI
			const sendPartialResponse = (partialText: string) => {
				if (this.view) {
					this.view.webview.postMessage({
						command: 'streamResponse',
						text: partialText
					});
				}
			};

			// Handle the message with streaming
			const result = await this.chatService.handleSendMessage(chatId, text, sendPartialResponse);

			if (this.view) {
				if (result.success && result.response) {
					// Send the final response to the webview
					this.view.webview.postMessage({
						command: 'displayResponse',
						text: result.response
					});

					// Reset status to connected
					const currentConnectionStatus = await this.chatService.initializeConnection();
					this.view.webview.postMessage({
						command: 'updateConnectionStatus',
						isConnected: currentConnectionStatus.status === 'connected',
						statusText: currentConnectionStatus.text
					});
				} else if (result.error) {
					// Send error back to webview
					this.view.webview.postMessage({
						command: 'displayResponse',
						text: result.error
					});

					// Reset status
					const currentConnectionStatus = await this.chatService.initializeConnection();
					this.view.webview.postMessage({
						command: 'updateConnectionStatus',
						isConnected: currentConnectionStatus.status === 'connected',
						statusText: currentConnectionStatus.text
					});
				}
			}
		} else {
			// Fallback to original behavior if no connector
			const response = await this.chatService.handleSendMessage(chatId, text);

			if (this.view) {
				if (response.success && response.response) {
					// Send response back to webview
					this.view.webview.postMessage({
						command: 'displayResponse',
						text: response.response
					});
				} else if (response.error) {
					// Send error back to webview
					this.view.webview.postMessage({
						command: 'displayResponse',
						text: response.error
					});
				}
			}
		}
	}

	private async handleNewChat(chatId: string, chatName: string) {
		// Create a new chat using the chat service
		this.chatService.addChat(chatId, chatName);

		// Start a new conversation with 1C.ai if connected
		const result = await this.chatService.startNewChat();
		if (!result.success && result.error) {
			console.error('Failed to start new conversation with 1C.ai:', result.error);
		}

		// Save the chats
	await this.chatService.saveChats();

		// Update the chat list in the UI
		if (this.view) {
			this.view.webview.postMessage({
				command: 'updateChatList',
				chats: Array.from(this.chatService.getChats().entries()).map(([id, chat]) => ({
					id,
					name: chat.name
				}))
			});
		}
	}

	private async handleSwitchChat(chatId: string) {
		this.currentChatId = chatId;

		// Get the chat
		const chat = this.chatService.getChat(chatId);

		if (chat && this.view) {
			// Send chat history to webview
			this.view.webview.postMessage({
				command: 'loadChatHistory',
				history: chat.messages.map(msg => ({
					text: msg.text,
					isUser: msg.isUser
				}))
			});

			// Update the chat list in the UI
			this.view.webview.postMessage({
				command: 'updateChatList',
				chats: Array.from(this.chatService.getChats().entries()).map(([id, chat]) => ({
					id,
					name: chat.name
				}))
			});
		}
	}

	private async handleConfirmDeleteChat(chatId: string) {
		if (chatId === 'default') {
			// Don't allow deletion of default chat
			if (this.view) {
				this.view.webview.postMessage({
					command: 'displayResponse',
					text: 'Cannot delete the default chat.'
				});
			}
			return;
		}

		// Show confirmation dialog
	const result = await vscode.window.showInformationMessage(
			`Are you sure you want to delete the chat "${this.chatService.getChat(chatId)?.name || chatId}"?`,
			{ modal: true },
			'Yes', 'No'
		);

		if (result === 'Yes') {
			// Remove the chat from the map
			this.chatService.deleteChat(chatId);

			// If we're deleting the current chat, switch to default
			if (this.currentChatId === chatId) {
				this.currentChatId = 'default';
			}

			// Save the chats
			await this.chatService.saveChats();

			// Update the chat list in the UI
			if (this.view) {
				this.view.webview.postMessage({
					command: 'updateChatList',
					chats: Array.from(this.chatService.getChats().entries()).map(([id, chat]) => ({
						id,
						name: chat.name
					}))
				});

				// Load default chat history in the UI and update selection
				const defaultChat = this.chatService.getChat('default');
				if (defaultChat) {
					this.view.webview.postMessage({
						command: 'loadChatHistory',
						history: defaultChat.messages.map(msg => ({
							text: msg.text,
							isUser: msg.isUser
						}))
					});

					// Also send command to update the selected chat in UI
					this.view.webview.postMessage({
						command: 'switchChat',
						chatId: 'default'
					});
				}
			}
		}
	}

	private async handleDeleteChat(chatId: string) {
		if (chatId === 'default') {
			// Don't allow deletion of default chat
			if (this.view) {
				this.view.webview.postMessage({
					command: 'displayResponse',
					text: 'Cannot delete the default chat.'
				});
			}
			return;
		}

		// Remove the chat from the map
	this.chatService.deleteChat(chatId);

		// Save the chats
		await this.chatService.saveChats();

		// Update the chat list in the UI
		if (this.view) {
			this.view.webview.postMessage({
				command: 'updateChatList',
				chats: Array.from(this.chatService.getChats().entries()).map(([id, chat]) => ({
					id,
					name: chat.name
				}))
			});
		}
	}

	private async handleSaveCurrentChatToFile(chatId: string) {
		try {
			// Get the current chat data
			const chat = this.chatService.getChat(chatId);
			if (!chat) {
				vscode.window.showErrorMessage('Current chat not found!');
				return;
			}

			const serializedChat = {
				id: chat.id,
				name: chat.name,
				messages: chat.messages.map(msg => ({
					text: msg.text,
					isUser: msg.isUser,
					timestamp: msg.timestamp
				}))
			};

			// Create JSON content
			const content = JSON.stringify(serializedChat, null, 2);

			// Show save dialog
			const uri = await vscode.window.showSaveDialog({
				filters: {
					'JSON': ['json'],
					'Text': ['txt']
				},
				saveLabel: 'Save Current Chat'
			});

			if (uri) {
				// Write the content to the selected file
				await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from(content, 'utf8')));

				// Show success message
				vscode.window.showInformationMessage('Current chat saved successfully!');
			}
		} catch (error) {
			console.error('Error saving current chat to file:', error);
			vscode.window.showErrorMessage('Failed to save current chat: ' + (error as Error).message);
		}
	}

	private async handleLoadCurrentChatFromFile() {
		try {
			// Show open dialog
			const uri = await vscode.window.showOpenDialog({
				filters: {
					'JSON': ['json'],
					'Text': ['txt']
				},
				canSelectMany: false,
				openLabel: 'Load Current Chat'
			});

			if (uri && uri[0]) {
				// Read the content from the selected file
				const content = await vscode.workspace.fs.readFile(uri[0]);
				const text = new TextDecoder().decode(content);
				const loadedChat = JSON.parse(text);

				// Update the current chat with loaded data
				const currentChat = this.chatService.getChat(this.currentChatId);
				if (currentChat) {
					currentChat.messages = loadedChat.messages.map((msgData: any) => {
						const msg = new ChatMessage(msgData.text, msgData.isUser);
						msg.timestamp = new Date(msgData.timestamp);
						return msg;
					});

					// Save the updated chat
					await this.chatService.saveChats();

					// Update the UI
					if (this.view) {
						// Load current chat history in the UI
						this.view.webview.postMessage({
							command: 'loadChatHistory',
							history: currentChat.messages.map((msg: ChatMessage) => ({
								text: msg.text,
								isUser: msg.isUser
							}))
						});
					}

					// Show success message
					vscode.window.showInformationMessage('Current chat loaded successfully!');
				}
			}
		} catch (error) {
			console.error('Error loading current chat from file:', error);
			vscode.window.showErrorMessage('Failed to load current chat: ' + (error as Error).message);
		}
	}

	private async handleSaveChatToFile() {
		try {
			// Get all chats data
			const chats = this.chatService.getChats();
			const serializedChats = Array.from(chats.entries()).map(([id, chat]) => ({
				id,
				name: chat.name,
				messages: chat.messages.map(msg => ({
					text: msg.text,
					isUser: msg.isUser,
					timestamp: msg.timestamp
				}))
			}));

			// Create JSON content
			const content = JSON.stringify(serializedChats, null, 2);

			// Show save dialog
			const uri = await vscode.window.showSaveDialog({
				filters: {
					'JSON': ['json'],
					'Text': ['txt']
				},
				saveLabel: 'Save All Chats'
			});

			if (uri) {
				// Write the content to the selected file
				await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from(content, 'utf8')));

				// Show success message
				vscode.window.showInformationMessage('All chats saved successfully!');
			}
	} catch (error) {
			console.error('Error saving chats to file:', error);
			vscode.window.showErrorMessage('Failed to save chats: ' + (error as Error).message);
		}
	}

	private async handleLoadChatFromFile() {
		try {
			// Show open dialog
			const uri = await vscode.window.showOpenDialog({
				filters: {
					'JSON': ['json'],
					'Text': ['txt']
				},
				canSelectMany: false,
				openLabel: 'Load All Chats'
			});

			if (uri && uri[0]) {
				// Read the content from the selected file
				const content = await vscode.workspace.fs.readFile(uri[0]);
				const text = new TextDecoder().decode(content);
				const loadedChats = JSON.parse(text);

				// Load chats into the chat service
				await this.chatService.loadChatsFromData(loadedChats);

				// Update the UI
				if (this.view) {
					// Update the chat list in the UI
					this.view.webview.postMessage({
						command: 'updateChatList',
						chats: Array.from(this.chatService.getChats().entries()).map(([id, chat]) => ({
							id,
							name: chat.name
						}))
					});

					// Load current chat history in the UI
					const chat = this.chatService.getChat(this.currentChatId);
					if (chat) {
						this.view.webview.postMessage({
							command: 'loadChatHistory',
							history: chat.messages.map(msg => ({
								text: msg.text,
								isUser: msg.isUser
							}))
						});
					}
				}

				// Show success message
				vscode.window.showInformationMessage('All chats loaded successfully!');
			}
		} catch (error) {
			console.error('Error loading chats from file:', error);
			vscode.window.showErrorMessage('Failed to load chats: ' + (error as Error).message);
		}
	}

	private async handleDeleteAllChats() {
		// Show confirmation dialog
		const result = await vscode.window.showInformationMessage(
			'Are you sure you want to delete all chats? This cannot be undone.',
			{ modal: true },
			'Yes', 'No'
		);

		if (result === 'Yes') {
			// Clear all chats except the default one
			const defaultChat = this.chatService.getChat('default');
			this.chatService.getChats().clear();

			// Re-add the default chat
			if (defaultChat) {
				this.chatService.getChats().set('default', defaultChat);
			} else {
				this.chatService.addChat('default', 'Default Chat');
			}

			// Set current chat to default
			this.currentChatId = 'default';

			// Save the chats
			await this.chatService.saveChats();

			// Update the UI
			if (this.view) {
				// Update the chat list in the UI
				this.view.webview.postMessage({
					command: 'updateChatList',
					chats: Array.from(this.chatService.getChats().entries()).map(([id, chat]) => ({
						id,
						name: chat.name
					}))
				});

				// Load default chat history in the UI
				const chat = this.chatService.getChat('default');
				if (chat) {
					this.view.webview.postMessage({
						command: 'loadChatHistory',
						history: chat.messages.map(msg => ({
							text: msg.text,
							isUser: msg.isUser
						}))
					});
				}
			}

			vscode.window.showInformationMessage('All chats deleted successfully!');
		}
	}

	private async handleToggleConnection() {
		const connectionStatus = await this.chatService.toggleConnection();

		if (this.view) {
			// Send connection status to webview
			this.view.webview.postMessage({
				command: 'updateConnectionStatus',
				isConnected: connectionStatus.status === 'connected',
				statusText: connectionStatus.text
			});
		}
	}

	public async refresh() {
		await this.chatService.loadChats();

		if (this.view) {
			// Send current chat history to webview
			const chat = this.chatService.getChat(this.currentChatId);
			if (chat) {
				this.view.webview.postMessage({
					command: 'loadChatHistory',
					history: chat.messages.map(msg => ({
						text: msg.text,
						isUser: msg.isUser
					}))
				});
			}

			// Update the chat list in the UI
			this.view.webview.postMessage({
				command: 'updateChatList',
				chats: Array.from(this.chatService.getChats().entries()).map(([id, chat]) => ({
					id,
					name: chat.name
				}))
			});

			// Initialize connection status
			const connectionStatus = await this.chatService.initializeConnection();
			this.view.webview.postMessage({
				command: 'updateConnectionStatus',
				isConnected: connectionStatus.status === 'connected',
				statusText: connectionStatus.text
			});
		}
	}

	public sendSelectedTextToChat(text: string) {
		if (this.view) {
			// Send the selected text to the webview to be inserted into the input field
			this.view.webview.postMessage({
				command: 'insertTextToInput',
				text: text
			});
		}
	}
}
