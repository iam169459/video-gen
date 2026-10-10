export type VideoModelType = 
  | "stable_video_diffusion"
  | "stable_video_diffusion_xt"
  | "animatediff"
  | "animatediff_lightning"
  | "hotshot_xl"
  | "custom";

export type VideoGenerationStatus = 
  | "pending"
  | "queued"
  | "preprocessing"
  | "generating"
  | "postprocessing"
  | "completed"
  | "failed";

export type DownloadStatus = 
  | "pending"
  | "queued"
  | "downloading"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export type ModelType = 
  | "llm"
  | "video"
  | "vae"
  | "controlnet"
  | "lora"
  | "embedding"
  | "other";

export type UpdateChannel = "stable" | "beta" | "nightly";
export type UpdateStatus = "checking" | "available" | "downloading" | "installing" | "completed" | "failed" | "up_to_date";
export type SystemComponent = "backend" | "frontend" | "models" | "dependencies" | "docker" | "system";

export interface VideoGenerationParams {
  prompt: string;
  negative_prompt?: string;
  image?: string;
  image_path?: string;
  model_type: VideoModelType;
  model_id?: string;
  num_frames: number;
  fps: number;
  width: number;
  height: number;
  num_inference_steps: number;
  guidance_scale: number;
  motion_bucket_id: number;
  noise_aug_strength: number;
  seed?: number;
  decode_chunk_size: number;
  output_format: "mp4" | "gif" | "webm";
  quality: "low" | "medium" | "high";
}

export interface VideoGenerationResult {
  task_id: string;
  status: VideoGenerationStatus;
  params: VideoGenerationParams;
  output_path?: string;
  preview_path?: string;
  error?: string;
  progress: number;
  current_step: number;
  total_steps: number;
  start_time: string;
  end_time?: string;
  metadata?: Record<string, any>;
}

export interface VideoModelInfo {
  type: VideoModelType;
  id: string;
  name: string;
  description: string;
  resolution: [number, number];
  max_frames: number;
  recommended_fps: number;
  vram_required_gb: number;
  features: string[];
}

export interface DownloadProgress {
  download_id: string;
  model_id: string;
  model_type: ModelType;
  status: DownloadStatus;
  total_bytes: number;
  downloaded_bytes: number;
  speed_bps: number;
  eta_seconds: number;
  progress_percent: number;
  current_file: string;
  files_completed: number;
  total_files: number;
  error?: string;
  started_at: string;
  completed_at?: string;
  local_path?: string;
}

export interface ModelInfo {
  model_id: string;
  model_type: ModelType;
  name: string;
  description: string;
  size_gb: number;
  required_vram_gb: number;
  tags: string[];
  license: string;
  author: string;
  last_updated: string;
  download_count: number;
  likes: number;
  pipeline_tag?: string;
  library_name?: string;
  card_data?: Record<string, any>;
  local_path?: string;
  is_downloaded: boolean;
  version?: string;
  sha?: string;
}

export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  gpu_count: number;
  gpu_metrics: GPUMetric[];
  network_io: {
    bytes_sent_per_sec: number;
    bytes_recv_per_sec: number;
  };
  timestamp: string;
}

export interface GPUMetric {
  id: number;
  name: string;
  load: number;
  memory_used: number;
  memory_total: number;
  memory_percent: number;
  temperature: number;
}

export interface UpdateInfo {
  version: string;
  channel: UpdateChannel;
  release_notes: string;
  download_url: string;
  size_mb: number;
  required: boolean;
  components: SystemComponent[];
  release_date: string;
  checksum: string;
}

export interface UpdateProgress {
  status: UpdateStatus;
  progress_percent: number;
  current_step: string;
  total_steps: number;
  current_step_num: number;
  downloaded_bytes: number;
  total_bytes: number;
  speed_mbps: number;
  eta_seconds: number;
  error?: string;
}

export interface ChainGenerateRequest {
  model_id: string;
  prompt: string;
  max_new_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  chain_config?: {
    num_blocks?: number;
    block_size?: number;
    overlap?: number;
    processing_mode?: "sequential" | "pipeline" | "parallel";
    offload_to_cpu?: boolean;
  };
}

export interface ChainStats {
  model_id: string;
  initialized: boolean;
  total_blocks: number;
  loaded_blocks: number;
  total_memory_mb: number;
  blocks: Record<string, {
    status: string;
    memory_mb: number;
    layer_range: [number, number];
    compute_time: number;
  }>;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime_seconds: number;
  components: Record<string, string>;
}

export interface Settings {
  [key: string]: any;
}