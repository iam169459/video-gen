import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  VideoGenerationResult,
  VideoModelInfo,
  DownloadProgress,
  ModelInfo,
  SystemMetrics,
  UpdateProgress,
  VideoGenerationParams,
} from "@/types";

export const useSettingsStore = create<{
  settings: Record<string, any>;
  setSettings: (settings: Record<string, any>) => void;
  updateSetting: (key: string, value: any) => void;
}>()(
  persist(
    (set) => ({
      settings: {},
      setSettings: (settings) => set({ settings }),
      updateSetting: (key, value) =>
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        })),
    }),
    {
      name: "settings-store",
    }
  )
);

interface VideoState {
  tasks: VideoGenerationResult[];
  selectedTask: VideoGenerationResult | null;
  models: VideoModelInfo[];
  isGenerating: boolean;
  currentParams: VideoGenerationParams | null;
  
  setTasks: (tasks: VideoGenerationResult[]) => void;
  addTask: (task: VideoGenerationResult) => void;
  updateTask: (taskId: string, updates: Partial<VideoGenerationResult>) => void;
  removeTask: (taskId: string) => void;
  setSelectedTask: (task: VideoGenerationResult | null) => void;
  setModels: (models: VideoModelInfo[]) => void;
  setGenerating: (generating: boolean) => void;
  setCurrentParams: (params: VideoGenerationParams | null) => void;
  clearCompletedTasks: () => void;
}

export const useVideoStore = create<VideoState>()(
  persist(
    (set) => ({
      tasks: [],
      selectedTask: null,
      models: [],
      isGenerating: false,
      currentParams: null,
      
      setTasks: (tasks) => set({ tasks }),
      addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
      updateTask: (taskId, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.task_id === taskId ? { ...t, ...updates } : t
          ),
          selectedTask:
            state.selectedTask?.task_id === taskId
              ? { ...state.selectedTask, ...updates }
              : state.selectedTask,
        })),
      removeTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((t) => t.task_id !== taskId),
          selectedTask:
            state.selectedTask?.task_id === taskId ? null : state.selectedTask,
        })),
      setSelectedTask: (task) => set({ selectedTask: task }),
      setModels: (models) => set({ models }),
      setGenerating: (generating) => set({ isGenerating: generating }),
      setCurrentParams: (params) => set({ currentParams: params }),
      clearCompletedTasks: () =>
        set((state) => ({
          tasks: state.tasks.filter(
            (t) => t.status !== "completed" && t.status !== "failed"
          ),
        })),
    }),
    {
      name: "video-store",
      partialize: (state) => ({
        currentParams: state.currentParams,
      }),
    }
  )
);

interface DownloadState {
  downloads: DownloadProgress[];
  history: DownloadProgress[];
  activeDownload: DownloadProgress | null;
  
  setDownloads: (downloads: DownloadProgress[]) => void;
  addDownload: (download: DownloadProgress) => void;
  updateDownload: (downloadId: string, updates: Partial<DownloadProgress>) => void;
  removeDownload: (downloadId: string) => void;
  setActiveDownload: (download: DownloadProgress | null) => void;
  setHistory: (history: DownloadProgress[]) => void;
  clearHistory: () => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  downloads: [],
  history: [],
  activeDownload: null,
  
  setDownloads: (downloads) => set({ downloads }),
  addDownload: (download) => set((state) => ({ downloads: [download, ...state.downloads] })),
  updateDownload: (downloadId, updates) =>
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.download_id === downloadId ? { ...d, ...updates } : d
      ),
      activeDownload:
        state.activeDownload?.download_id === downloadId
          ? { ...state.activeDownload, ...updates }
          : state.activeDownload,
    })),
  removeDownload: (downloadId) =>
    set((state) => ({
      downloads: state.downloads.filter((d) => d.download_id !== downloadId),
      activeDownload:
        state.activeDownload?.download_id === downloadId ? null : state.activeDownload,
    })),
  setActiveDownload: (download) => set({ activeDownload: download }),
  setHistory: (history) => set({ history }),
  clearHistory: () => set({ history: [] }),
}));

interface ModelState {
  localModels: ModelInfo[];
  searchResults: ModelInfo[];
  isSearching: boolean;
  selectedModel: ModelInfo | null;
  
  setLocalModels: (models: ModelInfo[]) => void;
  addLocalModel: (model: ModelInfo) => void;
  removeLocalModel: (modelId: string) => void;
  setSearchResults: (results: ModelInfo[]) => void;
  setSearching: (searching: boolean) => void;
  setSelectedModel: (model: ModelInfo | null) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  localModels: [],
  searchResults: [],
  isSearching: false,
  selectedModel: null,
  
  setLocalModels: (models) => set({ localModels: models }),
  addLocalModel: (model) => set((state) => ({ localModels: [model, ...state.localModels] })),
  removeLocalModel: (modelId) =>
    set((state) => ({
      localModels: state.localModels.filter((m) => m.model_id !== modelId),
    })),
  setSearchResults: (results) => set({ searchResults: results }),
  setSearching: (searching) => set({ isSearching: searching }),
  setSelectedModel: (model) => set({ selectedModel: model }),
}));

interface SystemState {
  metrics: SystemMetrics | null;
  updateProgress: UpdateProgress | null;
  updateInfo: { update_available: boolean; version?: string } | null;
  isCheckingUpdates: boolean;
  
  setMetrics: (metrics: SystemMetrics) => void;
  setUpdateProgress: (progress: UpdateProgress) => void;
  setUpdateInfo: (info: { update_available: boolean; version?: string } | null) => void;
  setCheckingUpdates: (checking: boolean) => void;
}

export const useSystemStore = create<SystemState>((set) => ({
  metrics: null,
  updateProgress: null,
  updateInfo: null,
  isCheckingUpdates: false,
  
  setMetrics: (metrics) => set({ metrics }),
  setUpdateProgress: (progress) => set({ updateProgress: progress }),
  setUpdateInfo: (info) => set({ updateInfo: info }),
  setCheckingUpdates: (checking) => set({ isCheckingUpdates: checking }),
}));

interface UISettings {
  theme: "light" | "dark" | "system";
  sidebarOpen: boolean;
  activeTab: string;
  notifications: Array<{ id: string; type: "success" | "error" | "info"; message: string }>;
  
  setTheme: (theme: "light" | "dark" | "system") => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
  addNotification: (notification: { type: "success" | "error" | "info"; message: string }) => void;
  removeNotification: (id: string) => void;
}

export const useUIStore = create<UISettings>()(
  persist(
    (set) => ({
      theme: "system",
      sidebarOpen: true,
      activeTab: "generate",
      notifications: [],
      
      setTheme: (theme) => {
        set({ theme });
        if (theme === "system") {
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          document.documentElement.classList.toggle("dark", prefersDark);
        } else {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }
      },
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            ...state.notifications,
            { ...notification, id: Math.random().toString(36).substring(7) },
          ],
        })),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
    }),
    {
      name: "ui-settings",
    }
  )
);