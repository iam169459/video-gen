"use client";

import React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ChainPageContent } from "@/components/pages/ChainPage";

export default function ChainPage() {
  return (
    <MainLayout>
      <ChainPageContent />
    </MainLayout>
  );
}