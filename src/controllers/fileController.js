const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const chokidar = require('chokidar');

class FileController {
    constructor() {
        this.serversDir = path.join(__dirname, '../../servers');
        this.watchers = new Map();
    }

    async listDirectory(serverId, directoryPath = '/') {
        const serverPath = path.join(this.serversDir, serverId);
        const targetPath = path.join(serverPath, directoryPath);
        
        try {
            await this.validatePath(serverPath, targetPath);
            
            const stats = await fs.stat(targetPath);
            
            if (!stats.isDirectory()) {
                const content = await fs.readFile(targetPath, 'utf8');
                return {
                    type: 'file',
                    path: directoryPath,
                    name: path.basename(directoryPath),
                    content,
                    size: stats.size,
                    modified: stats.mtime,
                    permissions: this.getPermissions(stats),
                    readable: true,
                    writable: true
                };
            }
            
            const files = await fs.readdir(targetPath);
            const fileStats = await Promise.all(
                files.map(async (file) => {
                    const filePath = path.join(targetPath, file);
                    try {
                        const stat = await fs.stat(filePath);
                        return {
                            name: file,
                            path: path.join(directoryPath, file).replace(/\\/g, '/'),
                            type: stat.isDirectory() ? 'directory' : 'file',
                            size: stat.size,
                            modified: stat.mtime,
                            permissions: this.getPermissions(stat),
                            extension: path.extname(file).toLowerCase(),
                            readable: true,
                            writable: true
                        };
                    } catch (error) {
                        return {
                            name: file,
                            path: path.join(directoryPath, file).replace(/\\/g, '/'),
                            type: 'unknown',
                            size: 0,
                            modified: new Date(),
                            permissions: '000',
                            error: error.message
                        };
                    }
                })
            );
            
            return {
                type: 'directory',
                path: directoryPath,
                files: fileStats.sort((a, b) => {
                    if (a.type === b.type) return a.name.localeCompare(b.name);
                    return a.type === 'directory' ? -1 : 1;
                }),
                totalSize: fileStats.reduce((sum, file) => sum + file.size, 0),
                fileCount: fileStats.filter(f => f.type === 'file').length,
                directoryCount: fileStats.filter(f => f.type === 'directory').length
            };
        } catch (error) {
            throw new Error(`Failed to list directory: ${error.message}`);
        }
    }

    async readFile(serverId, filePath) {
        const serverPath = path.join(this.serversDir, serverId);
        const targetPath = path.join(serverPath, filePath);
        
        try {
            await this.validatePath(serverPath, targetPath);
            
            const stats = await fs.stat(targetPath);
            
            if (stats.isDirectory()) {
                throw new Error('Cannot read directory as file');
            }
            
            const content = await fs.readFile(targetPath, 'utf8');
            
            return {
                path: filePath,
                name: path.basename(filePath),
                content,
                size: stats.size,
                modified: stats.mtime,
                permissions: this.getPermissions(stats),
                encoding: 'utf8',
                mimeType: this.getMimeType(targetPath)
            };
        } catch (error) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    }

    async writeFile(serverId, filePath, content) {
        const serverPath = path.join(this.serversDir, serverId);
        const targetPath = path.join(serverPath, filePath);
        
        try {
            await this.validatePath(serverPath, targetPath);
            
            const dirPath = path.dirname(targetPath);
            await fs.mkdir(dirPath, { recursive: true });
            
            await fs.writeFile(targetPath, content, 'utf8');
            
            const stats = await fs.stat(targetPath);
            
            return {
                path: filePath,
                name: path.basename(filePath),
                size: stats.size,
                modified: stats.mtime,
                success: true
            };
        } catch (error) {
            throw new Error(`Failed to write file: ${error.message}`);
        }
    }

    async createDirectory(serverId, dirPath) {
        const serverPath = path.join(this.serversDir, serverId);
        const targetPath = path.join(serverPath, dirPath);
        
        try {
            await this.validatePath(serverPath, targetPath);
            
            await fs.mkdir(targetPath, { recursive: true });
            
            const stats = await fs.stat(targetPath);
            
            return {
                path: dirPath,
                name: path.basename(dirPath),
                type: 'directory',
                created: true,
                modified: stats.mtime,
                permissions: this.getPermissions(stats)
            };
        } catch (error) {
            throw new Error(`Failed to create directory: ${error.message}`);
        }
    }

    async deletePath(serverId, targetPath) {
        const serverPath = path.join(this.serversDir, serverId);
        const fullPath = path.join(serverPath, targetPath);
        
        try {
            await this.validatePath(serverPath, fullPath);
            
            const stats = await fs.stat(fullPath);
            const isDirectory = stats.isDirectory();
            
            if (isDirectory) {
                await fs.rm(fullPath, { recursive: true, force: true });
            } else {
                await fs.unlink(fullPath);
            }
            
            return {
                path: targetPath,
                type: isDirectory ? 'directory' : 'file',
                deleted: true,
                size: stats.size
            };
        } catch (error) {
            throw new Error(`Failed to delete: ${error.message}`);
        }
    }

    async renamePath(serverId, oldPath, newName) {
        const serverPath = path.join(this.serversDir, serverId);
        const oldFullPath = path.join(serverPath, oldPath);
        const newFullPath = path.join(path.dirname(oldFullPath), newName);
        
        try {
            await this.validatePath(serverPath, oldFullPath);
            await this.validatePath(serverPath, newFullPath);
            
            await fs.rename(oldFullPath, newFullPath);
            
            const stats = await fs.stat(newFullPath);
            
            return {
                oldPath,
                newPath: path.join(path.dirname(oldPath), newName).replace(/\\/g, '/'),
                name: newName,
                type: stats.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                modified: stats.mtime
            };
        } catch (error) {
            throw new Error(`Failed to rename: ${error.message}`);
        }
    }

    async copyPath(serverId, sourcePath, destinationPath) {
        const serverPath = path.join(this.serversDir, serverId);
        const sourceFullPath = path.join(serverPath, sourcePath);
        const destFullPath = path.join(serverPath, destinationPath);
        
        try {
            await this.validatePath(serverPath, sourceFullPath);
            await this.validatePath(serverPath, destFullPath);
            
            const sourceStats = await fs.stat(sourceFullPath);
            
            if (sourceStats.isDirectory()) {
                await this.copyDirectory(sourceFullPath, destFullPath);
            } else {
                await fs.copyFile(sourceFullPath, destFullPath);
            }
            
            const destStats = await fs.stat(destFullPath);
            
            return {
                source: sourcePath,
                destination: destinationPath,
                type: sourceStats.isDirectory() ? 'directory' : 'file',
                size: destStats.size,
                copied: true
            };
        } catch (error) {
            throw new Error(`Failed to copy: ${error.message}`);
        }
    }

    async copyDirectory(source, destination) {
        await fs.mkdir(destination, { recursive: true });
        
        const files = await fs.readdir(source);
        
        for (const file of files) {
            const sourcePath = path.join(source, file);
            const destPath = path.join(destination, file);
            
            const stats = await fs.stat(sourcePath);
            
            if (stats.isDirectory()) {
                await this.copyDirectory(sourcePath, destPath);
            } else {
                await fs.copyFile(sourcePath, destPath);
            }
        }
    }

    async compressPaths(serverId, paths, outputPath) {
        const serverPath = path.join(this.serversDir, serverId);
        const outputFullPath = path.join(serverPath, outputPath);
        
        try {
            await this.validatePath(serverPath, outputFullPath);
            
            const outputDir = path.dirname(outputFullPath);
            await fs.mkdir(outputDir, { recursive: true });
            
            const output = fs.createWriteStream(outputFullPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            return new Promise(async (resolve, reject) => {
                output.on('close', async () => {
                    const stats = await fs.stat(outputFullPath);
                    resolve({
                        path: outputPath,
                        size: stats.size,
                        compressed: true,
                        fileCount: archive.pointer()
                    });
                });
                
                archive.on('error', reject);
                archive.on('warning', (err) => {
                    if (err.code === 'ENOENT') {
                        console.warn('Archive warning:', err);
                    } else {
                        reject(err);
                    }
                });
                
                archive.pipe(output);
                
                for (const filePath of paths) {
                    const fullPath = path.join(serverPath, filePath);
                    await this.validatePath(serverPath, fullPath);
                    
                    const stats = await fs.stat(fullPath);
                    const relativePath = path.relative(serverPath, fullPath);
                    
                    if (stats.isDirectory()) {
                        archive.directory(fullPath, relativePath);
                    } else {
                        archive.file(fullPath, { name: relativePath });
                    }
                }
                
                archive.finalize();
            });
        } catch (error) {
            throw new Error(`Failed to compress: ${error.message}`);
        }
    }

    async extractArchive(serverId, archivePath, destinationPath) {
        const serverPath = path.join(this.serversDir, serverId);
        const archiveFullPath = path.join(serverPath, archivePath);
        const destFullPath = path.join(serverPath, destinationPath);
        
        try {
            await this.validatePath(serverPath, archiveFullPath);
            await this.validatePath(serverPath, destFullPath);
            
            await fs.mkdir(destFullPath, { recursive: true });
            
            return new Promise((resolve, reject) => {
                fs.createReadStream(archiveFullPath)
                    .pipe(unzipper.Extract({ path: destFullPath }))
                    .on('close', () => {
                        resolve({
                            archive: archivePath,
                            destination: destinationPath,
                            extracted: true
                        });
                    })
                    .on('error', reject);
            });
        } catch (error) {
            throw new Error(`Failed to extract: ${error.message}`);
        }
    }

    async uploadFiles(serverId, directoryPath, files) {
        const serverPath = path.join(this.serversDir, serverId);
        const targetDir = path.join(serverPath, directoryPath);
        
        try {
            await this.validatePath(serverPath, targetDir);
            await fs.mkdir(targetDir, { recursive: true });
            
            const uploadedFiles = [];
            
            for (const file of files) {
                const filePath = path.join(targetDir, file.name);
                await this.validatePath(serverPath, filePath);
                
                await file.mv(filePath);
                
                const stats = await fs.stat(filePath);
                
                uploadedFiles.push({
                    name: file.name,
                    path: path.join(directoryPath, file.name).replace(/\\/g, '/'),
                    size: stats.size,
                    type: path.extname(file.name).toLowerCase(),
                    uploaded: true
                });
            }
            
            return {
                directory: directoryPath,
                files: uploadedFiles,
                totalSize: uploadedFiles.reduce((sum, file) => sum + file.size, 0),
                count: uploadedFiles.length
            };
        } catch (error) {
            throw new Error(`Failed to upload files: ${error.message}`);
        }
    }

    async downloadPath(serverId, targetPath) {
        const serverPath = path.join(this.serversDir, serverId);
        const fullPath = path.join(serverPath, targetPath);
        
        try {
            await this.validatePath(serverPath, fullPath);
            
            const stats = await fs.stat(fullPath);
            
            return {
                path: fullPath,
                name: path.basename(targetPath),
                size: stats.size,
                isDirectory: stats.isDirectory(),
                stream: fs.createReadStream(fullPath)
            };
        } catch (error) {
            throw new Error(`Failed to prepare download: ${error.message}`);
        }
    }

    async searchFiles(serverId, searchTerm, directory = '/') {
        const serverPath = path.join(this.serversDir, serverId);
        const searchPath = path.join(serverPath, directory);
        
        try {
            await this.validatePath(serverPath, searchPath);
            
            const results = [];
            await this.searchDirectory(searchPath, searchTerm.toLowerCase(), results, serverPath);
            
            return {
                searchTerm,
                directory,
                results: results.sort((a, b) => a.path.localeCompare(b.path)),
                count: results.length,
                searchedAt: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    async searchDirectory(dir, searchTerm, results, basePath) {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            
            try {
                const stats = await fs.stat(filePath);
                const relativePath = path.relative(basePath, filePath);
                
                if (file.toLowerCase().includes(searchTerm) || 
                    relativePath.toLowerCase().includes(searchTerm)) {
                    
                    results.push({
                        name: file,
                        path: relativePath.replace(/\\/g, '/'),
                        type: stats.isDirectory() ? 'directory' : 'file',
                        size: stats.size,
                        modified: stats.mtime,
                        directory: stats.isDirectory()
                    });
                }
                
                if (stats.isDirectory()) {
                    await this.searchDirectory(filePath, searchTerm, results, basePath);
                }
            } catch (error) {
                console.warn(`Cannot access ${filePath}:`, error.message);
            }
        }
    }

    async changePermissions(serverId, targetPath, mode) {
        const serverPath = path.join(this.serversDir, serverId);
        const fullPath = path.join(serverPath, targetPath);
        
        try {
            await this.validatePath(serverPath, fullPath);
            
            await fs.chmod(fullPath, parseInt(mode, 8));
            
            const stats = await fs.stat(fullPath);
            
            return {
                path: targetPath,
                permissions: this.getPermissions(stats),
                mode: mode,
                changed: true
            };
        } catch (error) {
            throw new Error(`Failed to change permissions: ${error.message}`);
        }
    }

    async getFileInfo(serverId, filePath) {
        const serverPath = path.join(this.serversDir, serverId);
        const fullPath = path.join(serverPath, filePath);
        
        try {
            await this.validatePath(serverPath, fullPath);
            
            const stats = await fs.stat(fullPath);
            
            return {
                path: filePath,
                name: path.basename(filePath),
                type: stats.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                accessed: stats.atime,
                permissions: this.getPermissions(stats),
                inode: stats.ino,
                uid: stats.uid,
                gid: stats.gid,
                device: stats.dev,
                mimeType: this.getMimeType(fullPath)
            };
        } catch (error) {
            throw new Error(`Failed to get file info: ${error.message}`);
        }
    }

    async watchDirectory(serverId, directoryPath, callback) {
        const serverPath = path.join(this.serversDir, serverId);
        const watchPath = path.join(serverPath, directoryPath);
        
        try {
            await this.validatePath(serverPath, watchPath);
            
            const watcherKey = `${serverId}:${directoryPath}`;
            
            if (this.watchers.has(watcherKey)) {
                this.watchers.get(watcherKey).close();
            }
            
            const watcher = chokidar.watch(watchPath, {
                persistent: true,
                ignoreInitial: true,
                ignored: /(^|[\/\\])\../,
                depth: 5,
                interval: 1000,
                binaryInterval: 3000
            });
            
            watcher
                .on('add', (path) => callback({ type: 'add', path: path.replace(serverPath + '/', '') }))
                .on('change', (path) => callback({ type: 'change', path: path.replace(serverPath + '/', '') }))
                .on('unlink', (path) => callback({ type: 'delete', path: path.replace(serverPath + '/', '') }))
                .on('addDir', (path) => callback({ type: 'addDir', path: path.replace(serverPath + '/', '') }))
                .on('unlinkDir', (path) => callback({ type: 'deleteDir', path: path.replace(serverPath + '/', '') }))
                .on('error', (error) => console.error(`Watcher error for ${watchPath}:`, error));
            
            this.watchers.set(watcherKey, watcher);
            
            return {
                watching: directoryPath,
                serverId,
                started: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to watch directory: ${error.message}`);
        }
    }

    async stopWatching(serverId, directoryPath) {
        const watcherKey = `${serverId}:${directoryPath}`;
        
        if (this.watchers.has(watcherKey)) {
            this.watchers.get(watcherKey).close();
            this.watchers.delete(watcherKey);
            
            return {
                stopped: directoryPath,
                serverId,
                stoppedAt: new Date().toISOString()
            };
        }
        
        throw new Error('Watcher not found');
    }

    async calculateDirectorySize(serverId, directoryPath) {
        const serverPath = path.join(this.serversDir, serverId);
        const targetPath = path.join(serverPath, directoryPath);
        
        try {
            await this.validatePath(serverPath, targetPath);
            
            let totalSize = 0;
            let fileCount = 0;
            let directoryCount = 0;
            
            await this.calculateSizeRecursive(targetPath, (size, isDirectory) => {
                totalSize += size;
                if (isDirectory) {
                    directoryCount++;
                } else {
                    fileCount++;
                }
            });
            
            return {
                path: directoryPath,
                size: totalSize,
                formattedSize: this.formatBytes(totalSize),
                fileCount,
                directoryCount,
                totalItems: fileCount + directoryCount
            };
        } catch (error) {
            throw new Error(`Failed to calculate size: ${error.message}`);
        }
    }

    async calculateSizeRecursive(dir, callback) {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            
            try {
                const stats = await fs.stat(filePath);
                
                if (stats.isDirectory()) {
                    callback(0, true);
                    await this.calculateSizeRecursive(filePath, callback);
                } else {
                    callback(stats.size, false);
                }
            } catch (error) {
                console.warn(`Cannot access ${filePath}:`, error.message);
            }
        }
    }

    validatePath(basePath, targetPath) {
        const relative = path.relative(basePath, targetPath);
        
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Access denied: Path traversal attempt');
        }
        
        return true;
    }

    getPermissions(stats) {
        return (stats.mode & 0o777).toString(8).padStart(3, '0');
    }

    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        
        const mimeTypes = {
            '.txt': 'text/plain',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.yml': 'application/x-yaml',
            '.yaml': 'application/x-yaml',
            '.properties': 'text/plain',
            '.conf': 'text/plain',
            '.cfg': 'text/plain',
            '.xml': 'application/xml',
            '.html': 'text/html',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.zip': 'application/zip',
            '.jar': 'application/java-archive',
            '.tar': 'application/x-tar',
            '.gz': 'application/gzip',
            '.log': 'text/plain',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        
        return mimeTypes[ext] || 'application/octet-stream';
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    async getDiskUsage() {
        const checkDiskSpace = require('check-disk-space').default;
        const diskInfo = await checkDiskSpace(this.serversDir);
        
        return {
            total: diskInfo.size,
            free: diskInfo.free,
            used: diskInfo.size - diskInfo.free,
            path: this.serversDir
        };
    }

    cleanup() {
        for (const [key, watcher] of this.watchers.entries()) {
            watcher.close();
        }
        this.watchers.clear();
    }
}

module.exports = new FileController();