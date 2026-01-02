const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const serversDir = path.join(__dirname, '../../servers');

router.get('/:serverId', async (req, res) => {
    const serverId = req.params.serverId;
    const serverPath = path.join(serversDir, serverId);
    
    const pluginsPath = path.join(serverPath, 'plugins');
    const modsPath = path.join(serverPath, 'mods');
    
    try {
        const plugins = [];
        const mods = [];
        
        try {
            const pluginFiles = await fs.readdir(pluginsPath);
            for (const file of pluginFiles) {
                if (file.endsWith('.jar')) {
                    const stats = await fs.stat(path.join(pluginsPath, file));
                    plugins.push({
                        name: file.replace('.jar', ''),
                        filename: file,
                        size: stats.size,
                        modified: stats.mtime,
                        path: path.join('plugins', file)
                    });
                }
            }
        } catch (error) {
        }
        
        try {
            const modFiles = await fs.readdir(modsPath);
            for (const file of modFiles) {
                if (file.endsWith('.jar')) {
                    const stats = await fs.stat(path.join(modsPath, file));
                    mods.push({
                        name: file.replace('.jar', ''),
                        filename: file,
                        size: stats.size,
                        modified: stats.mtime,
                        path: path.join('mods', file)
                    });
                }
            }
        } catch (error) {
        }
        
        res.json({ plugins, mods });
    } catch (error) {
        res.json({ plugins: [], mods: [] });
    }
});

router.post('/:serverId/upload', async (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const pluginFile = req.files.file;
    const serverId = req.params.serverId;
    const { type = 'plugin' } = req.body;
    
    const serverPath = path.join(serversDir, serverId);
    const targetDir = type === 'mod' ? 'mods' : 'plugins';
    const targetPath = path.join(serverPath, targetDir);
    
    try {
        await fs.mkdir(targetPath, { recursive: true });
        await pluginFile.mv(path.join(targetPath, pluginFile.name));
        
        res.json({ 
            message: `${type} uploaded successfully`,
            file: {
                name: pluginFile.name,
                size: pluginFile.size,
                type,
                path: path.join(targetDir, pluginFile.name)
            }
        });
    } catch (error) {
        console.error('Error uploading plugin:', error);
        res.status(500).json({ error: 'Failed to upload plugin' });
    }
});

router.delete('/:serverId/:type/:filename', async (req, res) => {
    const { serverId, type, filename } = req.params;
    
    const serverPath = path.join(serversDir, serverId);
    const targetDir = type === 'mod' ? 'mods' : 'plugins';
    const filePath = path.join(serverPath, targetDir, filename);
    
    try {
        await fs.unlink(filePath);
        res.json({ message: `${type} deleted successfully` });
    } catch (error) {
        console.error('Error deleting plugin:', error);
        res.status(500).json({ error: 'Failed to delete plugin' });
    }
});

router.post('/:serverId/enable', async (req, res) => {
    const serverId = req.params.serverId;
    const { filename, enabled } = req.body;
    
    const serverPath = path.join(serversDir, serverId);
    const pluginPath = path.join(serverPath, 'plugins', filename);
    const disabledPath = path.join(serverPath, 'plugins', 'disabled', filename);
    
    try {
        if (enabled) {
            await fs.rename(disabledPath, pluginPath);
        } else {
            const disabledDir = path.join(serverPath, 'plugins', 'disabled');
            await fs.mkdir(disabledDir, { recursive: true });
            await fs.rename(pluginPath, disabledPath);
        }
        
        res.json({ 
            message: `Plugin ${enabled ? 'enabled' : 'disabled'}`,
            enabled
        });
    } catch (error) {
        console.error('Error toggling plugin:', error);
        res.status(500).json({ error: 'Failed to toggle plugin' });
    }
});

router.get('/marketplace/search', async (req, res) => {
    const { query, type = 'plugin', page = 1 } = req.query;
    
    try {
        let results = [];
        
        if (type === 'plugin') {
            const spigotResponse = await fetch(`https://api.spiget.org/v2/search/resources/${query}?size=20&page=${page}`);
            if (spigotResponse.ok) {
                const spigotResults = await spigotResponse.json();
                results = spigotResults.map(item => ({
                    id: item.id,
                    name: item.name,
                    author: item.author?.username || 'Unknown',
                    description: item.tag,
                    downloads: item.downloads,
                    rating: item.rating?.average || 0,
                    version: item.version?.name || 'Unknown',
                    source: 'spigotmc'
                }));
            }
        } else if (type === 'mod') {
            const modrinthResponse = await fetch(`https://api.modrinth.com/v2/search?query=${query}&limit=20&offset=${(page - 1) * 20}`);
            if (modrinthResponse.ok) {
                const modrinthResults = await modrinthResponse.json();
                results = modrinthResults.hits.map(item => ({
                    id: item.project_id,
                    name: item.title,
                    author: item.author,
                    description: item.description,
                    downloads: item.downloads,
                    version: item.versions?.[0] || 'Unknown',
                    source: 'modrinth'
                }));
            }
        }
        
        res.json({
            query,
            type,
            page,
            results,
            total: results.length
        });
    } catch (error) {
        console.error('Error searching marketplace:', error);
        res.json({ query, type, page, results: [], total: 0 });
    }
});

router.post('/marketplace/install', async (req, res) => {
    const { source, id, serverId, type } = req.body;
    
    if (!source || !id || !serverId) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    try {
        let downloadUrl = '';
        let filename = '';
        
        if (source === 'spigotmc') {
            const resourceResponse = await fetch(`https://api.spiget.org/v2/resources/${id}/download`);
            if (!resourceResponse.ok) throw new Error('Failed to fetch from SpigotMC');
            downloadUrl = resourceResponse.url;
            filename = `spigot-${id}.jar`;
        } else if (source === 'modrinth') {
            const versionResponse = await fetch(`https://api.modrinth.com/v2/project/${id}/version`);
            if (!versionResponse.ok) throw new Error('Failed to fetch from Modrinth');
            const versions = await versionResponse.json();
            const latest = versions[0];
            const jarFile = latest.files.find(f => f.primary);
            downloadUrl = jarFile.url;
            filename = jarFile.filename;
        }
        
        const serverPath = path.join(serversDir, serverId);
        const targetDir = type === 'mod' ? 'mods' : 'plugins';
        const targetPath = path.join(serverPath, targetDir, filename);
        
        const fileResponse = await fetch(downloadUrl);
        if (!fileResponse.ok) throw new Error('Failed to download file');
        
        const buffer = await fileResponse.arrayBuffer();
        await fs.writeFile(targetPath, Buffer.from(buffer));
        
        res.json({
            message: 'Plugin installed successfully',
            file: {
                name: filename,
                path: path.join(targetDir, filename),
                size: buffer.byteLength,
                source,
                type
            }
        });
    } catch (error) {
        console.error('Error installing from marketplace:', error);
        res.status(500).json({ error: 'Failed to install plugin' });
    }
});

router.get('/:serverId/config/:pluginName', async (req, res) => {
    const { serverId, pluginName } = req.params;
    const configPath = path.join(serversDir, serverId, 'plugins', pluginName, 'config.yml');
    
    try {
        const configContent = await fs.readFile(configPath, 'utf8');
        res.json({
            plugin: pluginName,
            config: configContent,
            exists: true
        });
    } catch (error) {
        res.json({
            plugin: pluginName,
            config: '',
            exists: false
        });
    }
});

router.put('/:serverId/config/:pluginName', async (req, res) => {
    const { serverId, pluginName } = req.params;
    const { config } = req.body;
    
    const configDir = path.join(serversDir, serverId, 'plugins', pluginName);
    const configPath = path.join(configDir, 'config.yml');
    
    try {
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(configPath, config);
        res.json({ message: 'Config saved successfully' });
    } catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({ error: 'Failed to save config' });
    }
});

module.exports = router;