"use client";

import React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Bell, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SidebarStore, UIStore } from "@/lib/stores";

export function Header() {
  const { theme, setTheme } = useTheme();
  const { sidebarOpen, setSidebarOpen } = SidebarStore();
  const { notifications, removeNotification } = UIStore();

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          <Button variant="ghost" size="sm" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {notifications.length > 0 && (
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-center gap-3 p-3 rounded-lg border shadow-lg animate-slide-down ${
                notification.type === "success"
                  ? "bg-green-500/10 border-green-500/20 text-green-500"
                  : notification.type === "error"
                  ? "bg-destructive/10 border-destructive/20 text-destructive"
                  : "bg-primary/10 border-primary/20 text-primary"
              }`}
            >
              <span className="flex-1 text-sm">{notification.message}</span>
              <Button variant="ghost" size="sm" onClick={() => removeNotification(notification.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}