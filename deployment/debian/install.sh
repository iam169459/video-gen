#!/bin/bash
# VideoGen AI - Flexible Installer with Options
# Usage: sudo bash install.sh [OPTIONS]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Defaults
INSTALL_MODE="production"
ENABLE_GPU=false
ENABLE_DOCKER=false
ENABLE_AUTO_UPDATE=false
UPDATE_CHANNEL="stable"
INSTALL_DIR="/opt/videogen"
DATA_DIR="/var/lib/videogen"
LOG_DIR="/var/log/videogen"
SERVICE_USER="videogen"
SKIP_DEPS=false
SKIP_FRONTEND=false
SKIP_BACKEND=false
DRY_RUN=false
FORCE=false

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_dry() { echo -e "${CYAN}[DRY-RUN]${NC} $1"; }

show_help() {
    cat << EOF
VideoGen AI Installer

USAGE:
    sudo bash install.sh [OPTIONS]

OPTIONS:
    -m, --mode MODE         Install mode: production|development|minimal (default: production)
    -g, --gpu               Enable GPU support (install NVIDIA drivers)
    -d, --docker            Use Docker deployment instead of native
    -u, --auto-update       Enable automatic updates from GitHub
    -c, --channel CHANNEL   Update channel: stable|beta|nightly (default: stable)
    -i, --install-dir DIR   Installation directory (default: /opt/videogen)
    --skip-deps             Skip system dependency installation
    --skip-frontend         Skip frontend build
    --skip-backend          Skip backend install
    --dry-run               Show what would be done without executing
    -f, --force             Force reinstall (overwrite existing)
    -h, --help              Show this help

MODES:
    production  Full install with systemd, nginx, redis, all services
    development Install for local dev (no systemd, run manually)
    minimal     Backend only, no frontend, no nginx

EXAMPLES:
    # Production install with GPU
    sudo bash install.sh --mode production --gpu

    # Development install (current user, no sudo services)
    bash install.sh --mode development

    # Minimal backend only
    sudo bash install.sh --mode minimal

    # Docker deployment
    sudo bash install.sh --docker

    # Dry run to preview
    bash install.sh --dry-run --mode production --gpu

EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--mode) INSTALL_MODE="$2"; shift 2 ;;
            -g|--gpu) ENABLE_GPU=true; shift ;;
            -d|--docker) ENABLE_DOCKER=true; shift ;;
            -u|--auto-update) ENABLE_AUTO_UPDATE=true; shift ;;
            -c|--channel) UPDATE_CHANNEL="$2"; shift 2 ;;
            -i|--install-dir) INSTALL_DIR="$2"; shift 2 ;;
            --skip-deps) SKIP_DEPS=true; shift ;;
            --skip-frontend) SKIP_FRONTEND=true; shift ;;
            --skip-backend) SKIP_BACKEND=true; shift ;;
            --dry-run) DRY_RUN=true; shift ;;
            -f|--force) FORCE=true; shift ;;
            -h|--help) show_help; exit 0 ;;
            *) log_error "Unknown option: $1"; show_help; exit 1 ;;
        esac
    done
}

validate_args() {
    [[ "$INSTALL_MODE" =~ ^(production|development|minimal)$ ]] || { log_error "Invalid mode: $INSTALL_MODE"; exit 1; }
    [[ "$UPDATE_CHANNEL" =~ ^(stable|beta|nightly)$ ]] || { log_error "Invalid channel: $UPDATE_CHANNEL"; exit 1; }
    
    if [[ "$ENABLE_DOCKER" == true && "$INSTALL_MODE" != "production" ]]; then
        log_warn "Docker mode forces production install"
        INSTALL_MODE="production"
    fi
}

run_cmd() {
    if [[ "$DRY_RUN" == true ]]; then
        log_dry "$1"
    else
        eval "$1"
    fi
}

check_root() {
    if [[ $EUID -ne 0 && "$INSTALL_MODE" == "production" && "$ENABLE_DOCKER" == false ]]; then
        log_error "Production mode requires root. Use --mode development for non-root install."
        exit 1
    fi
}

install_system_deps() {
    log_step "Installing system dependencies..."
    local pkgs=(
        python3.10 python3.10-venv python3.10-dev python3-pip
        nodejs npm git ffmpeg
        libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1
        build-essential cmake pkg-config libssl-dev libffi-dev
    )
    
    if [[ "$INSTALL_MODE" == "production" ]]; then
        pkgs+=(redis-server nginx supervisor logrotate)
    fi
    
    if [[ "$ENABLE_GPU" == true ]]; then
        pkgs+=(nvidia-driver-550 nvidia-container-toolkit)
    fi
    
    run_cmd "apt-get update"
    run_cmd "apt-get install -y ${pkgs[*]}"
}

setup_user_dirs() {
    log_step "Setting up user and directories..."
    
    if [[ "$INSTALL_MODE" == "development" ]]; then
        SERVICE_USER="$USER"
        INSTALL_DIR="${INSTALL_DIR:-$HOME/videogen}"
        DATA_DIR="${DATA_DIR:-$HOME/videogen-data}"
        LOG_DIR="${LOG_DIR:-$HOME/videogen-logs}"
    fi
    
    run_cmd "id $SERVICE_USER &>/dev/null || useradd -r -s /bin/bash -d $INSTALL_DIR -m $SERVICE_USER"
    run_cmd "mkdir -p $INSTALL_DIR $DATA_DIR/{models,outputs,temp,logs,cache} $LOG_DIR"
    run_cmd "chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR $DATA_DIR $LOG_DIR 2>/dev/null || true"
}

copy_project() {
    log_step "Copying project files..."
    local REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    run_cmd "rsync -a --exclude='.git' --exclude='venv' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' '$REPO_DIR/' '$INSTALL_DIR/'"
    run_cmd "chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR"
}

install_backend() {
    [[ "$SKIP_BACKEND" == true ]] && { log_info "Skipping backend install"; return; }
    log_step "Installing Python backend..."
    
    run_cmd "sudo -u $SERVICE_USER bash -c '
        cd $INSTALL_DIR
        python3.10 -m venv venv
        source venv/bin/activate
        pip install --upgrade pip setuptools wheel
        cd backend
        pip install -r requirements.txt
    '"
}

install_frontend() {
    [[ "$SKIP_FRONTEND" == true || "$INSTALL_MODE" == "minimal" ]] && { log_info "Skipping frontend build"; return; }
    log_step "Building frontend..."
    
    run_cmd "sudo -u $SERVICE_USER bash -c '
        cd $INSTALL_DIR/frontend
        npm ci
        npm run build
    '"
}

create_env() {
    log_step "Creating environment file..."
    run_cmd "cat > $INSTALL_DIR/.env << EOF
HUGGINGFACE_TOKEN=
GITHUB_TOKEN=
UPDATE_CHANNEL=$UPDATE_CHANNEL
AUTO_UPDATE_ENABLED=$ENABLE_AUTO_UPDATE
DEBUG=$([[ "$INSTALL_MODE" == "development" ]] && echo true || echo false)
LOG_LEVEL=$([[ "$INSTALL_MODE" == "development" ]] && echo DEBUG || echo INFO)
EOF
    chown $SERVICE_USER:$SERVICE_USER $INSTALL_DIR/.env
    chmod 600 $INSTALL_DIR/.env"
}

setup_systemd() {
    [[ "$INSTALL_MODE" != "production" ]] && { log_info "Skipping systemd (not production mode)"; return; }
    log_step "Setting up systemd services..."
    
    run_cmd "cat > /etc/systemd/system/videogen-backend.service << 'EOF'
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
EOF"

    run_cmd "cat > /etc/systemd/system/videogen-celery-worker.service << 'EOF'
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
EOF"

    run_cmd "cat > /etc/systemd/system/videogen-celery-beat.service << 'EOF'
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
EOF"
}

setup_nginx() {
    [[ "$INSTALL_MODE" != "production" ]] && { log_info "Skipping nginx (not production mode)"; return; }
    log_step "Configuring Nginx..."
    
    run_cmd "cat > /etc/nginx/sites-available/videogen << 'EOF'
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
    
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
    
    client_max_body_size 50G;
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF"
    run_cmd "ln -sf /etc/nginx/sites-available/videogen /etc/nginx/sites-enabled/"
    run_cmd "rm -f /etc/nginx/sites-enabled/default"
    run_cmd "nginx -t"
    run_cmd "systemctl enable nginx"
    run_cmd "systemctl restart nginx"
}

setup_redis() {
    [[ "$INSTALL_MODE" != "production" ]] && { log_info "Skipping Redis config (not production mode)"; return; }
    log_step "Configuring Redis..."
    
    run_cmd "sed -i 's/^# maxmemory <bytes>/maxmemory 2gb/' /etc/redis/redis.conf"
    run_cmd "sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf"
    run_cmd "systemctl enable redis-server"
    run_cmd "systemctl restart redis-server"
}

start_services() {
    [[ "$INSTALL_MODE" != "production" ]] && { log_info "Skipping service start (not production mode)"; return; }
    log_step "Starting services..."
    
    run_cmd "systemctl daemon-reload"
    run_cmd "systemctl enable videogen-backend videogen-celery-worker videogen-celery-beat"
    run_cmd "systemctl start videogen-backend videogen-celery-worker videogen-celery-beat"
}

verify_install() {
    [[ "$INSTALL_MODE" != "production" ]] && return
    log_step "Verifying installation..."
    sleep 3
    
    for svc in videogen-backend videogen-celery-worker videogen-celery-beat nginx redis-server; do
        if run_cmd "systemctl is-active --quiet $svc"; then
            log_info "✓ $svc running"
        else
            log_error "✗ $svc failed"
        fi
    done
}

print_summary() {
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "VideoGen AI Installation Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [[ "$INSTALL_MODE" == "development" ]]; then
        echo "Mode: Development"
        echo "Install dir: $INSTALL_DIR"
        echo
        echo "To start manually:"
        echo "  cd $INSTALL_DIR"
        echo "  source venv/bin/activate"
        echo "  python -m uvicorn app.main:app --reload  # Backend"
        echo "  cd frontend && npm run dev               # Frontend"
    else
        echo "Mode: Production"
        echo "Web UI: http://$(hostname -I | awk '{print $1}')"
        echo "API: http://$(hostname -I | awk '{print $1}'):8000/docs"
        echo
        echo "Services:"
        echo "  systemctl status videogen-backend"
        echo "  systemctl status videogen-celery-worker"
        echo "  systemctl status videogen-celery-beat"
        echo
        echo "Logs:"
        echo "  journalctl -u videogen-backend -f"
    fi
    echo
    echo "Config: $INSTALL_DIR/.env"
    echo "Models: $DATA_DIR/models"
    echo "Outputs: $DATA_DIR/outputs"
    echo
    log_warn "Edit $INSTALL_DIR/.env to add HUGGINGFACE_TOKEN"
}

main() {
    parse_args "$@"
    validate_args
    check_root
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "VideoGen AI Installer"
    echo "Mode: $INSTALL_MODE | GPU: $ENABLE_GPU | Docker: $ENABLE_DOCKER"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    
    if [[ "$DRY_RUN" == true ]]; then
        log_warn "DRY RUN MODE - No changes will be made"
        echo
    fi
    
    [[ "$SKIP_DEPS" == false ]] && install_system_deps
    setup_user_dirs
    copy_project
    install_backend
    install_frontend
    create_env
    setup_systemd
    setup_nginx
    setup_redis
    start_services
    verify_install
    print_summary
}

main "$@"