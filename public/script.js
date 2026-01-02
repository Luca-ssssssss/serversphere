class ServerSphere {
    constructor() {
        this.socket = io();
        this.currentLanguage = 'de';
        this.servers = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadServers();
        this.setupSocket();
        this.loadLanguage();
        this.updateStats();
    }

    bindEvents() {
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('createServer').addEventListener('click', () => this.showModal('createServerModal'));
        document.getElementById('refreshAll').addEventListener('click', () => this.refreshAll());
        document.getElementById('sendCommand').addEventListener('click', () => this.sendCommand());
        document.getElementById('clearConsole').addEventListener('click', () => this.clearConsole());
        document.querySelector('.lang-select').addEventListener('change', (e) => this.changeLanguage(e.target.value));
        document.querySelector('.modal-close').addEventListener('click', () => this.hideModal('createServerModal'));
        document.getElementById('nextStep').addEventListener('click', () => this.nextStep());
        document.getElementById('prevStep').addEventListener('click', () => this.prevStep());
        document.getElementById('serverForm').addEventListener('submit', (e) => this.createServer(e));
        
        document.querySelectorAll('.server-type-card input').forEach(input => {
            input.addEventListener('change', (e) => {
                document.querySelectorAll('.server-type-card').forEach(card => {
                    card.style.borderColor = '';
                });
                e.target.closest('.server-type-card').style.borderColor = '#6366F1';
            });
        });

        document.getElementById('consoleInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendCommand();
        });
    }

    toggleTheme() {
        document.documentElement.setAttribute('data-theme', 
            document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
        );
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    nextStep() {
        const steps = document.querySelectorAll('.wizard-steps .step');
        const currentStep = [...steps].findIndex(step => step.classList.contains('active'));
        if (currentStep < steps.length - 1) {
            steps[currentStep].classList.remove('active');
            steps[currentStep + 1].classList.add('active');
            
            document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
            document.querySelector(`.form-step[data-step="${currentStep + 2}"]`).classList.add('active');
            
            this.updateStepButtons();
        }
    }

    prevStep() {
        const steps = document.querySelectorAll('.wizard-steps .step');
        const currentStep = [...steps].findIndex(step => step.classList.contains('active'));
        if (currentStep > 0) {
            steps[currentStep].classList.remove('active');
            steps[currentStep - 1].classList.add('active');
            
            document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
            document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');
            
            this.updateStepButtons();
        }
    }

    updateStepButtons() {
        const steps = document.querySelectorAll('.wizard-steps .step');
        const currentStep = [...steps].findIndex(step => step.classList.contains('active'));
        
        document.getElementById('prevStep').style.display = currentStep === 0 ? 'none' : 'inline-flex';
        document.getElementById('nextStep').style.display = currentStep === steps.length - 1 ? 'none' : 'inline-flex';
        document.getElementById('createServerBtn').style.display = currentStep === steps.length - 1 ? 'inline-flex' : 'none';
    }

    async createServer(e) {
        e.preventDefault();
        
        const serverData = {
            name: document.getElementById('serverName').value,
            type: document.querySelector('input[name="serverType"]:checked')?.value,
            version: document.getElementById('serverVersion').value,
            port: document.getElementById('serverPort').value || 25565,
            ram: document.getElementById('serverRam').value
        };

        try {
            const response = await fetch('/api/servers/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverData)
            });

            if (response.ok) {
                this.hideModal('createServerModal');
                this.loadServers();
                this.showNotification('Server created successfully!', 'success');
            } else {
                throw new Error('Failed to create server');
            }
        } catch (error) {
            this.showNotification('Error creating server: ' + error.message, 'error');
        }
    }

    async loadServers() {
        try {
            const response = await fetch('/api/servers');
            this.servers = await response.json();
            this.renderServers();
        } catch (error) {
            console.error('Error loading servers:', error);
        }
    }

    renderServers() {
        const container = document.getElementById('serversContainer');
        container.innerHTML = '';
        
        this.servers.forEach(server => {
            const serverCard = this.createServerCard(server);
            container.appendChild(serverCard);
        });
        
        document.getElementById('activeServers').textContent = this.servers.filter(s => s.online).length;
    }

    createServerCard(server) {
        const card = document.createElement('div');
        card.className = 'server-card';
        card.innerHTML = `
            <div class="server-header">
                <div class="server-info">
                    <h4>${server.name}</h4>
                    <span class="server-version">${server.version}</span>
                </div>
                <div class="server-status ${server.online ? 'online' : 'offline'}"></div>
            </div>
            <div class="server-details">
                <div class="resource-meter">
                    <div class="resource-fill" style="width: ${server.cpu}%"></div>
                </div>
                <div class="server-stats">
                    <span>👥 ${server.players}/${server.maxPlayers}</span>
                    <span>⚡ ${server.tps} TPS</span>
                </div>
            </div>
            <div class="server-actions">
                <button class="btn-small" onclick="serverSphere.startServer('${server.id}')">▶️</button>
                <button class="btn-small" onclick="serverSphere.stopServer('${server.id}')">⏹️</button>
                <button class="btn-small" onclick="serverSphere.restartServer('${server.id}')">🔄</button>
                <button class="btn-small" onclick="serverSphere.openConsole('${server.id}')">💬</button>
            </div>
        `;
        return card;
    }

    async startServer(serverId) {
        try {
            await fetch(`/api/servers/${serverId}/start`, { method: 'POST' });
            this.showNotification('Server starting...', 'info');
            setTimeout(() => this.loadServers(), 5000);
        } catch (error) {
            this.showNotification('Error starting server', 'error');
        }
    }

    async stopServer(serverId) {
        try {
            await fetch(`/api/servers/${serverId}/stop`, { method: 'POST' });
            this.showNotification('Server stopping...', 'info');
            setTimeout(() => this.loadServers(), 3000);
        } catch (error) {
            this.showNotification('Error stopping server', 'error');
        }
    }

    async restartServer(serverId) {
        try {
            await fetch(`/api/servers/${serverId}/restart`, { method: 'POST' });
            this.showNotification('Server restarting...', 'info');
            setTimeout(() => this.loadServers(), 8000);
        } catch (error) {
            this.showNotification('Error restarting server', 'error');
        }
    }

    openConsole(serverId) {
        document.getElementById('consoleSection').style.display = 'block';
        this.currentConsoleServer = serverId;
    }

    sendCommand() {
        const input = document.getElementById('consoleInput');
        const command = input.value.trim();
        
        if (command && this.currentConsoleServer) {
            this.socket.emit('console_command', {
                serverId: this.currentConsoleServer,
                command: command
            });
            
            this.addConsoleOutput(`> ${command}`, 'command');
            input.value = '';
        }
    }

    addConsoleOutput(text, type = 'output') {
        const console = document.getElementById('consoleOutput');
        const line = document.createElement('div');
        line.className = `console-${type}`;
        line.textContent = text;
        console.appendChild(line);
        console.scrollTop = console.scrollHeight;
    }

    clearConsole() {
        document.getElementById('consoleOutput').innerHTML = '';
    }

    setupSocket() {
        this.socket.on('console_output', (data) => {
            this.addConsoleOutput(data.output);
        });

        this.socket.on('server_status_update', (status) => {
            this.updateServerStatus(status);
        });

        this.socket.on('notification', (data) => {
            this.showNotification(data.message, data.type);
        });
    }

    updateServerStatus(status) {
        const server = this.servers.find(s => s.id === status.serverId);
        if (server) {
            Object.assign(server, status);
            this.renderServers();
        }
    }

    async refreshAll() {
        await this.loadServers();
        this.showNotification('All servers refreshed', 'success');
    }

    async updateStats() {
        try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            
            document.getElementById('onlinePlayers').textContent = stats.totalPlayers;
            document.getElementById('storageUsed').textContent = `${stats.storageUsed} GB`;
            document.getElementById('systemLoad').textContent = `${stats.cpuLoad}%`;
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'}</span>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s forwards';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    changeLanguage(lang) {
        this.currentLanguage = lang;
        document.documentElement.lang = lang;
        this.loadLanguage();
    }

    async loadLanguage() {
        const translations = {
            de: {
                dashboard: 'Dashboard',
                servers: 'Server',
                files: 'Dateien',
                backups: 'Backups',
                plugins: 'Plugins',
                settings: 'Einstellungen',
                createServer: 'Server erstellen',
                refreshAll: 'Alle aktualisieren',
                activeServers: 'Aktive Server',
                onlinePlayers: 'Spieler online',
                storageUsed: 'Speicher verwendet',
                systemLoad: 'Systemauslastung'
            },
            en: {
                dashboard: 'Dashboard',
                servers: 'Servers',
                files: 'Files',
                backups: 'Backups',
                plugins: 'Plugins',
                settings: 'Settings',
                createServer: 'Create Server',
                refreshAll: 'Refresh All',
                activeServers: 'Active Servers',
                onlinePlayers: 'Online Players',
                storageUsed: 'Storage Used',
                systemLoad: 'System Load'
            }
        };

        const langData = translations[this.currentLanguage];
        Object.keys(langData).forEach(key => {
            const elements = document.querySelectorAll(`[data-i18n="${key}"]`);
            elements.forEach(el => {
                el.textContent = langData[key];
            });
        });
    }
}

const serverSphere = new ServerSphere();

setInterval(() => serverSphere.updateStats(), 30000);
setInterval(() => serverSphere.loadServers(), 10000);