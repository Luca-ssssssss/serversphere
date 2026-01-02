const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const router = express.Router();

const serversDir = path.join(__dirname, '../../servers');
const backupsDir = path.join(__dirname, '../../backups');

async function ensureBackupDir() {
    await fs.mkdir(backupsDir, { recursive: true });
}

router.post('/:serverId/create', async (req, res) => {
    const serverId = req.params.serverId;
    const { name, exclude = [] } = req.body;
    
    await ensureBackupDir();
    
    const serverPath = path.join(serversDir, serverId);
    const backupName = name || `${serverId}-${Date.now()}.zip`;
    const backupPath = path.join(backupsDir, backupName);
    
    try {
        await fs.access(serverPath);
        
        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', async () => {
            const stats = await fs.stat(backupPath);
            
            const backupInfo = {
                id: Date.now().toString(),
                name: backupName,
                serverId,
                size: stats.size,
                createdAt: new Date().toISOString(),
                path: backupPath
            };
            
            const backupsFile = path.join(backupsDir, 'backups.json');
            let backups = [];
            
            try {
                const data = await fs.readFile(backupsFile, 'utf8');
                backups = JSON.parse(data);
            } catch (error) {
                backups = [];
            }
            
            backups.push(backupInfo);
            await fs.writeFile(backupsFile, JSON.stringify(backups, null, 2));
            
            res.json({
                message: 'Backup created successfully',
                backup: backupInfo
            });
        });
        
        archive.on('error', (err) => {
            throw err;
        });
        
        archive.pipe(output);
        
        const files = await fs.readdir(serverPath);
        for (const file of files) {
            if (exclude.includes(file)) continue;
            
            const filePath = path.join(serverPath, file);
            const stats = await fs.stat(filePath);
            
            if (stats.isDirectory()) {
                archive.directory(filePath, file);
            } else {
                archive.file(filePath, { name: file });
            }
        }
        
        archive.finalize();
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

router.get('/:serverId', async (req, res) => {
    const serverId = req.params.serverId;
    
    try {
        const backupsFile = path.join(backupsDir, 'backups.json');
        const data = await fs.readFile(backupsFile, 'utf8');
        const allBackups = JSON.parse(data);
        
        const serverBackups = allBackups
            .filter(backup => backup.serverId === serverId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ backups: serverBackups });
    } catch (error) {
        res.json({ backups: [] });
    }
});

router.post('/:serverId/restore', async (req, res) => {
    const serverId = req.params.serverId;
    const { backupId } = req.body;
    
    try {
        const backupsFile = path.join(backupsDir, 'backups.json');
        const data = await fs.readFile(backupsFile, 'utf8');
        const backups = JSON.parse(data);
        
        const backup = backups.find(b => b.id === backupId && b.serverId === serverId);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });
        
        const serverPath = path.join(serversDir, serverId);
        
        await new Promise((resolve, reject) => {
            fs.createReadStream(backup.path)
                .pipe(unzipper.Extract({ path: serverPath }))
                .on('close', resolve)
                .on('error', reject);
        });
        
        res.json({ message: 'Backup restored successfully' });
    } catch (error) {
        console.error('Error restoring backup:', error);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

router.delete('/:serverId/:backupId', async (req, res) => {
    const { serverId, backupId } = req.params;
    
    try {
        const backupsFile = path.join(backupsDir, 'backups.json');
        const data = await fs.readFile(backupsFile, 'utf8');
        let backups = JSON.parse(data);
        
        const backupIndex = backups.findIndex(b => b.id === backupId && b.serverId === serverId);
        if (backupIndex === -1) return res.status(404).json({ error: 'Backup not found' });
        
        const backup = backups[backupIndex];
        
        try {
            await fs.unlink(backup.path);
        } catch (error) {
            console.error('Error deleting backup file:', error);
        }
        
        backups.splice(backupIndex, 1);
        await fs.writeFile(backupsFile, JSON.stringify(backups, null, 2));
        
        res.json({ message: 'Backup deleted successfully' });
    } catch (error) {
        console.error('Error deleting backup:', error);
        res.status(500).json({ error: 'Failed to delete backup' });
    }
});

router.post('/:serverId/schedule', async (req, res) => {
    const serverId = req.params.serverId;
    const { schedule, keep = 10 } = req.body;
    
    const schedulesFile = path.join(backupsDir, 'schedules.json');
    let schedules = [];
    
    try {
        const data = await fs.readFile(schedulesFile, 'utf8');
        schedules = JSON.parse(data);
    } catch (error) {
        schedules = [];
    }
    
    const existingIndex = schedules.findIndex(s => s.serverId === serverId);
    const scheduleEntry = {
        serverId,
        schedule,
        keep,
        enabled: true,
        lastRun: null,
        nextRun: calculateNextRun(schedule),
        createdAt: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        schedules[existingIndex] = scheduleEntry;
    } else {
        schedules.push(scheduleEntry);
    }
    
    await fs.writeFile(schedulesFile, JSON.stringify(schedules, null, 2));
    
    res.json({ 
        message: 'Backup schedule saved',
        schedule: scheduleEntry
    });
});

function calculateNextRun(schedule) {
    const now = new Date();
    let next = new Date(now);
    
    switch (schedule) {
        case 'hourly':
            next.setHours(next.getHours() + 1);
            break;
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        default:
            next.setDate(next.getDate() + 1);
    }
    
    return next.toISOString();
}

router.get('/:serverId/schedule', async (req, res) => {
    const serverId = req.params.serverId;
    
    try {
        const schedulesFile = path.join(backupsDir, 'schedules.json');
        const data = await fs.readFile(schedulesFile, 'utf8');
        const schedules = JSON.parse(data);
        
        const schedule = schedules.find(s => s.serverId === serverId);
        res.json({ schedule: schedule || null });
    } catch (error) {
        res.json({ schedule: null });
    }
});

router.post('/:serverId/upload', async (req, res) => {
    if (!req.files || !req.files.backup) {
        return res.status(400).json({ error: 'No backup file uploaded' });
    }
    
    const backupFile = req.files.backup;
    const serverId = req.params.serverId;
    
    await ensureBackupDir();
    
    const backupName = `${serverId}-upload-${Date.now()}.zip`;
    const backupPath = path.join(backupsDir, backupName);
    
    try {
        await backupFile.mv(backupPath);
        
        const stats = await fs.stat(backupPath);
        const backupInfo = {
            id: Date.now().toString(),
            name: backupName,
            serverId,
            size: stats.size,
            createdAt: new Date().toISOString(),
            path: backupPath,
            uploaded: true
        };
        
        const backupsFile = path.join(backupsDir, 'backups.json');
        let backups = [];
        
        try {
            const data = await fs.readFile(backupsFile, 'utf8');
            backups = JSON.parse(data);
        } catch (error) {
            backups = [];
        }
        
        backups.push(backupInfo);
        await fs.writeFile(backupsFile, JSON.stringify(backups, null, 2));
        
        res.json({
            message: 'Backup uploaded successfully',
            backup: backupInfo
        });
    } catch (error) {
        console.error('Error uploading backup:', error);
        res.status(500).json({ error: 'Failed to upload backup' });
    }
});

router.get('/:serverId/:backupId/download', async (req, res) => {
    const { serverId, backupId } = req.params;
    
    try {
        const backupsFile = path.join(backupsDir, 'backups.json');
        const data = await fs.readFile(backupsFile, 'utf8');
        const backups = JSON.parse(data);
        
        const backup = backups.find(b => b.id === backupId && b.serverId === serverId);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });
        
        res.download(backup.path, path.basename(backup.path));
    } catch (error) {
        console.error('Error downloading backup:', error);
        res.status(500).json({ error: 'Failed to download backup' });
    }
});

module.exports = router;