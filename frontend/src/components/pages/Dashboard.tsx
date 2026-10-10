"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import {
  Video,
  Download,
  Brain,
  BarChart3,
  Terminal,
  Settings,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Loader2,
  HardDrive,
  Cpu,
  MemoryStick,
  Wifi,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Separator } from "@/components/ui/Separator";
import { api } from "@/lib/api";
import { useVideoStore, useDownloadStore, useSystemStore, useUIStore } from "@/lib/stores";
import { formatBytes, formatDuration, getStatusColor, cn } from "@/lib/utils";
import type { SystemMetrics, VideoGenerationResult } from "@/types";

const quickActions = [
  { name: "Generate Video", href: "/generate", icon: Video, description: "Create videos from images or text" },
  { name: "Download Models", href: "/models", icon: Download, description: "Browse and download AI models" },
  { name: "LLM Chain", href: "/chain", icon: Brain, description: "Run large language models efficiently" },
  { name: "System Monitor", href: "/monitor", icon: BarChart3, description: "Monitor system resources" },
  { name: "Terminal", href: "/terminal", icon: Terminal, description: "Access system terminal" },
  { name: "Settings", href: "/settings", icon: Settings, description: "Configure application settings" },
];

const statusCards = [
  { name: "CPU Usage", icon: Cpu, key: "cpu_percent", unit: "%", color: "bg-blue-500" },
  { name: "Memory Usage", icon: MemoryStick, key: "memory_percent", unit: "%", color: "bg-green-500" },
  { name: "Disk Usage", icon: HardDrive, key: "disk_percent", unit: "%", color: "bg-yellow-500" },
  { name: "Network", icon: Wifi, key: "network", unit: "MB/s", color: "bg-purple-500" },
];

export function DashboardContent() {
  const { tasks, setTasks } = useVideoStore();
  const { downloads, setDownloads } = useDownloadStore();
  const { metrics, setMetrics, updateProgress, setUpdateProgress } = useSystemStore();
  const { addNotification } = useUIStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [health, videoTasks, downloadList, systemMetrics, updateStatus] = await Promise.allSettled([
          api.healthCheck(),
          api.listVideoTasks(),
          api.listDownloads(),
          api.getSystemMetrics(),
          api.getUpdateProgress(),
        ]);

        if (health.status === "fulfilled") {
          console.log("Health:", health.value);
        }
        if (videoTasks.status === "fulfilled") {
          setTasks(videoTasks.value);
        }
        if (downloadList.status === "fulfilled") {
          setDownloads(downloadList.value);
        }
        if (systemMetrics.status === "fulfilled") {
          setMetrics(systemMetrics.value);
        }
        if (updateStatus.status === "fulfilled") {
          setUpdateProgress(updateStatus.value);
        }
      } catch (error) {
        console.error("Dashboard fetch error:", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [setTasks, setDownloads, setMetrics, setUpdateProgress]);

  const recentTasks = tasks.slice(0, 5);
  const activeDownloads = downloads.filter(
    (d) => d.status === "downloading" || d.status === "queued" || d.status === "verifying"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your video generation system</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={metrics ? "success" : "secondary"}>
            {metrics ? "System Online" : "Loading..."}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statusCards.map((card) => {
          let value = 0;
          let label = "0%";
          
          if (metrics) {
            if (card.key === "cpu_percent") {
              value = metrics.cpu_percent;
              label = `${metrics.cpu_percent.toFixed(1)}%`;
            } else if (card.key === "memory_percent") {
              value = metrics.memory_percent;
              label = `${metrics.memory_percent.toFixed(1)}% (${formatBytes(metrics.memory_used_gb * 1024 ** 3)} / ${formatBytes(metrics.memory_total_gb * 1024 ** 3)})`;
            } else if (card.key === "disk_percent") {
              value = metrics.disk_percent;
              label = `${metrics.disk_percent.toFixed(1)}% (${formatBytes(metrics.disk_used_gb * 1024 ** 3)} / ${formatBytes(metrics.disk_total_gb * 1024 ** 3)})`;
            } else if (card.key === "network") {
              const total = (metrics.network_io.bytes_sent_per_sec + metrics.network_io.bytes_recv_per_sec) / (1024 ** 2);
              value = total;
              label = `${total.toFixed(2)} MB/s`;
            }
          }

          return (
            <Card key={card.name}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{card.name}</p>
                    <p className="text-2xl font-bold mt-1">{label}</p>
                  </div>
                  <div className={cn("p-3 rounded-full", card.color)}>
                    <card.icon className="h-5 w-5 text-white" />
                  </div>
                </div>
                <Progress value={value} max={100} className="mt-4 h-1.5" variant="default" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickActions.map((action) => (
                <Link
                  key={action.name}
                  href={action.href}
                  className="group flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-all"
                >
                  <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{action.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Backend API</span>
              </div>
              <Badge variant="success">Online</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Video Generator</span>
              </div>
              <Badge variant="success">Ready</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Download Manager</span>
              </div>
              <Badge variant="success">Ready</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Chain Block System</span>
              </div>
              <Badge variant="success">Ready</Badge>
            </div>
            {metrics && metrics.gpu_count > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>GPU Acceleration ({metrics.gpu_count} GPU{s})</span>
                  </div>
                  <Badge variant="success">Available</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Video Tasks</CardTitle>
            <Link href="/generate" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No video tasks yet</p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/generate">Create your first video</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTasks.map((task) => (
                  <div key={task.task_id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Video className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{task.params.prompt.slice(0, 50)}...</p>
                      <p className="text-xs text-muted-foreground">
                        {task.params.model_type} • {task.params.num_frames} frames • {formatDuration(task.params.num_frames / task.params.fps)}
                      </p>
                    </div>
                    <Badge variant={getStatusColor(task.status) as any}>{task.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Downloads</CardTitle>
            <Link href="/models" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {activeDownloads.length === 0 && downloads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Download className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No downloads yet</p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/models">Browse models</Link>
                </Button>
              </div>
            ) : activeDownloads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p>No active downloads</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeDownloads.map((download) => (
                  <div key={download.download_id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{download.model_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(download.downloaded_bytes)} / {formatBytes(download.total_bytes)}
                        </p>
                      </div>
                      <Badge variant={getStatusColor(download.status) as any}>{download.status}</Badge>
                    </div>
                    <Progress value={download.progress_percent} max={100} className="h-1.5" />
                    <p className="text-xs text-muted-foreground">
                      {download.speed_bps > 0 ? `${(download.speed_bps / (1024 ** 2)).toFixed(1)} MB/s` : "Starting..."}
                      {download.eta_seconds > 0 && ` • ETA: ${formatDuration(download.eta_seconds)}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {updateProgress && updateProgress.status !== "up_to_date" && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div>
                  <p className="font-medium">Update in Progress</p>
                  <p className="text-sm text-muted-foreground">{updateProgress.current_step}</p>
                </div>
              </div>
              <Progress value={updateProgress.progress_percent} max={100} className="w-48 h-2" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}