#!/bin/bash
# VideoGen AI - Cross-Platform Installer (Linux/macOS/Windows via WSL)
# Usage: bash install.sh [OPTIONS]

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_MODE="auto"
ENABLE_GPU=false
INSTALL_DIR=""
DATA_DIR=""
SKIP_DEPS=false
SKIP_FRONTEND=false
SKIP_BACKEND=false
DRY_RUN=false
FORCE=false
USE_OLLAMA=false
USE_LLAMA_CPP=false

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_dry() { echo -e "${CYAN}[DRY-RUN]${NC} $1"; }

show_help() {
    cat << 'EOF'
VideoGen AI - Cross-Platform Installer

USAGE:
    bash install.sh [OPTIONS]

OPTIONS:
    -m, --mode MODE         Install mode: auto|dev|minimal|server (default: auto)
    -g, --gpu               Enable GPU acceleration (CUDA/Metal/ROCm)
    -o, --ollama            Install and configure Ollama for local LLMs
    -l, --llama-cpp         Install llama.cpp for local inference
    -i, --install-dir DIR   Installation directory (default: ~/videogen)
    --skip-deps             Skip system dependency installation
    --skip-frontend         Skip frontend build
    --skip-backend          Skip backend install
    --dry-run               Show what would be done
    -f, --force             Force reinstall
    -h, --help              Show help

MODES:
    auto       Auto-detect: dev on PC, server on Linux server
    dev        Development mode - run manually with hot reload
    minimal    Backend API only
    server     Production with systemd (Linux only)

EXAMPLES:
    # Quick install on your PC (Linux/macOS/WSL)
    bash install.sh

    # With Ollama for local LLMs
    bash install.sh --ollama

    # With llama.cpp + GPU
    bash install.sh --llama-cpp --gpu

    # Development mode with hot reload
    bash install.sh --mode dev

    # Windows (run in WSL2)
    wsl bash install.sh

    # Preview what will happen
    bash install.sh --dry-run

FEATURES INCLUDED:
    ✅ Next.js 14 + React 18 + Tailwind CSS frontend
    ✅ FastAPI + Python backend with chain-block LLM system
    ✅ Local model downloader (Hugging Face, Civitai, etc.)
    ✅ Uncensored AI models section
    ✅ Local inference: Ollama, llama.cpp, Transformers
    ✅ Video generation: SVD, AnimateDiff, Hotshot
    ✅ System monitoring + terminal
    ✅ Model management UI with categories
EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--mode) INSTALL_MODE="$2"; shift 2 ;;
            -g|--gpu) ENABLE_GPU=true; shift ;;
            -o|--ollama) USE_OLLAMA=true; shift ;;
            -l|--llama-cpp) USE_LLAMA_CPP=true; shift ;;
            -i|--install-dir) INSTALL_DIR="$2"; shift 2 ;;
            --skip-deps) SKIP_DEPS=true; shift ;;
            --skip-frontend) SKIP_FRONTEND=true; shift ;;
            --skip-backend) SKIP_BACKEND=true; shift ;;
            --dry-run) DRY_RUN=true; shift ;;
            -f|--force) FORCE=true; shift ;;
            -h|--help) show_help; exit 0 ;;
            *) log_error "Unknown: $1"; show_help; exit 1 ;;
        esac
    done
}

detect_os() {
    case "$(uname -s)" in
        Linux*) OS="linux" ;;
        Darwin*) OS="macos" ;;
        CYGWIN*|MINGW*|MSYS*) OS="windows" ;;
        *) OS="unknown" ;;
    esac
    
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        DISTRO=$ID
    fi
    
    ARCH=$(uname -m)
    log_info "Detected: $OS ($DISTRO) $ARCH"
}

detect_mode() {
    if [[ "$INSTALL_MODE" != "auto" ]]; then return; fi
    
    if [[ "$OS" == "linux" && -n "${DISTRO:-}" && "$DISTRO" =~ ^(ubuntu|debian|fedora|arch|rhel|centos)$ ]]; then
        if systemctl is-system-running >/dev/null 2>&1; then
            INSTALL_MODE="server"
        else
            INSTALL_MODE="dev"
        fi
    else
        INSTALL_MODE="dev"
    fi
    log_info "Auto mode: $INSTALL_MODE"
}

check_cmd() { command -v "$1" >/dev/null 2>&1; }

install_deps_linux() {
    log_step "Installing Linux dependencies..."
    if check_cmd apt-get; then
        run_cmd "apt-get update"
        run_cmd "apt-get install -y python3.10 python3.10-venv python3.10-dev python3-pip nodejs npm git ffmpeg curl wget build-essential cmake pkg-config libssl-dev libffi-dev libgl1-mesa-glx libglib2.0-0"
        [[ "$USE_OLLAMA" == true ]] && run_cmd "curl -fsSL https://ollama.ai/install.sh | sh"
    elif check_cmd dnf; then
        run_cmd "dnf install -y python3.10 python3.10-devel nodejs npm git ffmpeg curl wget gcc cmake openssl-devel"
        [[ "$USE_OLLAMA" == true ]] && run_cmd "curl -fsSL https://ollama.ai/install.sh | sh"
    elif check_cmd pacman; then
        run_cmd "pacman -Sy --noconfirm python nodejs npm git ffmpeg curl wget base-devel cmake openssl"
        [[ "$USE_OLLAMA" == true ]] && run_cmd "curl -fsSL https://ollama.ai/install.sh | sh"
    fi
}

install_deps_macos() {
    log_step "Installing macOS dependencies..."
    if ! check_cmd brew; then
        log_error "Homebrew required. Install from https://brew.sh"
        exit 1
    fi
    run_cmd "brew install python@3.10 node ffmpeg git cmake"
    [[ "$USE_OLLAMA" == true ]] && run_cmd "brew install ollama"
    [[ "$USE_LLAMA_CPP" == true ]] && run_cmd "brew install llama.cpp"
}

install_deps_windows() {
    log_step "Windows detected - use WSL2 for best experience"
    log_info "Run: wsl --install"
    log_info "Then run this script inside WSL"
    exit 1
}

run_cmd() {
    if [[ "$DRY_RUN" == true ]]; then
        log_dry "$1"
    else
        eval "$1"
    fi
}

setup_dirs() {
    log_step "Setting up directories..."
    INSTALL_DIR="${INSTALL_DIR:-$HOME/videogen}"
    DATA_DIR="${DATA_DIR:-$HOME/videogen-data}"
    
    run_cmd "mkdir -p $INSTALL_DIR $DATA_DIR/{models,outputs,temp,logs,cache,uncensored,llm,video,lora,embeddings}"
}

copy_project() {
    log_step "Copying project..."
    REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    run_cmd "rsync -a --exclude='.git' --exclude='venv' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' --exclude='.next' --exclude='out' '$REPO_DIR/' '$INSTALL_DIR/'"
}

install_backend() {
    [[ "$SKIP_BACKEND" == true ]] && return
    log_step "Installing Python backend..."
    run_cmd "cd $INSTALL_DIR && python3.10 -m venv venv"
    run_cmd "cd $INSTALL_DIR && source venv/bin/activate && pip install --upgrade pip setuptools wheel && pip install -r backend/requirements.txt"
    
    # Install local inference engines
    if [[ "$USE_LLAMA_CPP" == true ]]; then
        run_cmd "cd $INSTALL_DIR && source venv/bin/activate && pip install llama-cpp-python"
    fi
}

install_frontend() {
    [[ "$SKIP_FRONTEND" == true ]] && return
    log_step "Building frontend..."
    run_cmd "cd $INSTALL_DIR/frontend && npm ci && npm run build"
}

create_env() {
    log_step "Creating config..."
    cat > "$INSTALL_DIR/.env" << EOF
# VideoGen AI Config
HUGGINGFACE_TOKEN=
GITHUB_TOKEN=
UPDATE_CHANNEL=stable
AUTO_UPDATE_ENABLED=false
DEBUG=true
LOG_LEVEL=DEBUG

# Local Inference
USE_OLLAMA=$USE_OLLAMA
USE_LLAMA_CPP=$USE_LLAMA_CPP
OLLAMA_HOST=http://localhost:11434
LLAMA_CPP_PATH=$INSTALL_DIR/venv/bin/llama-cli

# Paths
MODELS_DIR=$DATA_DIR/models
OUTPUT_DIR=$DATA_DIR/outputs
UNCENSORED_DIR=$DATA_DIR/uncensored
LLM_DIR=$DATA_DIR/llm
VIDEO_DIR=$DATA_DIR/video
LORA_DIR=$DATA_DIR/lora
EMBEDDINGS_DIR=$DATA_DIR/embeddings

# GPU
ENABLE_GPU=$ENABLE_GPU
EOF
}

create_start_scripts() {
    log_step "Creating start scripts..."
    
    # Backend start
    cat > "$INSTALL_DIR/start-backend.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
export PYTHONPATH="$(pwd)"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
EOF
    
    # Frontend start
    cat > "$INSTALL_DIR/start-frontend.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/frontend"
npm run dev
EOF
    
    # Combined start
    cat > "$INSTALL_DIR/start.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "Starting VideoGen AI..."
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo "API Docs: http://localhost:8000/docs"
echo

# Start backend
source venv/bin/activate
export PYTHONPATH="$(pwd)"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start frontend
cd frontend
npm run dev &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
EOF
    
    # Ollama model pull script
    cat > "$INSTALL_DIR/pull-models.sh" << 'EOF'
#!/bin/bash
# Pull recommended models for uncensored/local AI

MODELS=(
    # Uncensored LLMs
    "dolphin-mixtral:8x7b"
    "dolphin-llama3:8b"
    "nemotron-3-ultra"
    "wizardlm-uncensored:30b"
    "openhermes:7b"
    "zephyr-uncensored:7b"
    
    # Code models
    "codellama:34b"
    "deepseek-coder:33b"
    "starcoder2:15b"
    
    # Vision models
    "llava:34b"
    "bakllava:7b"
)

echo "Pulling recommended models..."
for model in "${MODELS[@]}"; do
    echo "Pulling $model..."
    ollama pull "$model"
done

echo "Done! Models available in VideoGen AI"
EOF
    
    run_cmd "chmod +x $INSTALL_DIR/start-backend.sh $INSTALL_DIR/start-frontend.sh $INSTALL_DIR/start.sh $INSTALL_DIR/pull-models.sh"
}

print_summary() {
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "VideoGen AI Ready!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Install: $INSTALL_DIR"
    echo "Data: $DATA_DIR"
    echo
    echo "🚀 Quick Start:"
    echo "  cd $INSTALL_DIR"
    echo "  ./start.sh"
    echo
    echo "📦 Or run separately:"
    echo "  ./start-backend.sh  # API on :8000"
    echo "  ./start-frontend.sh # UI on :3000"
    echo
    if [[ "$USE_OLLAMA" == true ]]; then
        echo "🤖 Ollama models:"
        echo "  ./pull-models.sh    # Pull uncensored models"
        echo "  ollama list         # List installed"
    fi
    echo
    echo "🌐 Open: http://localhost:3000"
    echo "📚 API: http://localhost:8000/docs"
    echo
    echo "🎯 Features:"
    echo "  • Model browser with categories (Uncensored, Coding, Vision, etc.)"
    echo "  • Local download queue with progress"
    echo "  • Video generation (SVD, AnimateDiff, Hotshot)"
    echo "  • Chain-block LLM for large models"
    echo "  • System monitoring + terminal"
    echo "  • Uncensored AI dedicated section"
}

main() {
    parse_args "$@"
    detect_os
    detect_mode
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "VideoGen AI Installer"
    echo "OS: $OS | Mode: $INSTALL_MODE | GPU: $ENABLE_GPU"
    [[ "$USE_OLLAMA" == true ]] && echo "Ollama: enabled"
    [[ "$USE_LLAMA_CPP" == true ]] && echo "llama.cpp: enabled"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    [[ "$DRY_RUN" == true ]] && log_warn "DRY RUN - no changes"
    echo
    
    [[ "$SKIP_DEPS" == false ]] && {
        case $OS in
            linux) install_deps_linux ;;
            macos) install_deps_macos ;;
            windows) install_deps_windows ;;
        esac
    }
    
    setup_dirs
    copy_project
    install_backend
    install_frontend
    create_env
    create_start_scripts
    print_summary
}

main "$@"