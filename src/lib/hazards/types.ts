export interface SourceMeta { source: string; observedAt?: string; distanceMi?: number; note?: string }

export interface AirQuality {
  aqi: number; categoryNumber: number; categoryName: string; parameter: string;
  reportingArea: string; trend: { date: string; aqi: number }[]; provenance: SourceMeta;
}
export interface StormAlert { event: string; severity: string; urgency: string; headline: string; onset: string | null; expires: string | null; areaDesc: string }
export interface StormAlerts { nws: StormAlert[]; spc: { label: string; label2: string } | null; stormActive: boolean; provenance: SourceMeta }
export interface VolcanoStatus { name: string; colorCode: string; alertLevel: string; nvewsThreat: string | null; noticeUrl: string | null; provenance: SourceMeta }
export interface QuakeEvent { mag: number; place: string; time: string; depthKm: number; lng: number; lat: number; type: string; status: string }
export interface SeismicSummary { count30d: number; count7d: number; largestMag: number | null; swarm: boolean; events: QuakeEvent[]; provenance: SourceMeta }
export interface ParkAlert { category: string; title: string; description: string; url: string; parkCode: string; lastIndexedDate: string }
export interface ParkAlerts { alerts: ParkAlert[]; provenance: SourceMeta }
export interface HazardsSummary {
  aqi: { value: number; category: string } | null;
  storm: { active: boolean; label: string } | null;
  provenance: SourceMeta;
}
