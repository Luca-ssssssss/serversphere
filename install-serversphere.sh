#!/bin/bash

# ============================================
# ServerSphere Auto-Installer - One-Click Install
# GitHub: https://github.com/Luca-ssssssss/serversphere
# ============================================

# Default Werte
DEFAULT_PORT=$((3000 + RANDOM % 1000))
INSTALL_DIR="/opt/serversphere"
GITHUB_REPO="https://github.com/Luca-ssssssss/serversphere"
GITHUB_RAW="https://raw.githubusercontent.com/Luca-ssssssss/serversphere/main"

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ========== SPRACHE ==========

show_language_menu() {
    clear
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                🚀 ServerSphere Auto-Installer                ║"
    echo "║          GitHub: https://github.com/Luca-ssssssss/serversphere ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo "Select language / Sprache wählen:"
    echo "1) 🇺🇸 English"
    echo "2) 🇩🇪 Deutsch"
    echo ""
    
    while true; do
        read -p "Your choice / Ihre Wahl [1-2]: " lang_choice
        case $lang_choice in
            1)
                LANGUAGE="en"
                load_english_texts
                break
                ;;
            2)
                LANGUAGE="de"
                load_german_texts
                break
                ;;
            *)
                echo -e "${RED}Invalid choice / Ungültige Wahl${NC}"
                ;;
        esac
    done
}

load_english_texts() {
    # Messages
    MSG_WELCOME="Welcome to ServerSphere Auto-Installer!"
    MSG_DOMAIN="Enter your domain (or leave empty for IP access): "
    MSG_PORT="Enter port (default $DEFAULT_PORT): "
    MSG_SSL="Enable SSL? [y/n]: "
    MSG_INSTALL_TYPE="Select installation type:"
    MSG_OPTION1="1) Full installation (recommended)"
    MSG_OPTION2="2) ServerSphere only (without Nginx/Firewall)"
    MSG_OPTION3="3) Custom installation"
    MSG_CHOICE="Enter your choice [1-3]: "
    MSG_START="🚀 Starting installation..."
    MSG_CLEANUP="🧹 Cleaning up previous installation..."
    MSG_UPDATE="🔄 Updating system packages..."
    MSG_NODE="📦 Installing Node.js..."
    MSG_DEPS="📦 Installing dependencies..."
    MSG_DOWNLOAD="⬇️  Downloading ServerSphere from GitHub..."
    MSG_CONFIG="⚙️  Configuring ServerSphere..."
    MSG_SERVICE="🔧 Setting up systemd service..."
    MSG_NGINX="🌐 Configuring Nginx reverse proxy..."
    MSG_FIREWALL="🔥 Configuring firewall..."
    MSG_SSL_SETUP="🔐 Setting up SSL certificate..."
    MSG_START_SERVICES="▶️  Starting services..."
    MSG_COMPLETE="✅ Installation complete!"
    MSG_ACCESS="🌐 Access your panel at:"
    MSG_LOGIN="🔐 Admin login: admin / admin123"
    MSG_WARNING="⚠️  CHANGE PASSWORD IMMEDIATELY AFTER LOGIN!"
    MSG_MANAGE="🔧 Management commands:"
    MSG_FILES="📁 Important files:"
    MSG_ERROR_ROOT="❌ Please run as root: sudo bash $0"
    MSG_ERROR_DOWNLOAD="❌ Failed to download from GitHub"
    MSG_ERROR_NODE="❌ Node.js installation failed"
    
    # Yes/No
    YES="y"
    NO="n"
    YES_NO="[y/n]"
}

load_german_texts() {
    # Nachrichten
    MSG_WELCOME="Willkommen zum ServerSphere Auto-Installer!"
    MSG_DOMAIN="Gib deine Domain ein (oder leer für IP-Zugriff): "
    MSG_PORT="Gib Port ein (Standard $DEFAULT_PORT): "
    MSG_SSL="SSL aktivieren? [j/n]: "
    MSG_INSTALL_TYPE="Wähle Installationsart:"
    MSG_OPTION1="1) Vollständige Installation (empfohlen)"
    MSG_OPTION2="2) Nur ServerSphere (ohne Nginx/Firewall)"
    MSG_OPTION3="3) Benutzerdefinierte Installation"
    MSG_CHOICE="Gib deine Wahl ein [1-3]: "
    MSG_START="🚀 Starte Installation..."
    MSG_CLEANUP="🧹 Lösche vorherige Installation..."
    MSG_UPDATE="🔄 Aktualisiere Systempakete..."
    MSG_NODE="📦 Installiere Node.js..."
    MSG_DEPS="📦 Installiere Abhängigkeiten..."
    MSG_DOWNLOAD="⬇️  Lade ServerSphere von GitHub herunter..."
    MSG_CONFIG="⚙️  Konfiguriere ServerSphere..."
    MSG_SERVICE="🔧 Richte Systemd Service ein..."
    MSG_NGINX="🌐 Konfiguriere Nginx Reverse Proxy..."
    MSG_FIREWALL="🔥 Konfiguriere Firewall..."
    MSG_SSL_SETUP="🔐 Richte SSL Zertifikat ein..."
    MSG_START_SERVICES="▶️  Starte Dienste..."
    MSG_COMPLETE="✅ Installation abgeschlossen!"
    MSG_ACCESS="🌐 Zugriff auf das Panel:"
    MSG_LOGIN="🔐 Admin Login: admin / admin123"
    MSG_WARNING="⚠️  PASSWORT SOFORT NACH DEM LOGIN ÄNDERN!"
    MSG_MANAGE="🔧 Verwaltungsbefehle:"
    MSG_FILES="📁 Wichtige Dateien:"
    MSG_ERROR_ROOT="❌ Bitte als root ausführen: sudo bash $0"
    MSG_ERROR_DOWNLOAD="❌ Download von GitHub fehlgeschlagen"
    MSG_ERROR_NODE="❌ Node.js Installation fehlgeschlagen"
    
    # Ja/Nein
    YES="j"
    NO="n"
    YES_NO="[j/n]"
}

# ========== HILFSFUNKTIONEN ==========

print_header() {
    clear
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                🚀 ServerSphere Auto-Installer                ║"
    echo "║          GitHub: https://github.com/Luca-ssssssss/serversphere ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${BLUE}📦 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

ask_yes_no() {
    local prompt="$1"
    
    while true; do
        read -p "$prompt $YES_NO: " yn
        case $yn in
            [$YES]*) return 0 ;;
            [$NO]*) return 1 ;;
            *) echo "Please enter $YES or $NO / Bitte $YES oder $NO eingeben" ;;
        esac
    done
}

check_root() {
    if [ "$EUID" -ne 0 ]; then 
        print_error "$MSG_ERROR_ROOT"
        exit 1
    fi
}

check_required_tools() {
    echo "Checking required tools..."
    
    # Update apt cache
    apt-get update -qq 2>/dev/null || true
    
    # Install curl and wget if missing
    for tool in curl wget git unzip; do
        if ! command -v $tool &> /dev/null; then
            echo "  Installing $tool..."
            apt-get install -y $tool 2>&1 | grep -i "done\|unpacking" | head -1 || true
        fi
    done
    
    echo "Tool check completed"
}

# ========== INSTALLATIONS-FUNKTIONEN ==========

cleanup_previous() {
    print_step "$MSG_CLEANUP"
    
    echo "Stopping existing services..."
    systemctl stop serversphere 2>/dev/null &
    SYSPID=$!
    sleep 1
    kill -9 $SYSPID 2>/dev/null || true
    
    echo "Terminating Node.js processes..."
    pkill -9 node 2>/dev/null || true
    sleep 1
    
    echo "Removing old installation..."
    rm -rf "$INSTALL_DIR" 2>/dev/null || true
    
    echo "Cleaning up config files..."
    rm -f /etc/systemd/system/serversphere.service 2>/dev/null || true
    rm -f /etc/nginx/sites-enabled/serversphere 2>/dev/null || true
    rm -f /etc/nginx/sites-available/serversphere 2>/dev/null || true
    
    echo "Reloading systemd..."
    systemctl daemon-reload 2>/dev/null || true
    sleep 1
    
    print_success "Cleanup completed"
}

update_system() {
    print_step "$MSG_UPDATE"
    
    echo "Updating package lists..."
    apt-get update -y 2>&1 | tail -2 || true
    
    echo "Upgrading packages..."
    apt-get upgrade -y 2>&1 | tail -2 || true
    
    print_success "System updated"
}

install_nodejs() {
    print_step "$MSG_NODE"
    
    if ! command -v node &> /dev/null; then
        echo "Downloading Node.js setup script..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -2 || true
        
        echo "Installing Node.js..."
        apt-get install -y nodejs 2>&1 | tail -2 || {
            print_error "$MSG_ERROR_NODE"
            exit 1
        }
        print_success "Node.js installed: $(node --version)"
    else
        print_success "Node.js already installed: $(node --version)"
    fi
    
    # Update npm
    echo "Updating npm..."
    npm install -g npm@latest 2>&1 | tail -1 || true
}

install_dependencies() {
    print_step "$MSG_DEPS"
    
    # Common dependencies
    DEPS_COMMON="git curl wget unzip build-essential python3 make g++ openjdk-17-jre-headless"
    
    # Full installation dependencies
    if [ "$INSTALL_TYPE" -eq 1 ] || [ "$INSTALL_TYPE" -eq 3 ]; then
        DEPS_FULL="nginx ufw certbot python3-certbot-nginx"
        echo "Installing full dependencies..."
        apt-get install -y $DEPS_COMMON $DEPS_FULL 2>&1 | tail -3 || true
    else
        # Minimal installation
        echo "Installing basic dependencies..."
        apt-get install -y $DEPS_COMMON 2>&1 | tail -3 || true
    fi
    
    print_success "Dependencies installed"
}

download_all_files() {
    print_step "$MSG_DOWNLOAD"
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    echo "Downloading ALL ServerSphere files from GitHub..."
    
    # Method 1: Try to clone with git first
    if command -v git &> /dev/null; then
        echo "Using git clone..."
        git clone --depth=1 "$GITHUB_REPO.git" . 2>/dev/null && return 0
    fi
    
    # Method 2: Download ZIP archive
    echo "Using wget to download ZIP..."
    wget -q "$GITHUB_REPO/archive/main.zip" -O /tmp/serversphere.zip
    if [ $? -eq 0 ]; then
        unzip -q /tmp/serversphere.zip -d /tmp/
        cp -r /tmp/serversphere-main/* "$INSTALL_DIR"/
        cp -r /tmp/serversphere-main/.* "$INSTALL_DIR"/ 2>/dev/null || true
        rm -f /tmp/serversphere.zip
        rm -rf /tmp/serversphere-main
        return 0
    fi
    
    # Method 3: Download essential files individually
    echo "Downloading essential files individually..."
    
    # List of all essential files
    ESSENTIAL_FILES=(
        "package.json"
        "package-lock.json"
        "server.js"
        "setup.js"
        "keygen.js"
        ".env.template"
        "README.md"
        "start.bat"
        "public/"
    )
    
    # Download each file
    for item in "${ESSENTIAL_FILES[@]}"; do
        if [[ "$item" == */ ]]; then
            # Directory - create it
            mkdir -p "${item%/}"
        else
            # File - download it
            echo "Downloading: $item"
            wget -q "$GITHUB_RAW/$item" -O "$item" 2>/dev/null || echo "Warning: Could not download $item"
        fi
    done
    
    # Create src directory structure
    mkdir -p src
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        print_error "$MSG_ERROR_DOWNLOAD"
        exit 1
    fi
    
    print_success "Download completed"
}

setup_serversphere() {
    print_step "$MSG_CONFIG"
    
    cd "$INSTALL_DIR"
    
    # Install npm dependencies
    echo "Installing Node.js dependencies..."
    npm install --production --no-audit --no-fund
    
    # Generate security keys
    echo "Generating security keys..."
    if [ -f "keygen.js" ]; then
        node keygen.js
    else
        # Fallback key generation
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
    
    # Update .env with our settings
    if [ -f ".env" ]; then
        sed -i "s/PORT=.*/PORT=$PORT/" .env
        sed -i 's/HOST=.*/HOST=0.0.0.0/' .env
        sed -i 's/NODE_ENV=.*/NODE_ENV=production/' .env
        if ! grep -q "ALLOW_EXTERNAL_ACCESS" .env; then
            echo "ALLOW_EXTERNAL_ACCESS=true" >> .env
        fi
    else
        cat > .env << EOF
PORT=$PORT
HOST=0.0.0.0
NODE_ENV=production
ALLOW_EXTERNAL_ACCESS=true
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
CSRF_SECRET=$(openssl rand -hex 32)
EOF
    fi
    
    # Create necessary directories
    mkdir -p servers backups uploads logs keys public
    
    print_success "ServerSphere configured"
}

setup_systemd_service() {
    print_step "$MSG_SERVICE"
    
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
    print_step "$MSG_NGINX"
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    
    # Create nginx config
    cat > /etc/nginx/sites-available/serversphere << EOF
server {
    listen 80;
    server_name ${DOMAIN:-_} $([ -n "$DOMAIN" ] && echo "www.$DOMAIN");
    
    # Allow external access
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS, PUT, DELETE';
    add_header Access-Control-Allow-Headers 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
    
    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    location /socket.io/ {
        proxy_pass http://localhost:$PORT/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }
    
    client_max_body_size 100M;
}
EOF
    
    # Enable site
    ln -sf /etc/nginx/sites-available/serversphere /etc/nginx/sites-enabled/
    
    # Test and restart nginx
    nginx -t && systemctl restart nginx
    
    print_success "Nginx configured"
}

setup_firewall() {
    print_step "$MSG_FIREWALL"
    
    # Enable firewall if not enabled
    if ! ufw status | grep -q "Status: active"; then
        ufw --force enable
    fi
    
    # Set defaults
    ufw default deny incoming
    ufw default allow outgoing
    
    # Open ports
    ufw allow 22/tcp comment 'SSH'
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw allow $PORT/tcp comment "ServerSphere Panel"
    ufw allow 25565:25575/tcp comment 'Minecraft Ports'
    
    # Reload firewall
    ufw --force reload
    
    print_success "Firewall configured"
}

setup_ssl() {
    if [ "$SSL" = true ] && [ -n "$DOMAIN" ]; then
        print_step "$MSG_SSL_SETUP"
        
        # Setup SSL certificate
        if certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
                   --non-interactive --agree-tos \
                   --email "admin@$DOMAIN" \
                   --redirect; then
            print_success "SSL certificate installed"
        else
            print_error "SSL setup failed - continuing without SSL"
        fi
    fi
}

start_services() {
    print_step "$MSG_START_SERVICES"
    
    # Start and enable ServerSphere
    systemctl start serversphere
    systemctl enable serversphere
    
    # Wait for service to start
    sleep 5
    
    # Check status
    if systemctl is-active --quiet serversphere; then
        print_success "ServerSphere service is running"
    else
        print_error "Service failed to start. Checking logs..."
        journalctl -u serversphere --no-pager -n 20
    fi
}

show_summary() {
    local local_ip=$(hostname -I | awk '{print $1}')
    local external_ip=$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || echo "UNKNOWN")
    
    echo -e "\n${GREEN}================================================"
    echo "$MSG_COMPLETE"
    echo "================================================${NC}\n"
    
    echo -e "${CYAN}$MSG_ACCESS${NC}"
    
    if [ -n "$DOMAIN" ] && [ "$SSL" = true ]; then
        echo -e "   ${GREEN}https://$DOMAIN${NC}"
        echo -e "   🔒 SSL: Enabled"
    elif [ -n "$DOMAIN" ]; then
        echo -e "   ${BLUE}http://$DOMAIN${NC}"
        echo -e "   🔓 SSL: Not enabled"
    else
        echo -e "   ${BLUE}http://$local_ip${NC} (via Nginx)"
        echo -e "   ${BLUE}http://$local_ip:$PORT${NC} (direct)"
        
        if [ "$external_ip" != "UNKNOWN" ]; then
            echo -e "\n   ${CYAN}External Access:${NC}"
            echo -e "   ${GREEN}http://$external_ip${NC}"
            echo -e "   ${GREEN}http://$external_ip:$PORT${NC}"
            echo -e "\n   ${YELLOW}⚠️  For external access, forward in your router:${NC}"
            echo -e "   • Port 80 → $local_ip:80"
            echo -e "   • Port $PORT → $local_ip:$PORT"
        fi
    fi
    
    echo -e "\n${CYAN}$MSG_LOGIN${NC}"
    echo -e "${RED}$MSG_WARNING${NC}"
    
    echo -e "\n${CYAN}$MSG_MANAGE${NC}"
    echo "   systemctl status serversphere"
    echo "   systemctl restart serversphere"
    echo "   journalctl -u serversphere -f"
    
    echo -e "\n${CYAN}$MSG_FILES${NC}"
    echo "   $INSTALL_DIR/.env"
    echo "   /etc/systemd/system/serversphere.service"
    echo "   /etc/nginx/sites-available/serversphere"
    
    echo -e "\n${GREEN}✅ ServerSphere is ready!${NC}"
}

# ========== HAUPT-FUNKTION ==========

main() {
    # Show language menu first
    show_language_menu
    
    # Show header with selected language
    print_header
    echo -e "${CYAN}$MSG_WELCOME${NC}\n"
    
    # Check root
    check_root
    
    # Check required tools
    check_required_tools
    
    # Get configuration
    read -p "$MSG_DOMAIN" DOMAIN
    
    read -p "$MSG_PORT" input_port
    PORT=${input_port:-$DEFAULT_PORT}
    
    if [ -n "$DOMAIN" ]; then
        if ask_yes_no "$MSG_SSL"; then
            SSL=true
        else
            SSL=false
        fi
    fi
    
    # Installation type
    echo -e "\n${CYAN}$MSG_INSTALL_TYPE${NC}"
    echo "$MSG_OPTION1"
    echo "$MSG_OPTION2"
    echo "$MSG_OPTION3"
    
    while true; do
        read -p "$MSG_CHOICE" INSTALL_TYPE
        case $INSTALL_TYPE in
            1|2|3) break ;;
            *) echo "Invalid choice. Please enter 1, 2 or 3." ;;
        esac
    done
    
    # Custom installation options
    if [ "$INSTALL_TYPE" -eq 3 ]; then
        CUSTOM_NGINX=false
        CUSTOM_FIREWALL=false
        CUSTOM_SSL=false
        
        if ask_yes_no "Setup Nginx reverse proxy?"; then
            CUSTOM_NGINX=true
        fi
        if ask_yes_no "Configure firewall?"; then
            CUSTOM_FIREWALL=true
        fi
        if [ -n "$DOMAIN" ] && ask_yes_no "Setup SSL certificate?"; then
            CUSTOM_SSL=true
        fi
    fi
    
    # Start installation
    echo -e "\n${BLUE}$MSG_START${NC}"
    
    # Step 1: Cleanup
    cleanup_previous
    
    # Step 2: Update system
    update_system
    
    # Step 3: Install Node.js
    install_nodejs
    
    # Step 4: Install dependencies
    install_dependencies
    
    # Step 5: Download ALL files
    download_all_files
    
    # Step 6: Setup ServerSphere
    setup_serversphere
    
    # Step 7: Setup systemd service
    setup_systemd_service
    
    # Step 8: Additional setup based on installation type
    case $INSTALL_TYPE in
        1)
            # Full installation
            setup_nginx
            setup_firewall
            setup_ssl
            ;;
        2)
            # ServerSphere only
            echo "Skipping Nginx and Firewall setup..."
            ;;
        3)
            # Custom installation
            [ "$CUSTOM_NGINX" = true ] && setup_nginx
            [ "$CUSTOM_FIREWALL" = true ] && setup_firewall
            [ "$CUSTOM_SSL" = true ] && SSL=true && setup_ssl
            ;;
    esac
    
    # Step 9: Start services
    start_services
    
    # Step 10: Show summary
    show_summary
}

# ========== SCRIPT START ==========

# Trap SIGINT (Ctrl+C) to exit cleanly
trap 'echo -e "\n${RED}Installation interrupted${NC}"; exit 1' SIGINT

# Run main function
main

exit 0
