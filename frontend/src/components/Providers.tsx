"use client";

import React, { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "react-hot-toast";
import { TooltipProvider } from "@/components/ui/Tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored) {
      document.documentElement.classList.toggle("dark", stored === "dark");
    }
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "hsl(var(--background))",
              color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
            },
            success: {
              iconTheme: {
                primary: "#22c55e",
                secondary: "white",
              },
            },
            error: {
              iconTheme: {
                primary: "#ef4444",
                secondary: "white",
              },
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}