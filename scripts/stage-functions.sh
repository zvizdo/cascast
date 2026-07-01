#!/usr/bin/env bash
# Vendor shared/ into each Cloud Function dir for Gen2 deploy packaging.
# Gen2 zips a single source dir, so `from shared import ...` (and weather_worker's
# `from weather_worker import ...`) must resolve at the zip root. We copy the
# canonical packages into each function dir. The copies are gitignored and are a
# build artifact — run this before `terraform apply` so the archive_file picks
# up fresh code. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/../functions"

for fn in orchestrator weather_worker nwac_worker snotel_worker satellite_worker; do
  rm -rf "$fn/shared"
  cp -R shared "$fn/shared"
  rm -rf "$fn/shared/tests"   # never ship tests in the deploy package
done

# weather_worker/main.py imports `from weather_worker import open_meteo_client|tone|summary`,
# which must resolve at the zip root -> vendor a self-named package alongside main.py.
rm -rf weather_worker/weather_worker
mkdir -p weather_worker/weather_worker
cp weather_worker/__init__.py \
   weather_worker/open_meteo_client.py \
   weather_worker/tone.py \
   weather_worker/summary.py \
   weather_worker/weather_worker/

# Same self-named-package pattern for the P2 workers: main.py imports
# `from <pkg> import <client>`, which must resolve at the zip root.
rm -rf nwac_worker/nwac_worker
mkdir -p nwac_worker/nwac_worker
cp nwac_worker/__init__.py nwac_worker/nwac_client.py nwac_worker/nwac_worker/

rm -rf snotel_worker/snotel_worker
mkdir -p snotel_worker/snotel_worker
cp snotel_worker/__init__.py snotel_worker/snotel_client.py snotel_worker/snotel_worker/

rm -rf satellite_worker/satellite_worker
mkdir -p satellite_worker/satellite_worker
cp satellite_worker/__init__.py satellite_worker/copernicus_client.py satellite_worker/satellite_worker/

echo "staged: shared/ -> all 5 workers; self-packages for weather/nwac/snotel/satellite"
