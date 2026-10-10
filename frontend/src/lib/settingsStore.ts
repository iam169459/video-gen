import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  settings: Record<string, any>;
  setSettings: (settings: Record<string, any>) => void;
  updateSetting: (key: string, value: any) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {},
      setSettings: (settings) => set({ settings }),
      updateSetting: (key, value) =>
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        })),
    }),
    {
      name: "settings-store",
    }
  )
);