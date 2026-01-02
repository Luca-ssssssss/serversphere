const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const serversDir = path.join(__dirname, '../../servers');

router.get('/:serverId', async (req, res) => {
    const serverId = req.params.serverId;
    const lines = parseInt(req.query.lines) || 100;
    
    const logPath = path.join(serversDir, serverId, 'logs', 'latest.log');
    
    try {
        const logContent = await fs.readFile(logPath, 'utf8');
        const logLines = logContent.split('\n').slice(-lines);
        
        const coloredLog = logLines.map(line => {
            const timestamp = line.match(/^\[\d{2}:\d{2}:\d{2}\]/)?.[0] || '';
            const level = line.includes('ERROR') ? 'error' :
                         line.includes('WARN') ? 'warning' :
                         line.includes('INFO') ? 'info' : 'debug';
            
            return {
                timestamp,
                level,
                message: line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, ''),
                raw: line
            };
        });
        
        res.json({
            logs: coloredLog,
            totalLines: logContent.split('\n').length
        });
    } catch (error) {
        res.json({ logs: [], totalLines: 0 });
    }
});

router.post('/:serverId/command', async (req, res) => {
    const serverId = req.params.serverId;
    const { command } = req.body;
    
    const logPath = path.join(serversDir, serverId, 'logs', 'latest.log');
    
    try {
        await fs.appendFile(logPath, `[${new Date().toLocaleTimeString()}] [CONSOLE] ${command}\n`);
        
        res.json({ 
            message: 'Command logged',
            timestamp: new Date().toISOString(),
            command
        });
    } catch (error) {
        console.error('Error logging command:', error);
        res.status(500).json({ error: 'Failed to log command' });
    }
});

router.get('/:serverId/players', async (req, res) => {
    const serverId = req.params.serverId;
    const logPath = path.join(serversDir, serverId, 'logs', 'latest.log');
    
    try {
        const logContent = await fs.readFile(logPath, 'utf8');
        const lines = logContent.split('\n').reverse().slice(0, 1000);
        
        const players = new Set();
        
        lines.forEach(line => {
            const joinMatch = line.match(/\]\s*(\w+)\s*joined the game/);
            if (joinMatch) players.add(joinMatch[1]);
            
            const leaveMatch = line.match(/\]\s*(\w+)\s*left the game/);
            if (leaveMatch) players.delete(leaveMatch[1]);
        });
        
        res.json({
            online: Array.from(players),
            count: players.size
        });
    } catch (error) {
        res.json({ online: [], count: 0 });
    }
});

router.get('/:serverId/stats', async (req, res) => {
    const serverId = req.params.serverId;
    const logPath = path.join(serversDir, serverId, 'logs', 'latest.log');
    
    try {
        const logContent = await fs.readFile(logPath, 'utf8');
        const lines = logContent.split('\n').reverse().slice(0, 500);
        
        let tps = 20;
        let memory = { used: 0, max: 0 };
        
        lines.forEach(line => {
            const tpsMatch = line.match(/TPS from last 1m, 5m, 15m:\s*([\d.]+)/);
            if (tpsMatch) tps = parseFloat(tpsMatch[1]);
            
            const memMatch = line.match(/Memory:\s*(\d+)%?\s*\((\d+)\/(\d+)\)/);
            if (memMatch) {
                memory.used = parseInt(memMatch[2]);
                memory.max = parseInt(memMatch[3]);
            }
        });
        
        const errors = lines.filter(line => 
            line.includes('ERROR') || 
            line.includes('Exception') || 
            line.includes('CRASH')
        ).length;
        
        const warnings = lines.filter(line => 
            line.includes('WARN') || 
            line.includes('Warning')
        ).length;
        
        res.json({
            tps,
            memory,
            errors,
            warnings,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            tps: 20,
            memory: { used: 0, max: 0 },
            errors: 0,
            warnings: 0,
            lastUpdated: new Date().toISOString()
        });
    }
});

router.post('/:serverId/clear', async (req, res) => {
    const serverId = req.params.serverId;
    const logPath = path.join(serversDir, serverId, 'logs', 'latest.log');
    
    try {
        await fs.writeFile(logPath, '');
        res.json({ message: 'Console cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear console' });
    }
});

router.get('/:serverId/search', async (req, res) => {
    const serverId = req.params.serverId;
    const query = req.query.q;
    const logPath = path.join(serversDir, serverId, 'logs', 'latest.log');
    
    if (!query) return res.status(400).json({ error: 'Search query required' });
    
    try {
        const logContent = await fs.readFile(logPath, 'utf8');
        const lines = logContent.split('\n');
        
        const results = lines
            .map((line, index) => ({ line, number: index + 1 }))
            .filter(item => item.line.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 100);
        
        res.json({
            query,
            results,
            count: results.length
        });
    } catch (error) {
        res.json({ query, results: [], count: 0 });
    }
});

module.exports = router;