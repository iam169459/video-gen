"use client";

import React, { useEffect } from "react";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Thermometer,
  Zap,
  Activity,
  Server,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { api } from "@/lib/api";
import { useSystemStore } from "@/lib/stores";
import { useSystemMetricsWebSocket } from "@/hooks/useWebSocket";
import { formatBytes, formatDuration, cn } from "@/lib/utils";
import type { SystemMetrics, GPUMetric } from "@/types";

const metricCards = [
  { name: "CPU Usage", icon: Cpu, color: "bg-blue-500", key: "cpu_percent", unit: "%" },
  { name: "Memory Usage", icon: MemoryStick, color: "bg-green-500", key: "memory_percent", unit: "%" },
  { name: "Disk Usage", icon: HardDrive, color: "bg-yellow-500", key: "disk_percent", unit: "%" },
  { name: "Network", icon: Wifi, color: "bg-purple-500", key: "network", unit: "MB/s" },
];

export function MonitorPageContent() {
  const { metrics, setMetrics, updateProgress } = useSystemStore();

  const { lastMessage: wsMetrics } = useSystemMetricsWebSocket((data) => {
    setMetrics(data);
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await api.getSystemMetrics();
        setMetrics(data);
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [setMetrics]);

  const currentMetrics = wsMetrics || metrics;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Monitor</h1>
          <p className="text-muted-foreground mt-1">Real-time system resource monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          {wsMetrics ? (
            <Badge variant="success" className="flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Live
            </Badge>
          ) : (
            <Badge variant="secondary">Polling</Badge>
          )}
        </div>
      </div>

      {currentMetrics && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {metricCards.map((card) => {
              let value = 0;
              let label = "0%";
              let detail = "";

              if (card.key === "cpu_percent") {
                value = currentMetrics.cpu_percent;
                label = `${currentMetrics.cpu_percent.toFixed(1)}%`;
              } else if (card.key === "memory_percent") {
                value = currentMetrics.memory_percent;
                label = `${currentMetrics.memory_percent.toFixed(1)}%`;
                detail = `${formatBytes(currentMetrics.memory_used_gb * 1024 ** 3)} / ${formatBytes(currentMetrics.memory_total_gb * 1024 ** 3)}`;
              } else if (card.key === "disk_percent") {
                value = currentMetrics.disk_percent;
                label = `${currentMetrics.disk_percent.toFixed(1)}%`;
                detail = `${formatBytes(currentMetrics.disk_used_gb * 1024 ** 3)} / ${formatBytes(currentMetrics.disk_total_gb * 1024 ** 3)}`;
              } else if (card.key === "network") {
                const total = (currentMetrics.network_io.bytes_sent_per_sec + currentMetrics.network_io.bytes_recv_per_sec) / (1024 ** 2);
                value = Math.min(total * 10, 100);
                label = `${total.toFixed(2)} MB/s`;
                detail = `↑ ${(currentMetrics.network_io.bytes_sent_per_sec / (1024 ** 2)).toFixed(2)} MB/s • ↓ ${(currentMetrics.network_io.bytes_recv_per_sec / (1024 ** 2)).toFixed(2)} MB/s`;
              }

              return (
                <Card key={card.name}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{card.name}</p>
                        <p className="text-3xl font-bold mt-1">{label}</p>
                        {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
                      </div>
                      <div className={cn("p-3 rounded-full", card.color)}>
                        <card.icon className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <Progress value={value} max={100} className="mt-4 h-2" />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Tabs defaultValue="gpu" className="space-y-4">
            <TabsList>
              <TabsTrigger value="gpu">GPU ({currentMetrics.gpu_count})</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="gpu" className="space-y-4">
              {currentMetrics.gpu_count === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No GPU Detected</h3>
                    <p className="text-muted-foreground mt-1">Running in CPU-only mode</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {currentMetrics.gpu_metrics.map((gpu) => (
                    <Card key={gpu.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">GPU {gpu.id}: {gpu.name}</CardTitle>
                          <Badge variant={gpu.temperature > 80 ? "destructive" : gpu.temperature > 65 ? "warning" : "success"}>
                            {gpu.temperature}°C
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>GPU Load</span>
                              <span className="font-medium">{gpu.load.toFixed(1)}%</span>
                            </div>
                            <Progress value={gpu.load} max={100} className="h-2" variant={gpu.load > 90 ? "destructive" : gpu.load > 70 ? "warning" : "default"} />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>VRAM Usage</span>
                              <span className="font-medium">
                                {formatBytes(gpu.memory_used * 1024 ** 2)} / {formatBytes(gpu.memory_total * 1024 ** 2)}
                              </span>
                            </div>
                            <Progress value={gpu.memory_percent} max={100} className="h-2" variant={gpu.memory_percent > 90 ? "destructive" : gpu.memory_percent > 75 ? "warning" : "default"} />
                          </div>
                        </div>
                        <div className="pt-2 border-t border-border">
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Temperature: {gpu.temperature}°C</span>
                            <span>Memory: {gpu.memory_percent.toFixed(1)}%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="details" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      CPU Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Usage</span>
                      <span className="font-medium">{currentMetrics.cpu_percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={currentMetrics.cpu_percent} max={100} className="h-2" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">System Load</span>
                      <span>Normal</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MemoryStick className="h-4 w-4" />
                      Memory Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Usage</span>
                      <span className="font-medium">{currentMetrics.memory_percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={currentMetrics.memory_percent} max={100} className="h-2" />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Used</p>
                        <p className="font-medium">{formatBytes(currentMetrics.memory_used_gb * 1024 ** 3)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-medium">{formatBytes(currentMetrics.memory_total_gb * 1024 ** 3)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-medium">{formatBytes((currentMetrics.memory_total_gb - currentMetrics.memory_used_gb) * 1024 ** 3)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Cached</p>
                        <p className="font-medium">-</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      Disk Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Usage</span>
                      <span className="font-medium">{currentMetrics.disk_percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={currentMetrics.disk_percent} max={100} className="h-2" />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Used</p>
                        <p className="font-medium">{formatBytes(currentMetrics.disk_used_gb * 1024 ** 3)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-medium">{formatBytes(currentMetrics.disk_total_gb * 1024 ** 3)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Free</p>
                        <p className="font-medium">{formatBytes((currentMetrics.disk_total_gb - currentMetrics.disk_used_gb) * 1024 ** 3)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Type</p>
                        <p className="font-medium">SSD</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wifi className="h-4 w-4" />
                      Network Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Upload</p>
                        <p className="font-medium">
                          {(currentMetrics.network_io.bytes_sent_per_sec / (1024 ** 2)).toFixed(2)} MB/s
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Download</p>
                        <p className="font-medium">
                          {(currentMetrics.network_io.bytes_recv_per_sec / (1024 ** 2)).toFixed(2)} MB/s
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <p className="text-sm text-muted-foreground">Real-time network throughput</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Power & Thermal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {currentMetrics.gpu_metrics.length > 0 ? (
                      currentMetrics.gpu_metrics.map((gpu) => (
                        <div key={gpu.id} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">GPU {gpu.id} Temp</span>
                            <span className={cn("font-medium", gpu.temperature > 80 ? "text-destructive" : gpu.temperature > 65 ? "text-yellow-500" : "text-green-500")}>
                              {gpu.temperature}°C
                            </span>
                          </div>
                          <Progress value={Math.min((gpu.temperature / 100) * 100, 100)} max={100} className="h-1.5" variant={gpu.temperature > 80 ? "destructive" : gpu.temperature > 65 ? "warning" : "success"} />
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">No GPU temperature data</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Process Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Backend Status</span>
                      <Badge variant="success">Running</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Uptime</span>
                      <span>Calculating...</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Python Version</span>
                      <span>3.10+</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">PyTorch Version</span>
                      <span>2.2+</span>
                    </div>
                    <Separator />
                    <p className="text-sm text-muted-foreground">Last updated: {new Date(currentMetrics.timestamp).toLocaleTimeString()}</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          {updateProgress && updateProgress.status !== "up_to_date" && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                    <div>
                      <p className="font-medium">System Update</p>
                      <p className="text-sm text-muted-foreground">{updateProgress.current_step}</p>
                    </div>
                  </div>
                  <Progress value={updateProgress.progress_percent} max={100} className="w-64 h-2" />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}