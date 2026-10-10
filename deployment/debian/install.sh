#!/bin/bash
# Debian/Ubuntu installation script for VideoGen AI
# Run as root or with sudo

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/videogen"
DATA_DIR="/var/lib/videogen"
LOG_DIR="/var/log/videogen"
SERVICE_USER="videogen"
PYTHON_VERSION="3.10"
NODE_VERSION="20"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        log_error "Cannot detect OS"
        exit 1
    fi
    log_info "Detected OS: $OS $VERSION"
}

install_dependencies() {
    log_info "Installing system dependencies..."
    
    apt-get update
    apt-get install -y \
        python3.10 \
        python3.10-venv \
        python3.10-dev \
        python3-pip \
        nodejs \
        npm \
        git \
        ffmpeg \
        libgl1-mesa-glx \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender-dev \
        libgomp1 \
        redis-server \
        nginx \
        supervisor \
        curl \
        wget \
        ca-certificates \
        gnupg \
        lsb-release \
        build-essential \
        cmake \
        pkg-config \
        libssl-dev \
        libffi-dev
    
    # Install NVIDIA Container Toolkit for GPU support
    if command -v nvidia-smi &> /dev/null; then
        log_info "NVIDIA GPU detected, installing container toolkit..."
        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
        curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
            tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
        apt-get update
        apt-get install -y nvidia-container-toolkit
        nvidia-ctk runtime configure --runtime=docker
        systemctl restart docker
    fi
}

create_user() {
    log_info "Creating service user..."
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd -r -s /bin/bash -d "$INSTALL_DIR" -m "$SERVICE_USER"
        usermod -aG docker "$SERVICE_USER"
        usermod -aG video "$SERVICE_USER"
        usermod -aG render "$SERVICE_USER"
    fi
}

create_directories() {
    log_info "Creating directories..."
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$DATA_DIR"/{models,outputs,temp,logs,cache}
    mkdir -p "$LOG_DIR"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
}

install_backend() {
    log_info "Installing backend..."
    
    cd "$INSTALL_DIR"
    
    # Create virtual environment
    sudo -u "$SERVICE_USER" python3.10 -m venv venv
    source venv/bin/activate
    
    # Upgrade pip
    pip install --upgrade pip setuptools wheel
    
    # Install poetry
    pip install poetry
    
    # Copy backend source
    cp -r /tmp/videogen/backend/* ./
    
    # Install dependencies
    poetry config virtualenvs.create false
    poetry install --only=main --no-interaction --no-ansi
    
    # Create necessary files
    cat > .env << EOF
HUGGINGFACE_TOKEN=${HUGGINGFACE_TOKEN:-}
GITHUB_TOKEN=${GITHUB_TOKEN:-}
UPDATE_CHANNEL=stable
AUTO_UPDATE_ENABLED=false
DEBUG=false
LOG_LEVEL=INFO
EOF
    
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
}

install_frontend() {
    log_info "Installing frontend..."
    
    cd "$INSTALL_DIR"
    
    # Copy frontend source
    cp -r /tmp/videogen/frontend/* ./frontend/
    
    cd frontend
    
    # Install dependencies and build
    sudo -u "$SERVICE_USER" npm ci
    sudo -u "$SERVICE_USER" npm run build
    
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/frontend"
}

setup_systemd() {
    log_info "Setting up systemd services..."
    
    # Backend service
    cat > /etc/systemd/system/videogen-backend.service << EOF
[Unit]
Description=VideoGen AI Backend
After=network.target redis.service
Requires=redis.service

[Service]
Type=exec
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin
Environment=PYTHONPATH=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=videogen-backend

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR $LOG_DIR

[Install]
WantedBy=multi-user.target
EOF

    # Celery worker service
    cat > /etc/systemd/system/videogen-celery-worker.service << EOF
[Unit]
Description=VideoGen AI Celery Worker
After=network.target redis.service videogen-backend.service
Requires=redis.service

[Service]
Type=exec
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin
Environment=PYTHONPATH=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/celery -A app.core.celery_app worker --loglevel=info --concurrency=2
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=videogen-celery-worker

[Install]
WantedBy=multi-user.target
EOF

    # Celery beat service
    cat > /etc/systemd/system/videogen-celery-beat.service << EOF
[Unit]
Description=VideoGen AI Celery Beat
After=network.target redis.service videogen-backend.service
Requires=redis.service

[Service]
Type=exec
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin
Environment=PYTHONPATH=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/celery -A app.core.celery_app beat --loglevel=info
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=videogen-celery-beat

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable videogen-backend videogen-celery-worker videogen-celery-beat
}

setup_nginx() {
    log_info "Configuring Nginx..."
    
    cat > /etc/nginx/sites-available/videogen << EOF
server {
    listen 80;
    server_name _;
    
    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
    
    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
    
    # Increase upload size for model downloads
    client_max_body_size 50G;
    
    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF

    ln -sf /etc/nginx/sites-available/videogen /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    nginx -t
    systemctl enable nginx
    systemctl restart nginx
}

setup_redis() {
    log_info "Configuring Redis..."
    
    sed -i 's/^# maxmemory <bytes>/maxmemory 2gb/' /etc/redis/redis.conf
    sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    
    systemctl enable redis-server
    systemctl restart redis-server
}

setup_logrotate() {
    log_info "Setting up log rotation..."
    
    cat > /etc/logrotate.d/videogen << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 $SERVICE_USER $SERVICE_USER
    sharedscripts
    postrotate
        systemctl reload videogen-backend > /dev/null 2>&1 || true
    endscript
}
EOF
}

setup_firewall() {
    log_info "Configuring firewall..."
    
    if command -v ufw &> /dev/null; then
        ufw allow 22/tcp
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw allow 8000/tcp
        ufw allow 3000/tcp
        ufw --force enable
    fi
}

print_summary() {
    log_info "Installation complete!"
    echo
    echo "VideoGen AI has been installed to: $INSTALL_DIR"
    echo "Data directory: $DATA_DIR"
    echo "Log directory: $LOG_DIR"
    echo
    echo "Services:"
    echo "  - videogen-backend: Main API server (port 8000)"
    echo "  - videogen-celery-worker: Background task worker"
    echo "  - videogen-celery-beat: Scheduled tasks"
    echo "  - nginx: Reverse proxy (port 80)"
    echo "  - redis-server: Cache and message broker"
    echo
    echo "Commands:"
    echo "  systemctl start videogen-backend"
    echo "  systemctl status videogen-backend"
    echo "  journalctl -u videogen-backend -f"
    echo
    echo "Access the web UI at: http://$(hostname -I | awk '{print $1}')"
    echo
    log_warn "Don't forget to configure your Hugging Face token in $INSTALL_DIR/.env"
    log_warn "For GPU support, ensure NVIDIA drivers and nvidia-container-toolkit are installed"
}

main() {
    log_info "Starting VideoGen AI installation..."
    
    check_root
    detect_os
    install_dependencies
    create_user
    create_directories
    install_backend
    install_frontend
    setup_systemd
    setup_nginx
    setup_redis
    setup_logrotate
    setup_firewall
    print_summary
}

main "$@"