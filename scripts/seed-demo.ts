/* Seed the demo projects via the live API: the 34h Rainier scenario + Baker + Shuksan.
 * Usage: BASE_URL=https://<cloud-run-url> npx tsx scripts/seed-demo.ts
 * Idempotent: skips a (name, mountainId) that already exists. Tone reflects live conditions. */
const BASE_URL = process.env.BASE_URL ?? "https://mtn-weather-web-771101720649.us-west1.run.app";

function targetDate(hoursOut: number): string {
  return new Date(Date.now() + hoursOut * 3600_000).toISOString().slice(0, 10);
}

const DEMOS = [
  { name: "Rainier — 34h Window", mountainId: "mt-rainier", hours: 34,
    notes: "Demo: evolving forecast as the date nears." },
  { name: "Baker demo", mountainId: "mt-baker", hours: 34, notes: "Demo project." },
  { name: "Shuksan demo", mountainId: "mt-shuksan", hours: 34, notes: "Demo project." },
];

async function main() {
  const existing = (await (await fetch(`${BASE_URL}/api/projects`)).json()) as Array<{
    name: string; mountainId: string;
  }>;
  const has = (n: string, m: string) => existing.some((p) => p.name === n && p.mountainId === m);

  for (const d of DEMOS) {
    if (has(d.name, d.mountainId)) {
      console.log(`skip (exists): ${d.name}`);
      continue;
    }
    const td = targetDate(d.hours);
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: d.name, mountainId: d.mountainId,
        targetDateStart: td, targetDateEnd: td, notes: d.notes,
      }),
    });
    const body = (await res.json()) as { id?: string; error?: string };
    console.log(res.ok ? `created ${d.mountainId} → ${body.id}` : `FAILED ${d.mountainId}: ${body.error}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
