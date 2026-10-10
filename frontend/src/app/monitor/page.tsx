"use client";

import React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { MonitorPageContent } from "@/components/pages/MonitorPage";

export default function MonitorPage() {
  return (
    <MainLayout>
      <MonitorPageContent />
    </MainLayout>
  );
}