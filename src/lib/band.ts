import { create } from "zustand";

export type Band = "base" | "mid" | "summit";

interface BandState {
  band: Band;
  setBand: (b: Band) => void;
}

export const useBand = create<BandState>((set) => ({
  band: "summit",
  setBand: (band) => set({ band }),
}));
