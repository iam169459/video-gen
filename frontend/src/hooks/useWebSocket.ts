import { useEffect, useRef, useCallback, useState } from "react";
import type { VideoGenerationResult, DownloadProgress, SystemMetrics, UpdateProgress } from "@/types";

interface UseWebSocketOptions<T> {
  url: string;
  onMessage?: (data: T) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
}

export function useWebSocket<T>({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnect = true,
  reconnectInterval = 3000,
}: UseWebSocketOptions<T>) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<T | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T;
        setLastMessage(data);
        onMessage?.(data);
      } catch (error) {
        console.error("WebSocket message parse error:", error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      onClose?.();
      
      if (reconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    };

    ws.onerror = (error) => {
      onError?.(error);
    };
  }, [url, onMessage, onOpen, onClose, onError, reconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return { isConnected, lastMessage, send, connect, disconnect };
}

export function useVideoTaskWebSocket(taskId: string | null, onUpdate?: (task: VideoGenerationResult) => void) {
  return useWebSocket<VideoGenerationResult>({
    url: taskId ? `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}/api/v1/video/tasks/${taskId}/ws` : "",
    onMessage: onUpdate,
    reconnect: !!taskId,
  });
}

export function useDownloadWebSocket(downloadId: string | null, onUpdate?: (progress: DownloadProgress) => void) {
  return useWebSocket<DownloadProgress>({
    url: downloadId ? `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}/api/v1/models/downloads/${downloadId}/ws` : "",
    onMessage: onUpdate,
    reconnect: !!downloadId,
  });
}

export function useSystemMetricsWebSocket(onUpdate?: (metrics: SystemMetrics) => void) {
  return useWebSocket<SystemMetrics>({
    url: `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}/api/v1/system/metrics/ws`,
    onMessage: onUpdate,
    reconnect: true,
  });
}

export function useUpdateProgressWebSocket(onUpdate?: (progress: UpdateProgress) => void) {
  return useWebSocket<UpdateProgress>({
    url: `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"}/api/v1/update/progress/ws`,
    onMessage: onUpdate,
    reconnect: true,
  });
}