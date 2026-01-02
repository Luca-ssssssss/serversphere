#!/bin/bash

# ============================================
# ServerSphere Auto-Installer - One-Click Install
# GitHub: https://github.com/Luca-ssssssss/serversphere
# ============================================

# Default Werte
DEFAULT_PORT=$((3000 + RANDOM % 1000))
DEFAULT_LANG="de"
DOMAIN=""
SSL=false
INSTALL_DIR="/opt/serversphere"
GITHUB_REPO="https://github.com/Luca-ssssssss/serversphere"

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ========== SPRACH-DATEIEN ==========

load_language() {
    local lang=$1
    
    if [ "$lang" = "en" ]; then
        # ENGLISH TEXTS
        MSG_TITLE="🚀 ServerSphere Auto-Installer"
        MSG_WELCOME="Welcome to ServerSphere Auto-Installer!"
        MSG_DOMAIN_PROMPT="Enter your domain (or leave empty for IP access): "
        MSG_PORT_PROMPT="Enter port (default $DEFAULT_PORT): "
        MSG_SSL_PROMPT="Enable SSL? [y/n]: "
        MSG_INSTALL_OPTIONS="Select installation type:"
        MSG_OPTION1="1) Full installation (recommended)"
        MSG_OPTION2="2) ServerSphere only (without Nginx/Firewall)"
        MSG_OPTION3="3) Custom installation"
        MSG_CHOICE="Enter your choice [1-3]: "
        MSG_STARTING="🚀 Starting installation..."
        MSG_CLEANING="🧹 Cleaning up previous installation..."
        MSG_DOWNLOADING="⬇️  Downloading ServerSphere from GitHub..."
        MSG_INSTALLING="🔧 Installing dependencies..."
        MSG_CONFIGURING="⚙️  Configuring ServerSphere..."
        MSG_SETUP_NGINX="🌐 Setting up Nginx reverse proxy..."
        MSG_SETUP_FIREWALL="🔥 Configuring firewall..."
        MSG_SETUP_SSL="🔐 Setting up SSL certificate..."
        MSG_STARTING_SERVICES="▶️  Starting services..."
        MSG_COMPLETE="✅ Installation complete!"
        MSG_ACCESS="🌐 Access your panel at:"
        MSG_LOGIN="🔐 Admin login: admin / admin123"
        MSG_WARNING="⚠️  CHANGE PASSWORD IMMEDIATELY AFTER LOGIN!"
        MSG_ERROR_ROOT="❌ Please run as root: sudo bash install-serversphere.sh"
        MSG_ERROR_DOWNLOAD="❌ Failed to download from GitHub"
        MSG_ERROR_NODE="❌ Node.js installation failed"
        MSG_SUCCESS="✅"
        MSG_FAIL="❌"
        YES="y"
        NO="n"
    else
        # DEUTSCHE TEXTE
        MSG_TITLE="🚀 ServerSphere Auto-Installer"
        MSG_WELCOME="Willkommen zum ServerSphere Auto-Installer!"
        MSG_DOMAIN_PROMPT="Gib deine Domain ein (oder leer für IP-Zugriff): "
        MSG_PORT_PROMPT="Gib Port ein (Standard $DEFAULT_PORT): "
        MSG_SSL_PROMPT="SSL aktivieren? [j/n]: "
        MSG_INSTALL_OPTIONS="Wähle Installationsart:"
        MSG_OPTION1="1) Vollständige Installation (empfohlen)"
        MSG_OPTION2="2) Nur ServerSphere (ohne Nginx/Firewall)"
        MSG_OPTION3="3) Benutzerdefinierte Installation"
        MSG_CHOICE="Gib deine Wahl ein [1-3]: "
        MSG_STARTING="🚀 Starte Installation..."
        MSG_CLEANING="🧹 Lösche vorherige Installation..."
        MSG_DOWNLOADING="⬇️  Lade ServerSphere von GitHub herunter..."
        MSG_INSTALLING="🔧 Installiere Abhängigkeiten..."
        MSG_CONFIGURING="⚙️  Konfiguriere ServerSphere..."
        MSG_SETUP_NGINX="🌐 Richte Nginx Reverse Proxy ein..."
        MSG_SETUP_FIREWALL="🔥 Konfiguriere Firewall..."
        MSG_SETUP_SSL="🔐 Richte SSL Zertifikat ein..."
        MSG_STARTING_SERVICES="▶️  Starte Dienste..."
        MSG_COMPLETE="✅ Installation abgeschlossen!"
        MSG_ACCESS="🌐 Zugriff auf das Panel:"
        MSG_LOGIN="🔐 Admin Login: admin / admin123"
        MSG_WARNING="⚠️  PASSWORT SOFORT NACH DEM LOGIN ÄNDERN!"
        MSG_ERROR_ROOT="❌ Bitte als root ausführen: sudo bash install-serversphere.sh"
        MSG_ERROR_DOWNLOAD="❌ Download von GitHub fehlgeschlagen"
        MSG_ERROR_NODE="❌ Node.js Installation fehlgeschlagen"
        MSG_SUCCESS="✅"
        MSG_FAIL="❌"
        YES="j"
        NO="n"
    fi
}

# ========== HILFSFUNKTIONEN ==========

print_header() {
    clear
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                $MSG_TITLE                ║"
    echo "║          GitHub: https://github.com/Luca-ssssssss/serversphere ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${BLUE}📦 $1${NC}"
}

print_success() {
    echo -e "${GREEN}$MSG_SUCCESS $1${NC}"
}

print_error() {
    echo -e "${RED}$MSG_FAIL $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

ask_yes_no() {
    local prompt="$1"
    local default="${2:-$NO}"
    
    while true; do
        read -p "$prompt " yn
        case $yn in
            [$YES]*) return 0 ;;
            [$NO]*) return 1 ;;
            "") [ "$default" = "$YES" ] && return 0 || return 1 ;;
            *) echo "Bitte $YES oder $NO eingeben / Please enter $YES or $NO" ;;
        esac
    done
}

# ========== INSTALLATIONS-FUNKTIONEN ==========

check_root() {
    if [ "$EUID" -ne 0 ]; then 
        print_error "$MSG_ERROR_ROOT"
        exit 1
    fi
}

clean_previous() {
    print_step "$MSG_CLEANING"
    
    # Stoppe alle Dienste
    systemctl stop serversphere 2>/dev/null
    pkill -f "node.*server.js" 2>/dev/null
    pkill -f "serversphere" 2>/dev/null
    
    # Lösche alte Installation
    rm -rf "$INSTALL_DIR"
    rm -f /etc/systemd/system/serversphere.service
    rm -f /etc/nginx/sites-available/serversphere
    rm -f /etc/nginx/sites-enabled/serversphere
    
    # Systemd neu laden
    systemctl daemon-reload 2>/dev/null
    
    print_success "Cleanup completed"
}

install_dependencies() {
    print_step "$MSG_INSTALLING"
    
    # System aktualisieren
    apt-get update -y
    apt-get upgrade -y
    
    # Node.js installieren
    if ! command -v node &> /dev/null; then
        print_info "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        if [ $? -ne 0 ]; then
            print_error "$MSG_ERROR_NODE"
            exit 1
        fi
    fi
    
    # NPM aktualisieren
    npm install -g npm@latest
    
    # Abhängigkeiten installieren (basierend auf Installationsart)
    if [ "$INSTALL_TYPE" -eq 1 ]; then
        apt-get install -y git curl wget unzip nginx ufw certbot python3-certbot-nginx
    elif [ "$INSTALL_TYPE" -eq 2 ]; then
        apt-get install -y git curl wget unzip
    fi
    
    # Allgemeine Abhängigkeiten
    apt-get install -y build-essential python3 make g++ openjdk-17-jre-headless
    
    print_success "Dependencies installed"
}

download_serversphere() {
    print_step "$MSG_DOWNLOADING"
    
    # Erstelle Installationsverzeichnis
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR" || exit 1
    
    # Wichtige Dateien von GitHub herunterladen
    print_info "Downloading essential files..."
    
    ESSENTIAL_FILES=(
        "package.json"
        "server.js"
        "setup.js"
        "keygen.js"
        ".env.template"
        "public/"
        "src/"
    )
    
    for file in "${ESSENTIAL_FILES[@]}"; do
        if [[ "$file" == */ ]]; then
            # Verzeichnis
            dir_name="${file%/}"
            mkdir -p "$dir_name"
            wget -q -r -np -nH --cut-dirs=2 -R "index.html*" \
                "https://github.com/Luca-ssssssss/serversphere/tree/main/$dir_name/" \
                -P "$dir_name/" 2>/dev/null || true
        else
            # Einzelne Datei
            wget -q "https://raw.githubusercontent.com/Luca-ssssssss/serversphere/main/$file" -O "$file"
        fi
    done
    
    # Prüfe ob package.json heruntergeladen wurde
    if [ ! -f "package.json" ]; then
        print_error "$MSG_ERROR_DOWNLOAD"
        exit 1
    fi
    
    print_success "ServerSphere downloaded successfully"
}

setup_serversphere() {
    print_step "$MSG_CONFIGURING"
    
    cd "$INSTALL_DIR" || exit 1
    
    # Node.js Abhängigkeiten installieren
    print_info "Installing Node.js dependencies..."
    npm install --production
    
    # Security Keys generieren
    print_info "Generating security keys..."
    if [ -f "keygen.js" ]; then
        node keygen.js
    else
        # Manuelle Key-Generierung als Fallback
        cat > .env << EOF
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
CSRF_SECRET=$(openssl rand -hex 32)
PORT=$PORT
HOST=0.0.0.0
NODE_ENV=production
ALLOW_EXTERNAL_ACCESS=true
EOF
    fi
    
    # .env Datei aktualisieren
    if [ -f ".env" ]; then
        sed -i "s/PORT=.*/PORT=$PORT/" .env
        sed -i 's/HOST=.*/HOST=0.0.0.0/' .env
        sed -i 's/NODE_ENV=.*/NODE_ENV=production/' .env
        if ! grep -q "ALLOW_EXTERNAL_ACCESS" .env; then
            echo "ALLOW_EXTERNAL_ACCESS=true" >> .env
        fi
    fi
    
    # Notwendige Verzeichnisse erstellen
    mkdir -p servers backups uploads logs keys
    
    print_success "ServerSphere configured"
}

setup_systemd() {
    print_step "Setting up systemd service"
    
    cat > /etc/systemd/system/serversphere.service << EOF
[Unit]
Description=ServerSphere Minecraft Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    print_success "Systemd service created"
}

setup_nginx() {
    print_step "$MSG_SETUP_NGINX"
    
    # Nginx Konfiguration erstellen
    NGINX_CONFIG="/etc/nginx/sites-available/serversphere"
    
    if [ -z "$DOMAIN" ]; then
        # IP-basierte Konfiguration
        cat > "$NGINX_CONFIG" << EOF
server {
    listen 80;
    server_name _;
    
    # Externen Zugriff erlauben
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS, PUT, DELETE';
    
    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    
    client_max_body_size 100M;
}
EOF
    else
        # Domain-basierte Konfiguration
        cat > "$NGINX_CONFIG" << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    
    client_max_body_size 100M;
}
EOF
    fi
    
    # Standard-Site deaktivieren und unsere aktivieren
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null
    ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/
    
    # Nginx testen und starten
    nginx -t && systemctl restart nginx
    
    print_success "Nginx configured"
}

setup_firewall() {
    print_step "$MSG_SETUP_FIREWALL"
    
    # UFW aktivieren falls nicht aktiv
    if ! ufw status | grep -q "Status: active"; then
        ufw --force enable
    fi
    
    # Standard-Regeln
    ufw default deny incoming
    ufw default allow outgoing
    
    # Ports öffnen
    ufw allow 22/tcp comment 'SSH'
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw allow $PORT/tcp comment "ServerSphere Panel"
    ufw allow 25565:25575/tcp comment 'Minecraft Ports'
    
    # Firewall neu laden
    ufw reload
    
    print_success "Firewall configured"
}

setup_ssl() {
    if [ "$SSL" = true ] && [ -n "$DOMAIN" ]; then
        print_step "$MSG_SETUP_SSL"
        
        # Temporäre Email für Let's Encrypt
        EMAIL="admin@$DOMAIN"
        
        # SSL Zertifikat anfordern
        if certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
                   --non-interactive --agree-tos --email "$EMAIL" \
                   --redirect; then
            print_success "SSL certificate installed"
        else
            print_error "SSL setup failed - continuing without SSL"
        fi
    fi
}

start_services() {
    print_step "$MSG_STARTING_SERVICES"
    
    # ServerSphere starten
    systemctl start serversphere
    systemctl enable serversphere
    
    # Auf Start warten
    sleep 5
    
    # Status prüfen
    if systemctl is-active --quiet serversphere; then
        print_success "ServerSphere service is running"
    else
        print_error "Service failed to start - checking logs..."
        journalctl -u serversphere --no-pager -n 10
    fi
}

show_summary() {
    local local_ip=$(hostname -I | awk '{print $1}')
    local external_ip=$(curl -s https://api.ipify.org 2>/dev/null || echo "UNKNOWN")
    
    echo -e "\n${GREEN}================================================"
    echo "$MSG_COMPLETE"
    echo "================================================${NC}\n"
    
    echo -e "${CYAN}$MSG_ACCESS${NC}"
    
    if [ -n "$DOMAIN" ] && [ "$SSL" = true ]; then
        echo -e "   ${GREEN}https://$DOMAIN${NC}"
        echo -e "   🔒 SSL: Enabled (Let's Encrypt)"
    elif [ -n "$DOMAIN" ]; then
        echo -e "   ${BLUE}http://$DOMAIN${NC}"
        echo -e "   🔓 SSL: Not enabled"
    else
        echo -e "   ${CYAN}Local Network:${NC}"
        echo -e "   ${BLUE}http://$local_ip${NC} (Port 80 via Nginx)"
        echo -e "   ${BLUE}http://$local_ip:$PORT${NC} (Direct access)"
        
        if [ "$external_ip" != "UNKNOWN" ]; then
            echo -e "\n   ${CYAN}External Access:${NC}"
            echo -e "   ${GREEN}http://$external_ip${NC} (Port 80 via Nginx)"
            echo -e "   ${GREEN}http://$external_ip:$PORT${NC} (Direct access)"
            echo -e "\n   ${YELLOW}⚠️  For external access, configure in your router:${NC}"
            echo -e "   • Port 80 → $local_ip:80"
            echo -e "   • Port $PORT → $local_ip:$PORT (optional)"
        fi
    fi
    
    echo -e "\n${CYAN}$MSG_LOGIN${NC}"
    echo -e "${RED}$MSG_WARNING${NC}"
    
    echo -e "\n${CYAN}🔧 Management Commands:${NC}"
    echo "   systemctl status serversphere    # Status check"
    echo "   systemctl restart serversphere   # Restart"
    echo "   systemctl stop serversphere      # Stop"
    echo "   journalctl -u serversphere -f    # View logs"
    
    echo -e "\n${CYAN}📁 Important Files:${NC}"
    echo "   Configuration: $INSTALL_DIR/.env"
    echo "   Service file: /etc/systemd/system/serversphere.service"
    echo "   Nginx config: /etc/nginx/sites-available/serversphere"
    
    echo -e "\n${GREEN}✅ ServerSphere is ready to use!${NC}"
}

# ========== HAUPT-FUNKTION ==========

main() {
    # Header anzeigen
    print_header
    
    # Sprache auswählen
    echo -e "${CYAN}Select language / Sprache wählen:${NC}"
    echo "1) English"
    echo "2) Deutsch"
    read -p "Choice [1-2]: " lang_choice
    
    if [ "$lang_choice" = "1" ]; then
        LANGUAGE="en"
    else
        LANGUAGE="de"
    fi
    
    load_language "$LANGUAGE"
    
    print_header
    echo -e "${CYAN}$MSG_WELCOME${NC}\n"
    
    # Prüfe Root-Rechte
    check_root
    
    # Konfiguration abfragen
    read -p "$MSG_DOMAIN_PROMPT" DOMAIN
    
    read -p "$MSG_PORT_PROMPT" input_port
    PORT=${input_port:-$DEFAULT_PORT}
    
    if [ -n "$DOMAIN" ]; then
        if ask_yes_no "$MSG_SSL_PROMPT" "$NO"; then
            SSL=true
        fi
    fi
    
    # Installationsart auswählen
    echo -e "\n${CYAN}$MSG_INSTALL_OPTIONS${NC}"
    echo "$MSG_OPTION1"
    echo "$MSG_OPTION2"
    echo "$MSG_OPTION3"
    read -p "$MSG_CHOICE" INSTALL_TYPE
    
    # Starte Installation
    echo -e "\n${BLUE}$MSG_STARTING${NC}"
    
    # Cleanup
    clean_previous
    
    # Abhängigkeiten installieren
    install_dependencies
    
    # ServerSphere herunterladen
    download_serversphere
    
    # ServerSphere einrichten
    setup_serversphere
    
    # Systemd Service einrichten
    setup_systemd
    
    # Weitere Konfiguration basierend auf Installationsart
    case $INSTALL_TYPE in
        1)
            # Vollständige Installation
            setup_nginx
            setup_firewall
            setup_ssl
            ;;
        2)
            # Nur ServerSphere
            print_info "Skipping Nginx and Firewall setup..."
            ;;
        3)
            # Benutzerdefinierte Installation
            if ask_yes_no "Setup Nginx reverse proxy?" "$YES"; then
                setup_nginx
            fi
            if ask_yes_no "Configure firewall?" "$YES"; then
                setup_firewall
            fi
            if [ -n "$DOMAIN" ] && ask_yes_no "Setup SSL certificate?" "$NO"; then
                SSL=true
                setup_ssl
            fi
            ;;
    esac
    
    # Dienste starten
    start_services
    
    # Zusammenfassung anzeigen
    show_summary
}

# ========== SCRIPT START ==========

# Prüfe ob interaktiver Modus
if [ "$1" = "--non-interactive" ]; then
    # Non-interactive Mode mit Default-Werten
    PORT=$DEFAULT_PORT
    INSTALL_TYPE=1
    load_language "en"
    check_root
    clean_previous
    install_dependencies
    download_serversphere
    setup_serversphere
    setup_systemd
    setup_nginx
    setup_firewall
    start_services
    show_summary
else
    # Normaler interaktiver Modus
    main "$@"
fi

exit 0
