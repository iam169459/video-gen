#!/bin/bash
# VideoGen AI Update Script
# Run as videogen user or root

set -euo pipefail

INSTALL_DIR="/opt/videogen"
DATA_DIR="/var/lib/videogen"
SERVICE_USER="videogen"
GITHUB_REPO="your-username/video-gen"
UPDATE_CHANNEL="stable"

log_info() {
    echo -e "\033[0;32m[INFO]\033[0m $1"
}

log_warn() {
    echo -e "\033[1;33m[WARN]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

check_github_cli() {
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) not installed. Install it first."
        exit 1
    fi
}

check_auth() {
    if ! gh auth status &> /dev/null; then
        log_error "Not authenticated with GitHub. Run 'gh auth login' first."
        exit 1
    fi
}

get_latest_release() {
    local channel=$1
    local query=""
    
    if [[ "$channel" == "stable" ]]; then
        query="--json tagName,assets,body,publishedAt --jq '.[] | select(.prerelease == false and .draft == false) | {tagName, assets, body, publishedAt}'"
    else
        query="--json tagName,assets,body,publishedAt,prerelease --jq '.[] | select(.prerelease == true or .draft == false) | {tagName, assets, body, publishedAt, prerelease}'"
    fi
    
    gh api repos/$GITHUB_REPO/releases $query | head -1
}

download_and_extract() {
    local asset_url=$1
    local dest_dir=$2
    
    log_info "Downloading update from $asset_url"
    curl -L -o /tmp/update.tar.gz "$asset_url"
    
    log_info "Extracting update..."
    mkdir -p "$dest_dir"
    tar -xzf /tmp/update.tar.gz -C "$dest_dir"
    
    if [[ -f "$dest_dir/install.sh" ]]; then
        log_info "Running install script..."
        chmod +x "$dest_dir/install.sh"
        "$dest_dir/install.sh"
    fi
}

backup_current() {
    local backup_dir="/tmp/videogen-backup-$(date +%Y%m%d-%H%M%S)"
    log_info "Creating backup at $backup_dir"
    mkdir -p "$backup_dir"
    cp -r "$INSTALL_DIR/app" "$backup_dir/" 2>/dev/null || true
    cp -r "$INSTALL_DIR/frontend" "$backup_dir/" 2>/dev/null || true
    cp "$INSTALL_DIR/.env" "$backup_dir/" 2>/dev/null || true
    echo "$backup_dir"
}

restore_backup() {
    local backup_dir=$1
    log_warn "Restoring from backup: $backup_dir"
    cp -r "$backup_dir/app" "$INSTALL_DIR/" 2>/dev/null || true
    cp -r "$backup_dir/frontend" "$INSTALL_DIR/" 2>/dev/null || true
    cp "$backup_dir/.env" "$INSTALL_DIR/" 2>/dev/null || true
}

update_backend() {
    log_info "Updating backend..."
    
    cd "$INSTALL_DIR"
    
    # Pull latest code
    if [[ -d .git ]]; then
        git fetch origin
        git checkout main
        git pull origin main
    else
        log_warn "Not a git repository, skipping git pull"
    fi
    
    # Update dependencies
    source venv/bin/activate
    poetry install --only=main --no-interaction --no-ansi
    
    # Run migrations if any
    # python -m alembic upgrade head 2>/dev/null || true
}

update_frontend() {
    log_info "Updating frontend..."
    
    cd "$INSTALL_DIR/frontend"
    
    # Pull latest code
    if [[ -d .git ]]; then
        git fetch origin
        git checkout main
        git pull origin main
    fi
    
    # Install dependencies and build
    npm ci
    npm run build
}

restart_services() {
    log_info "Restarting services..."
    
    systemctl --user daemon-reload 2>/dev/null || sudo systemctl daemon-reload
    
    # Restart backend services
    sudo systemctl restart videogen-backend
    sudo systemctl restart videogen-celery-worker
    sudo systemctl restart videogen-celery-beat
    
    # Restart nginx
    sudo systemctl reload nginx
    
    log_info "Services restarted"
}

health_check() {
    log_info "Performing health check..."
    
    sleep 5
    
    for i in {1..10}; do
        if curl -sf http://localhost:8000/api/v1/health > /dev/null; then
            log_info "Health check passed"
            return 0
        fi
        log_info "Waiting for service... ($i/10)"
        sleep 3
    done
    
    log_error "Health check failed"
    return 1
}

main() {
    local channel="${1:-$UPDATE_CHANNEL}"
    local force="${2:-false}"
    
    log_info "Starting update (channel: $channel)..."
    
    check_github_cli
    check_auth
    
    # Create backup
    local backup_dir=$(backup_current)
    
    # Get latest release
    local release_info=$(get_latest_release "$channel")
    
    if [[ -z "$release_info" ]]; then
        log_info "No new release found for channel: $channel"
        exit 0
    fi
    
    local version=$(echo "$release_info" | jq -r '.tagName')
    log_info "Found version: $version"
    
    # Check if already on this version
    local current_version="1.0.0"
    if [[ -f "$INSTALL_DIR/VERSION" ]]; then
        current_version=$(cat "$INSTALL_DIR/VERSION")
    fi
    
    if [[ "$current_version" == "$version" && "$force" != "true" ]]; then
        log_info "Already on version $version. Use 'force' to reinstall."
        exit 0
    fi
    
    # Find backend asset
    local backend_asset=$(echo "$release_info" | jq -r '.assets[] | select(.name | contains("backend")) | .browser_download_url' | head -1)
    local frontend_asset=$(echo "$release_info" | jq -r '.assets[] | select(.name | contains("frontend")) | .browser_download_url' | head -1)
    
    if [[ -n "$backend_asset" ]]; then
        download_and_extract "$backend_asset" "$INSTALL_DIR"
    else
        log_warn "No backend asset found, updating from git..."
        update_backend
    fi
    
    if [[ -n "$frontend_asset" ]]; then
        download_and_extract "$frontend_asset" "$INSTALL_DIR/frontend"
    else
        log_warn "No frontend asset found, updating from git..."
        update_frontend
    fi
    
    # Save version
    echo "$version" > "$INSTALL_DIR/VERSION"
    
    # Restart services
    restart_services
    
    # Health check
    if health_check; then
        log_info "Update completed successfully to version $version"
    else
        log_error "Update failed, restoring backup..."
        restore_backup "$backup_dir"
        restart_services
        exit 1
    fi
}

main "$@"