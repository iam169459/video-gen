"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Video,
  Download,
  Settings,
  Terminal,
  Brain,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SidebarStore } from "@/lib/stores";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Video Generation", href: "/generate", icon: Video },
  { name: "Model Downloads", href: "/models", icon: Download },
  { name: "LLM Chain", href: "/chain", icon: Brain },
  { name: "System Monitor", href: "/monitor", icon: BarChart3 },
  { name: "Terminal", href: "/terminal", icon: Terminal },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { sidebarOpen, setSidebarOpen } = SidebarStore();

  if (!sidebarOpen) return null;

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-card border-r border-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-border">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            <Video className="h-6 w-6" />
            <span>VideoGen AI</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1" role="navigation" aria-label="Main navigation">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                collapsed && "justify-center"
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        {!collapsed && (
          <div className="text-xs text-muted-foreground text-center">
            v1.0.0
          </div>
        )}
      </div>
    </aside>
  );
}