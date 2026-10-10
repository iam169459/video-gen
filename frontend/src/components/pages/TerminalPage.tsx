"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Terminal as TerminalIcon,
  Send,
  X,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import { api } from "@/lib/api";
import { useUIStore } from "@/lib/stores";
import { cn } from "@/lib/utils";

const DEFAULT_SHELL = "/bin/bash";
const PROMPT = "$ ";

export function TerminalPageContent() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isConnected, setIsConnected] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [output, setOutput] = useState<Array<{ type: "input" | "output" | "error"; content: string }>>([]);
  const [activeTab, setActiveTab] = useState("terminal");
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { addNotification } = useUIStore();

  useEffect(() => {
    connectTerminal();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectTerminal = () => {
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}/api/v1/ws/terminal`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      addOutput("output", "Connected to terminal server\r\n");
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "output") {
          addOutput("output", data.content);
        } else if (data.type === "error") {
          addOutput("error", data.content);
        } else if (data.type === "prompt") {
          setIsExecuting(false);
        }
      } catch {
        addOutput("output", event.data);
      }
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
      addOutput("error", "\r\nDisconnected from terminal server\r\n");
      setTimeout(connectTerminal, 3000);
    };

    wsRef.current.onerror = () => {
      addOutput("error", "\r\nTerminal connection error\r\n");
    };
  };

  const addOutput = (type: "input" | "output" | "error", content: string) => {
    setOutput((prev) => [...prev, { type, content }]);
    setTimeout(() => {
      terminalRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isConnected || isExecuting) return;

    const command = input;
    addOutput("input", `${PROMPT}${command}\r\n`);
    setHistory((prev) => [...prev, command]);
    setHistoryIndex(-1);
    setInput("");
    setIsExecuting(true);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "command", command }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput("");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
    } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isExecuting) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "interrupt" }));
        }
        setIsExecuting(false);
        addOutput("output", "^C\r\n");
      }
    }
  };

  const clearTerminal = () => {
    setOutput([]);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "clear" }));
    }
  };

  const scrollToBottom = () => {
    terminalRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Terminal</h1>
          <p className="text-muted-foreground mt-1">System terminal access</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "success" : "destructive"} className="flex items-center gap-1">
            <span className={cn("relative flex h-2 w-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
          <Button variant="outline" size="sm" onClick={clearTerminal}>
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="terminal">
            <TerminalIcon className="h-4 w-4 mr-2" />
            Terminal
          </TabsTrigger>
          <TabsTrigger value="logs">
            <TerminalIcon className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="terminal">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle className="text-lg">Terminal Session</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {DEFAULT_SHELL}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <ScrollArea className="h-full">
                <div
                  className="p-4 font-mono text-sm bg-black text-green-100 min-h-full"
                  style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.6 }}
                >
                  <div ref={terminalRef} className="flex flex-col">
                    {output.map((line, index) => (
                      <div
                        key={index}
                        className={cn(
                          "whitespace-pre-wrap break-all",
                          line.type === "input" && "text-blue-300",
                          line.type === "error" && "text-red-300",
                          line.type === "output" && "text-green-100"
                        )}
                      >
                        {line.content}
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
              <div className="border-t border-border p-4 flex items-center gap-2 bg-muted/50">
                <span className="text-green-400 font-mono">{PROMPT}</span>
                <form onSubmit={handleSubmit} className="flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-transparent border-none outline-none text-green-100 font-mono text-sm"
                    placeholder="Enter command..."
                    disabled={!isConnected || isExecuting}
                    autoFocus
                  />
                </form>
                {isExecuting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle className="text-lg">System Logs</CardTitle>
              <Button variant="outline" size="sm" onClick={() => addNotification({ type: "info", message: "Log refresh not implemented" })}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <ScrollArea className="h-full">
                <div className="p-4 font-mono text-sm bg-black text-gray-300 min-h-full" style={{ fontFamily: "monospace", lineHeight: 1.5 }}>
                  <div className="text-gray-500">Loading logs...</div>
                  <div className="text-gray-500 mt-2">Log streaming not yet implemented in backend</div>
                  <div className="text-gray-500 mt-2">Connect to backend /logs endpoint to stream logs</div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Commands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              "nvidia-smi",
              "htop",
              "df -h",
              "free -h",
              "docker ps",
              "docker stats --no-stream",
              "python -c \"import torch; print(torch.cuda.is_available())\"",
              "ls -la ~/data/models",
            ].map((cmd) => (
              <Button
                key={cmd}
                variant="ghost"
                className="w-full justify-start gap-2 px-3 py-1.5 text-sm"
                onClick={() => {
                  setInput(cmd);
                  inputRef.current?.focus();
                }}
              >
                <Copy className="h-3 w-3" />
                <code className="text-xs">{cmd}</code>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GPU Commands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              "nvidia-smi -l 1",
              "nvidia-smi dmon -s pucvmet",
              "watch -n 1 nvidia-smi",
              "gpustat -cp",
            ].map((cmd) => (
              <Button
                key={cmd}
                variant="ghost"
                className="w-full justify-start gap-2 px-3 py-1.5 text-sm"
                onClick={() => {
                  setInput(cmd);
                  inputRef.current?.focus();
                }}
              >
                <Copy className="h-3 w-3" />
                <code className="text-xs">{cmd}</code>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Docker Commands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              "docker compose up -d",
              "docker compose down",
              "docker compose logs -f",
              "docker compose restart",
              "docker system prune -a",
            ].map((cmd) => (
              <Button
                key={cmd}
                variant="ghost"
                className="w-full justify-start gap-2 px-3 py-1.5 text-sm"
                onClick={() => {
                  setInput(cmd);
                  inputRef.current?.focus();
                }}
              >
                <Copy className="h-3 w-3" />
                <code className="text-xs">{cmd}</code>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}