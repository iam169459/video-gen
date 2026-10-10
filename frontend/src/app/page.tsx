"use client";

import React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { DashboardContent } from "@/components/pages/Dashboard";

export default function HomePage() {
  return (
    <MainLayout>
      <DashboardContent />
    </MainLayout>
  );
}