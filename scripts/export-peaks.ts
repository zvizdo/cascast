import { writeFileSync } from "fs";
import { MOUNTAINS } from "../src/lib/mountains-data";

writeFileSync(
  "functions/tools/peaks.json",
  JSON.stringify(
    MOUNTAINS.map((m) => ({ slug: m.slug, lat: m.lat, lng: m.lng, summit: m.elevations.summit })),
    null,
    2,
  ),
);
