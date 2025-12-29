export class ChatMessage {
	text: string;
	isUser: boolean;
	timestamp: Date;

	constructor(text: string, isUser: boolean) {
		this.text = text;
		this.isUser = isUser;
	this.timestamp = new Date();
	}
}

export class ChatHistory {
	id: string;
	name: string;
	messages: ChatMessage[];

	constructor(id: string, name: string) {
	this.id = id;
		this.name = name;
		this.messages = [];
	}
}