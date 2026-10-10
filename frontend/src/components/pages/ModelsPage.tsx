"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  Brain,
  Code,
  Image,
  Video,
  Sparkles,
  Shield,
  Unlock,
  Globe,
  Cpu,
  Server,
  Zap,
  ArrowRight,
  FolderOpen,
  Play,
  Pause,
  Settings,
  Link2,
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
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/Accordion";
import { Switch } from "@/components/ui/Switch";
import { api } from "@/lib/api";
import { useModelStore, useDownloadStore, useUIStore } from "@/lib/stores";
import { useDownloadWebSocket } from "@/hooks/useWebSocket";
import { formatBytes, formatDuration, getStatusColor, formatRelativeTime, cn } from "@/lib/utils";
import type { ModelInfo, DownloadProgress, ModelType, DownloadStatus } from "@/types";

const modelTypes: { value: ModelType; label: string; icon: React.ReactNode }[] = [
  { value: "llm", label: "LLM", icon: <Brain className="h-4 w-4" /> },
  { value: "video", label: "Video", icon: <Video className="h-4 w-4" /> },
  { value: "vae", label: "VAE", icon: <Image className="h-4 w-4" /> },
  { value: "controlnet", label: "ControlNet", icon: <Settings className="h-4 w-4" /> },
  { value: "lora", label: "LoRA", icon: <Sparkles className="h-4 w-4" /> },
  { value: "embedding", label: "Embedding", icon: <Globe className="h-4 w-4" /> },
  { value: "other", label: "Other", icon: <FolderOpen className="h-4 w-4" /> },
];

const modelCategories = [
  {
    id: "uncensored",
    name: "Uncensored AI",
    icon: Unlock,
    description: "Unrestricted models for creative freedom",
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    models: [
      { id: "cognitivecomputations/dolphin-mixtral-8x7b", name: "Dolphin Mixtral 8x7B", type: "llm", size: "26 GB", desc: "Uncensored Mixtral fine-tune", tags: ["uncensored", "mixtral", "moe"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "cognitivecomputations/dolphin-llama3-8b", name: "Dolphin Llama 3 8B", type: "llm", size: "4.7 GB", desc: "Uncensored Llama 3", tags: ["uncensored", "llama3"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "EricHartford/WizardLM-30B-Uncensored", name: "WizardLM 30B Uncensored", type: "llm", size: "17 GB", desc: "High-quality uncensored", tags: ["uncensored", "wizardlm"], engine: ["ollama", "llamacpp"] },
      { id: "NVIDIA/Nemotron-3-Ultra", name: "Nemotron 3 Ultra", type: "llm", size: "53 GB", desc: "NVIDIA's flagship model", tags: ["nvidia", "ultra"], engine: ["transformers", "llamacpp"] },
      { id: "teknium/OpenHermes-2.5-Mistral-7B", name: "OpenHermes 2.5 7B", type: "llm", size: "4.1 GB", desc: "Uncensored Mistral fine-tune", tags: ["uncensored", "hermes"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "alignmentlab/Zephyr-7B-Uncensored", name: "Zephyr 7B Uncensored", type: "llm", size: "4.1 GB", desc: "Uncensored chat model", tags: ["uncensored", "zephyr"], engine: ["ollama", "transformers", "llamacpp"] },
    ]
  },
  {
    id: "coding",
    name: "Code & Development",
    icon: Code,
    description: "Models optimized for programming",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    models: [
      { id: "codellama/CodeLlama-34b-hf", name: "CodeLlama 34B", type: "llm", size: "19 GB", desc: "Meta's code model", tags: ["code", "llama"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "deepseek-ai/deepseek-coder-33b-instruct", name: "DeepSeek Coder 33B", type: "llm", size: "18 GB", desc: "Top-tier code model", tags: ["code", "deepseek"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "bigcode/starcoder2-15b", name: "StarCoder2 15B", type: "llm", size: "8.5 GB", desc: "Code generation specialist", tags: ["code", "starcoder"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "Qwen/Qwen2.5-Coder-32B", name: "Qwen2.5 Coder 32B", type: "llm", size: "18 GB", desc: "Latest Qwen code model", tags: ["code", "qwen"], engine: ["ollama", "transformers", "llamacpp"] },
    ]
  },
  {
    id: "vision",
    name: "Vision & Multimodal",
    icon: Image,
    description: "Models that understand images",
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    models: [
      { id: "llava-hf/llava-v1.6-34b-hf", name: "LLaVA 1.6 34B", type: "llm", size: "19 GB", desc: "State-of-art vision-language", tags: ["vision", "llava"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "llava-hf/bakllava-7b-hf", name: "BakLLaVA 7B", type: "llm", size: "4.1 GB", desc: "Lightweight vision model", tags: ["vision", "bakllava"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "microsoft/Phi-3.5-vision-instruct", name: "Phi-3.5 Vision", type: "llm", size: "2.3 GB", desc: "Microsoft's small vision model", tags: ["vision", "phi"], engine: ["transformers", "llamacpp"] },
    ]
  },
  {
    id: "video-gen",
    name: "Video Generation",
    icon: Video,
    description: "Models for creating videos",
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    models: [
      { id: "stabilityai/stable-video-diffusion-img2vid-xt", name: "SVD XT", type: "video", size: "10 GB", desc: "25-frame video from image", tags: ["svd", "img2vid"], engine: ["diffusers"] },
      { id: "guoyww/animatediff", name: "AnimateDiff", type: "video", size: "6 GB", desc: "Text-to-video with motion", tags: ["animatediff", "t2v"], engine: ["diffusers"] },
      { id: "ByteDance/AnimateDiff-Lightning", name: "AnimateDiff Lightning", type: "video", size: "4 GB", desc: "4-step fast video", tags: ["animatediff", "fast"], engine: ["diffusers"] },
      { id: "hotshot-xl/Hotshot-XL", name: "Hotshot-XL", type: "video", size: "7 GB", desc: "GIF-style video generation", tags: ["hotshot", "gif"], engine: ["diffusers"] },
    ]
  },
  {
    id: "general-llm",
    name: "General Purpose LLMs",
    icon: Brain,
    description: "Versatile chat and reasoning models",
    color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    models: [
      { id: "meta-llama/Meta-Llama-3.1-8B-Instruct", name: "Llama 3.1 8B", type: "llm", size: "4.7 GB", desc: "Meta's latest 8B model", tags: ["llama3", "meta"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "meta-llama/Meta-Llama-3.1-70B-Instruct", name: "Llama 3.1 70B", type: "llm", size: "40 GB", desc: "Meta's flagship 70B", tags: ["llama3", "meta", "70b"], engine: ["ollama", "llamacpp"] },
      { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen2.5 72B", type: "llm", size: "41 GB", desc: "Alibaba's powerful model", tags: ["qwen", "72b"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "microsoft/Phi-3.5-mini-instruct", name: "Phi-3.5 Mini", type: "llm", size: "2.2 GB", desc: "Tiny but capable", tags: ["phi", "microsoft", "small"], engine: ["ollama", "transformers", "llamacpp"] },
      { id: "google/gemma-2-27b-it", name: "Gemma 2 27B", type: "llm", size: "15 GB", desc: "Google's open model", tags: ["gemma", "google"], engine: ["ollama", "transformers", "llamacpp"] },
    ]
  },
  {
    id: "specialized",
    name: "Specialized & Tools",
    icon: Zap,
    description: "Special purpose models",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    models: [
      { id: "sentence-transformers/all-MiniLM-L6-v2", name: "All-MiniLM-L6-v2", type: "embedding", size: "90 MB", desc: "Fast embeddings", tags: ["embedding", "sentence"], engine: ["transformers"] },
      { id: "BAAI/bge-large-en-v1.5", name: "BGE Large EN", type: "embedding", size: "1.2 GB", desc: "Top retrieval embeddings", tags: ["embedding", "bge"], engine: ["transformers"] },
      { id: "stabilityai/sd-vae-ft-mse", name: "SD VAE MSE", type: "vae", size: "300 MB", desc: "Improved VAE", tags: ["vae", "stable-diffusion"], engine: ["diffusers"] },
    ]
  },
];

const inferenceEngines = [
  { id: "transformers", name: "Transformers (Python)", icon: Brain, desc: "Full Python/HF Transformers", gpu: true, speed: "Fast", features: ["Full control", "Chain blocks", "Custom pipelines"] },
  { id: "ollama", name: "Ollama", icon: Server, desc: "Native binary, easy management", gpu: true, speed: "Fast", features: ["Auto GPU", "Model library", "API server"] },
  { id: "llamacpp", name: "llama.cpp", icon: Cpu, desc: "CPU/GPU optimized C++", gpu: true, speed: "Very Fast", features: ["Quantization", "Metal/CUDA", "Low memory"] },
];

export function ModelsPageContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedEngine, setSelectedEngine] = useState<string>("transformers");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [showModelDetail, setShowModelDetail] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<ModelInfo | null>(null);
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [activeTab, setActiveTab] = useState("discover");

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
      const data = await api.searchModels(searchQuery);
      setSearchResults(data);
      setShowSearchResults(true);
      setActiveTab("search");
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

  const getActiveDownloads = () => downloads.filter(d => ["downloading", "queued", "verifying", "paused"].includes(d.status));
  const getCompletedDownloads = () => downloads.filter(d => d.status === "completed").slice(0, 10);

  const allCuratedModels = useMemo(() => modelCategories.flatMap(c => c.models), []);
  const isModelDownloaded = (modelId: string) => localModels.some(m => m.model_id === modelId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Model Hub</h1>
          <p className="text-muted-foreground mt-1">Discover, download, and manage AI models</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">{localModels.length} local</Badge>
          <Button variant="outline" size="sm" onClick={() => setShowEngineSettings(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Inference Engines
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="local">Local Models</TabsTrigger>
          <TabsTrigger value="downloads">Downloads</TabsTrigger>
          <TabsTrigger value="engines">Engines</TabsTrigger>
        </TabsList>

        {/* DISCOVER TAB - Curated Categories */}
        <TabsContent value="discover" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modelCategories.map((category) => (
              <Card key={category.id} className={cn("overflow-hidden transition-all hover:shadow-lg", category.color.replace("bg-", "").replace("text-", "").replace("border-", ""))}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("p-2 rounded-lg", category.color)}>
                        <category.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{category.name}</h3>
                        <p className="text-xs text-muted-foreground">{category.models.length} models</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{category.models.filter(m => isModelDownloaded(m.id)).length} installed</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{category.description}</p>
                </CardHeader>
                <CardContent className="pb-0">
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value={category.id}>
                      <AccordionTrigger className="py-2 text-sm font-medium hover:bg-accent/50">
                        <span className="flex items-center gap-2">
                          <ChevronDown className="h-4 w-4" />
                          Browse {category.models.length} models
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {category.models.map((model) => (
                            <CuratedModelCard
                              key={model.id}
                              model={model}
                              isDownloaded={isModelDownloaded(model.id)}
                              onDownload={() => handleDownload(model as ModelInfo)}
                              onClick={() => setSelectedModel(model as ModelInfo), setShowModelDetail(true)}
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* SEARCH TAB */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[250px]">
                  <Input
                    placeholder="Search Hugging Face models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    icon={<Search className="h-4 w-4" />}
                  />
                </div>
                <Select value={selectedEngine} onValueChange={setSelectedEngine}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Inference Engine" />
                  </SelectTrigger>
                  <SelectContent>
                    {inferenceEngines.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
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
                    <Button variant="ghost" size="sm" onClick={() => { setShowSearchResults(false); setActiveTab("discover"); }}>
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

        {/* LOCAL MODELS TAB */}
        <TabsContent value="local" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Local Models</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={selectedEngine} onValueChange={setSelectedEngine}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Run with" />
                  </SelectTrigger>
                  <SelectContent>
                    {inferenceEngines.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => { setActiveTab("discover"); }}>
                  <Download className="h-4 w-4 mr-2" />
                  Get More
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {localModels.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">No local models yet</p>
                  <p className="text-sm mt-1">Discover and download models from the Discover tab</p>
                  <Button className="mt-4" onClick={() => setActiveTab("discover")}>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Browse Models
                  </Button>
                </div>
              ) : (
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-2">
                    {localModels.map((model) => (
                      <LocalModelCard
                        key={model.model_id}
                        model={model}
                        selectedEngine={selectedEngine}
                        onDelete={() => handleDelete(model)}
                        onRun={() => addNotification({ type: "info", message: `Starting ${model.name} with ${selectedEngine}...` })}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DOWNLOADS TAB */}
        <TabsContent value="downloads" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Active Downloads</CardTitle></CardHeader>
              <CardContent>
                {getActiveDownloads().length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No active downloads</p>
                ) : (
                  <ScrollArea className="max-h-96">
                    <div className="space-y-3">
                      {getActiveDownloads().map((download) => (
                        <DownloadProgressCard key={download.download_id} download={download} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Recent Completed</CardTitle></CardHeader>
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

        {/* ENGINES TAB */}
        <TabsContent value="engines" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {inferenceEngines.map((engine) => (
              <Card key={engine.id} className={cn(selectedEngine === engine.id && "ring-2 ring-primary")}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary">{engine.icon}</div>
                    <div>
                      <CardTitle className="text-lg">{engine.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{engine.desc}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">GPU Support</span>
                    <Badge variant={engine.gpu ? "success" : "secondary"}>{engine.gpu ? "Yes" : "CPU Only"}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Speed</span>
                    <Badge variant="outline">{engine.speed}</Badge>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Features:</p>
                    <div className="flex flex-wrap gap-1">
                      {engine.features.map(f => (
                        <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant={selectedEngine === engine.id ? "primary" : "outline"}
                    className="w-full"
                    onClick={() => { setSelectedEngine(engine.id); setActiveTab("local"); }}
                  >
                    {selectedEngine === engine.id ? (
                      <>✓ Selected <ArrowRight className="h-4 w-4 ml-2" /></>
                    ) : (
                      "Use This Engine"
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Quick Setup Commands
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 font-mono text-sm bg-muted/50 p-4 rounded-lg">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="p-2 rounded bg-background">
                  <span className="text-green-500"># Ollama</span>
                  <br />curl -fsSL https://ollama.ai/install.sh | sh
                  <br />ollama pull dolphin-mixtral:8x7b
                </div>
                <div className="p-2 rounded bg-background">
                  <span className="text-blue-500"># llama.cpp</span>
                  <br />pip install llama-cpp-python
                  <br /># or: brew install llama.cpp
                </div>
                <div className="p-2 rounded bg-background">
                  <span className="text-purple-500"># Transformers</span>
                  <br />pip install transformers accelerate
                  <br /># Already included!
                </div>
                <div className="p-2 rounded bg-background">
                  <span className="text-orange-500"># Video Gen</span>
                  <br />pip install diffusers xformers
                  <br /># Already included!
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DOWNLOAD CONFIRM DIALOG */}
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
              <div className="p-2 rounded-lg bg-primary/10 text-primary"><Download className="h-5 w-5" /></div>
              <div>
                <p className="font-medium">{downloadingModel?.name}</p>
                <p className="text-sm text-muted-foreground">{downloadingModel?.model_id} • {downloadingModel?.size_gb.toFixed(1)} GB</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Model will be downloaded to local storage. Large models may take several minutes.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>Cancel</Button>
            <Button onClick={confirmDownload} disabled={!downloadingModel}><Download className="h-4 w-4 mr-2" />Start Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODEL DETAIL DIALOG */}
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
                {allCuratedModels.find(m => m.id === selectedModel.model_id)?.tags.map(t => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div><p className="text-muted-foreground">Size</p><p className="font-medium">{selectedModel.size_gb.toFixed(1)} GB</p></div>
                <div><p className="text-muted-foreground">VRAM Required</p><p className="font-medium">{selectedModel.required_vram_gb} GB</p></div>
                <div><p className="text-muted-foreground">Downloads</p><p className="font-medium">{selectedModel.download_count.toLocaleString()}</p></div>
                <div><p className="text-muted-foreground">Likes</p><p className="font-medium">{selectedModel.likes.toLocaleString()}</p></div>
                <div><p className="text-muted-foreground">Author</p><p className="font-medium">{selectedModel.author}</p></div>
                <div><p className="text-muted-foreground">Updated</p><p className="font-medium">{formatRelativeTime(selectedModel.last_updated)}</p></div>
              </div>
              {selectedModel.description && (<div><p className="text-sm text-muted-foreground mb-1">Description</p><p className="text-sm">{selectedModel.description}</p></div>)}
              <div className="flex gap-2">
                <Button onClick={() => handleDownload(selectedModel)} disabled={isModelDownloaded(selectedModel.model_id)}>
                  <Download className="h-4 w-4 mr-2" /> {isModelDownloaded(selectedModel.model_id) ? "Already Downloaded" : "Download"}
                </Button>
                <Button variant="outline" onClick={() => addNotification({ type: "info", message: `Run with ${selectedEngine}...` })}>
                  <Play className="h-4 w-4 mr-2" /> Run with {selectedEngine}
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModelDetail(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ENGINE SETTINGS DIALOG */}
      <Dialog open={showEngineSettings} onOpenChange={setShowEngineSettings}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Inference Engine Settings</DialogTitle>
            <DialogDescription>Configure how models run locally</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {inferenceEngines.map((engine) => (
              <div key={engine.id} className="p-4 rounded-lg border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">{engine.icon}</div>
                    <div>
                      <p className="font-medium">{engine.name}</p>
                      <p className="text-sm text-muted-foreground">{engine.desc}</p>
                    </div>
                  </div>
                  <Badge variant={selectedEngine === engine.id ? "success" : "outline"}>{selectedEngine === engine.id ? "Active" : "Available"}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">GPU</span><p>{engine.gpu ? "Yes" : "No"}</p></div>
                  <div><span className="text-muted-foreground">Speed</span><p>{engine.speed}</p></div>
                </div>
                <Button variant={selectedEngine === engine.id ? "primary" : "outline"} className="w-full mt-2" onClick={() => setSelectedEngine(engine.id)}>
                  {selectedEngine === engine.id ? "✓ Selected" : "Select"}
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEngineSettings(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CuratedModelCard({ model, isDownloaded, onDownload, onClick }: { model: any; isDownloaded: boolean; onDownload: () => void; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="p-2 rounded-lg bg-primary/10 text-primary"><Brain className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{model.name}</p>
          <p className="text-xs text-muted-foreground truncate">{model.id}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {model.tags.map((t: string) => <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0.5">{t}</Badge>)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:block text-xs text-muted-foreground">{model.size}</div>
        {isDownloaded ? (
          <Badge variant="success" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" /> Ready</Badge>
        ) : (
          <Button size="sm" onClick={(e) => { e.stopPropagation(); onDownload(); }}>
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>
    </button>
  );
}

function ModelCard({ model, onDownload, isDownloaded }: { model: ModelInfo; onDownload: () => void; isDownloaded: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="p-2 rounded-lg bg-primary/10 text-primary"><Download className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{model.name}</p>
          <p className="text-xs text-muted-foreground truncate">{model.model_id}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:block text-xs text-muted-foreground">{model.size_gb.toFixed(1)} GB</div>
        {isDownloaded ? <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" /> Installed</Badge> : <Button size="sm" onClick={onDownload}><Download className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
}

function LocalModelCard({ model, selectedEngine, onDelete, onRun }: { model: ModelInfo; selectedEngine: string; onDelete: () => void; onRun: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isUncensored = model.tags?.some(t => t.toLowerCase().includes("uncensored")) || model.model_id.toLowerCase().includes("uncensored") || model.model_id.toLowerCase().includes("dolphin") || model.model_id.toLowerCase().includes("wizard") || model.model_id.toLowerCase().includes("nemotron");
  
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn("p-2 rounded-lg", isUncensored ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500")}>
            {isUncensored ? <Unlock className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{model.name}</p>
              {isUncensored && <Badge variant="destructive" className="text-xs"><Unlock className="h-3 w-3 mr-1" />Uncensored</Badge>}
            </div>
            <p className="text-xs text-muted-foreground truncate">{model.model_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{model.size_gb.toFixed(1)} GB</span>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
          <Button variant="outline" size="sm" onClick={onRun}><Play className="h-3 w-3 mr-1" />Run</Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border p-3 text-sm text-muted-foreground space-y-1">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="font-medium">Type:</span> {model.model_type}</div>
            <div><span className="font-medium">License:</span> {model.license}</div>
            <div><span className="font-medium">VRAM:</span> {model.required_vram_gb} GB</div>
            <div><span className="font-medium">Engine:</span> {selectedEngine}</div>
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
          <div className="p-1.5 rounded bg-primary/10 text-primary"><Download className="h-4 w-4" /></div>
          <div className="min-w-0"><p className="font-medium text-sm truncate">{download.model_id}</p><p className="text-xs text-muted-foreground truncate">{download.current_file}</p></div>
        </div>
        <Badge variant={getStatusColor(download.status) as any} className="text-xs">{download.status}</Badge>
      </div>
      <Progress value={download.progress_percent} max={100} className="h-1.5" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatBytes(download.downloaded_bytes)} / {formatBytes(download.total_bytes)}</span>
        <span>{download.speed_bps > 0 ? `${(download.speed_bps / (1024 ** 2)).toFixed(1)} MB/s` : "Starting..."}{download.eta_seconds > 0 && ` • ETA: ${formatDuration(download.eta_seconds)}`}</span>
      </div>
      <div className="flex items-center gap-2">
        {download.status === "downloading" && <Button variant="outline" size="sm" onClick={() => api.pauseDownload(download.download_id)}><Pause className="h-3 w-3" /></Button>}
        {download.status === "paused" && <Button variant="outline" size="sm" onClick={() => api.resumeDownload(download.download_id)}><Play className="h-3 w-3" /></Button>}
        <Button variant="ghost" size="sm" onClick={() => api.cancelDownload(download.download_id)}><X className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function CompletedDownloadCard({ download }: { download: DownloadProgress }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-accent/50">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="p-1.5 rounded bg-green-500/10 text-green-500"><CheckCircle className="h-4 w-4" /></div>
        <div className="min-w-0"><p className="font-medium text-sm truncate">{download.model_id}</p><p className="text-xs text-muted-foreground">{formatBytes(download.total_bytes)} • {formatRelativeTime(download.completed_at || download.started_at)}</p></div>
      </div>
      <Badge variant="success" className="text-xs">Completed</Badge>
    </div>
  );
}