const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const router = express.Router();

const serversDir = path.join(__dirname, '../../servers');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const serverId = req.params.serverId;
        const uploadPath = path.join(serversDir, serverId, 'uploads');
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

router.get('/:serverId', async (req, res) => {
    const serverId = req.params.serverId;
    const directory = req.query.path || '/';
    const serverPath = path.join(serversDir, serverId);
    const targetPath = path.join(serverPath, directory);
    
    try {
        await fs.access(targetPath);
        const stats = await fs.stat(targetPath);
        
        if (!stats.isDirectory()) {
            const fileContent = await fs.readFile(targetPath, 'utf8');
            return res.json({
                type: 'file',
                path: directory,
                name: path.basename(directory),
                content: fileContent,
                size: stats.size,
                modified: stats.mtime
            });
        }
        
        const files = await fs.readdir(targetPath);
        const fileStats = await Promise.all(
            files.map(async (file) => {
                const filePath = path.join(targetPath, file);
                const stat = await fs.stat(filePath);
                return {
                    name: file,
                    path: path.join(directory, file),
                    type: stat.isDirectory() ? 'directory' : 'file',
                    size: stat.size,
                    modified: stat.mtime,
                    permissions: stat.mode.toString(8).slice(-3)
                };
            })
        );
        
        res.json({
            type: 'directory',
            path: directory,
            files: fileStats.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            })
        });
    } catch (error) {
        console.error('Error reading directory:', error);
        res.status(404).json({ error: 'Directory not found' });
    }
});

router.post('/:serverId/upload', upload.array('files'), async (req, res) => {
    try {
        const uploadedFiles = req.files.map(file => ({
            name: file.originalname,
            path: file.path.replace(serversDir + path.sep, ''),
            size: file.size,
            type: path.extname(file.originalname).slice(1)
        }));
        
        res.json({
            message: 'Files uploaded successfully',
            files: uploadedFiles
        });
    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).json({ error: 'Failed to upload files' });
    }
});

router.post('/:serverId/create', async (req, res) => {
    const serverId = req.params.serverId;
    const { path: filePath, type, name } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    const fullPath = path.join(serversDir, serverId, filePath, name);
    
    try {
        if (type === 'directory') {
            await fs.mkdir(fullPath, { recursive: true });
            res.json({ message: 'Directory created successfully' });
        } else {
            await fs.writeFile(fullPath, '');
            res.json({ message: 'File created successfully' });
        }
    } catch (error) {
        console.error('Error creating:', error);
        res.status(500).json({ error: 'Failed to create' });
    }
});

router.put('/:serverId/edit', async (req, res) => {
    const serverId = req.params.serverId;
    const { path: filePath, content } = req.body;
    
    const fullPath = path.join(serversDir, serverId, filePath);
    
    try {
        await fs.writeFile(fullPath, content);
        res.json({ message: 'File saved successfully' });
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).json({ error: 'Failed to save file' });
    }
});

router.delete('/:serverId/delete', async (req, res) => {
    const serverId = req.params.serverId;
    const { path: filePath } = req.body;
    
    const fullPath = path.join(serversDir, serverId, filePath);
    
    try {
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true });
        } else {
            await fs.unlink(fullPath);
        }
        
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error('Error deleting:', error);
        res.status(500).json({ error: 'Failed to delete' });
    }
});

router.post('/:serverId/rename', async (req, res) => {
    const serverId = req.params.serverId;
    const { path: filePath, newName } = req.body;
    
    const fullPath = path.join(serversDir, serverId, filePath);
    const newPath = path.join(path.dirname(fullPath), newName);
    
    try {
        await fs.rename(fullPath, newPath);
        res.json({ message: 'Renamed successfully' });
    } catch (error) {
        console.error('Error renaming:', error);
        res.status(500).json({ error: 'Failed to rename' });
    }
});

router.get('/:serverId/download', async (req, res) => {
    const serverId = req.params.serverId;
    const filePath = req.query.path;
    
    const fullPath = path.join(serversDir, serverId, filePath);
    
    try {
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}.zip"`);
            
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(res);
            archive.directory(fullPath, false);
            archive.finalize();
        } else {
            res.download(fullPath);
        }
    } catch (error) {
        console.error('Error downloading:', error);
        res.status(404).json({ error: 'File not found' });
    }
});

router.post('/:serverId/extract', async (req, res) => {
    const serverId = req.params.serverId;
    const { path: zipPath, destination } = req.body;
    
    const fullZipPath = path.join(serversDir, serverId, zipPath);
    const extractPath = path.join(serversDir, serverId, destination || path.dirname(zipPath));
    
    try {
        await fs.mkdir(extractPath, { recursive: true });
        
        await new Promise((resolve, reject) => {
            fs.createReadStream(fullZipPath)
                .pipe(unzipper.Extract({ path: extractPath }))
                .on('close', resolve)
                .on('error', reject);
        });
        
        res.json({ message: 'Extracted successfully' });
    } catch (error) {
        console.error('Error extracting:', error);
        res.status(500).json({ error: 'Failed to extract' });
    }
});

router.post('/:serverId/chmod', async (req, res) => {
    const serverId = req.params.serverId;
    const { path: filePath, mode } = req.body;
    
    const fullPath = path.join(serversDir, serverId, filePath);
    
    try {
        await fs.chmod(fullPath, parseInt(mode, 8));
        res.json({ message: 'Permissions updated' });
    } catch (error) {
        console.error('Error changing permissions:', error);
        res.status(500).json({ error: 'Failed to update permissions' });
    }
});

module.exports = router;