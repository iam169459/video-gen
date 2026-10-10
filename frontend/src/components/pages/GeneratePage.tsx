"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Video,
  Image,
  Sparkles,
  Slider as SliderIcon,
  Settings,
  Play,
  Pause,
  Stop,
  Trash2,
  Download,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog";
import { api } from "@/lib/api";
import { useVideoStore, useUIStore } from "@/lib/stores";
import { useVideoTaskWebSocket } from "@/hooks/useWebSocket";
import { formatBytes, formatDuration, getStatusColor, cn } from "@/lib/utils";
import type { VideoGenerationParams, VideoGenerationResult, VideoModelInfo, VideoGenerationStatus } from "@/types";

const defaultParams: VideoGenerationParams = {
  prompt: "",
  negative_prompt: "",
  model_type: "stable_video_diffusion_xt",
  num_frames: 25,
  fps: 8,
  width: 576,
  height: 1024,
  num_inference_steps: 25,
  guidance_scale: 7.5,
  motion_bucket_id: 127,
  noise_aug_strength: 0.02,
  decode_chunk_size: 8,
  output_format: "mp4",
  quality: "high",
};

export function GeneratePageContent() {
  const [params, setParams] = useState<VideoGenerationParams>(defaultParams);
  const [models, setModels] = useState<VideoModelInfo[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<VideoGenerationResult | null>(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);

  const { tasks, setTasks, addTask, updateTask, setSelectedTask: setStoreSelectedTask, clearCompletedTasks } = useVideoStore();
  const { addNotification } = useUIStore();

  const { lastMessage: taskUpdate } = useVideoTaskWebSocket(selectedTask?.task_id || null, (update) => {
    updateTask(update.task_id, update);
    if (selectedTask?.task_id === update.task_id) {
      setSelectedTask(update);
    }
  });

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await api.listVideoModels();
        setModels(data);
      } catch (error) {
        console.error("Failed to fetch models:", error);
      }
    };
    fetchModels();

    const fetchTasks = async () => {
      try {
        const data = await api.listVideoTasks();
        setTasks(data);
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
      }
    };
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [setTasks]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setParams((prev) => ({ ...prev, image: e.target?.result as string }));
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "image/*": [] } });

  const handleGenerate = async () => {
    if (!params.prompt.trim() && !params.image) {
      addNotification({ type: "error", message: "Please provide a prompt or an input image" });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await api.generateVideo(params);
      addNotification({ type: "success", message: "Video generation started" });
      const task = await api.getVideoTask(result.task_id);
      addTask(task);
      setSelectedTask(task);
      setStoreSelectedTask(task);
      setShowTaskDetail(true);
    } catch (error) {
      addNotification({ type: "error", message: "Failed to start video generation" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await api.cancelVideoTask(taskId);
      addNotification({ type: "success", message: "Task cancelled" });
    } catch (error) {
      addNotification({ type: "error", message: "Failed to cancel task" });
    }
  };

  const handleDownload = async (taskId: string) => {
    try {
      const blob = await api.downloadVideo(taskId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video_${taskId}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      addNotification({ type: "error", message: "Failed to download video" });
    }
  };

  const getStatusIcon = (status: VideoGenerationStatus) => {
    switch (status) {
      case "generating":
      case "preprocessing":
      case "postprocessing":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "failed":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Video className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Video Generation</h1>
          <p className="text-muted-foreground mt-1">Create stunning videos with AI models</p>
        </div>
        <Badge variant="outline" className="text-sm">
          {models.find((m) => m.type === params.model_type)?.name || params.model_type}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                {...getRootProps()}
                className={cn(
                  "relative border-2 border-dashed rounded-xl p-8 text-center transition-colors",
                  isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                  params.image && "border-transparent bg-muted/50"
                )}
              >
                <input {...getInputProps()} />
                {params.image ? (
                  <div className="relative max-w-md mx-auto">
                    <img src={params.image} alt="Preview" className="rounded-lg max-h-64 w-auto" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setParams((prev) => ({ ...prev, image: undefined }));
                        setPreviewUrl(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Image className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">
                      Drag & drop an image here, or click to select
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG, JPG up to 10MB
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Prompt</label>
                <textarea
                  value={params.prompt}
                  onChange={(e) => setParams((prev) => ({ ...prev, prompt: e.target.value }))}
                  className="w-full min-h-[100px] p-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-ring"
                  placeholder="Describe the video you want to generate..."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Negative Prompt (Optional)</label>
                <textarea
                  value={params.negative_prompt}
                  onChange={(e) => setParams((prev) => ({ ...prev, negative_prompt: e.target.value }))}
                  className="w-full min-h-[60px] p-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-ring"
                  placeholder="What to avoid in the video..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Model Settings</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="ml-1">{showAdvanced ? "Hide" : "Show"} Advanced</span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Model</label>
                  <Select value={params.model_type} onValueChange={(v) => setParams((prev) => ({ ...prev, model_type: v as any }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.type} value={model.type}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium">Output Format</label>
                  <Select value={params.output_format} onValueChange={(v) => setParams((prev) => ({ ...prev, output_format: v as any }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mp4">MP4 Video</SelectItem>
                      <SelectItem value="gif">GIF Animation</SelectItem>
                      <SelectItem value="webm">WebM Video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {showAdvanced && (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        Frames: {params.num_frames}
                      </label>
                      <Slider
                        value={[params.num_frames]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, num_frames: v }))}
                        min={1}
                        max={100}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        FPS: {params.fps}
                      </label>
                      <Slider
                        value={[params.fps]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, fps: v }))}
                        min={1}
                        max={60}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        Width: {params.width}
                      </label>
                      <Slider
                        value={[params.width]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, width: v }))}
                        min={256}
                        max={1024}
                        step={64}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        Height: {params.height}
                      </label>
                      <Slider
                        value={[params.height]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, height: v }))}
                        min={256}
                        max={1024}
                        step={64}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        Inference Steps: {params.num_inference_steps}
                      </label>
                      <Slider
                        value={[params.num_inference_steps]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, num_inference_steps: v }))}
                        min={1}
                        max={100}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        Guidance Scale: {params.guidance_scale}
                      </label>
                      <Slider
                        value={[params.guidance_scale]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, guidance_scale: v }))}
                        min={1}
                        max={20}
                        step={0.5}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        Motion Bucket: {params.motion_bucket_id}
                      </label>
                      <Slider
                        value={[params.motion_bucket_id]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, motion_bucket_id: v }))}
                        min={1}
                        max={255}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        Noise Aug: {params.noise_aug_strength.toFixed(2)}
                      </label>
                      <Slider
                        value={[params.noise_aug_strength]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, noise_aug_strength: v }))}
                        min={0}
                        max={1}
                        step={0.01}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium flex items-center justify-between">
                        Decode Chunk: {params.decode_chunk_size}
                      </label>
                      <Slider
                        value={[params.decode_chunk_size]}
                        onValueChange={([v]) => setParams((prev) => ({ ...prev, decode_chunk_size: v }))}
                        min={1}
                        max={16}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">Seed (Optional)</label>
                      <Input
                        type="number"
                        value={params.seed?.toString() || ""}
                        onChange={(e) => setParams((prev) => ({ ...prev, seed: e.target.value ? parseInt(e.target.value) : undefined }))}
                        placeholder="Random"
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                className="w-full py-4 text-lg"
                onClick={handleGenerate}
                disabled={isGenerating || (!params.prompt.trim() && !params.image)}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Generate Video
                  </>
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                Estimated time: ~{Math.ceil((params.num_frames / params.fps) * 2 + params.num_inference_steps * 0.5)}s
              </div>

              {selectedTask && (
                <div className="space-y-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("p-1.5 rounded", getStatusColor(selectedTask.status).replace("badge-", "bg-"))}>
                        {getStatusIcon(selectedTask.status)}
                      </div>
                      <span className="font-medium text-sm">{selectedTask.status}</span>
                    </div>
                    <Badge variant={getStatusColor(selectedTask.status) as any}>{Math.round(selectedTask.progress * 100)}%</Badge>
                  </div>
                  <Progress value={selectedTask.progress * 100} max={100} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Step {selectedTask.current_step} / {selectedTask.total_steps}</span>
                    {selectedTask.error && <span className="text-destructive">{selectedTask.error}</span>}
                  </div>
                  {selectedTask.status === "completed" && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleDownload(selectedTask.task_id)}>
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleCancel(selectedTask.task_id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No tasks yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {tasks.slice(0, 10).map((task) => (
                    <Button
                      key={task.task_id}
                      variant={selectedTask?.task_id === task.task_id ? "primary" : "outline"}
                      className="w-full justify-start gap-2 p-2"
                      onClick={() => {
                        setSelectedTask(task);
                        setShowTaskDetail(true);
                      }}
                    >
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium truncate">{task.params.prompt.slice(0, 30)}...</p>
                        <p className="text-xs text-muted-foreground">
                          {task.params.model_type} • {formatDuration(task.params.num_frames / task.params.fps)}
                        </p>
                      </div>
                      <Badge variant={getStatusColor(task.status) as any} className="text-xs">
                        {task.status}
                      </Badge>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showTaskDetail} onOpenChange={setShowTaskDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Task Details</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant={getStatusColor(selectedTask.status) as any} className="text-base px-3 py-1">
                  {selectedTask.status}
                </Badge>
                <div className="flex items-center gap-2">
                  {selectedTask.status === "completed" && (
                    <Button variant="outline" size="sm" onClick={() => handleDownload(selectedTask.task_id)}>
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  )}
                  {selectedTask.status === "generating" && (
                    <Button variant="destructive" size="sm" onClick={() => handleCancel(selectedTask.task_id)}>
                      <Stop className="h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
              <Progress value={selectedTask.progress * 100} max={100} className="h-3" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Model</p>
                  <p className="font-medium">{selectedTask.params.model_type}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Resolution</p>
                  <p className="font-medium">{selectedTask.params.width}x{selectedTask.params.height}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Frames / FPS</p>
                  <p className="font-medium">{selectedTask.params.num_frames} / {selectedTask.params.fps}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">{formatDuration(selectedTask.params.num_frames / selectedTask.params.fps)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Steps</p>
                  <p className="font-medium">{selectedTask.current_step} / {selectedTask.total_steps}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Guidance Scale</p>
                  <p className="font-medium">{selectedTask.params.guidance_scale}</p>
                </div>
              </div>
              {selectedTask.output_path && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Output</p>
                  <video
                    src={`/api/v1/video/tasks/${selectedTask.task_id}/download`}
                    controls
                    className="w-full rounded-lg border border-border"
                  />
                </div>
              )}
              {selectedTask.preview_path && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Preview</p>
                  <img
                    src={`/api/v1/video/tasks/${selectedTask.task_id}/preview`}
                    alt="Preview"
                    className="w-full rounded-lg border border-border"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDetail(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}