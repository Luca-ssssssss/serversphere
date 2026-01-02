const WebSocket = require('ws');
const serverController = require('../controllers/serverController');

class SocketManager {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.clients = new Map();
        this.setupWebSocket();
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            this.clients.set(clientId, { ws, subscriptions: new Set() });
            
            console.log(`WebSocket Client connected: ${clientId}`);

            ws.on('message', (data) => this.handleMessage(clientId, data));
            ws.on('close', () => this.handleDisconnect(clientId));
            ws.on('error', (error) => this.handleError(clientId, error));

            this.sendWelcomeMessage(clientId);
        });
    }

    generateClientId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async handleMessage(clientId, data) {
        try {
            const client = this.clients.get(clientId);
            if (!client) return;

            const message = JSON.parse(data.toString());
            console.log(`Message from ${clientId}:`, message.type);

            switch (message.type) {
                case 'subscribe':
                    await this.handleSubscribe(clientId, message);
                    break;
                case 'unsubscribe':
                    await this.handleUnsubscribe(clientId, message);
                    break;
                case 'console_command':
                    await this.handleConsoleCommand(clientId, message);
                    break;
                case 'server_action':
                    await this.handleServerAction(clientId, message);
                    break;
                case 'file_change':
                    await this.handleFileChange(clientId, message);
                    break;
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
                    break;
                default:
                    console.warn(`Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            this.sendError(clientId, 'Invalid message format');
        }
    }

    async handleSubscribe(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;

        const { channel, serverId } = message;
        
        switch (channel) {
            case 'server_status':
                client.subscriptions.add(`server_status_${serverId}`);
                this.sendToClient(clientId, {
                    type: 'subscribed',
                    channel: `server_status_${serverId}`,
                    serverId
                });
                
                const server = await serverController.listServers().then(servers => 
                    servers.find(s => s.id === serverId)
                );
                
                if (server) {
                    this.sendToClient(clientId, {
                        type: 'server_status',
                        serverId,
                        data: server,
                        timestamp: Date.now()
                    });
                }
                break;

            case 'server_console':
                client.subscriptions.add(`server_console_${serverId}`);
                this.sendToClient(clientId, {
                    type: 'subscribed',
                    channel: `server_console_${serverId}`,
                    serverId
                });
                break;

            case 'system_stats':
                client.subscriptions.add('system_stats');
                this.sendToClient(clientId, {
                    type: 'subscribed',
                    channel: 'system_stats'
                });
                break;

            default:
                this.sendError(clientId, `Unknown channel: ${channel}`);
        }
    }

    async handleUnsubscribe(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;

        const { channel, serverId } = message;
        const subscriptionKey = serverId ? `${channel}_${serverId}` : channel;
        
        if (client.subscriptions.has(subscriptionKey)) {
            client.subscriptions.delete(subscriptionKey);
            this.sendToClient(clientId, {
                type: 'unsubscribed',
                channel: subscriptionKey,
                timestamp: Date.now()
            });
        }
    }

    async handleConsoleCommand(clientId, message) {
        const { serverId, command } = message;
        
        try {
            const result = await serverController.sendCommand(serverId, command);
            
            this.sendToClient(clientId, {
                type: 'console_response',
                serverId,
                result,
                timestamp: Date.now()
            });

            this.broadcastToSubscribers(`server_console_${serverId}`, {
                type: 'console_output',
                serverId,
                output: `> ${command}`,
                timestamp: Date.now()
            });
        } catch (error) {
            this.sendError(clientId, `Console command failed: ${error.message}`);
        }
    }

    async handleServerAction(clientId, message) {
        const { serverId, action } = message;
        
        try {
            let result;
            switch (action) {
                case 'start':
                    result = await serverController.startServer(serverId);
                    break;
                case 'stop':
                    result = await serverController.stopServer(serverId);
                    break;
                case 'restart':
                    result = await serverController.restartServer(serverId);
                    break;
                default:
                    throw new Error(`Unknown action: ${action}`);
            }

            this.sendToClient(clientId, {
                type: 'server_action_response',
                serverId,
                action,
                result,
                timestamp: Date.now()
            });

            this.broadcastServerUpdate(serverId);
        } catch (error) {
            this.sendError(clientId, `Server action failed: ${error.message}`);
        }
    }

    async handleFileChange(clientId, message) {
        const { serverId, path, action, content } = message;
        
        this.broadcastToSubscribers(`file_changes_${serverId}`, {
            type: 'file_change',
            serverId,
            path,
            action,
            timestamp: Date.now()
        });
    }

    handleDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            client.ws.terminate();
        }
        this.clients.delete(clientId);
        console.log(`WebSocket Client disconnected: ${clientId}`);
    }

    handleError(clientId, error) {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.handleDisconnect(clientId);
    }

    sendWelcomeMessage(clientId) {
        this.sendToClient(clientId, {
            type: 'welcome',
            message: 'Connected to ServerSphere WebSocket',
            version: '1.0.0',
            timestamp: Date.now(),
            clientId
        });
    }

    sendToClient(clientId, data) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(data));
            } catch (error) {
                console.error(`Error sending to client ${clientId}:`, error);
            }
        }
    }

    sendError(clientId, error) {
        this.sendToClient(clientId, {
            type: 'error',
            error: error.toString(),
            timestamp: Date.now()
        });
    }

    broadcastToSubscribers(channel, data) {
        for (const [clientId, client] of this.clients.entries()) {
            if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(JSON.stringify(data));
                } catch (error) {
                    console.error(`Error broadcasting to client ${clientId}:`, error);
                }
            }
        }
    }

    async broadcastServerUpdate(serverId) {
        const server = await serverController.listServers().then(servers => 
            servers.find(s => s.id === serverId)
        );

        if (server) {
            this.broadcastToSubscribers(`server_status_${serverId}`, {
                type: 'server_status',
                serverId,
                data: server,
                timestamp: Date.now()
            });
        }
    }

    async broadcastSystemStats() {
        const stats = await serverController.getSystemStats();
        
        this.broadcastToSubscribers('system_stats', {
            type: 'system_stats',
            data: stats,
            timestamp: Date.now()
        });
    }

    broadcastNotification(title, message, type = 'info') {
        const notification = {
            type: 'notification',
            data: {
                title,
                message,
                type,
                timestamp: Date.now(),
                id: Date.now().toString()
            }
        };

        for (const [clientId, client] of this.clients.entries()) {
            if (client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(JSON.stringify(notification));
                } catch (error) {
                    console.error(`Error sending notification to client ${clientId}:`, error);
                }
            }
        }
    }

    getStats() {
        return {
            totalClients: this.clients.size,
            subscriptions: Array.from(this.clients.values()).reduce(
                (total, client) => total + client.subscriptions.size, 0
            ),
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = SocketManager;