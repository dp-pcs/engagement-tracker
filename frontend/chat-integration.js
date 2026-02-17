// Google Chat MCP Integration
// Connects to MCP server to fetch chat activity

class ChatIntegration {
    constructor(mcpUrl) {
        this.mcpUrl = mcpUrl;
        this.eventSource = null;
        this.messageId = 0;
        this.pendingRequests = new Map();
        this.connected = false;
        this.tools = [];
    }

    // Connect to MCP server via SSE
    connect() {
        return new Promise((resolve, reject) => {
            if (this.eventSource) {
                this.eventSource.close();
            }

            console.log('Connecting to MCP server:', this.mcpUrl);
            this.eventSource = new EventSource(this.mcpUrl);

            this.eventSource.onopen = () => {
                console.log('MCP connection opened');
                this.connected = true;
            };

            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('MCP message:', data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('Error parsing MCP message:', e);
                }
            };

            this.eventSource.onerror = (error) => {
                console.error('MCP connection error:', error);
                this.connected = false;
                reject(error);
            };

            // Give it a moment to connect and receive initial messages
            setTimeout(() => {
                if (this.connected) {
                    resolve();
                } else {
                    reject(new Error('Connection timeout'));
                }
            }, 3000);
        });
    }

    handleMessage(data) {
        // Handle different MCP message types
        if (data.method === 'tools/list' || data.tools) {
            this.tools = data.tools || data.result?.tools || [];
            console.log('Available tools:', this.tools);
        }

        // Handle responses to our requests
        if (data.id && this.pendingRequests.has(data.id)) {
            const { resolve, reject } = this.pendingRequests.get(data.id);
            this.pendingRequests.delete(data.id);

            if (data.error) {
                reject(data.error);
            } else {
                resolve(data.result || data);
            }
        }
    }

    // Send a request to the MCP server
    async callTool(toolName, args = {}) {
        if (!this.connected) {
            throw new Error('Not connected to MCP server');
        }

        const id = ++this.messageId;

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            // MCP uses JSON-RPC style messages
            const message = {
                jsonrpc: '2.0',
                id,
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: args
                }
            };

            console.log('Would send:', message);

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 10000);
        });
    }

    // Get chat messages from a space
    async getSpaceMessages(spaceId, limit = 50) {
        // Extract space ID from URL if needed
        if (spaceId.includes('chat.google.com')) {
            const match = spaceId.match(/\/room\/([A-Za-z0-9_-]+)/);
            if (match) spaceId = match[1];
        }

        try {
            return await this.callTool('get_messages', {
                space_id: spaceId,
                limit: limit
            });
        } catch (e) {
            console.error('Error getting messages:', e);
            return null;
        }
    }

    // Get space members
    async getSpaceMembers(spaceId) {
        if (spaceId.includes('chat.google.com')) {
            const match = spaceId.match(/\/room\/([A-Za-z0-9_-]+)/);
            if (match) spaceId = match[1];
        }

        try {
            return await this.callTool('get_members', { space_id: spaceId });
        } catch (e) {
            console.error('Error getting members:', e);
            return null;
        }
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.connected = false;
    }
}

// Chat Activity UI Component - Using safe DOM methods
class ChatActivityPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.chatIntegration = null;
    }

    async initialize(mcpUrl) {
        if (!mcpUrl) {
            this.renderError('Chat MCP URL not configured');
            return false;
        }

        this.chatIntegration = new ChatIntegration(mcpUrl);

        try {
            await this.chatIntegration.connect();
            return true;
        } catch (e) {
            console.error('Failed to connect to chat MCP:', e);
            this.renderError('Unable to connect to chat service');
            return false;
        }
    }

    async loadActivity(spaceUrl) {
        if (!this.container) return;

        this.container.textContent = '';
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.textContent = 'Loading chat activity...';
        this.container.appendChild(loading);

        if (!this.chatIntegration?.connected) {
            this.renderError('Chat service not connected');
            return;
        }

        try {
            const messages = await this.chatIntegration.getSpaceMessages(spaceUrl, 20);
            const members = await this.chatIntegration.getSpaceMembers(spaceUrl);

            this.renderActivity(messages, members);
        } catch (e) {
            console.error('Error loading chat activity:', e);
            this.renderError('Failed to load chat activity');
        }
    }

    renderActivity(messages, members) {
        if (!this.container) return;
        this.container.textContent = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'chat-activity';

        // Stats section
        const stats = document.createElement('div');
        stats.className = 'chat-stats';

        const msgStat = this.createStatElement(messages?.length || 0, 'Recent Messages');
        const memberStat = this.createStatElement(members?.length || 0, 'Participants');
        stats.appendChild(msgStat);
        stats.appendChild(memberStat);
        wrapper.appendChild(stats);

        // Participants section
        wrapper.appendChild(this.createParticipantsSection(members));

        // Messages section
        wrapper.appendChild(this.createMessagesSection(messages));

        this.container.appendChild(wrapper);
    }

    createStatElement(value, label) {
        const stat = document.createElement('div');
        stat.className = 'chat-stat';

        const valueEl = document.createElement('span');
        valueEl.className = 'stat-value';
        valueEl.textContent = value;
        stat.appendChild(valueEl);

        const labelEl = document.createElement('span');
        labelEl.className = 'stat-label';
        labelEl.textContent = label;
        stat.appendChild(labelEl);

        return stat;
    }

    createParticipantsSection(members) {
        const section = document.createElement('div');
        section.className = 'chat-section';

        const header = document.createElement('h4');
        header.textContent = 'Active Participants';
        section.appendChild(header);

        const list = document.createElement('div');
        list.className = 'participants-list';

        if (!members || members.length === 0) {
            const noData = document.createElement('p');
            noData.className = 'no-data';
            noData.textContent = 'No participant data available';
            list.appendChild(noData);
        } else {
            members.slice(0, 10).forEach(m => {
                const participant = document.createElement('div');
                participant.className = 'participant';

                const name = document.createElement('span');
                name.className = 'participant-name';
                name.textContent = m.name || m.displayName || 'Unknown';
                participant.appendChild(name);

                if (m.email) {
                    const email = document.createElement('span');
                    email.className = 'participant-email';
                    email.textContent = m.email;
                    participant.appendChild(email);
                }

                list.appendChild(participant);
            });
        }

        section.appendChild(list);
        return section;
    }

    createMessagesSection(messages) {
        const section = document.createElement('div');
        section.className = 'chat-section';

        const header = document.createElement('h4');
        header.textContent = 'Recent Activity';
        section.appendChild(header);

        const list = document.createElement('div');
        list.className = 'messages-list';

        if (!messages || messages.length === 0) {
            const noData = document.createElement('p');
            noData.className = 'no-data';
            noData.textContent = 'No recent messages';
            list.appendChild(noData);
        } else {
            messages.slice(0, 10).forEach(m => {
                const msg = document.createElement('div');
                msg.className = 'chat-message';

                const author = document.createElement('span');
                author.className = 'message-author';
                author.textContent = m.sender?.name || m.author || 'Unknown';
                msg.appendChild(author);

                const time = document.createElement('span');
                time.className = 'message-time';
                time.textContent = this.formatTime(m.createTime || m.timestamp);
                msg.appendChild(time);

                const text = document.createElement('p');
                text.className = 'message-text';
                text.textContent = m.text || m.content || '';
                msg.appendChild(text);

                list.appendChild(msg);
            });
        }

        section.appendChild(list);
        return section;
    }

    renderError(message) {
        if (!this.container) return;
        this.container.textContent = '';

        const errorDiv = document.createElement('div');
        errorDiv.className = 'chat-error';

        const errorMsg = document.createElement('p');
        errorMsg.textContent = message;
        errorDiv.appendChild(errorMsg);

        const hint = document.createElement('p');
        hint.className = 'chat-error-hint';
        hint.textContent = 'Chat integration requires MCP server access';
        errorDiv.appendChild(hint);

        this.container.appendChild(errorDiv);
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleString();
    }
}

// Export for use
window.ChatIntegration = ChatIntegration;
window.ChatActivityPanel = ChatActivityPanel;
