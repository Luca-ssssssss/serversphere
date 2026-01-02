const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class ServerController {
    constructor() {
        this.serversDir = path.join(__dirname, '../../servers');
        this.activeServers = new Map();
    }
    
    async listServers() {
        try {
            const dirs = await fs.readdir(this.serversDir);
            const servers = [];
            
            for (const dir of dirs) {
                const serverPath = path.join(this.serversDir, dir);
                const configPath = path.join(serverPath, 'server.json');
                
                try {
                    const configData = await fs.readFile(configPath, 'utf8');
                    const config = JSON.parse(configData);
                    
                    const server = {
                        id: dir,
                        name: config.name || dir,
                        type: config.type || 'vanilla',
                        version: config.version || 'unknown',
                        port: config.port || 25565,
                        ram: config.ram || 4096,
                        online: this.activeServers.has(dir),
                        players: 0,
                        maxPlayers: 20,
                        tps: 20,
                        cpu: 0,
                        memory: 0,
                        status: 'offline',
                        createdAt: config.createdAt || new Date().toISOString()
                    };
                    
                    if (this.activeServers.has(dir)) {
                        const activeServer = this.activeServers.get(dir);
                        Object.assign(server, activeServer.status);
                    }
                    
                    servers.push(server);
                } catch (error) {
                    console.error(`Error reading server ${dir}:`, error);
                }
            }
            
            return servers;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    
    async createServer(data) {
        const serverId = data.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
        const serverPath = path.join(this.serversDir, serverId);
        
        await fs.mkdir(serverPath, { recursive: true });
        
        const config = {
            id: serverId,
            name: data.name,
            type: data.type,
            version: data.version,
            port: data.port || 25565,
            ram: data.ram || 4096,
            properties: {
                'server-port': data.port || 25565,
                'max-players': 20,
                'view-distance': 10,
                'online-mode': true,
                'enable-rcon': false,
                'rcon.port': 25575,
                'rcon.password': this.generatePassword(),
                'enable-query': true,
                'query.port': data.port || 25565,
                'difficulty': 'normal',
                'gamemode': 'survival',
                'level-type': 'default',
                'spawn-protection': 16,
                'max-world-size': 29999984,
                'network-compression-threshold': 256
            },
            createdAt: new Date().toISOString()
        };
        
        await fs.writeFile(
            path.join(serverPath, 'server.json'),
            JSON.stringify(config, null, 2)
        );
        
        await this.downloadServerJar(serverId, data.type, data.version);
        
        return {
            id: serverId,
            name: data.name,
            type: data.type,
            version: data.version,
            port: data.port || 25565,
            ram: data.ram || 4096,
            online: false,
            status: 'created'
        };
    }
    
    async downloadServerJar(serverId, type, version) {
        const serverPath = path.join(this.serversDir, serverId);
        let downloadUrl = '';
        
        switch (type) {
            case 'paper':
                const paperBuild = await this.getLatestPaperBuild(version);
                downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${paperBuild}/downloads/paper-${version}-${paperBuild}.jar`;
                break;
            case 'purpur':
                downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
                break;
            case 'vanilla':
                const vanillaSha = await this.getVanillaVersion(version);
                downloadUrl = `https://piston-data.mojang.com/v1/objects/${vanillaSha}/server.jar`;
                break;
            default:
                throw new Error(`Unsupported server type: ${type}`);
        }
        
        try {
            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error(`Download failed: ${response.status}`);
            
            const buffer = await response.arrayBuffer();
            await fs.writeFile(
                path.join(serverPath, 'server.jar'),
                Buffer.from(buffer)
            );
            
            console.log(`Downloaded ${type} ${version} for server ${serverId}`);
        } catch (error) {
            console.error(`Failed to download server jar:`, error);
            throw error;
        }
    }
    
    async getLatestPaperBuild(version) {
        try {
            const response = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
            const data = await response.json();
            return data.builds[data.builds.length - 1];
        } catch (error) {
            console.error('Error fetching Paper build:', error);
            return 'latest';
        }
    }
    
    async getVanillaVersion(version) {
        try {
            const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest.json');
            const data = await response.json();
            const versionInfo = data.versions.find(v => v.id === version);
            
            if (!versionInfo) {
                throw new Error(`Version ${version} not found`);
            }
            
            const versionResponse = await fetch(versionInfo.url);
            const versionData = await versionResponse.json();
            return versionData.downloads.server.sha1;
        } catch (error) {
            console.error('Error fetching vanilla version:', error);
            throw error;
        }
    }
    
    async startServer(serverId) {
        const serverPath = path.join(this.serversDir, serverId);
        
        try {
            await fs.access(serverPath);
        } catch (error) {
            throw new Error('Server not found');
        }
        
        if (this.activeServers.has(serverId)) {
            throw new Error('Server is already running');
        }
        
        const configPath = path.join(serverPath, 'server.json');
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        const properties = Object.entries(config.properties || {})
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        await fs.writeFile(
            path.join(serverPath, 'server.properties'),
            properties
        );
        
        await fs.writeFile(
            path.join(serverPath, 'eula.txt'),
            'eula=true\n'
        );
        
        const javaArgs = [
            '-Xmx' + config.ram + 'M',
            '-Xms' + Math.floor(config.ram / 4) + 'M',
            '-XX:+UseG1GC',
            '-XX:+ParallelRefProcEnabled',
            '-XX:MaxGCPauseMillis=200',
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+DisableExplicitGC',
            '-XX:+AlwaysPreTouch',
            '-XX:G1NewSizePercent=30',
            '-XX:G1MaxNewSizePercent=40',
            '-XX:G1HeapRegionSize=8M',
            '-XX:G1ReservePercent=20',
            '-XX:G1HeapWastePercent=5',
            '-XX:G1MixedGCCountTarget=4',
            '-XX:InitiatingHeapOccupancyPercent=15',
            '-XX:G1MixedGCLiveThresholdPercent=90',
            '-XX:G1RSetUpdatingPauseTimePercent=5',
            '-XX:SurvivorRatio=32',
            '-XX:+PerfDisableSharedMem',
            '-XX:MaxTenuringThreshold=1',
            '-Dusing.aikars.flags=https://mcflags.emc.gs',
            '-Daikars.new.flags=true',
            '-jar', 'server.jar',
            'nogui'
        ];
        
        const child = require('child_process').spawn('java', javaArgs, {
            cwd: serverPath,
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false
        });
        
        const serverStatus = {
            pid: child.pid,
            process: child,
            online: true,
            status: 'starting',
            players: 0,
            tps: 20,
            cpu: 0,
            memory: 0,
            lastUpdate: Date.now()
        };
        
        this.activeServers.set(serverId, serverStatus);
        
        child.stdout.on('data', (data) => {
            const output = data.toString();
            
            if (output.includes('Done')) {
                serverStatus.status = 'online';
            }
            
            if (output.includes('joined the game')) {
                serverStatus.players++;
            }
            
            if (output.includes('left the game')) {
                serverStatus.players = Math.max(0, serverStatus.players - 1);
            }
            
            const tpsMatch = output.match(/TPS from last 1m, 5m, 15m:\s*([\d.]+)/);
            if (tpsMatch) {
                serverStatus.tps = parseFloat(tpsMatch[1]);
            }
            
            console.log(`[${serverId}] ${output.trim()}`);
        });
        
        child.stderr.on('data', (data) => {
            console.error(`[${serverId} ERROR] ${data.toString()}`);
        });
        
        child.on('close', (code) => {
            serverStatus.online = false;
            serverStatus.status = 'stopped';
            serverStatus.players = 0;
            serverStatus.pid = null;
            serverStatus.process = null;
            this.activeServers.delete(serverId);
            console.log(`[${serverId}] Process exited with code ${code}`);
        });
        
        return {
            pid: child.pid,
            status: 'starting'
        };
    }
    
    async stopServer(serverId) {
        if (!this.activeServers.has(serverId)) {
            throw new Error('Server is not running');
        }
        
        const server = this.activeServers.get(serverId);
        server.status = 'stopping';
        
        try {
            server.process.stdin.write('stop\n');
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (server.process) {
                        server.process.kill('SIGKILL');
                    }
                    resolve({ forced: true });
                }, 30000);
                
                server.process.on('close', () => {
                    clearTimeout(timeout);
                    resolve({ forced: false });
                });
            });
        } catch (error) {
            if (server.process) {
                server.process.kill('SIGKILL');
            }
            throw error;
        }
    }
    
    async restartServer(serverId) {
        await this.stopServer(serverId);
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        return await this.startServer(serverId);
    }
    
    async sendCommand(serverId, command) {
        if (!this.activeServers.has(serverId)) {
            throw new Error('Server is not running');
        }
        
        const server = this.activeServers.get(serverId);
        
        if (!server.process) {
            throw new Error('Server process not found');
        }
        
        server.process.stdin.write(command + '\n');
        
        return { sent: true, command };
    }
    
    async getServerLogs(serverId, lines = 100) {
        const logPath = path.join(this.serversDir, serverId, 'logs', 'latest.log');
        
        try {
            const logContent = await fs.readFile(logPath, 'utf8');
            const logLines = logContent.split('\n').slice(-lines);
            
            return logLines.map(line => ({
                raw: line,
                timestamp: line.match(/^\[\d{2}:\d{2}:\d{2}\]/)?.[0] || '',
                message: line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, ''),
                level: line.includes('ERROR') ? 'error' :
                       line.includes('WARN') ? 'warning' :
                       line.includes('INFO') ? 'info' : 'debug'
            }));
        } catch (error) {
            return [];
        }
    }
    
    async deleteServer(serverId) {
        const serverPath = path.join(this.serversDir, serverId);
        
        if (this.activeServers.has(serverId)) {
            await this.stopServer(serverId);
        }
        
        await fs.rm(serverPath, { recursive: true, force: true });
        
        return { deleted: true };
    }
    
    async updateServerConfig(serverId, config) {
        const serverPath = path.join(this.serversDir, serverId);
        const configPath = path.join(serverPath, 'server.json');
        
        const existingConfig = await fs.readFile(configPath, 'utf8');
        const parsedConfig = JSON.parse(existingConfig);
        
        Object.assign(parsedConfig, config);
        
        await fs.writeFile(configPath, JSON.stringify(parsedConfig, null, 2));
        
        return parsedConfig;
    }
    
    generatePassword() {
        return require('crypto').randomBytes(16).toString('hex');
    }
    
    async getSystemStats() {
        try {
            const [cpuUsage, memoryUsage, diskUsage] = await Promise.all([
                this.getCPUUsage(),
                this.getMemoryUsage(),
                this.getDiskUsage()
            ]);
            
            return {
                cpu: cpuUsage,
                memory: memoryUsage,
                disk: diskUsage,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting system stats:', error);
            return {
                cpu: 0,
                memory: { used: 0, total: 0, percent: 0 },
                disk: { used: 0, total: 0, percent: 0 },
                timestamp: new Date().toISOString()
            };
        }
    }
    
    async getCPUUsage() {
        try {
            const { stdout } = await execPromise("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'");
            return parseFloat(stdout.trim());
        } catch (error) {
            return 0;
        }
    }
    
    async getMemoryUsage() {
        try {
            const { stdout } = await execPromise("free -m | awk 'NR==2{printf \"%.2f\", $3*100/$2 }'");
            const percent = parseFloat(stdout.trim());
            
            const { stdout: memInfo } = await execPromise("free -m | awk 'NR==2{print $2, $3}'");
            const [total, used] = memInfo.trim().split(' ').map(Number);
            
            return {
                total,
                used,
                percent
            };
        } catch (error) {
            return { total: 0, used: 0, percent: 0 };
        }
    }
    
    async getDiskUsage() {
        try {
            const { stdout } = await execPromise("df -h / | awk 'NR==2{print $3, $2, $5}'");
            const [used, total, percent] = stdout.trim().split(' ');
            
            return {
                used: this.parseSize(used),
                total: this.parseSize(total),
                percent: parseFloat(percent)
            };
        } catch (error) {
            return { used: 0, total: 0, percent: 0 };
        }
    }
    
    parseSize(sizeStr) {
        const match = sizeStr.match(/^(\d+\.?\d*)([KMGT]?)/i);
        if (!match) return 0;
        
        const [, value, unit] = match;
        const num = parseFloat(value);
        
        switch (unit.toUpperCase()) {
            case 'T': return num * 1024 * 1024;
            case 'G': return num * 1024;
            case 'M': return num;
            case 'K': return num / 1024;
            default: return num;
        }
    }
}

module.exports = new ServerController();