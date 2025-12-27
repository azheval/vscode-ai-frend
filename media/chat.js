(function () {
  const historyEl = document.getElementById('history');
  const inputEl = document.getElementById('input');
  const btn = document.getElementById('send');
  const openBtn = document.getElementById('openForm');
  const connStatusTextEl = document.getElementById('connStatusText');
  const connIndicatorEl = document.getElementById('connIndicator');
  const connectBtn = document.getElementById('connectBtn');
  const serviceMenuBtn = document.getElementById('serviceMenuBtn');
  const serviceMenuDropdown = document.getElementById('serviceMenuDropdown');
  const newChatBtn = document.getElementById('newChatBtn');
  let lastBotEl = null;

  function appendMessage(who, text) {
    const m = document.createElement('div');
    m.className = 'message ' + who;
    m.innerHTML = renderMarkdown(text); // Use markdown renderer
    historyEl.appendChild(m);
    historyEl.scrollTop = historyEl.scrollHeight;
    return m;
  }

  // Function to render markdown and highlight code
  function renderMarkdown(text) {
    // Simple markdown rendering for headers, bold, italic, lists, and code blocks
    let html = text
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>');

    // Render code blocks with syntax highlighting
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Render headers
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // Render bold and italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Render lists
    html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

    // Render line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  // Toggle service menu dropdown
  if (serviceMenuBtn) {
    serviceMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      serviceMenuDropdown.classList.toggle('hidden');
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!serviceMenuBtn.contains(e.target) && !serviceMenuDropdown.contains(e.target)) {
      serviceMenuDropdown.classList.add('hidden');
    }
  });

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'openForm' });
      serviceMenuDropdown.classList.add('hidden'); // Close menu after clicking
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'connect' });
      serviceMenuDropdown.classList.add('hidden'); // Close menu after clicking
    });
  }

  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'newChat' });
    });
  }

  btn.addEventListener('click', () => {
    const text = inputEl.value;
    if (!text || text.trim() === '') return;
    // send to extension host
    vscode.postMessage({ command: 'send', text });
    inputEl.value = '';
  });

  inputEl.addEventListener('keydown', (e) => {
    // Enter sends the message; Shift+Enter inserts a newline
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // allow default to insert newline
        return;
      }
      e.preventDefault();
      btn.click();
    }
  });

  // handle messages from extension
  window.addEventListener('message', event => {
    const msg = event.data;
      if (msg.command === 'append') {
      const el = appendMessage(msg.who === 'me' ? 'me' : 'bot', msg.text);
      if (msg.who === 'bot') lastBotEl = el;
    } else if (msg.command === 'stream') {
      // streaming partial text: replace last bot message or append if none
      if (lastBotEl) {
        lastBotEl.innerHTML = renderMarkdown(msg.text); // Use markdown renderer
        historyEl.scrollTop = historyEl.scrollHeight;
      } else {
        const el = appendMessage('bot', msg.text);
        lastBotEl = el;
      }
    } else if (msg.command === 'final') {
      if (lastBotEl) {
        lastBotEl.innerHTML = renderMarkdown(msg.text); // Use markdown renderer
        lastBotEl = null;
        historyEl.scrollTop = historyEl.scrollHeight;
      } else {
        appendMessage('bot', msg.text);
      }
    } else if (msg.command === 'vscodeThemeChanged') {
      document.documentElement.setAttribute('data-theme', msg.theme || '');
    } else if (msg.command === 'prefill') {
      inputEl.value = msg.text || '';
      inputEl.focus();
      // move caret to end
      inputEl.selectionStart = inputEl.value.length;
      inputEl.selectionEnd = inputEl.value.length;
      if (msg.send) {
        btn.click();
      }
    } else if (msg.command === 'connStatus') {
      if (connStatusTextEl) {
        connStatusTextEl.textContent = msg.text || msg.status || '';
      }
      if (connIndicatorEl) {
        // Update connection indicator based on status
        connIndicatorEl.className = 'conn-indicator'; // reset classes
        if (msg.status === 'connected') {
          connIndicatorEl.classList.add('connected');
          connIndicatorEl.title = 'Connected';
        } else if (msg.status === 'connecting' || msg.status === 'starting-conversation' || msg.status === 'processing') {
          connIndicatorEl.classList.add('connecting');
          connIndicatorEl.title = 'Connecting...';
        } else if (msg.status === 'error') {
          connIndicatorEl.classList.add('error');
          connIndicatorEl.title = 'Error';
        } else {
          connIndicatorEl.classList.add('disconnected');
          connIndicatorEl.title = 'Disconnected';
        }
      }
      // Update the connect button text in the service menu
      const connectBtnInMenu = document.querySelector('#serviceMenuDropdown button[title="Connect to 1C.ai"]');
      if (connectBtnInMenu) {
        if (msg.status === 'connected') {
          connectBtnInMenu.textContent = 'Отключить';  // "Disconnect" in Russian
        } else {
          connectBtnInMenu.textContent = 'Подключить';  // "Connect" in Russian
        }
      }
    } else if (msg.command === 'newChat') {
      // Handle new chat command from extension
      historyEl.innerHTML = ''; // Clear chat history
      vscode.postMessage({ command: 'newChat' }); // Notify extension to start new conversation
    } else if (msg.command === 'newConversationStarted') {
      historyEl.innerHTML = ''; // Clear chat history when new conversation starts
    }
  });

  // try to read saved theme in state (optional)
  try {
    const state = vscode.getState && vscode.getState();
    if (state && state.theme) {
      document.documentElement.setAttribute('data-theme', state.theme);
    }
  } catch (e) {}
})();