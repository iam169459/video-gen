"use client";

import React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { GeneratePageContent } from "@/components/pages/GeneratePage";

export default function GeneratePage() {
  return (
    <MainLayout>
      <GeneratePageContent />
    </MainLayout>
  );
}