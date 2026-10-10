"use client";

import React, { useState, useEffect } from "react";
import {
  Download,
  Search,
  Trash2,
  RefreshCw,
  Filter,
  X,
  CheckCircle,
  Loader2,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { api } from "@/lib/api";
import { useModelStore, useDownloadStore, useUIStore } from "@/lib/stores";
import { useDownloadWebSocket } from "@/hooks/useWebSocket";
import { formatBytes, formatDuration, getStatusColor, formatRelativeTime, cn } from "@/lib/utils";
import type { ModelInfo, DownloadProgress, ModelType, DownloadStatus } from "@/types";

const modelTypes: { value: ModelType; label: string }[] = [
  { value: "llm", label: "LLM" },
  { value: "video", label: "Video" },
  { value: "vae", label: "VAE" },
  { value: "controlnet", label: "ControlNet" },
  { value: "lora", label: "LoRA" },
  { value: "embedding", label: "Embedding" },
  { value: "other", label: "Other" },
];

export function ModelsPageContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<ModelType>("all");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [showModelDetail, setShowModelDetail] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<ModelInfo | null>(null);

  const { localModels, setLocalModels, searchResults, setSearchResults, setSearching, setSelectedModel: setStoreSelectedModel } = useModelStore();
  const { downloads, activeDownload, updateDownload, setActiveDownload, setDownloads } = useDownloadStore();
  const { addNotification } = useUIStore();

  const { lastMessage: downloadUpdate } = useDownloadWebSocket(activeDownload?.download_id || null, (update) => {
    updateDownload(update.download_id, update);
    if (activeDownload?.download_id === update.download_id) {
      setActiveDownload(update);
    }
  });

  useEffect(() => {
    const fetchLocalModels = async () => {
      try {
        const data = await api.listLocalModels();
        setLocalModels(data);
      } catch (error) {
        console.error("Failed to fetch local models:", error);
      }
    };
    fetchLocalModels();
  }, [setLocalModels]);

  useEffect(() => {
    const fetchDownloads = async () => {
      try {
        const data = await api.listDownloads();
        setDownloads(data);
      } catch (error) {
        console.error("Failed to fetch downloads:", error);
      }
    };
    fetchDownloads();
    const interval = setInterval(fetchDownloads, 3000);
    return () => clearInterval(interval);
  }, [setDownloads]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await api.searchModels(searchQuery, selectedType !== "all" ? selectedType : undefined);
      setSearchResults(data);
      setShowSearchResults(true);
    } catch (error) {
      addNotification({ type: "error", message: "Search failed" });
    } finally {
      setSearching(false);
    }
  };

  const handleDownload = async (model: ModelInfo) => {
    setDownloadingModel(model);
    setShowDownloadDialog(true);
  };

  const confirmDownload = async () => {
    if (!downloadingModel) return;
    try {
      const result = await api.downloadModel(
        downloadingModel.model_id,
        downloadingModel.model_type,
        undefined,
        false
      );
      addNotification({ type: "success", message: "Download started" });
      setShowDownloadDialog(false);
      setDownloadingModel(null);
    } catch (error) {
      addNotification({ type: "error", message: "Failed to start download" });
    }
  };

  const handleDelete = async (model: ModelInfo) => {
    if (!confirm(`Delete ${model.name}? This cannot be undone.`)) return;
    try {
      await api.deleteLocalModel(model.model_id, model.model_type);
      addNotification({ type: "success", message: "Model deleted" });
    } catch (error) {
      addNotification({ type: "error", message: "Failed to delete model" });
    }
  };

  const getActiveDownloads = () => {
    return downloads.filter(
      (d) => d.status === "downloading" || d.status === "queued" || d.status === "verifying" || d.status === "paused"
    );
  };

  const getCompletedDownloads = () => {
    return downloads.filter((d) => d.status === "completed").slice(0, 10);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Model Manager</h1>
          <p className="text-muted-foreground mt-1">Download and manage AI models</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {localModels.length} local models
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="browse" className="space-y-4">
        <TabsList>
          <TabsTrigger value="browse">Browse & Search</TabsTrigger>
          <TabsTrigger value="local">Local Models</TabsTrigger>
          <TabsTrigger value="downloads">Downloads</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    placeholder="Search models on Hugging Face..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    icon={<Search className="h-4 w-4" />}
                  />
                </div>
                <Select value={selectedType} onValueChange={(v) => setSelectedType(v as ModelType)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {modelTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleSearch} disabled={!searchQuery.trim() || searchResults.length > 0 && !searchResults[0]}>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>

              {showSearchResults && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Search Results ({searchResults.length})</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowSearchResults(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ScrollArea className="max-h-96">
                    <div className="space-y-2">
                      {searchResults.map((model) => (
                        <ModelCard
                          key={model.model_id}
                          model={model}
                          onDownload={() => handleDownload(model)}
                          isDownloaded={model.is_downloaded}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="local" className="space-y-4">
          <Card>
            <CardContent className="p-6">
              {localModels.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No local models found</p>
                  <p className="text-sm mt-1">Search and download models from the Browse tab</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-2">
                    {localModels.map((model) => (
                      <LocalModelCard
                        key={model.model_id}
                        model={model}
                        onDelete={() => handleDelete(model)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="downloads" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Active Downloads</CardTitle>
              </CardHeader>
              <CardContent>
                {getActiveDownloads().length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No active downloads</p>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {getActiveDownloads().map((download) => (
                        <DownloadProgressCard
                          key={download.download_id}
                          download={download}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Completed</CardTitle>
              </CardHeader>
              <CardContent>
                {getCompletedDownloads().length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No completed downloads</p>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-2">
                      {getCompletedDownloads().map((download) => (
                        <CompletedDownloadCard key={download.download_id} download={download} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Download</DialogTitle>
            <DialogDescription>
              Download {downloadingModel?.name} ({downloadingModel?.size_gb.toFixed(1)} GB)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">{downloadingModel?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {downloadingModel?.model_id} • {downloadingModel?.size_gb.toFixed(1)} GB
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The model will be downloaded to your local storage. Large models may take several minutes.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmDownload} disabled={!downloadingModel}>
              <Download className="h-4 w-4 mr-2" />
              Start Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModelDetail} onOpenChange={setShowModelDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedModel?.name}</DialogTitle>
            <DialogDescription>{selectedModel?.model_id}</DialogDescription>
          </DialogHeader>
          {selectedModel && (
            <div className="space-y-4 py-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{selectedModel.model_type}</Badge>
                <Badge variant="outline">{selectedModel.license}</Badge>
                {selectedModel.pipeline_tag && <Badge variant="outline">{selectedModel.pipeline_tag}</Badge>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Size</p>
                  <p className="font-medium">{selectedModel.size_gb.toFixed(1)} GB</p>
                </div>
                <div>
                  <p className="text-muted-foreground">VRAM Required</p>
                  <p className="font-medium">{selectedModel.required_vram_gb} GB</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Downloads</p>
                  <p className="font-medium">{selectedModel.download_count.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Likes</p>
                  <p className="font-medium">{selectedModel.likes.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Author</p>
                  <p className="font-medium">{selectedModel.author}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated</p>
                  <p className="font-medium">{formatRelativeTime(selectedModel.last_updated)}</p>
                </div>
              </div>
              {selectedModel.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{selectedModel.description}</p>
                </div>
              )}
              {selectedModel.tags.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedModel.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModelDetail(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModelCard({ model, onDownload, isDownloaded }: { model: ModelInfo; onDownload: () => void; isDownloaded: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{model.name}</p>
          <p className="text-xs text-muted-foreground truncate">{model.model_id}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:block text-xs text-muted-foreground">
          {model.size_gb.toFixed(1)} GB
        </div>
        {isDownloaded ? (
          <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" /> Installed</Badge>
        ) : (
          <Button size="sm" onClick={onDownload}>
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function LocalModelCard({ model, onDelete }: { model: ModelInfo; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{model.name}</p>
            <p className="text-xs text-muted-foreground truncate">{model.model_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{model.size_gb.toFixed(1)} GB</span>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border p-3 text-sm text-muted-foreground space-y-1">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="font-medium">Type:</span> {model.model_type}</div>
            <div><span className="font-medium">License:</span> {model.license}</div>
            <div><span className="font-medium">VRAM:</span> {model.required_vram_gb} GB</div>
            <div><span className="font-medium">Author:</span> {model.author}</div>
            <div className="col-span-2"><span className="font-medium">Path:</span> {model.local_path}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadProgressCard({ download }: { download: DownloadProgress }) {
  return (
    <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 rounded bg-primary/10 text-primary">
            <Download className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{download.model_id}</p>
            <p className="text-xs text-muted-foreground truncate">{download.current_file}</p>
          </div>
        </div>
        <Badge variant={getStatusColor(download.status) as any} className="text-xs">
          {download.status}
        </Badge>
      </div>
      <Progress value={download.progress_percent} max={100} className="h-1.5" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatBytes(download.downloaded_bytes)} / {formatBytes(download.total_bytes)}</span>
        <span>
          {download.speed_bps > 0 ? `${(download.speed_bps / (1024 ** 2)).toFixed(1)} MB/s` : "Starting..."}
          {download.eta_seconds > 0 && ` • ETA: ${formatDuration(download.eta_seconds)}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {download.status === "downloading" && (
          <Button variant="outline" size="sm" onClick={() => api.pauseDownload(download.download_id)}>
            <Pause className="h-3 w-3" />
          </Button>
        )}
        {download.status === "paused" && (
          <Button variant="outline" size="sm" onClick={() => api.resumeDownload(download.download_id)}>
            <Play className="h-3 w-3" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => api.cancelDownload(download.download_id)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function CompletedDownloadCard({ download }: { download: DownloadProgress }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-accent/50">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="p-1.5 rounded bg-green-500/10 text-green-500">
          <CheckCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{download.model_id}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(download.total_bytes)} • {formatRelativeTime(download.completed_at || download.started_at)}
          </p>
        </div>
      </div>
      <Badge variant="success" className="text-xs">Completed</Badge>
    </div>
  );
}