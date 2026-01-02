const dgram = require('dgram');
const net = require('net');
const { Buffer } = require('buffer');

class MinecraftStatusChecker {
    constructor() {
        this.timeout = 5000;
        this.cache = new Map();
        this.cacheDuration = 30000;
    }

    async checkServer(host, port = 25565) {
        const cacheKey = `${host}:${port}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            return cached.data;
        }

        try {
            const [javaStatus, bedrockStatus] = await Promise.allSettled([
                this.checkJavaServer(host, port),
                this.checkBedrockServer(host, port)
            ]);

            let status;
            if (javaStatus.status === 'fulfilled') {
                status = {
                    ...javaStatus.value,
                    type: 'java',
                    online: true
                };
            } else if (bedrockStatus.status === 'fulfilled') {
                status = {
                    ...bedrockStatus.value,
                    type: 'bedrock',
                    online: true
                };
            } else {
                status = {
                    online: false,
                    host,
                    port,
                    error: 'Server offline or unreachable',
                    type: 'unknown'
                };
            }

            this.cache.set(cacheKey, {
                data: status,
                timestamp: Date.now()
            });

            return status;
        } catch (error) {
            return {
                online: false,
                host,
                port,
                error: error.message,
                type: 'error'
            };
        }
    }

    async checkJavaServer(host, port) {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            }, this.timeout);

            socket.setTimeout(this.timeout);
            
            socket.connect(port, host, () => {
                const handshake = this.createHandshake(host, port);
                const request = this.createStatusRequest();
                
                socket.write(handshake);
                socket.write(request);
            });

            let responseBuffer = Buffer.alloc(0);
            
            socket.on('data', (data) => {
                responseBuffer = Buffer.concat([responseBuffer, data]);
                
                try {
                    const packetLength = responseBuffer.readInt32BE(0);
                    if (responseBuffer.length >= packetLength + 4) {
                        const packetId = responseBuffer.readInt8(4);
                        
                        if (packetId === 0x00) {
                            const jsonLength = responseBuffer.readInt32BE(5);
                            const jsonData = responseBuffer.slice(9, 9 + jsonLength).toString('utf8');
                            const status = JSON.parse(jsonData);
                            
                            clearTimeout(timeout);
                            socket.destroy();
                            
                            const result = this.parseJavaStatus(status);
                            resolve({
                                ...result,
                                host,
                                port,
                                protocol: 'java'
                            });
                        }
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    socket.destroy();
                    reject(error);
                }
            });

            socket.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            socket.on('timeout', () => {
                clearTimeout(timeout);
                socket.destroy();
                reject(new Error('Connection timeout'));
            });
        });
    }

    async checkBedrockServer(host, port = 19132) {
        return new Promise((resolve, reject) => {
            const socket = dgram.createSocket('udp4');
            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error('Connection timeout'));
            }, this.timeout);

            const unconnectedPing = Buffer.alloc(25);
            unconnectedPing.writeUInt8(0x01, 0);
            unconnectedPing.writeBigUInt64BE(BigInt(Date.now()), 1);
            unconnectedPing.writeUInt8(0x00, 9);
            unconnectedPing.writeUInt32BE(0x00ffff00, 10);
            unconnectedPing.writeUInt16BE(4, 14);
            unconnectedPing.writeUInt16BE(port, 16);
            unconnectedPing.writeUInt32BE(3, 18);
            unconnectedPing.writeUInt32BE(host.length, 22);
            unconnectedPing.write(host, 23);

            socket.on('message', (message) => {
                try {
                    if (message.readUInt8(0) === 0x1c) {
                        const serverId = message.readBigUInt64BE(1).toString();
                        const pingId = message.readBigUInt64BE(9).toString();
                        
                        const serverInfoLength = message.readUInt16BE(17);
                        const serverInfo = message.slice(19, 19 + serverInfoLength).toString();
                        
                        const [edition, motdLine1, protocol, version, onlinePlayers, maxPlayers] = serverInfo.split(';');
                        
                        clearTimeout(timeout);
                        socket.close();
                        
                        resolve({
                            host,
                            port,
                            edition,
                            motd: motdLine1,
                            version,
                            players: {
                                online: parseInt(onlinePlayers),
                                max: parseInt(maxPlayers)
                            },
                            protocol: parseInt(protocol),
                            serverId,
                            pingId,
                            protocol: 'bedrock'
                        });
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    socket.close();
                    reject(error);
                }
            });

            socket.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            socket.send(unconnectedPing, port, host, (error) => {
                if (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
        });
    }

    createHandshake(host, port) {
        const hostBuffer = Buffer.from(host, 'utf8');
        const handshake = Buffer.alloc(5 + hostBuffer.length + 2);
        
        let offset = 0;
        offset = this.writeVarInt(handshake, 0x00, offset);
        offset = this.writeVarInt(handshake, -1, offset);
        offset = this.writeString(handshake, host, offset);
        offset = handshake.writeUInt16BE(port, offset);
        offset = this.writeVarInt(handshake, 1, offset);
        
        const packetLength = Buffer.alloc(1);
        this.writeVarInt(packetLength, offset, 0);
        
        return Buffer.concat([packetLength, handshake.slice(0, offset)]);
    }

    createStatusRequest() {
        const request = Buffer.alloc(1);
        let offset = this.writeVarInt(request, 0x00, 0);
        
        const packetLength = Buffer.alloc(1);
        this.writeVarInt(packetLength, offset, 0);
        
        return Buffer.concat([packetLength, request.slice(0, offset)]);
    }

    parseJavaStatus(status) {
        const result = {
            description: this.parseDescription(status.description),
            players: {
                online: status.players?.online || 0,
                max: status.players?.max || 0,
                sample: status.players?.sample || []
            },
            version: {
                name: status.version?.name || 'Unknown',
                protocol: status.version?.protocol || -1
            },
            favicon: status.favicon || null,
            modinfo: status.modinfo || null,
            forgeData: status.forgeData || null,
            latency: 0
        };

        if (status.players?.online !== undefined) {
            result.players.online = status.players.online;
        }

        if (status.players?.max !== undefined) {
            result.players.max = status.players.max;
        }

        return result;
    }

    parseDescription(description) {
        if (typeof description === 'string') {
            return {
                text: description,
                extra: []
            };
        } else if (description && description.text) {
            return description;
        } else if (description && description.extra) {
            return {
                text: '',
                extra: description.extra
            };
        }
        
        return {
            text: 'A Minecraft Server',
            extra: []
        };
    }

    writeVarInt(buffer, value, offset) {
        value = value >>> 0;
        
        do {
            let temp = value & 0x7f;
            value >>>= 7;
            
            if (value !== 0) {
                temp |= 0x80;
            }
            
            buffer.writeUInt8(temp, offset++);
        } while (value !== 0);
        
        return offset;
    }

    writeString(buffer, string, offset) {
        const stringBuffer = Buffer.from(string, 'utf8');
        offset = this.writeVarInt(buffer, stringBuffer.length, offset);
        stringBuffer.copy(buffer, offset);
        return offset + stringBuffer.length;
    }

    async pingServer(host, port = 25565) {
        const startTime = Date.now();
        
        try {
            await this.checkJavaServer(host, port);
            const latency = Date.now() - startTime;
            
            const cacheKey = `${host}:${port}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                cached.data.latency = latency;
            }
            
            return latency;
        } catch (error) {
            return -1;
        }
    }

    async batchCheck(servers) {
        const results = [];
        
        for (const server of servers) {
            try {
                const status = await this.checkServer(server.host, server.port);
                results.push({
                    ...server,
                    status
                });
            } catch (error) {
                results.push({
                    ...server,
                    status: {
                        online: false,
                        error: error.message
                    }
                });
            }
        }
        
        return results;
    }

    clearCache() {
        this.cache.clear();
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.entries()).map(([key, value]) => ({
                key,
                age: Date.now() - value.timestamp,
                data: value.data
            }))
        };
    }
}

module.exports = new MinecraftStatusChecker();