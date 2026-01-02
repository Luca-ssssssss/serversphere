require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*' }
});

// Basic middleware
app.use(helmet({
    contentSecurityPolicy: false // Vereinfacht für Entwicklung
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

// Basic routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Simple API endpoints
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/servers', async (req, res) => {
    try {
        const serversDir = path.join(__dirname, 'servers');
        await fs.mkdir(serversDir, { recursive: true });
        const dirs = await fs.readdir(serversDir);
        
        const servers = dirs.map(dir => ({
            id: dir,
            name: dir,
            online: false,
            players: 0,
            maxPlayers: 20,
            tps: 20,
            cpu: 0,
            memory: 0
        }));
        
        res.json(servers);
    } catch (error) {
        res.json([]);
    }
});

// WebSocket
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
    
    socket.on('echo', (data) => {
        socket.emit('echo_response', { 
            message: 'Echo: ' + data.message,
            timestamp: new Date().toISOString()
        });
    });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
    console.log(`
    🚀 ServerSphere v1.0.0
    ====================================
    📊 Panel URL: http://${HOST}:${PORT}/panel
    🔌 API Base: http://${HOST}:${PORT}/api
    📁 Servers directory: ${path.join(__dirname, 'servers')}
    ====================================
    Server running on http://${HOST}:${PORT}
    `);
});