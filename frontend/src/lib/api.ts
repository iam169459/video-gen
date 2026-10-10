import axios, { AxiosInstance, AxiosError } from "axios";
import type {
  VideoGenerationParams,
  VideoGenerationResult,
  VideoModelInfo,
  DownloadProgress,
  ModelInfo,
  SystemMetrics,
  UpdateInfo,
  UpdateProgress,
  ChainGenerateRequest,
  ChainStats,
  HealthResponse,
  Settings,
  CuratedCategory,
  InferenceEngineInfo,
  ModelRunResponse,
} from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 300000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error("API Error:", error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get("/health");
    return response.data;
  }

  async listVideoModels(): Promise<VideoModelInfo[]> {
    const response = await this.client.get("/video/models");
    return response.data;
  }

  async generateVideo(params: VideoGenerationParams): Promise<{ task_id: string; status: string; message: string }> {
    const response = await this.client.post("/video/generate", params);
    return response.data;
  }

  async listVideoTasks(status?: string): Promise<VideoGenerationResult[]> {
    const response = await this.client.get("/video/tasks", { params: { status } });
    return response.data;
  }

  async getVideoTask(taskId: string): Promise<VideoGenerationResult> {
    const response = await this.client.get(`/video/tasks/${taskId}`);
    return response.data;
  }

  async downloadVideo(taskId: string): Promise<Blob> {
    const response = await this.client.get(`/video/tasks/${taskId}/download`, {
      responseType: "blob",
    });
    return response.data;
  }

  async previewVideo(taskId: string): Promise<Blob> {
    const response = await this.client.get(`/video/tasks/${taskId}/preview`, {
      responseType: "blob",
    });
    return response.data;
  }

  async cancelVideoTask(taskId: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/video/tasks/${taskId}`);
    return response.data;
  }

  async chainGenerate(request: ChainGenerateRequest): Promise<any> {
    const response = await this.client.post("/chain/generate", request);
    return response.data;
  }

  async getChainStats(): Promise<Record<string, ChainStats>> {
    const response = await this.client.get("/chain/stats");
    return response.data;
  }

  async releaseChain(modelId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/chain/release/${modelId}`);
    return response.data;
  }

  async downloadModel(modelId: string, modelType: string, revision?: string, forceRedownload?: boolean): Promise<{ download_id: string }> {
    const response = await this.client.post("/models/download", {
      model_id: modelId,
      model_type: modelType,
      revision,
      force_redownload: forceRedownload,
    });
    return response.data;
  }

  async listDownloads(status?: string): Promise<DownloadProgress[]> {
    const response = await this.client.get("/models/downloads", { params: { status } });
    return response.data;
  }

  async getDownloadProgress(downloadId: string): Promise<DownloadProgress> {
    const response = await this.client.get(`/models/downloads/${downloadId}`);
    return response.data;
  }

  async pauseDownload(downloadId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/models/downloads/${downloadId}/pause`);
    return response.data;
  }

  async resumeDownload(downloadId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/models/downloads/${downloadId}/resume`);
    return response.data;
  }

  async cancelDownload(downloadId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/models/downloads/${downloadId}/cancel`);
    return response.data;
  }

  async searchModels(query: string, modelType?: string, limit?: number): Promise<ModelInfo[]> {
    const response = await this.client.get("/models/search", {
      params: { query, model_type: modelType, limit },
    });
    return response.data;
  }

  async listLocalModels(): Promise<ModelInfo[]> {
    const response = await this.client.get("/models/local");
    return response.data;
  }

  async deleteLocalModel(modelId: string, modelType: string): Promise<{ message: string }> {
    const response = await this.client.delete("/models/local/" + modelId, {
      params: { model_type: modelType },
    });
    return response.data;
  }

  async getSettings(): Promise<Settings> {
    const response = await this.client.get("/settings");
    return response.data;
  }

  async updateSettings(settings: Settings): Promise<{ message: string }> {
    const response = await this.client.post("/settings", { settings });
    return response.data;
  }

  async getSetting(key: string): Promise<{ key: string; value: any }> {
    const response = await this.client.get(`/settings/${key}`);
    return response.data;
  }

  async setSetting(key: string, value: any): Promise<{ message: string }> {
    const response = await this.client.put(`/settings/${key}`, { value });
    return response.data;
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const response = await this.client.get("/system/metrics");
    return response.data;
  }

  async checkUpdates(force?: boolean): Promise<{ update_available: boolean; version?: string; current_version?: string } & Partial<UpdateInfo>> {
    const response = await this.client.get("/update/check", { params: { force } });
    return response.data;
  }

  async installUpdate(): Promise<{ message: string }> {
    const response = await this.client.post("/update/install");
    return response.data;
  }

  async getUpdateProgress(): Promise<UpdateProgress> {
    const response = await this.client.get("/update/progress");
    return response.data;
  }

  async getUpdateChannel(): Promise<{ channel: string }> {
    const response = await this.client.get("/update/channel");
    return response.data;
  }

  async setUpdateChannel(channel: string): Promise<{ message: string }> {
    const response = await this.client.put("/update/channel", { channel });
    return response.data;
  }

  async uploadImage(file: File): Promise<{ base64: string; width: number; height: number }> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await this.client.post("/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  }

  async getCuratedModels(): Promise<CuratedCategory[]> {
    const response = await this.client.get("/models/curated");
    return response.data;
  }

  async listInferenceEngines(): Promise<InferenceEngineInfo[]> {
    const response = await this.client.get("/inference/engines");
    return response.data;
  }

  async runModel(modelId: string, engine: string, prompt: string, maxTokens: number = 512, temperature: number = 0.7): Promise<ModelRunResponse> {
    const response = await this.client.post("/inference/run", {
      model_id: modelId,
      engine,
      prompt,
      max_tokens: maxTokens,
      temperature,
    });
    return response.data;
  }

  async runModelStream(modelId: string, engine: string, prompt: string, maxTokens: number = 512, temperature: number = 0.7): Promise<ReadableStream> {
    const response = await this.client.post("/inference/run/stream", {
      model_id: modelId,
      engine,
      prompt,
      max_tokens: maxTokens,
      temperature,
    }, {
      responseType: "stream",
    });
    return response.data;
  }

  async getLocalModelInfo(modelId: string): Promise<any> {
    const response = await this.client.get(`/models/local/${modelId}/info`);
    return response.data;
  }
}

export const api = new ApiClient();