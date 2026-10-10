"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Brain,
  Send,
  Loader2,
  Settings,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  MemoryStick,
  Cpu,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Switch } from "@/components/ui/Switch"
import { Badge } from "@/components/ui/Badge"
import { Progress } from "@/components/ui/Progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { Separator } from "@/components/ui/Separator"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/Dialog"
import { api } from "@/lib/api"
import { useUIStore } from "@/lib/stores"
import { formatBytes, getStatusColor, cn } from "@/lib/utils"
import type { ChainStats, ChainGenerateRequest } from "@/types"

const defaultChainConfig = {
  num_blocks: 8,
  block_size: 4,
  overlap: 1,
  processing_mode: "sequential" as const,
  offload_to_cpu: true,
}

export function ChainPageContent() {
  const [modelId, setModelId] = useState("")
  const [prompt, setPrompt] = useState("")
  const [maxTokens, setMaxTokens] = useState(512)
  const [temperature, setTemperature] = useState(0.7)
  const [topP, setTopP] = useState(0.9)
  const [stream, setStream] = useState(false)
  const [chainConfig, setChainConfig] = useState(defaultChainConfig)
  const [isGenerating, setIsGenerating] = useState(false)
  const [response, setResponse] = useState("")
  const [stats, setStats] = useState<Record<string, ChainStats>>({})
  const [showConfig, setShowConfig] = useState(false)
  const [selectedChain, setSelectedChain] = useState<string | null>(null)
  const [showChainDetail, setShowChainDetail] = useState(false)
  const responseRef = useRef<HTMLDivElement>(null)

  const { addNotification } = useUIStore()

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.getChainStats()
        setStats(data)
      } catch (error) {
        console.error("Failed to fetch chain stats:", error)
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleGenerate = async () => {
    if (!modelId.trim() || !prompt.trim()) {
      addNotification({ type: "error", message: "Please provide model ID and prompt" })
      return
    }

    setIsGenerating(true)
    setResponse("")

    try {
      const request: ChainGenerateRequest = {
        model_id: modelId,
        prompt,
        max_new_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream,
        chain_config: chainConfig,
      }

      if (stream) {
        const result = await api.chainGenerate(request)
        const reader = result.body?.getReader()
        const decoder = new TextDecoder()
        
        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split("\n")
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") break
              try {
                const parsed = JSON.parse(data)
                if (parsed.token) {
                  setResponse((prev) => prev + parsed.token)
                  responseRef.current?.scrollIntoView({ behavior: "smooth" })
                }
              } catch {}
            }
          }
        }
      } else {
        const result = await api.chainGenerate(request)
        setResponse(result.response || "")
      }
      addNotification({ type: "success", message: "Generation complete" })
    } catch (error) {
      addNotification({ type: "error", message: "Generation failed" })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleReleaseChain = async (modelId: string) => {
    try {
      await api.releaseChain(modelId)
      addNotification({ type: "success", message: "Chain released" })
      const data = await api.getChainStats()
      setStats(data)
    } catch (error) {
      addNotification({ type: "error", message: "Failed to release chain" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">LLM Chain Block System</h1>
          <p className="text-muted-foreground mt-1">Run large language models efficiently with block-wise processing</p>
        </div>
        <Button variant="outline" onClick={() => setShowConfig(!showConfig)}>
          <Settings className="h-4 w-4 mr-2" />
          Chain Config
        </Button>
      </div>

      {showConfig && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-6 space-y-4">
            <h3 className="font-medium">Chain Block Configuration</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Number of Blocks</label>
                <Slider
                  value={[chainConfig.num_blocks]}
                  onValueChange={([v]) => setChainConfig((prev) => ({ ...prev, num_blocks: v }))}
                  min={1}
                  max={16}
                  step={1}
                />
                <p className="text-sm text-muted-foreground">{chainConfig.num_blocks} blocks</p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Block Size</label>
                <Slider
                  value={[chainConfig.block_size]}
                  onValueChange={([v]) => setChainConfig((prev) => ({ ...prev, block_size: v }))}
                  min={1}
                  max={8}
                  step={1}
                />
                <p className="text-sm text-muted-foreground">{chainConfig.block_size} layers/block</p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Overlap</label>
                <Slider
                  value={[chainConfig.overlap]}
                  onValueChange={([v]) => setChainConfig((prev) => ({ ...prev, overlap: v }))}
                  min={0}
                  max={4}
                  step={1}
                />
                <p className="text-sm text-muted-foreground">{chainConfig.overlap} layers</p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Processing Mode</label>
                <Select value={chainConfig.processing_mode} onValueChange={(v) => setChainConfig((prev) => ({ ...prev, processing_mode: v as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequential</SelectItem>
                    <SelectItem value="pipeline">Pipeline</SelectItem>
                    <SelectItem value="parallel">Parallel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={chainConfig.offload_to_cpu}
                  onCheckedChange={(checked) => setChainConfig((prev) => ({ ...prev, offload_to_cpu: checked }))}
                />
                <span className="text-sm">Offload to CPU</span>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate Text</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Model ID (Hugging Face)</label>
                <Input
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="meta-llama/Llama-2-7b-chat-hf"
                  icon={<Brain className="h-4 w-4" />}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full min-h-[120px] p-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-ring"
                  placeholder="Enter your prompt here..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Max Tokens: {maxTokens}
                  </label>
                  <Slider
                    value={[maxTokens]}
                    onValueChange={([v]) => setMaxTokens(v)}
                    min={1}
                    max={4096}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Temperature: {temperature}
                  </label>
                  <Slider
                    value={[temperature]}
                    onValueChange={([v]) => setTemperature(v)}
                    min={0.1}
                    max={2}
                    step={0.1}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Top-p: {topP}
                  </label>
                  <Slider
                    value={[topP]}
                    onValueChange={([v]) => setTopP(v)}
                    min={0.1}
                    max={1}
                    step={0.05}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={stream} onCheckedChange={setStream} />
                    <span className="text-sm">Stream</span>
                  </label>
                </div>
              </div>

              <Button
                className="w-full py-3 text-lg"
                onClick={handleGenerate}
                disabled={isGenerating || !modelId.trim() || !prompt.trim()}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Response</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="min-h-[200px] max-h-[400px] overflow-y-auto p-4 rounded-lg border border-border bg-muted/30 font-mono text-sm whitespace-pre-wrap">
                {response || (
                  <span className="text-muted-foreground">
                    Generated text will appear here...
                  </span>
                )}
                <div ref={responseRef} />
              </div>
              {response && (
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(response)}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setResponse("")}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Chains</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(stats).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No active chains</p>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-3">
                    {Object.entries(stats).map(([modelId, stat]) => (
                      <ChainStatCard
                        key={modelId}
                        modelId={modelId}
                        stat={stat}
                        onSelect={() => {
                          setSelectedChain(modelId)
                          setShowChainDetail(true)
                        }}
                        onRelease={() => handleReleaseChain(modelId)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showChainDetail} onOpenChange={setShowChainDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Chain Details: {selectedChain}</DialogTitle>
            <DialogDescription>Block-by-block breakdown of the chain</DialogDescription>
          </DialogHeader>
          {selectedChain && stats[selectedChain] && (
            <div className="space-y-4 py-4">
              <ChainDetail stat={stats[selectedChain]} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChainDetail(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ChainStatCard({ modelId, stat, onSelect, onRelease }: { modelId: string; stat: ChainStats; onSelect: () => void; onRelease: () => void }) {
  return (
    <Button
      variant={selectedChain === modelId ? "primary" : "outline"}
      className="w-full justify-start gap-3 p-3"
      onClick={onSelect}
    >
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          <span className="font-medium truncate">{modelId}</span>
          <Badge variant={stat.initialized ? "success" : "secondary"} className="text-xs">
            {stat.initialized ? "Ready" : "Initializing"}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
          <span className="flex items-center gap-1">
            <MemoryStick className="h-3 w-3" />
            {formatBytes(stat.total_memory_mb * 1024 * 1024)}
          </span>
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            {stat.loaded_blocks}/{stat.total_blocks} blocks
          </span>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onRelease() }}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </Button>
  )
}

function ChainDetail({ stat }: { stat: ChainStats }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Total Blocks</p>
          <p className="font-bold text-xl">{stat.total_blocks}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Loaded Blocks</p>
          <p className="font-bold text-xl">{stat.loaded_blocks}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Total Memory</p>
          <p className="font-bold text-xl">{formatBytes(stat.total_memory_mb * 1024 * 1024)}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">Model</p>
          <p className="font-bold text-xl truncate">{stat.model_id}</p>
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-2">Block Details</h4>
        <ScrollArea className="max-h-96">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2">Block</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Layers</th>
                <th className="text-left p-2">Memory</th>
                <th className="text-left p-2">Compute Time</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stat.blocks).map(([blockId, block]) => (
                <tr key={blockId} className="border-b border-border/50">
                  <td className="p-2 font-mono">{blockId}</td>
                  <td className="p-2">
                    <Badge variant={getStatusColor(block.status) as any} className="text-xs">
                      {block.status}
                    </Badge>
                  </td>
                  <td className="p-2 font-mono">{block.layer_range[0]}-{block.layer_range[1]}</td>
                  <td className="p-2">{formatBytes(block.memory_mb * 1024 * 1024)}</td>
                  <td className="p-2">{block.compute_time.toFixed(2)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  )
}