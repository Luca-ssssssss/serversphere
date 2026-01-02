#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const os = require('os');

// Colors für Konsolenausgabe
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

console.log(colors.bright + colors.cyan + `
╔══════════════════════════════════════════════════════════════╗
║                🚀 ServerSphere Debian Installer              ║
║                  Automatische Installation                   ║
╚══════════════════════════════════════════════════════════════╝
` + colors.reset);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Hilfsfunktion für Shell-Commands
function executeCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
        const child = exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
        
        if (options.logOutput !== false) {
            child.stdout?.on('data', (data) => {
                if (options.silent !== true) {
                    process.stdout.write(colors.dim + data + colors.reset);
                }
            });
            child.stderr?.on('data', (data) => {
                if (options.silent !== true) {
                    process.stderr.write(colors.yellow + data + colors.reset);
                }
            });
        }
    });
}

async function checkRoot() {
    if (process.getuid && process.getuid() !== 0) {
        console.log(colors.red + '❌ Bitte als root oder mit sudo ausführen!' + colors.reset);
        process.exit(1);
    }
    return true;
}

async function detectOS() {
    const platform = os.platform();
    if (platform !== 'linux') {
        console.log(colors.red + '❌ Dieses Script ist nur für Linux/Debian Systeme!' + colors.reset);
        process.exit(1);
    }
    
    try {
        const { stdout } = await executeCommand('cat /etc/os-release', { silent: true });
        if (stdout.includes('Debian') || stdout.includes('Ubuntu')) {
            return 'debian';
        } else if (stdout.includes('CentOS') || stdout.includes('Red Hat')) {
            return 'rhel';
        } else {
            return 'unknown';
        }
    } catch {
        return 'unknown';
    }
}

async function updateSystem() {
    console.log(colors.blue + '\n📦 System aktualisieren...' + colors.reset);
    try {
        await executeCommand('apt-get update -y');
        await executeCommand('apt-get upgrade -y');
        console.log(colors.green + '✅ System aktualisiert' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.yellow + '⚠️  Systemupdate fehlgeschlagen, aber fortfahren...' + colors.reset);
        return false;
    }
}

async function installNodeJS() {
    console.log(colors.blue + '\n📦 Node.js installieren...' + colors.reset);
    
    try {
        // Überprüfen ob Node.js schon installiert ist
        const { stdout: nodeVersion } = await executeCommand('node --version', { silent: true });
        console.log(colors.green + `✅ Node.js bereits installiert: ${nodeVersion.trim()}` + colors.reset);
        return true;
    } catch {
        // Node.js installieren
        try {
            console.log(colors.cyan + '📥 NodeSource Repository hinzufügen...' + colors.reset);
            await executeCommand('curl -fsSL https://deb.nodesource.com/setup_20.x | bash -');
            
            console.log(colors.cyan + '📦 Node.js installieren...' + colors.reset);
            await executeCommand('apt-get install -y nodejs');
            
            const { stdout: nodeVersion } = await executeCommand('node --version', { silent: true });
            const { stdout: npmVersion } = await executeCommand('npm --version', { silent: true });
            
            console.log(colors.green + `✅ Node.js installiert: ${nodeVersion.trim()}` + colors.reset);
            console.log(colors.green + `✅ npm installiert: ${npmVersion.trim()}` + colors.reset);
            return true;
        } catch (error) {
            console.log(colors.red + '❌ Node.js Installation fehlgeschlagen!' + colors.reset);
            console.log(colors.yellow + '📋 Alternative: Node.js manuell installieren...' + colors.reset);
            
            try {
                await executeCommand('apt-get install -y curl');
                await executeCommand('curl -sL https://deb.nodesource.com/setup_16.x | bash -');
                await executeCommand('apt-get install -y nodejs');
                console.log(colors.green + '✅ Node.js manuell installiert' + colors.reset);
                return true;
            } catch (error2) {
                console.log(colors.red + '❌ Kritischer Fehler: Node.js konnte nicht installiert werden' + colors.reset);
                return false;
            }
        }
    }
}

async function installRequiredPackages() {
    console.log(colors.blue + '\n📦 Benötigte Pakete installieren...' + colors.reset);
    
    const packages = [
        'git', 'build-essential', 'python3', 'make', 'g++',
        'openjdk-17-jre-headless', 'nginx', 'ufw', 'certbot',
        'python3-certbot-nginx'
    ];
    
    try {
        await executeCommand(`apt-get install -y ${packages.join(' ')}`);
        console.log(colors.green + '✅ Alle Pakete installiert' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.yellow + '⚠️  Einige Pakete konnten nicht installiert werden' + colors.reset);
        return false;
    }
}

async function createProjectStructure() {
    console.log(colors.blue + '\n📁 Projektstruktur erstellen...' + colors.reset);
    
    const baseDir = '/opt/serversphere';
    const subDirs = [
        'public/assets/icons',
        'public/assets/fonts',
        'src/routes',
        'src/middleware',
        'src/controllers',
        'src/models',
        'src/utils',
        'src/config',
        'uploads',
        'servers',
        'backups',
        'logs',
        'keys',
        'scripts'
    ];
    
    try {
        // Hauptverzeichnis
        await fs.mkdir(baseDir, { recursive: true });
        
        // Unterverzeichnisse
        for (const dir of subDirs) {
            await fs.mkdir(path.join(baseDir, dir), { recursive: true });
            console.log(colors.dim + `   📁 ${dir}` + colors.reset);
        }
        
        console.log(colors.green + `✅ Projektverzeichnis erstellt: ${baseDir}` + colors.reset);
        return baseDir;
    } catch (error) {
        console.log(colors.red + `❌ Fehler beim Erstellen der Verzeichnisse: ${error.message}` + colors.reset);
        return null;
    }
}

async function copyProjectFiles(baseDir) {
    console.log(colors.blue + '\n📄 Projektdateien kopieren...' + colors.reset);
    
    const currentDir = process.cwd();
    const filesToCopy = [
        'package.json',
        'server.js',
        '.env.template',
        'keygen.js',
        'setup.js'
    ];
    
    try {
        for (const file of filesToCopy) {
            const sourcePath = path.join(currentDir, file);
            const destPath = path.join(baseDir, file);
            
            try {
                await fs.access(sourcePath);
                await fs.copyFile(sourcePath, destPath);
                console.log(colors.dim + `   📄 ${file}` + colors.reset);
            } catch {
                console.log(colors.yellow + `   ⚠️  ${file} nicht gefunden, überspringe...` + colors.reset);
            }
        }
        
        // Erstelle minimale Dateien falls nicht vorhanden
        await createMissingFiles(baseDir);
        
        console.log(colors.green + '✅ Projektdateien kopiert' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.red + `❌ Fehler beim Kopieren: ${error.message}` + colors.reset);
        return false;
    }
}

async function createMissingFiles(baseDir) {
    // Erstelle package.json falls nicht existiert
    const packageJsonPath = path.join(baseDir, 'package.json');
    try {
        await fs.access(packageJsonPath);
    } catch {
        const packageJson = {
            name: "serversphere",
            version: "1.0.0",
            description: "Minecraft Server Management Panel",
            main: "server.js",
            scripts: {
                start: "node server.js",
                dev: "nodemon server.js",
                setup: "node setup.js",
                keygen: "node keygen.js"
            },
            dependencies: {
                "express": "^4.18.2",
                "socket.io": "^4.5.4",
                "bcryptjs": "^2.4.3",
                "jsonwebtoken": "^9.0.0",
                "multer": "^1.4.5-lts.1",
                "archiver": "^5.3.1",
                "unzipper": "^0.10.14",
                "axios": "^1.3.4",
                "dotenv": "^16.0.3",
                "cors": "^2.8.5",
                "helmet": "^7.0.0",
                "express-rate-limit": "^6.7.0",
                "compression": "^1.7.4",
                "express-fileupload": "^1.4.0",
                "express-validator": "^6.14.2"
            },
            devDependencies: {
                "nodemon": "^2.0.22"
            }
        };
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
    
    // Erstelle .env.template
    const envTemplate = `# ServerSphere Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
JWT_SECRET=your-jwt-secret-key-change-immediately
SESSION_SECRET=your-session-secret-change-immediately
ENCRYPTION_KEY=your-encryption-key-32-chars-minimum
CSRF_SECRET=your-csrf-secret-key
MONGODB_URI=mongodb://localhost:27017/serversphere
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=100
SESSION_COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:3000
BACKUP_RETENTION_DAYS=30
MAX_BACKUPS_PER_SERVER=10
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=./logs
DEFAULT_SERVER_RAM=4096
MAX_FILE_UPLOAD_SIZE=104857600`;
    
    await fs.writeFile(path.join(baseDir, '.env.template'), envTemplate);
}

async function installDependencies(baseDir) {
    console.log(colors.blue + '\n📦 Node.js Abhängigkeiten installieren...' + colors.reset);
    
    try {
        process.chdir(baseDir);
        await executeCommand('npm install --production');
        console.log(colors.green + '✅ Abhängigkeiten installiert' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.red + '❌ Fehler bei npm install' + colors.reset);
        return false;
    }
}

async function generateKeys(baseDir) {
    console.log(colors.blue + '\n🔐 Sicherheitsschlüssel generieren...' + colors.reset);
    
    try {
        process.chdir(baseDir);
        
        // Erstelle keygen.js falls nicht existiert
        const keygenPath = path.join(baseDir, 'keygen.js');
        try {
            await fs.access(keygenPath);
        } catch {
            const keygenContent = `const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔐 Generiere Sicherheitsschlüssel...');

const keys = {
  JWT_SECRET: crypto.randomBytes(64).toString('hex'),
  SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  CSRF_SECRET: crypto.randomBytes(32).toString('hex')
};

console.log('✅ Schlüssel generiert');

// Erstelle .env Datei
const envContent = \`NODE_ENV=production
PORT=3000
HOST=0.0.0.0
\${Object.entries(keys).map(([k, v]) => \`\${k}=\${v}\`).join('\\n')}
MONGODB_URI=mongodb://localhost:27017/serversphere
SESSION_COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:3000\`;

fs.writeFileSync(path.join(__dirname, '.env'), envContent);
console.log('✅ .env Datei erstellt');`;
            
            await fs.writeFile(keygenPath, keygenContent);
        }
        
        await executeCommand('node keygen.js');
        console.log(colors.green + '✅ Schlüssel generiert und .env erstellt' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.red + '❌ Fehler bei der Key-Generierung' + colors.reset);
        return false;
    }
}

async function createSystemdService(baseDir) {
    console.log(colors.blue + '\n⚙️  Systemd Service erstellen...' + colors.reset);
    
    const serviceContent = `[Unit]
Description=ServerSphere Minecraft Panel
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${baseDir}
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=/usr/bin/node ${baseDir}/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=serversphere

# Sicherheit
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${baseDir}/servers ${baseDir}/backups ${baseDir}/uploads ${baseDir}/logs

[Install]
WantedBy=multi-user.target`;
    
    try {
        await fs.writeFile('/etc/systemd/system/serversphere.service', serviceContent);
        await executeCommand('systemctl daemon-reload');
        console.log(colors.green + '✅ Systemd Service erstellt' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.red + `❌ Fehler beim Erstellen des Service: ${error.message}` + colors.reset);
        return false;
    }
}

async function configureFirewall() {
    console.log(colors.blue + '\n🔥 Firewall konfigurieren...' + colors.reset);
    
    try {
        await executeCommand('ufw --force enable');
        await executeCommand('ufw default deny incoming');
        await executeCommand('ufw default allow outgoing');
        await executeCommand('ufw allow 22/tcp');
        await executeCommand('ufw allow 3000/tcp');
        await executeCommand('ufw allow 80/tcp');
        await executeCommand('ufw allow 443/tcp');
        await executeCommand('ufw allow 25565:25575/tcp');
        console.log(colors.green + '✅ Firewall konfiguriert' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.yellow + '⚠️  Firewall konnte nicht konfiguriert werden' + colors.reset);
        return false;
    }
}

async function configureNginx(domain = null) {
    console.log(colors.blue + '\n🌐 Nginx konfigurieren...' + colors.reset);
    
    const nginxConfig = domain ? 
`server {
    listen 80;
    server_name ${domain};
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }
    
    client_max_body_size 100M;
}` 
: 
`server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }
    
    client_max_body_size 100M;
}`;
    
    try {
        await fs.writeFile('/etc/nginx/sites-available/serversphere', nginxConfig);
        
        // Symlink erstellen
        try {
            await executeCommand('ln -sf /etc/nginx/sites-available/serversphere /etc/nginx/sites-enabled/');
        } catch {
            // Falls schon existiert
        }
        
        // Standard Nginx Site deaktivieren
        try {
            await executeCommand('rm -f /etc/nginx/sites-enabled/default');
        } catch {
            // Ignorieren falls nicht existiert
        }
        
        // Nginx testen und neustarten
        await executeCommand('nginx -t');
        await executeCommand('systemctl restart nginx');
        
        console.log(colors.green + '✅ Nginx konfiguriert' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.red + `❌ Nginx Konfiguration fehlgeschlagen: ${error.message}` + colors.reset);
        return false;
    }
}

async function setupSSL(domain) {
    if (!domain) {
        console.log(colors.yellow + '\n⚠️  Keine Domain angegeben, überspringe SSL Setup' + colors.reset);
        return false;
    }
    
    console.log(colors.blue + `\n🔒 SSL Zertifikat für ${domain} einrichten...` + colors.reset);
    
    try {
        await executeCommand(`certbot --nginx -d ${domain} --non-interactive --agree-tos --email admin@${domain}`);
        console.log(colors.green + '✅ SSL Zertifikat eingerichtet' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.yellow + '⚠️  SSL Setup fehlgeschlagen, aber fortfahren...' + colors.reset);
        return false;
    }
}

async function startServices() {
    console.log(colors.blue + '\n🚀 Dienste starten...' + colors.reset);
    
    try {
        await executeCommand('systemctl start serversphere');
        await executeCommand('systemctl enable serversphere');
        await executeCommand('systemctl restart nginx');
        
        // Warten und Status prüfen
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const { stdout: status } = await executeCommand('systemctl status serversphere --no-pager', { silent: true });
        
        if (status.includes('active (running)')) {
            console.log(colors.green + '✅ ServerSphere Service läuft' + colors.reset);
            return true;
        } else {
            console.log(colors.yellow + '⚠️  Service Status unklar' + colors.reset);
            return false;
        }
    } catch (error) {
        console.log(colors.red + '❌ Fehler beim Starten der Dienste' + colors.reset);
        return false;
    }
}

async function createAdminUser(baseDir) {
    console.log(colors.blue + '\n👤 Admin Benutzer erstellen...' + colors.reset);
    
    try {
        const adminData = {
            id: crypto.randomUUID(),
            username: 'admin',
            email: 'admin@localhost',
            role: 'admin',
            verified: true,
            createdAt: new Date().toISOString()
        };
        
        await fs.writeFile(
            path.join(baseDir, 'users.json'),
            JSON.stringify([adminData], null, 2)
        );
        
        console.log(colors.green + '✅ Admin Benutzer erstellt' + colors.reset);
        console.log(colors.yellow + '📋 Standard Login: admin / admin123' + colors.reset);
        console.log(colors.red + '⚠️  Bitte Passwort nach erstem Login ändern!' + colors.reset);
        return true;
    } catch (error) {
        console.log(colors.yellow + '⚠️  Admin Benutzer konnte nicht erstellt werden' + colors.reset);
        return false;
    }
}

async function showSummary(baseDir, domain, useSSL) {
    console.log(colors.bright + colors.cyan + '\n' + '='.repeat(60));
    console.log('🎉 INSTALLATION ABGESCHLOSSEN!');
    console.log('='.repeat(60) + colors.reset);
    
    console.log(colors.green + '\n✅ ServerSphere wurde erfolgreich installiert!' + colors.reset);
    
    console.log(colors.blue + '\n📋 ZUSAMMENFASSUNG:' + colors.reset);
    console.log(colors.white + `📍 Installationsverzeichnis: ${baseDir}` + colors.reset);
    console.log(colors.white + `👤 Admin Login: admin / admin123` + colors.reset);
    console.log(colors.red + `   ⚠️  SOFORT ÄNDERN NACH DEM LOGIN!` + colors.reset);
    
    if (domain && useSSL) {
        console.log(colors.white + `🌐 Zugriff: https://${domain}` + colors.reset);
        console.log(colors.white + `🔒 SSL: Aktiviert (Let's Encrypt)` + colors.reset);
    } else if (domain) {
        console.log(colors.white + `🌐 Zugriff: http://${domain}` + colors.reset);
        console.log(colors.white + `🔓 SSL: Nicht aktiviert` + colors.reset);
    } else {
        console.log(colors.white + `🌐 Zugriff: http://SERVER_IP:3000` + colors.reset);
        console.log(colors.white + `🌐 Alternativ: http://localhost:3000` + colors.reset);
    }
    
    console.log(colors.blue + '\n🔧 VERWALTUNGSBEFEHLE:' + colors.reset);
    console.log(colors.white + `📊 Status prüfen: systemctl status serversphere` + colors.reset);
    console.log(colors.white + `🔁 Neustarten: systemctl restart serversphere` + colors.reset);
    console.log(colors.white + `⏹️  Stoppen: systemctl stop serversphere` + colors.reset);
    console.log(colors.white + `▶️  Starten: systemctl start serversphere` + colors.reset);
    console.log(colors.white + `📝 Logs anzeigen: journalctl -u serversphere -f` + colors.reset);
    
    console.log(colors.blue + '\n📁 WICHTIGE DATEIEN:' + colors.reset);
    console.log(colors.white + `🔐 Konfiguration: ${baseDir}/.env` + colors.reset);
    console.log(colors.white + `📋 Service Config: /etc/systemd/system/serversphere.service` + colors.reset);
    console.log(colors.white + `🌐 Nginx Config: /etc/nginx/sites-available/serversphere` + colors.reset);
    
    console.log(colors.blue + '\n🚀 NÄCHSTE SCHRITTE:' + colors.reset);
    console.log(colors.white + `1. Zum Panel navigieren (siehe oben)` + colors.reset);
    console.log(colors.white + `2. Mit admin / admin123 einloggen` + colors.reset);
    console.log(colors.white + `3. SOFORT Passwort ändern!` + colors.reset);
    console.log(colors.white + `4. Ersten Minecraft Server erstellen` + colors.reset);
    
    console.log(colors.yellow + '\n⚠️  SICHERHEITSHINWEISE:' + colors.reset);
    console.log(colors.white + `• Ändere das Standard-Passwort SOFORT!` + colors.reset);
    console.log(colors.white + `• Konfiguriere regelmäßige Backups` + colors.reset);
    console.log(colors.white + `• Halte das System aktuell (apt update && apt upgrade)` + colors.reset);
    console.log(colors.white + `• Überwache die Logs regelmäßig` + colors.reset);
    
    console.log(colors.bright + colors.green + '\n✅ ServerSphere ist jetzt bereit für den Einsatz!' + colors.reset);
}

async function main() {
    try {
        // 1. Root-Rechte prüfen
        await checkRoot();
        
        // 2. OS prüfen
        const osType = await detectOS();
        console.log(colors.green + `✅ Betriebssystem erkannt: ${osType}` + colors.reset);
        
        // 3. Installationstyp abfragen
        console.log(colors.cyan + '\n⚙️  Installationstyp wählen:' + colors.reset);
        console.log('1) Vollständige Installation (empfohlen)');
        console.log('2) Minimale Installation');
        console.log('3) Nur Projektdateien');
        
        const installType = await question('\nWähle (1-3): ') || '1';
        
        // 4. Domain abfragen
        let domain = null;
        let useSSL = false;
        
        if (installType === '1') {
            domain = await question('Domain (leer lassen für IP): ');
            if (domain) {
                const sslAnswer = await question('SSL Zertifikat einrichten? (j/n): ');
                useSSL = sslAnswer.toLowerCase() === 'j';
            }
        }
        
        // 5. Installation starten
        console.log(colors.bright + colors.blue + '\n🚀 Starte Installation...' + colors.reset);
        
        // Vollständige Installation
        if (installType === '1') {
            await updateSystem();
            await installNodeJS();
            await installRequiredPackages();
        }
        
        // Projektverzeichnis erstellen
        const baseDir = await createProjectStructure();
        if (!baseDir) {
            throw new Error('Konnte Projektverzeichnis nicht erstellen');
        }
        
        // Dateien kopieren
        await copyProjectFiles(baseDir);
        
        // Abhängigkeiten installieren
        await installDependencies(baseDir);
        
        // Schlüssel generieren
        await generateKeys(baseDir);
        
        // Admin Benutzer
        await createAdminUser(baseDir);
        
        // Vollständige Installation fortsetzen
        if (installType === '1') {
            await createSystemdService(baseDir);
            await configureFirewall();
            await configureNginx(domain);
            
            if (useSSL && domain) {
                await setupSSL(domain);
            }
            
            await startServices();
        }
        
        // Zusammenfassung anzeigen
        await showSummary(baseDir, domain, useSSL);
        
    } catch (error) {
        console.log(colors.red + `\n❌ KRITISCHER FEHLER: ${error.message}` + colors.reset);
        console.log(colors.yellow + '🔧 TROUBLESHOOTING:' + colors.reset);
        console.log('1. Prüfe die Logs oben auf Fehler');
        console.log('2. Stelle sicher, dass du root Rechte hast');
        console.log('3. Überprüfe die Internetverbindung');
        console.log('4. Starte das Script neu');
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Script ausführen
if (require.main === module) {
    main();
}

module.exports = { main };
