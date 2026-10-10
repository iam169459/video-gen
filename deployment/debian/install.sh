#!/bin/bash
# VideoGen AI - Debian Server Installer
# Run as root: sudo bash install.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/videogen"
DATA_DIR="/var/lib/videogen"
LOG_DIR="/var/log/videogen"
SERVICE_USER="videogen"
ENABLE_GPU=false
ENABLE_OLLAMA=true
ENABLE_LLAMACPP=true
AUTO_START=true
SKIP_DEPS=false

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

show_help() {
    cat << 'EOF'
VideoGen AI - Debian Server Installer

USAGE:
    sudo bash install.sh [OPTIONS]

OPTIONS:
    -g, --gpu              Enable NVIDIA GPU support (install drivers + CUDA)
    --no-ollama            Skip Ollama installation
    --no-llamacpp          Skip llama.cpp installation
    --no-auto-start        Don't enable auto-start on boot
    --skip-deps            Skip apt package installation
    -h, --help             Show help

EXAMPLES:
    # Full install with GPU
    sudo bash install.sh --gpu

    # Minimal install (no local LLM engines)
    sudo bash install.sh --no-ollama --no-llamacpp

    # Skip system packages (already installed)
    sudo bash install.sh --skip-deps

FEATURES:
    ✅ Systemd services (auto-start on boot)
    ✅ Nginx reverse proxy (port 80)
    ✅ Redis for caching/queue
    ✅ Uncensored AI models (Dolphin, WizardLM, Nemotron, etc.)
    ✅ Local inference: Ollama, llama.cpp, Transformers
    ✅ Video generation (SVD, AnimateDiff, Hotshot)
    ✅ Chain-block LLM for large models
    ✅ Model browser with categories
    ✅ System monitoring + terminal
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -g|--gpu) ENABLE_GPU=true; shift ;;
            --no-ollama) ENABLE_OLLAMA=false; shift ;;
            --no-llamacpp) ENABLE_LLAMACPP=false; shift ;;
            --no-auto-start) AUTO_START=false; shift ;;
            --skip-deps) SKIP_DEPS=true; shift ;;
            -h|--help) show_help; exit 0 ;;
            *) log_error "Unknown: $1"; show_help; exit 1 ;;
        esac
    done
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Run as root: sudo bash install.sh"
        exit 1
    fi
}

install_deps() {
    [[ "$SKIP_DEPS" == true ]] && { log_info "Skipping dependency installation"; return; }
    
    log_step "Installing system dependencies..."
    
    # Detect Python version available
    PYTHON_VERSION=$(apt-cache search '^python3\.' | grep -E '^python3\.(10|11|12)-venv' | head -1 | cut -d' ' -f1 | sed 's/-venv$//')
    if [[ -z "$PYTHON_VERSION" ]]; then
        PYTHON_VERSION="python3"
    fi
    log_info "Using Python: $PYTHON_VERSION"
    
    apt-get update
    apt-get install -y \
        $PYTHON_VERSION ${PYTHON_VERSION}-venv ${PYTHON_VERSION}-dev python3-pip \
        nodejs npm git ffmpeg redis-server nginx \
        libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1 \
        build-essential cmake pkg-config libssl-dev libffi-dev \
        supervisor logrotate curl wget gnupg2 lsb-release
    
    # Create python3.10 symlink if using different version
    if [[ "$PYTHON_VERSION" != "python3.10" ]]; then
        ln -sf $(which $PYTHON_VERSION) /usr/local/bin/python3.10
        ln -sf $(which ${PYTHON_VERSION%-dev}) /usr/local/bin/python3.10 2>/dev/null || true
    fi
    
    if [[ "$ENABLE_GPU" == true ]]; then
        log_step "Installing NVIDIA drivers..."
        apt-get install -y nvidia-driver-550 nvidia-container-toolkit 2>/dev/null || \
        apt-get install -y nvidia-driver nvidia-container-toolkit
    fi
    
    if [[ "$ENABLE_OLLAMA" == true ]]; then
        log_step "Installing Ollama..."
        curl -fsSL https://ollama.ai/install.sh | sh
    fi
    
    if [[ "$ENABLE_LLAMACPP" == true ]]; then
        log_step "Installing llama.cpp..."
        pip3 install llama-cpp-python 2>/dev/null || true
    fi
}

setup_user_dirs() {
    log_step "Setting up user and directories..."
    id "$SERVICE_USER" &>/dev/null || useradd -r -s /bin/bash -d "$INSTALL_DIR" -m "$SERVICE_USER"
    usermod -aG video "$SERVICE_USER" 2>/dev/null || true
    usermod -aG render "$SERVICE_USER" 2>/dev/null || true
    
    mkdir -p "$INSTALL_DIR" "$DATA_DIR"/{models,outputs,temp,logs,cache,uncensored,llm,video,lora,embeddings} "$LOG_DIR"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
}

copy_project() {
    log_step "Deploying application..."
    REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    rsync -a --exclude='.git' --exclude='venv' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' --exclude='.next' --exclude='out' "$REPO_DIR/" "$INSTALL_DIR/"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
}

install_backend() {
    log_step "Installing Python backend..."
    sudo -u "$SERVICE_USER" bash -c "
        cd $INSTALL_DIR
        python3.10 -m venv venv
        source venv/bin/activate
        pip install --upgrade pip setuptools wheel
        cd backend
        pip install -r requirements.txt
    " || {
        log_warn "python3.10 venv failed, trying python3..."
        sudo -u "$SERVICE_USER" bash -c "
            cd $INSTALL_DIR
            python3 -m venv venv
            source venv/bin/activate
            pip install --upgrade pip setuptools wheel
            cd backend
            pip install -r requirements.txt
        "
    }
}

install_frontend() {
    log_step "Building frontend..."
    sudo -u "$SERVICE_USER" bash -c "
        cd $INSTALL_DIR/frontend
        npm ci
        npm run build
    "
}

create_env() {
    log_step "Creating configuration..."
    cat > "$INSTALL_DIR/.env" << EOF
HUGGINGFACE_TOKEN=
GITHUB_TOKEN=
UPDATE_CHANNEL=stable
AUTO_UPDATE_ENABLED=false
DEBUG=false
LOG_LEVEL=INFO

USE_OLLAMA=$ENABLE_OLLAMA
USE_LLAMA_CPP=$ENABLE_LLAMACPP
OLLAMA_HOST=http://localhost:11434
LLAMA_CPP_PATH=$INSTALL_DIR/venv/bin/llama-cli

MODELS_DIR=$DATA_DIR/models
OUTPUT_DIR=$DATA_DIR/outputs
UNCENSORED_DIR=$DATA_DIR/uncensored
LLM_DIR=$DATA_DIR/llm
VIDEO_DIR=$DATA_DIR/video
LORA_DIR=$DATA_DIR/lora
EMBEDDINGS_DIR=$DATA_DIR/embeddings

ENABLE_GPU=$ENABLE_GPU
EOF
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
}

setup_systemd() {
    log_step "Setting up systemd services..."
    
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
LimitNOFILE=65536
LimitNPROC=4096
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR $LOG_DIR

[Install]
WantedBy=multi-user.target
EOF

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

    if [[ "$AUTO_START" == true ]]; then
        systemctl daemon-reload
        systemctl enable videogen-backend videogen-celery-worker videogen-celery-beat
    fi
}

setup_nginx() {
    log_step "Configuring Nginx..."
    
    cat > /etc/nginx/sites-available/videogen << 'EOF'
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
    
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
    
    client_max_body_size 50G;
    
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
    log_step "Configuring Redis..."
    sed -i 's/^# maxmemory <bytes>/maxmemory 2gb/' /etc/redis/redis.conf
    sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    systemctl enable redis-server
    systemctl restart redis-server
}

setup_logrotate() {
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

start_services() {
    log_step "Starting services..."
    systemctl daemon-reload
    
    if [[ "$AUTO_START" == true ]]; then
        systemctl start videogen-backend videogen-celery-worker videogen-celery-beat
    fi
}

verify_install() {
    log_step "Verifying installation..."
    sleep 3
    
    local all_ok=true
    for svc in videogen-backend videogen-celery-worker videogen-celery-beat nginx redis-server; do
        if systemctl is-active --quiet "$svc"; then
            log_info "✓ $svc running"
        else
            log_error "✗ $svc failed"
            all_ok=false
        fi
    done
    
    if [[ "$ENABLE_OLLAMA" == true ]]; then
        if systemctl is-active --quiet ollama 2>/dev/null || pgrep ollama >/dev/null; then
            log_info "✓ ollama running"
        else
            log_warn "⚠ ollama not running (start with: systemctl start ollama)"
        fi
    fi
    
    return 0
}

print_summary() {
    local ip=$(hostname -I | awk '{print $1}')
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "VideoGen AI - Debian Server Install Complete"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Web UI:      http://$ip"
    echo "API Docs:    http://$ip:8000/docs"
    echo "Install dir: $INSTALL_DIR"
    echo "Data dir:    $DATA_DIR"
    echo "Log dir:     $LOG_DIR"
    echo
    echo "Services (systemd):"
    echo "  systemctl status videogen-backend"
    echo "  systemctl status videogen-celery-worker"
    echo "  systemctl status videogen-celery-beat"
    echo "  systemctl status nginx"
    echo "  systemctl status redis-server"
    [[ "$ENABLE_OLLAMA" == true ]] && echo "  systemctl status ollama"
    echo
    echo "Logs:"
    echo "  journalctl -u videogen-backend -f"
    echo
    echo "Config:"
    echo "  $INSTALL_DIR/.env"
    echo
    echo "Uncensored Models Available:"
    echo "  Dolphin Mixtral 8x7B, Dolphin Llama3 8B, WizardLM 30B"
    echo "  Nemotron 3 Ultra, OpenHermes 2.5, Zephyr 7B Uncensored"
    echo
    echo "Inference Engines:"
    [[ "$ENABLE_OLLAMA" == true ]] && echo "  ✓ Ollama (port 11434)"
    [[ "$ENABLE_LLAMACPP" == true ]] && echo "  ✓ llama.cpp"
    echo "  ✓ Transformers (chain-block)"
    echo
    log_warn "Edit $INSTALL_DIR/.env to add HUGGINGFACE_TOKEN for private models"
    [[ "$ENABLE_GPU" == true ]] && log_warn "Reboot required for NVIDIA drivers to take effect"
}

main() {
    parse_args "$@"
    check_root
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "VideoGen AI - Debian Server Installation"
    echo "GPU: $ENABLE_GPU | Ollama: $ENABLE_OLLAMA | llama.cpp: $ENABLE_LLAMACPP"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    install_deps
    setup_user_dirs
    copy_project
    install_backend
    install_frontend
    create_env
    setup_systemd
    setup_nginx
    setup_redis
    setup_logrotate
    start_services
    verify_install
    print_summary
}

main "$@"