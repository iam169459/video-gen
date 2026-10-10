"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  RotateCcw,
  Download,
  Trash2,
  Shield,
  Bell,
  Palette,
  Database,
  Terminal,
  Globe,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/Dialog";
import { api } from "@/lib/api";
import { useSettingsStore, useSystemStore, useUIStore } from "@/lib/stores";
import { formatBytes, cn } from "@/lib/utils";
import type { UpdateProgress, UpdateChannel } from "@/types";

export function SettingsPageContent() {
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ update_available: boolean; version?: string } | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<UpdateChannel>("stable");
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { theme, setTheme } = useUIStore();
  const { addNotification } = useUIStore();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await api.getSettings();
        setSettings(data);
        setUpdateChannel(data.UPDATE_CHANNEL || "stable");
        setAutoUpdate(data.AUTO_UPDATE_ENABLED || false);
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      }
    };
    fetchSettings();

    const fetchUpdateInfo = async () => {
      try {
        const data = await api.getUpdateProgress();
        setUpdateProgress(data);
        const updateCheck = await api.checkUpdates();
        setUpdateInfo(updateCheck);
        setUpdateChannel(updateCheck.channel || "stable");
      } catch (error) {
        console.error("Failed to fetch update info:", error);
      }
    };
    fetchUpdateInfo();
  }, []);

  const handleSettingChange = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    api.updateSettings(newSettings).catch(() => {
      addNotification({ type: "error", message: `Failed to update ${key}` });
    });
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      const data = await api.checkUpdates(true);
      setUpdateInfo(data);
      if (data.update_available) {
        addNotification({ type: "success", message: `Update available: v${data.version}` });
      } else {
        addNotification({ type: "info", message: "You are up to date" });
      }
    } catch (error) {
      addNotification({ type: "error", message: "Failed to check for updates" });
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await api.installUpdate();
      addNotification({ type: "success", message: "Update installation started" });
    } catch (error) {
      addNotification({ type: "error", message: "Failed to start update" });
    }
  };

  const handleChannelChange = async (channel: UpdateChannel) => {
    setUpdateChannel(channel);
    try {
      await api.setUpdateChannel(channel);
      addNotification({ type: "success", message: `Update channel set to ${channel}` });
    } catch (error) {
      addNotification({ type: "error", message: "Failed to update channel" });
    }
  };

  const handleResetSettings = async () => {
    try {
      await api.updateSettings({});
      addNotification({ type: "success", message: "Settings reset to defaults" });
      setShowResetConfirm(false);
    } catch (error) {
      addNotification({ type: "error", message: "Failed to reset settings" });
    }
  };

  const tabs = [
    { id: "general", label: "General", icon: Settings },
    { id: "updates", label: "Updates", icon: RotateCcw },
    { id: "storage", label: "Storage", icon: Database },
    { id: "advanced", label: "Advanced", icon: Terminal },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your VideoGen AI experience</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <label className="block text-sm font-medium">Theme</label>
                <div className="flex items-center gap-4">
                  {["light", "dark", "system"].map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="theme"
                        value={t}
                        checked={theme === t}
                        onChange={() => setTheme(t as any)}
                        className="sr-only peer"
                      />
                      <div className={cn(
                        "flex items-center gap-2 px-4 py-3 rounded-lg border transition-all",
                        theme === t
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-primary/50"
                      )}>
                        <span className="capitalize">{t}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <label className="block text-sm font-medium">Language</label>
                <Select value={settings.LANGUAGE || "en"} onValueChange={(v) => handleSettingChange("LANGUAGE", v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="ko">Korean</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto-save settings</p>
                  <p className="text-sm text-muted-foreground">Automatically save settings changes</p>
                </div>
                <Switch
                  checked={settings.AUTO_SAVE !== false}
                  onCheckedChange={(checked) => handleSettingChange("AUTO_SAVE", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Telemetry</p>
                  <p className="text-sm text-muted-foreground">Send anonymous usage data to improve the app</p>
                </div>
                <Switch
                  checked={settings.TELEMETRY_ENABLED || false}
                  onCheckedChange={(checked) => handleSettingChange("TELEMETRY_ENABLED", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Desktop Notifications</p>
                  <p className="text-sm text-muted-foreground">Show notifications for task completion</p>
                </div>
                <Switch
                  checked={settings.DESKTOP_NOTIFICATIONS !== false}
                  onCheckedChange={(checked) => handleSettingChange("DESKTOP_NOTIFICATIONS", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sound Notifications</p>
                  <p className="text-sm text-muted-foreground">Play sound when tasks complete</p>
                </div>
                <Switch
                  checked={settings.SOUND_NOTIFICATIONS || false}
                  onCheckedChange={(checked) => handleSettingChange("SOUND_NOTIFICATIONS", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="updates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                Software Updates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Current Version</p>
                  <p className="text-sm text-muted-foreground">v1.0.0</p>
                </div>
                <Button onClick={handleCheckUpdates} disabled={isCheckingUpdates}>
                  <RotateCcw className={cn("h-4 w-4 mr-2", isCheckingUpdates && "animate-spin")} />
                  {isCheckingUpdates ? "Checking..." : "Check for Updates"}
                </Button>
              </div>

              {updateInfo && (
                <div className={cn(
                  "p-4 rounded-lg border",
                  updateInfo.update_available ? "border-green-500/50 bg-green-500/5" : "border-border bg-muted/50"
                )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {updateInfo.update_available ? "Update Available" : "Up to Date"}
                      </p>
                      {updateInfo.version && (
                        <p className="text-sm text-muted-foreground">Version {updateInfo.version} available</p>
                      )}
                    </div>
                    {updateInfo.update_available && (
                      <Button onClick={handleInstallUpdate} className="ml-4">
                        <Download className="h-4 w-4 mr-2" />
                        Install
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {updateProgress && updateProgress.status !== "up_to_date" && (
                <div className="space-y-3 p-4 rounded-lg border border-primary/50 bg-primary/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Update in Progress</p>
                      <p className="text-sm text-muted-foreground">{updateProgress.current_step}</p>
                    </div>
                    <Badge variant="outline">{updateProgress.status}</Badge>
                  </div>
                  <Progress value={updateProgress.progress_percent} max={100} className="h-3" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Step {updateProgress.current_step_num} of {updateProgress.total_steps}</span>
                    <span>{updateProgress.speed_mbps.toFixed(1)} MB/s</span>
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-4">
                <label className="block text-sm font-medium">Update Channel</label>
                <Select value={updateChannel} onValueChange={handleChannelChange}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stable">Stable (Recommended)</SelectItem>
                    <SelectItem value="beta">Beta</SelectItem>
                    <SelectItem value="nightly">Nightly</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Stable: Well-tested releases. Beta: Early access to new features. Nightly: Latest development builds.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto Update</p>
                  <p className="text-sm text-muted-foreground">Automatically download and install updates</p>
                </div>
                <Switch
                  checked={autoUpdate}
                  onCheckedChange={(checked) => {
                    setAutoUpdate(checked);
                    handleSettingChange("AUTO_UPDATE_ENABLED", checked);
                  }}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Check Interval</label>
                <Select value={settings.UPDATE_CHECK_INTERVAL_HOURS || 24} onValueChange={(v) => handleSettingChange("UPDATE_CHECK_INTERVAL_HOURS", parseInt(v))}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Every Hour</SelectItem>
                    <SelectItem value="6">Every 6 Hours</SelectItem>
                    <SelectItem value="12">Every 12 Hours</SelectItem>
                    <SelectItem value="24">Daily</SelectItem>
                    <SelectItem value="168">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Hugging Face Token</label>
                <Input
                  type="password"
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxx"
                  value={settings.HUGGINGFACE_TOKEN || ""}
                  onChange={(e) => handleSettingChange("HUGGINGFACE_TOKEN", e.target.value)}
                />
                <p className="text-sm text-muted-foreground">Required for private/gated models</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">GitHub Token (for updates)</label>
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={settings.GITHUB_TOKEN || ""}
                  onChange={(e) => handleSettingChange("GITHUB_TOKEN", e.target.value)}
                />
                <p className="text-sm text-muted-foreground">Required for private repository updates</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Storage Paths
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "MODELS_DIR", label: "Models Directory", default: "~/data/models" },
                { key: "OUTPUT_DIR", label: "Output Directory", default: "~/data/outputs" },
                { key: "TEMP_DIR", label: "Temp Directory", default: "~/data/temp" },
                { key: "CACHE_DIR", label: "Cache Directory", default: "~/data/cache" },
                { key: "LOGS_DIR", label: "Logs Directory", default: "~/data/logs" },
              ].map((dir) => (
                <div key={dir.key} className="space-y-2">
                  <label className="block text-sm font-medium">{dir.label}</label>
                  <Input
                    value={settings[dir.key] || dir.default}
                    onChange={(e) => handleSettingChange(dir.key, e.target.value)}
                    readOnly
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Download Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Max Concurrent Downloads: {settings.MAX_CONCURRENT_DOWNLOADS || 3}
                  </label>
                  <Slider
                    value={[settings.MAX_CONCURRENT_DOWNLOADS || 3]}
                    onValueChange={([v]) => handleSettingChange("MAX_CONCURRENT_DOWNLOADS", v)}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Download Timeout: {settings.DOWNLOAD_TIMEOUT || 3600}s
                  </label>
                  <Slider
                    value={[settings.DOWNLOAD_TIMEOUT || 3600]}
                    onValueChange={([v]) => handleSettingChange("DOWNLOAD_TIMEOUT", v)}
                    min={300}
                    max={7200}
                    step={300}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Chunk Size: {settings.DOWNLOAD_CHUNK_SIZE || 8192} bytes
                  </label>
                  <Slider
                    value={[settings.DOWNLOAD_CHUNK_SIZE || 8192]}
                    onValueChange={([v]) => handleSettingChange("DOWNLOAD_CHUNK_SIZE", v)}
                    min={1024}
                    max={65536}
                    step={1024}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Max Model Size: {settings.MAX_MODEL_SIZE_GB || 50} GB
                  </label>
                  <Slider
                    value={[settings.MAX_MODEL_SIZE_GB || 50]}
                    onValueChange={([v]) => handleSettingChange("MAX_MODEL_SIZE_GB", v)}
                    min={1}
                    max={200}
                    step={1}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Verify Checksums</p>
                  <p className="text-sm text-muted-foreground">Verify downloaded model integrity</p>
                </div>
                <Switch
                  checked={settings.VERIFY_CHECKSUMS !== false}
                  onCheckedChange={(checked) => handleSettingChange("VERIFY_CHECKSUMS", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Cleanup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" onClick={() => addNotification({ type: "info", message: "Cleanup not implemented yet" })}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clean Temporary Files
              </Button>
              <Button variant="outline" onClick={() => addNotification({ type: "info", message: "Cache clear not implemented yet" })}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Clear Cache
              </Button>
              <Button variant="destructive" onClick={() => setShowResetConfirm(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Reset All Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Chain Block System
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Max Blocks: {settings.CHAIN_MAX_BLOCKS || 8}
                  </label>
                  <Slider
                    value={[settings.CHAIN_MAX_BLOCKS || 8]}
                    onValueChange={([v]) => handleSettingChange("CHAIN_MAX_BLOCKS", v)}
                    min={1}
                    max={16}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Block Size: {settings.CHAIN_BLOCK_SIZE || 4}
                  </label>
                  <Slider
                    value={[settings.CHAIN_BLOCK_SIZE || 4]}
                    onValueChange={([v]) => handleSettingChange("CHAIN_BLOCK_SIZE", v)}
                    min={1}
                    max={8}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Overlap: {settings.CHAIN_OVERLAP || 1}
                  </label>
                  <Slider
                    value={[settings.CHAIN_OVERLAP || 1]}
                    onValueChange={([v]) => handleSettingChange("CHAIN_OVERLAP", v)}
                    min={0}
                    max={4}
                    step={1}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium flex justify-between">
                    Timeout: {settings.CHAIN_TIMEOUT_SECONDS || 300}s
                  </label>
                  <Slider
                    value={[settings.CHAIN_TIMEOUT_SECONDS || 300]}
                    onValueChange={([v]) => handleSettingChange("CHAIN_TIMEOUT_SECONDS", v)}
                    min={60}
                    max={600}
                    step={30}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">CPU Offload</p>
                  <p className="text-sm text-muted-foreground">Offload inactive blocks to CPU memory</p>
                </div>
                <Switch
                  checked={settings.ENABLE_CPU_OFFLOAD !== false}
                  onCheckedChange={(checked) => handleSettingChange("ENABLE_CPU_OFFLOAD", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">xFormers Memory Efficient Attention</p>
                  <p className="text-sm text-muted-foreground">Enable xFormers for memory efficiency</p>
                </div>
                <Switch
                  checked={settings.ENABLE_XFORMERS !== false}
                  onCheckedChange={(checked) => handleSettingChange("ENABLE_XFORMERS", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">FP16 Precision</p>
                  <p className="text-sm text-muted-foreground">Use half precision for models</p>
                </div>
                <Switch
                  checked={settings.USE_FP16 !== false}
                  onCheckedChange={(checked) => handleSettingChange("USE_FP16", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">BF16 Precision</p>
                  <p className="text-sm text-muted-foreground">Use bfloat16 (requires Ampere+ GPU)</p>
                </div>
                <Switch
                  checked={settings.USE_BF16 || false}
                  onCheckedChange={(checked) => handleSettingChange("USE_BF16", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Server Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Host</label>
                  <Input value={settings.HOST || "0.0.0.0"} onChange={(e) => handleSettingChange("HOST", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Port</label>
                  <Input type="number" value={settings.PORT || 8000} onChange={(e) => handleSettingChange("PORT", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Workers</label>
                  <Input type="number" value={settings.WORKERS || 1} onChange={(e) => handleSettingChange("WORKERS", parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Log Level</label>
                  <Select value={settings.LOG_LEVEL || "INFO"} onValueChange={(v) => handleSettingChange("LOG_LEVEL", v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEBUG">Debug</SelectItem>
                      <SelectItem value="INFO">Info</SelectItem>
                      <SelectItem value="WARNING">Warning</SelectItem>
                      <SelectItem value="ERROR">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Debug Mode</p>
                  <p className="text-sm text-muted-foreground">Enable debug logging and features</p>
                </div>
                <Switch
                  checked={settings.DEBUG || false}
                  onCheckedChange={(checked) => handleSettingChange("DEBUG", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-3 rounded-lg border">
                  <p className="text-sm text-muted-foreground">Python Version</p>
                  <p className="font-medium">3.10+</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-sm text-muted-foreground">PyTorch Version</p>
                  <p className="font-medium">2.2+</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-sm text-muted-foreground">CUDA Version</p>
                  <p className="font-medium">12.1+</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-sm text-muted-foreground">Platform</p>
                  <p className="font-medium">Linux/Debian</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Settings</DialogTitle>
            <DialogDescription>
              This will reset all settings to their default values. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetSettings}>
              <Trash2 className="h-4 w-4 mr-2" />
              Reset All Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}