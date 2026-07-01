import { MOUNTAINS } from "@/lib/mountains-data";
import type { Mountain } from "@/lib/types";

export interface RegionSubgroup {
  label: string | null;
  mountains: Mountain[];
}
export interface RegionGroup {
  id: "washington" | "oregon" | "beyond";
  title: string;
  note: string;
  subgroups: RegionSubgroup[];
}

type GroupId = RegionGroup["id"];
const GROUP_ORDER: GroupId[] = ["washington", "oregon", "beyond"];

const GROUP_META: Record<GroupId, { title: string; note: string }> = {
  washington: {
    title: "Washington",
    note: "The Cascades and Olympics — hourly weather, NWAC avalanche danger, and SNOTEL snowpack.",
  },
  oregon: {
    title: "Oregon",
    note: "Oregon's Cascade volcanoes. Weather and satellite everywhere; NWAC avalanche coverage thins south of Mount Hood.",
  },
  beyond: {
    title: "Beyond the Northwest",
    note: "Peaks outside NWAC's region — weather and satellite only (no avalanche or SNOTEL feed).",
  },
};

// region string → group + sub-label + intra-group order
const REGION_MAP: Record<string, { group: GroupId; subLabel: string | null; subOrder: number }> = {
  "cascades-north": { group: "washington", subLabel: "North Cascades", subOrder: 0 },
  "cascades-central": { group: "washington", subLabel: "Central Cascades · Enchantments", subOrder: 1 },
  "cascades-south": { group: "washington", subLabel: "South Cascades", subOrder: 2 },
  olympics: { group: "washington", subLabel: "Olympics", subOrder: 3 },
  oregon: { group: "oregon", subLabel: null, subOrder: 0 },
  "sierra-nevada": { group: "beyond", subLabel: null, subOrder: 0 },
};
const FALLBACK = { group: "beyond" as GroupId, subLabel: "Other peaks", subOrder: 99 };

export function browseGroups(mountains: readonly Mountain[] = MOUNTAINS): RegionGroup[] {
  const buckets = new Map<GroupId, Map<string, { label: string | null; order: number; mountains: Mountain[] }>>();
  for (const m of mountains) {
    const cfg = REGION_MAP[m.region] ?? FALLBACK;
    if (!buckets.has(cfg.group)) buckets.set(cfg.group, new Map());
    const subs = buckets.get(cfg.group)!;
    const key = cfg.subLabel ?? "__none__";
    if (!subs.has(key)) subs.set(key, { label: cfg.subLabel, order: cfg.subOrder, mountains: [] });
    subs.get(key)!.mountains.push(m);
  }
  const result: RegionGroup[] = [];
  for (const id of GROUP_ORDER) {
    const subs = buckets.get(id);
    if (!subs) continue;
    const subgroups: RegionSubgroup[] = [...subs.values()]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        label: s.label,
        mountains: [...s.mountains].sort((a, b) => b.elevations.summit - a.elevations.summit),
      }));
    result.push({ id, title: GROUP_META[id].title, note: GROUP_META[id].note, subgroups });
  }
  return result;
}
