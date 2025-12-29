import * as vscode from 'vscode';
import { ChatPanel } from './webviewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "one-ai" is now active!');

	// Register the chat panel command
	const chatPanel = new ChatPanel(context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatPanel.viewType, chatPanel)
	);

	// Register the send to chat command
	const sendToChatCommand = vscode.commands.registerCommand('one-ai.sendToChat', () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const selection = editor.selection;
			const text = editor.document.getText(selection);

			// Send the selected text to the chat panel
			chatPanel.sendSelectedTextToChat(text);
		}
	});

	context.subscriptions.push(sendToChatCommand);
}

export function deactivate() {}
