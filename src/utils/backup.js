const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const crypto = require('crypto');

class BackupManager {
    constructor() {
        this.backupsDir = path.join(__dirname, '../../backups');
        this.serversDir = path.join(__dirname, '../../servers');
        this.ensureDirectories();
    }
    
    async ensureDirectories() {
        await fs.mkdir(this.backupsDir, { recursive: true });
        await fs.mkdir(path.join(this.backupsDir, 'temp'), { recursive: true });
    }
    
    async createBackup(serverId, options = {}) {
        const {
            name = `${serverId}-${Date.now()}`,
            exclude = ['logs', 'cache', 'crash-reports'],
            compression = 'zip',
            incremental = false,
            notes = ''
        } = options;
        
        const serverPath = path.join(this.serversDir, serverId);
        const backupFileName = `${name}.${compression}`;
        const backupPath = path.join(this.backupsDir, backupFileName);
        
        try {
            await fs.access(serverPath);
            
            const backupId = crypto.randomBytes(8).toString('hex');
            const tempBackupPath = path.join(this.backupsDir, 'temp', `${backupId}.${compression}`);
            
            const output = fs.createWriteStream(tempBackupPath);
            const archive = archiver(compression, {
                zlib: { level: 9 }
            });
            
            return new Promise(async (resolve, reject) => {
                output.on('close', async () => {
                    const stats = await fs.stat(tempBackupPath);
                    
                    const backupInfo = {
                        id: backupId,
                        serverId,
                        name: backupFileName,
                        path: backupPath,
                        tempPath: tempBackupPath,
                        size: stats.size,
                        compression,
                        incremental,
                        exclude,
                        notes,
                        status: 'completed',
                        createdAt: new Date().toISOString(),
                        hash: await this.calculateHash(tempBackupPath)
                    };
                    
                    await fs.rename(tempBackupPath, backupPath);
                    
                    await this.saveBackupMetadata(backupInfo);
                    
                    resolve(backupInfo);
                });
                
                archive.on('error', reject);
                archive.on('warning', (err) => {
                    if (err.code === 'ENOENT') {
                        console.warn('Backup warning:', err.message);
                    } else {
                        reject(err);
                    }
                });
                
                archive.pipe(output);
                
                const files = await this.walkDirectory(serverPath);
                for (const file of files) {
                    const relativePath = path.relative(serverPath, file);
                    
                    if (this.shouldExclude(relativePath, exclude)) {
                        continue;
                    }
                    
                    const stats = await fs.stat(file);
                    
                    if (stats.isDirectory()) {
                        archive.directory(file, relativePath);
                    } else {
                        archive.file(file, { name: relativePath });
                    }
                }
                
                archive.finalize();
            });
        } catch (error) {
            console.error('Backup creation failed:', error);
            throw new Error(`Failed to create backup: ${error.message}`);
        }
    }
    
    async restoreBackup(backupPath, serverId, options = {}) {
        const {
            overwrite = true,
            exclude = []
        } = options;
        
        const serverPath = path.join(this.serversDir, serverId);
        
        try {
            if (overwrite) {
                await fs.rm(serverPath, { recursive: true, force: true });
                await fs.mkdir(serverPath, { recursive: true });
            }
            
            await new Promise((resolve, reject) => {
                fs.createReadStream(backupPath)
                    .pipe(unzipper.Extract({ path: serverPath }))
                    .on('close', resolve)
                    .on('error', reject);
            });
            
            return {
                success: true,
                serverId,
                restoredFiles: await this.countFiles(serverPath),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Backup restoration failed:', error);
            throw new Error(`Failed to restore backup: ${error.message}`);
        }
    }
    
    async listBackups(serverId) {
        const metadataPath = path.join(this.backupsDir, 'metadata.json');
        
        try {
            const data = await fs.readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(data);
            
            return metadata
                .filter(backup => backup.serverId === serverId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } catch (error) {
            return [];
        }
    }
    
    async deleteBackup(backupId) {
        const metadataPath = path.join(this.backupsDir, 'metadata.json');
        
        try {
            const data = await fs.readFile(metadataPath, 'utf8');
            let metadata = JSON.parse(data);
            
            const backupIndex = metadata.findIndex(b => b.id === backupId);
            if (backupIndex === -1) {
                throw new Error('Backup not found');
            }
            
            const backup = metadata[backupIndex];
            
            try {
                await fs.unlink(backup.path);
            } catch (error) {
                console.warn('Could not delete backup file:', error.message);
            }
            
            metadata.splice(backupIndex, 1);
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
            
            return { success: true, backupId };
        } catch (error) {
            throw new Error(`Failed to delete backup: ${error.message}`);
        }
    }
    
    async scheduleBackup(serverId, schedule) {
        const schedulesPath = path.join(this.backupsDir, 'schedules.json');
        let schedules = [];
        
        try {
            const data = await fs.readFile(schedulesPath, 'utf8');
            schedules = JSON.parse(data);
        } catch (error) {
            schedules = [];
        }
        
        const existingIndex = schedules.findIndex(s => s.serverId === serverId);
        const scheduleEntry = {
            serverId,
            schedule,
            enabled: true,
            lastRun: null,
            nextRun: this.calculateNextRun(schedule),
            createdAt: new Date().toISOString()
        };
        
        if (existingIndex >= 0) {
            schedules[existingIndex] = scheduleEntry;
        } else {
            schedules.push(scheduleEntry);
        }
        
        await fs.writeFile(schedulesPath, JSON.stringify(schedules, null, 2));
        
        return scheduleEntry;
    }
    
    async runScheduledBackups() {
        const schedulesPath = path.join(this.backupsDir, 'schedules.json');
        
        try {
            const data = await fs.readFile(schedulesPath, 'utf8');
            const schedules = JSON.parse(data);
            
            const now = new Date();
            const dueBackups = schedules.filter(schedule => {
                if (!schedule.enabled) return false;
                
                const nextRun = new Date(schedule.nextRun);
                return nextRun <= now;
            });
            
            for (const schedule of dueBackups) {
                try {
                    console.log(`Running scheduled backup for server ${schedule.serverId}`);
                    
                    await this.createBackup(schedule.serverId, {
                        name: `${schedule.serverId}-scheduled-${Date.now()}`,
                        incremental: true
                    });
                    
                    schedule.lastRun = now.toISOString();
                    schedule.nextRun = this.calculateNextRun(schedule.schedule);
                } catch (error) {
                    console.error(`Failed to run backup for server ${schedule.serverId}:`, error);
                }
            }
            
            await fs.writeFile(schedulesPath, JSON.stringify(schedules, null, 2));
            
            return {
                run: dueBackups.length,
                success: dueBackups.filter(s => !s.error).length
            };
        } catch (error) {
            console.error('Error running scheduled backups:', error);
            return { run: 0, success: 0 };
        }
    }
    
    async uploadBackup(file, serverId) {
        const backupId = crypto.randomBytes(8).toString('hex');
        const backupFileName = `${serverId}-upload-${Date.now()}.zip`;
        const backupPath = path.join(this.backupsDir, backupFileName);
        
        try {
            await file.mv(backupPath);
            
            const stats = await fs.stat(backupPath);
            
            const backupInfo = {
                id: backupId,
                serverId,
                name: backupFileName,
                path: backupPath,
                size: stats.size,
                compression: 'zip',
                incremental: false,
                status: 'uploaded',
                createdAt: new Date().toISOString(),
                hash: await this.calculateHash(backupPath)
            };
            
            await this.saveBackupMetadata(backupInfo);
            
            return backupInfo;
        } catch (error) {
            console.error('Backup upload failed:', error);
            throw new Error(`Failed to upload backup: ${error.message}`);
        }
    }
    
    async calculateHash(filePath) {
        const hash = crypto.createHash('sha256');
        const stream = require('fs').createReadStream(filePath);
        
        return new Promise((resolve, reject) => {
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }
    
    async walkDirectory(dir) {
        let results = [];
        const list = await fs.readdir(dir);
        
        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isDirectory()) {
                results = results.concat(await this.walkDirectory(filePath));
            } else {
                results.push(filePath);
            }
        }
        
        return results;
    }
    
    shouldExclude(filePath, excludePatterns) {
        return excludePatterns.some(pattern => {
            if (pattern.startsWith('*')) {
                return filePath.endsWith(pattern.slice(1));
            }
            return filePath.includes(pattern);
        });
    }
    
    async countFiles(dir) {
        let count = 0;
        const list = await fs.readdir(dir);
        
        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isDirectory()) {
                count += await this.countFiles(filePath);
            } else {
                count++;
            }
        }
        
        return count;
    }
    
    calculateNextRun(schedule) {
        const now = new Date();
        const next = new Date(now);
        
        switch (schedule) {
            case 'hourly':
                next.setHours(next.getHours() + 1);
                next.setMinutes(0, 0, 0);
                break;
            case 'daily':
                next.setDate(next.getDate() + 1);
                next.setHours(0, 0, 0, 0);
                break;
            case 'weekly':
                next.setDate(next.getDate() + 7);
                next.setHours(0, 0, 0, 0);
                break;
            case 'monthly':
                next.setMonth(next.getMonth() + 1);
                next.setDate(1);
                next.setHours(0, 0, 0, 0);
                break;
            default:
                throw new Error(`Unsupported schedule: ${schedule}`);
        }
        
        return next.toISOString();
    }
    
    async saveBackupMetadata(backupInfo) {
        const metadataPath = path.join(this.backupsDir, 'metadata.json');
        let metadata = [];
        
        try {
            const data = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(data);
        } catch (error) {
            metadata = [];
        }
        
        metadata.push(backupInfo);
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }
    
    async cleanupOldBackups(serverId, keep = 10) {
        const backups = await this.listBackups(serverId);
        
        if (backups.length <= keep) {
            return { deleted: 0, kept: backups.length };
        }
        
        const toDelete = backups.slice(keep);
        let deletedCount = 0;
        
        for (const backup of toDelete) {
            try {
                await this.deleteBackup(backup.id);
                deletedCount++;
            } catch (error) {
                console.error(`Failed to delete backup ${backup.id}:`, error);
            }
        }
        
        return {
            deleted: deletedCount,
            kept: backups.length - toDelete.length
        };
    }
    
    async verifyBackup(backupId) {
        const metadataPath = path.join(this.backupsDir, 'metadata.json');
        
        try {
            const data = await fs.readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(data);
            
            const backup = metadata.find(b => b.id === backupId);
            if (!backup) {
                throw new Error('Backup not found');
            }
            
            const currentHash = await this.calculateHash(backup.path);
            const isValid = currentHash === backup.hash;
            
            return {
                id: backupId,
                valid: isValid,
                size: backup.size,
                createdAt: backup.createdAt,
                verifiedAt: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Verification failed: ${error.message}`);
        }
    }
}

module.exports = new BackupManager();