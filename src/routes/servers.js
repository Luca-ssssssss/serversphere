const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const router = express.Router();

const serversDir = path.join(__dirname, '../../servers');
const SERVERS = [];

async function loadServers() {
    try {
        const dirs = await fs.readdir(serversDir);
        for (const dir of dirs) {
            const serverPath = path.join(serversDir, dir);
            const configPath = path.join(serverPath, 'server.json');
            
            try {
                const configData = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configData);
                
                const server = {
                    id: dir,
                    name: config.name || dir,
                    type: config.type || 'vanilla',
                    version: config.version || '1.20.1',
                    port: config.port || 25565,
                    ram: config.ram || 4096,
                    online: false,
                    players: 0,
                    maxPlayers: 20,
                    tps: 20,
                    cpu: 0,
                    memory: 0,
                    pid: null,
                    process: null,
                    status: 'offline',
                    createdAt: config.createdAt || new Date().toISOString()
                };
                
                const existingIndex = SERVERS.findIndex(s => s.id === dir);
                if (existingIndex >= 0) {
                    Object.assign(SERVERS[existingIndex], server);
                } else {
                    SERVERS.push(server);
                }
            } catch (error) {
                console.error(`Error loading server ${dir}:`, error);
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error reading servers directory:', error);
        }
    }
}

loadServers();

router.get('/', async (req, res) => {
    await loadServers();
    res.json(SERVERS.map(server => ({
        id: server.id,
        name: server.name,
        type: server.type,
        version: server.version,
        port: server.port,
        ram: server.ram,
        online: server.online,
        players: server.players,
        maxPlayers: server.maxPlayers,
        tps: server.tps,
        cpu: server.cpu,
        memory: server.memory,
        status: server.status,
        createdAt: server.createdAt
    })));
});

router.post('/create', async (req, res) => {
    const { name, type, version, port, ram } = req.body;
    
    if (!name || !type || !version) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const serverId = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const serverPath = path.join(serversDir, serverId);
    
    try {
        await fs.mkdir(serverPath, { recursive: true });
        
        const config = {
            id: serverId,
            name,
            type,
            version,
            port: port || 25565,
            ram: ram || 4096,
            createdAt: new Date().toISOString(),
            properties: {
                'server-port': port || 25565,
                'max-players': 20,
                'view-distance': 10,
                'enable-rcon': false,
                'rcon.port': 25575,
                'rcon.password': generatePassword(),
                'enable-query': true,
                'query.port': port || 25565
            }
        };
        
        await fs.writeFile(
            path.join(serverPath, 'server.json'),
            JSON.stringify(config, null, 2)
        );
        
        const server = {
            id: serverId,
            name,
            type,
            version,
            port: port || 25565,
            ram: ram || 4096,
            online: false,
            players: 0,
            maxPlayers: 20,
            tps: 20,
            cpu: 0,
            memory: 0,
            pid: null,
            process: null,
            status: 'created',
            createdAt: config.createdAt
        };
        
        SERVERS.push(server);
        
        await downloadServerJar(server);
        
        res.status(201).json({
            message: 'Server created successfully',
            server: {
                id: server.id,
                name: server.name,
                type: server.type,
                version: server.version,
                port: server.port,
                status: server.status
            }
        });
    } catch (error) {
        console.error('Error creating server:', error);
        res.status(500).json({ error: 'Failed to create server' });
    }
});

async function downloadServerJar(server) {
    const serverPath = path.join(serversDir, server.id);
    let downloadUrl = '';
    
    switch (server.type) {
        case 'paper':
            downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${server.version}/builds/latest/downloads/paper-${server.version}.jar`;
            break;
        case 'vanilla':
            downloadUrl = `https://piston-data.mojang.com/v1/objects/${await getVanillaVersion(server.version)}/server.jar`;
            break;
        case 'purpur':
            downloadUrl = `https://api.purpurmc.org/v2/purpur/${server.version}/latest/download`;
            break;
        default:
            downloadUrl = `https://piston-data.mojang.com/v1/objects/${await getVanillaVersion(server.version)}/server.jar`;
    }
    
    try {
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error('Download failed');
        
        const buffer = await response.arrayBuffer();
        await fs.writeFile(
            path.join(serverPath, 'server.jar'),
            Buffer.from(buffer)
        );
        
        console.log(`Downloaded ${server.type} ${server.version} for server ${server.name}`);
    } catch (error) {
        console.error(`Failed to download server jar:`, error);
    }
}

async function getVanillaVersion(version) {
    const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest.json');
    const data = await response.json();
    const versionInfo = data.versions.find(v => v.id === version);
    
    if (!versionInfo) return null;
    
    const versionResponse = await fetch(versionInfo.url);
    const versionData = await versionResponse.json();
    return versionData.downloads.server.sha1;
}

router.post('/:id/start', async (req, res) => {
    const server = SERVERS.find(s => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    if (server.online) {
        return res.status(400).json({ error: 'Server is already running' });
    }
    
    try {
        const serverPath = path.join(serversDir, server.id);
        
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
        
        const eulaPath = path.join(serverPath, 'eula.txt');
        await fs.writeFile(eulaPath, 'eula=true\n');
        
        const javaArgs = [
            '-Xmx' + server.ram + 'M',
            '-Xms' + Math.floor(server.ram / 4) + 'M',
            '-jar', 'server.jar',
            'nogui'
        ];
        
        const child = spawn('java', javaArgs, {
            cwd: serverPath,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        server.process = child;
        server.pid = child.pid;
        server.online = true;
        server.status = 'starting';
        
        child.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[${server.name}] ${output}`);
            
            if (output.includes('Done')) {
                server.status = 'online';
            }
            
            if (output.includes('joined the game')) {
                server.players++;
            }
            
            if (output.includes('left the game')) {
                server.players = Math.max(0, server.players - 1);
            }
        });
        
        child.stderr.on('data', (data) => {
            console.error(`[${server.name} ERROR] ${data.toString()}`);
        });
        
        child.on('close', (code) => {
            server.online = false;
            server.status = 'stopped';
            server.players = 0;
            server.process = null;
            server.pid = null;
            console.log(`[${server.name}] Process exited with code ${code}`);
        });
        
        res.json({ 
            message: 'Server starting',
            pid: child.pid,
            status: 'starting'
        });
    } catch (error) {
        console.error('Error starting server:', error);
        res.status(500).json({ error: 'Failed to start server' });
    }
});

router.post('/:id/stop', async (req, res) => {
    const server = SERVERS.find(s => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    if (!server.online || !server.process) {
        return res.status(400).json({ error: 'Server is not running' });
    }
    
    try {
        server.process.stdin.write('stop\n');
        server.status = 'stopping';
        
        setTimeout(() => {
            if (server.process && server.online) {
                server.process.kill('SIGKILL');
            }
        }, 10000);
        
        res.json({ message: 'Stop command sent' });
    } catch (error) {
        console.error('Error stopping server:', error);
        res.status(500).json({ error: 'Failed to stop server' });
    }
});

router.post('/:id/restart', async (req, res) => {
    const server = SERVERS.find(s => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    if (server.online && server.process) {
        server.process.stdin.write('stop\n');
        server.status = 'restarting';
        
        setTimeout(async () => {
            await startServerProcess(server);
        }, 5000);
    } else {
        await startServerProcess(server);
    }
    
    res.json({ message: 'Restart initiated' });
});

async function startServerProcess(server) {
    const serverPath = path.join(serversDir, server.id);
    const javaArgs = [
        '-Xmx' + server.ram + 'M',
        '-Xms' + Math.floor(server.ram / 4) + 'M',
        '-jar', 'server.jar',
        'nogui'
    ];
    
    const child = spawn('java', javaArgs, {
        cwd: serverPath,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    server.process = child;
    server.pid = child.pid;
    server.online = true;
    server.status = 'starting';
}

router.get('/:id/console', async (req, res) => {
    const server = SERVERS.find(s => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    const logPath = path.join(serversDir, server.id, 'logs', 'latest.log');
    
    try {
        const logContent = await fs.readFile(logPath, 'utf8');
        res.json({ log: logContent });
    } catch (error) {
        res.json({ log: '' });
    }
});

router.post('/:id/command', async (req, res) => {
    const server = SERVERS.find(s => s.id === req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });
    
    const { command } = req.body;
    
    if (!command) {
        return res.status(400).json({ error: 'No command provided' });
    }
    
    if (!server.online || !server.process) {
        return res.status(400).json({ error: 'Server is not running' });
    }
    
    try {
        server.process.stdin.write(command + '\n');
        res.json({ message: 'Command sent' });
    } catch (error) {
        console.error('Error sending command:', error);
        res.status(500).json({ error: 'Failed to send command' });
    }
});

router.delete('/:id', async (req, res) => {
    const serverIndex = SERVERS.findIndex(s => s.id === req.params.id);
    if (serverIndex === -1) return res.status(404).json({ error: 'Server not found' });
    
    const server = SERVERS[serverIndex];
    
    if (server.online && server.process) {
        server.process.stdin.write('stop\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    try {
        const serverPath = path.join(serversDir, server.id);
        await fs.rm(serverPath, { recursive: true, force: true });
        
        SERVERS.splice(serverIndex, 1);
        
        res.json({ message: 'Server deleted successfully' });
    } catch (error) {
        console.error('Error deleting server:', error);
        res.status(500).json({ error: 'Failed to delete server' });
    }
});

function generatePassword() {
    return Math.random().toString(36).slice(-10);
}

module.exports = router;