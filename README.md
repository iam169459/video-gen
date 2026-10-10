# VideoGen AI

A local video generator web application with chain block LLM system, model management, and modern UI/UX.

## Features

- **Video Generation**: Generate videos using Stable Video Diffusion, AnimateDiff, and other models
- **Chain Block LLM System**: Run large language models efficiently with block-wise processing
- **Model Management**: Download, manage, and update AI models from Hugging Face
- **System Monitoring**: Real-time GPU, CPU, memory, and network monitoring
- **Terminal Access**: Built-in system terminal with quick commands
- **Auto Updates**: Automatic update checking and installation
- **Modern UI/UX**: Beautiful, responsive interface built with Next.js and Tailwind CSS

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend       │
│   (Next.js)     │     │   (FastAPI)     │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │  Redis   │ │  Models  │ │  Celery  │
              │  (Cache/ │ │  Storage │ │  Workers │
              │   Queue) │ │          │ │          │
              └──────────┘ └──────────┘ └──────────┘
```

## Quick Start

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-username/video-gen.git
cd video-gen

# Configure environment
cp deployment/docker/.env.example deployment/docker/.env
# Edit .env with your tokens

# Start services
docker-compose -f deployment/docker/docker-compose.yml up -d

# Access at http://localhost:3000
```

### Debian/Ubuntu Installation

```bash
# Run as root
sudo bash deployment/debian/install.sh

# Start services
systemctl start videogen-backend videogen-celery-worker videogen-celery-beat nginx redis-server

# Access at http://your-server-ip
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HUGGINGFACE_TOKEN` | Token for private/gated models | - |
| `GITHUB_TOKEN` | Token for private repo updates | - |
| `UPDATE_CHANNEL` | Update channel (stable/beta/nightly) | stable |
| `AUTO_UPDATE_ENABLED` | Enable automatic updates | false |
| `DEBUG` | Enable debug mode | false |
| `LOG_LEVEL` | Log level (DEBUG/INFO/WARNING/ERROR) | INFO |

### Model Storage

Models are stored in:
- `/var/lib/videogen/models/` (Debian)
- `/app/data/models/` (Docker)

## API Documentation

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key Endpoints

- `POST /api/v1/video/generate` - Generate video
- `GET /api/v1/video/tasks` - List video tasks
- `POST /api/v1/models/download` - Download model
- `GET /api/v1/models/search` - Search models
- `POST /api/v1/chain/generate` - Generate with LLM chain
- `GET /api/v1/system/metrics` - System metrics
- `GET /api/v1/update/check` - Check for updates

## Chain Block System

The chain block system enables running large LLMs by splitting them into smaller blocks:

```python
# Configure chain
chain_config = ChainConfig(
    model_id="meta-llama/Llama-2-7b-chat-hf",
    num_blocks=8,
    block_size=4,
    overlap=1,
    processing_mode=ProcessingMode.SEQUENTIAL,
    offload_to_cpu=True
)

# Use chain
chain = await chain_registry.get_chain(model_id, chain_config)
response = await chain.generate(prompt, max_new_tokens=512)
```

## Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install poetry
poetry install --no-interaction
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Backend
cd backend
poetry run pytest

# Frontend
cd frontend
npm test
```

## Deployment

### Production Checklist

- [ ] Set strong `SECRET_KEY` in config
- [ ] Configure HTTPS with Let's Encrypt
- [ ] Set up firewall rules
- [ ] Configure backup strategy
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure log aggregation
- [ ] Set resource limits for containers

### Scaling

- Increase Celery workers for parallel processing
- Use multiple GPU workers with `CUDA_VISIBLE_DEVICES`
- Add load balancer for high availability
- Use Redis Cluster for large deployments

## Security

- All API endpoints require authentication (configure in production)
- Model downloads verified with checksums
- File uploads restricted to images
- CORS configured for specific origins
- Rate limiting on API endpoints

## Troubleshooting

### GPU Not Detected
```bash
# Check NVIDIA drivers
nvidia-smi

# Check Docker GPU support
docker run --rm --gpus all nvidia/cuda:12.1-base nvidia-smi
```

### Out of Memory
- Reduce `num_blocks` in chain config
- Enable CPU offload
- Use FP16/BF16 precision
- Reduce batch size

### Model Download Fails
- Check Hugging Face token
- Verify network connectivity
- Check disk space
- Review logs: `journalctl -u videogen-backend -f`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: Report bugs and request features
- Discussions: Ask questions and share ideas
- Documentation: Check the wiki for detailed guides