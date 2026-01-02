#!/bin/bash

# ============================================
# ServerSphere Auto-Installer
# GitHub: https://github.com/Luca-ssssssss/serversphere
# ============================================

# Farben für Ausgabe
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Funktionen
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

print_warning() {
    echo -e "${YELLOW}⚠  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

ask_yes_no() {
    while true; do
        read -p "$1 [j/n]: " yn
        case $yn in
            [Jj]* ) return 0;;
            [Nn]* ) return 1;;
            * ) echo "Bitte j oder n eingeben.";;
        esac
    done
}

check_root() {
    if [ "$EUID" -ne 0 ]; then 
        print_error "Bitte als root oder mit sudo ausführen!"
        echo "Verwendung: sudo ./install-serversphere.sh"
        exit 1
    fi
}

update_system() {
    print_step "System aktualisieren"
    apt-get update -y && apt-get upgrade -y
    print_success "System aktualisiert"
}

install_nodejs() {
    print_step "Node.js installieren"
    
    # Prüfen ob Node.js bereits installiert
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js bereits installiert: $NODE_VERSION"
    else
        # Node.js 20.x installieren
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        print_success "Node.js installiert: $(node --version)"
    fi
}

install_dependencies() {
    print_step "Systemabhängigkeiten installieren"
    
    DEPS=(
        "git" "curl" "wget" "unzip"
        "build-essential" "python3" "make" "g++"
        "openjdk-17-jre-headless"
        "nginx" "ufw" "certbot" "python3-certbot-nginx"
    )
    
    for dep in "${DEPS[@]}"; do
        if ! dpkg -l | grep -q "^ii  $dep "; then
            echo "📥 Installiere: $dep"
            apt-get install -y "$dep" 2>/dev/null || print_warning "$dep konnte nicht installiert werden"
        fi
    done
    
    print_success "Abhängigkeiten installiert"
}

download_from_github() {
    print_step "ServerSphere von GitHub herunterladen"
    
    GITHUB_URL="https://github.com/Luca-ssssssss/serversphere"
    INSTALL_DIR="/opt/serversphere"
    
    # Alte Installation entfernen
    rm -rf "$INSTALL_DIR"
    
    # Optionen für Download
    echo "📥 Download-Methode wählen:"
    echo "1) Git klonen (empfohlen, benötigt git)"
    echo "2) ZIP herunterladen"
    echo "3) Nur Hauptdateien (minimal)"
    read -p "Wähle [1-3]: " DOWNLOAD_CHOICE
    
    case $DOWNLOAD_CHOICE in
        1)
            # Git klonen
            git clone "$GITHUB_URL.git" "$INSTALL_DIR" || {
                print_error "Git Klonen fehlgeschlagen"
                return 1
            }
            ;;
        2)
            # ZIP herunterladen
            ZIP_URL="https://github.com/Luca-ssssssss/serversphere/archive/refs/heads/main.zip"
            TEMP_ZIP="/tmp/serversphere.zip"
            
            wget -O "$TEMP_ZIP" "$ZIP_URL" || {
                print_error "Download fehlgeschlagen"
                return 1
            }
            
            mkdir -p "$INSTALL_DIR"
            unzip -q "$TEMP_ZIP" -d /tmp/
            cp -r /tmp/serversphere-main/* "$INSTALL_DIR"/
            rm -f "$TEMP_ZIP"
            rm -rf /tmp/serversphere-main
            ;;
        3)
            # Nur essentielle Dateien
            mkdir -p "$INSTALL_DIR"
            
            # Wichtige Dateien herunterladen
            FILES=(
                "package.json"
                "server.js" 
                "setup.js"
                "keygen.js"
                ".env.template"
            )
            
            for file in "${FILES[@]}"; do
                URL="https://raw.githubusercontent.com/Luca-ssssssss/serversphere/main/$file"
                wget -q -O "$INSTALL_DIR/$file" "$URL" || print_warning "$file konnte nicht heruntergeladen werden"
            done
            ;;
        *)
            print_error "Ungültige Auswahl"
            return 1
            ;;
    esac
    
    print_success "ServerSphere heruntergeladen nach: $INSTALL_DIR"
    echo "$INSTALL_DIR"
}

setup_project() {
    local project_dir="$1"
    
    print_step "Projekt einrichten"
    
    cd "$project_dir" || {
        print_error "Konnte nicht in $project_dir wechseln"
        return 1
    }
    
    # npm Abhängigkeiten installieren
    if [ -f "package.json" ]; then
        print_step "Node.js Abhängigkeiten installieren"
        npm install --production
        print_success "Abhängigkeiten installiert"
    else
        print_error "package.json nicht gefunden"
        return 1
    fi
    
    # Keys generieren
    if [ -f "keygen.js" ]; then
        print_step "Sicherheitsschlüssel generieren"
        node keygen.js
        print_success "Schlüssel generiert"
    fi
    
    # Setup ausführen falls vorhanden
    if [ -f "setup.js" ]; then
        print_step "Setup-Script ausführen"
        node setup.js
        print_success "Setup abgeschlossen"
    fi
    
    # .env anpassen für Produktion
    if [ -f ".env" ]; then
        sed -i 's/HOST=.*/HOST=0.0.0.0/g' .env
        sed -i 's/NODE_ENV=.*/NODE_ENV=production/g' .env
        sed -i 's/SESSION_COOKIE_SECURE=.*/SESSION_COOKIE_SECURE=true/g' .env
        print_success "Konfiguration angepasst"
    fi
    
    print_success "Projekt eingerichtet"
}

create_systemd_service() {
    local project_dir="$1"
    
    print_step "Systemd Service erstellen"
    
    SERVICE_FILE="/etc/systemd/system/serversphere.service"
    
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ServerSphere Minecraft Panel
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$project_dir
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=/usr/bin/node $project_dir/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=serversphere

# Sicherheit
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$project_dir/servers $project_dir/backups $project_dir/uploads $project_dir/logs

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    print_success "Systemd Service erstellt"
}

configure_firewall() {
    print_step "Firewall konfigurieren"
    
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp comment 'SSH'
    ufw allow 3000/tcp comment 'ServerSphere'
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw allow 25565:25575/tcp comment 'Minecraft Ports'
    
    print_success "Firewall konfiguriert"
}

configure_nginx() {
    local domain="$1"
    
    print_step "Nginx konfigurieren"
    
    # Standard Site deaktivieren
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null
    
    # ServerSphere Site erstellen
    NGINX_CONFIG="/etc/nginx/sites-available/serversphere"
    
    if [ -z "$domain" ]; then
        # IP-basierte Konfiguration
        cat > "$NGINX_CONFIG" << 'EOF'
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
    
    client_max_body_size 100M;
}
EOF
    else
        # Domain-basierte Konfiguration
        cat > "$NGINX_CONFIG" << EOF
server {
    listen 80;
    server_name $domain;
    
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
}
EOF
    fi
    
    # Konfiguration aktivieren
    ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/
    
    # Nginx testen und neustarten
    nginx -t && systemctl restart nginx
    
    print_success "Nginx konfiguriert"
}

setup_ssl() {
    local domain="$1"
    
    if [ -z "$domain" ]; then
        print_warning "Keine Domain angegeben, überspringe SSL"
        return
    fi
    
    print_step "SSL Zertifikat einrichten"
    
    certbot --nginx -d "$domain" --non-interactive --agree-tos --email "admin@$domain"
    
    if [ $? -eq 0 ]; then
        print_success "SSL Zertifikat eingerichtet"
    else
        print_warning "SSL Setup fehlgeschlagen"
    fi
}

start_services() {
    print_step "Dienste starten"
    
    systemctl start serversphere
    systemctl enable serversphere
    systemctl restart nginx
    
    # Warten und Status prüfen
    sleep 3
    
    if systemctl is-active --quiet serversphere; then
        print_success "ServerSphere Service läuft"
    else
        print_warning "Service Status unklar - prüfe mit: systemctl status serversphere"
    fi
}

show_summary() {
    local project_dir="$1"
    local domain="$2"
    local ssl_enabled="$3"
    
    echo -e "\n${GREEN}=============================================="
    echo "🎉 INSTALLATION ABGESCHLOSSEN!"
    echo "==============================================${NC}\n"
    
    echo -e "${CYAN}📋 ZUSAMMENFASSUNG:${NC}"
    echo -e "📍 Installationsverzeichnis: ${project_dir}"
    echo -e "👤 Admin Login: admin / admin123"
    echo -e "${RED}⚠  SOFORT ÄNDERN NACH DEM LOGIN!${NC}\n"
    
    if [ -n "$domain" ] && [ "$ssl_enabled" = true ]; then
        echo -e "🌐 Zugriff: ${GREEN}https://$domain${NC}"
        echo -e "🔒 SSL: Aktiviert (Let's Encrypt)"
    elif [ -n "$domain" ]; then
        echo -e "🌐 Zugriff: ${BLUE}http://$domain${NC}"
        echo -e "🔓 SSL: Nicht aktiviert"
    else
        SERVER_IP=$(hostname -I | awk '{print $1}')
        echo -e "🌐 Zugriff: ${BLUE}http://$SERVER_IP:3000${NC}"
        echo -e "🌐 Alternativ: ${BLUE}http://localhost:3000${NC}"
    fi
    
    echo -e "\n${CYAN}🔧 VERWALTUNGSBEFEHLE:${NC}"
    echo -e "📊 Status: systemctl status serversphere"
    echo -e "🔁 Neustart: systemctl restart serversphere"
    echo -e "⏹️  Stoppen: systemctl stop serversphere"
    echo -e "▶️  Starten: systemctl start serversphere"
    echo -e "📝 Logs: journalctl -u serversphere -f\n"
    
    echo -e "${CYAN}📁 WICHTIGE DATEIEN:${NC}"
    echo -e "🔐 Konfiguration: ${project_dir}/.env"
    echo -e "⚙️  Service: /etc/systemd/system/serversphere.service"
    echo -e "🌐 Nginx: /etc/nginx/sites-available/serversphere\n"
    
    echo -e "${YELLOW}⚠  SICHERHEITSHINWEISE:${NC}"
    echo -e "• Standard-Passwort SOFORT ändern!"
    echo -e "• Regelmäßige Backups einrichten"
    echo -e "• System aktuell halten (apt update && apt upgrade)"
    echo -e "• Logs regelmäßig überwachen\n"
    
    echo -e "${GREEN}✅ ServerSphere ist bereit!${NC}"
}

# Hauptfunktion
main() {
    print_header
    
    # Root-Rechte prüfen
    check_root
    
    # Begrüßung
    echo -e "${CYAN}Willkommen zum ServerSphere Auto-Installer!${NC}\n"
    
    # Domain abfragen
    DOMAIN=""
    SSL_ENABLED=false
    
    read -p "Domain (leer lassen für IP-Zugriff): " DOMAIN
    
    if [ -n "$DOMAIN" ]; then
        if ask_yes_no "SSL Zertifikat einrichten?"; then
            SSL_ENABLED=true
        fi
    fi
    
    # Installationsoptionen
    echo -e "\n${CYAN}Installationsoptionen:${NC}"
    echo "1) Vollständige Installation (empfohlen)"
    echo "2) Nur ServerSphere installieren (ohne Nginx/Firewall)"
    echo "3) Nur Dateien herunterladen"
    
    read -p "Wähle [1-3]: " INSTALL_OPTION
    
    # Start der Installation
    echo -e "\n${BLUE}🚀 Starte Installation...${NC}"
    
    # System vorbereiten
    update_system
    
    # Je nach Option installieren
    case $INSTALL_OPTION in
        1)
            # Vollständige Installation
            install_nodejs
            install_dependencies
            ;;
        2|3)
            # Minimale Installation
            install_nodejs
            ;;
    esac
    
    # ServerSphere herunterladen
    PROJECT_DIR=$(download_from_github)
    
    if [ -z "$PROJECT_DIR" ]; then
        print_error "Download fehlgeschlagen"
        exit 1
    fi
    
    # Projekt einrichten
    setup_project "$PROJECT_DIR"
    
    # Weitere Konfiguration je nach Option
    case $INSTALL_OPTION in
        1)
            # Vollständige Konfiguration
            create_systemd_service "$PROJECT_DIR"
            configure_firewall
            configure_nginx "$DOMAIN"
            
            if [ "$SSL_ENABLED" = true ] && [ -n "$DOMAIN" ]; then
                setup_ssl "$DOMAIN"
            fi
            
            start_services
            ;;
        2)
            # Nur Service erstellen
            create_systemd_service "$PROJECT_DIR"
            start_services
            ;;
        3)
            # Nur Dateien
            echo -e "\n${GREEN}✅ Dateien heruntergeladen nach: $PROJECT_DIR${NC}"
            echo -e "\nManuell starten:"
            echo -e "cd $PROJECT_DIR"
            echo -e "npm start"
            exit 0
            ;;
    esac
    
    # Zusammenfassung anzeigen
    show_summary "$PROJECT_DIR" "$DOMAIN" "$SSL_ENABLED"
}

# Script ausführen
main "$@"