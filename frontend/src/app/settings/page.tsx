"use client";

import React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { SettingsPageContent } from "@/components/pages/SettingsPage";

export default function SettingsPage() {
  return (
    <MainLayout>
      <SettingsPageContent />
    </MainLayout>
  );
}