"use client";

import React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { TerminalPageContent } from "@/components/pages/TerminalPage";

export default function TerminalPage() {
  return (
    <MainLayout>
      <TerminalPageContent />
    </MainLayout>
  );
}