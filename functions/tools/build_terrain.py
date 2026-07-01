"""One-shot terrain bake CLI. Run locally from repo root:
  npx tsx scripts/export-peaks.ts
  PYTHONPATH=functions GCS_BUCKET_TERRAIN=mountain-weatherman-app-terrain GCP_PROJECT=mountain-weatherman-app \\
    functions/.venv/bin/python -m functions.tools.build_terrain --mountain mt-rainier
(needs functions/.venv with requirements-terrain.txt installed; PYTHONPATH=functions is
required so the vendored shared package resolves `from shared import config`.)"""
from __future__ import annotations

import argparse
import io
import json
import pathlib

import httpx
import numpy as np
import rasterio
import trimesh

from functions.shared import storage_client as sc
from functions.tools import terrain_mesh as tm

DEM_URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"


def fetch_dem(lat: float, lng: float, span: float, size: int = 256):
    """Return (dem float32 [rows,cols], bbox (w,s,e,n)). Row 0 = north."""
    bbox = (lng - span, lat - span, lng + span, lat + span)
    params = {
        "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
        "bboxSR": 4326,
        "imageSR": 4326,
        "size": f"{size},{size}",
        "format": "tiff",
        "pixelType": "F32",
        "interpolation": "RSP_BilinearInterpolation",
        "f": "image",
    }
    r = httpx.get(DEM_URL, params=params, timeout=120)
    r.raise_for_status()
    with rasterio.open(io.BytesIO(r.content)) as ds:
        dem = ds.read(1).astype("float32")
    dem = np.where(dem < -1e5, np.nan, dem)
    dem = np.nan_to_num(dem, nan=float(np.nanmin(dem)))
    return dem, bbox


def bake_one(slug, lat, lng, summit_elev_m, span=0.06, exaggeration=1.6):
    dem, bbox = fetch_dem(lat, lng, span)
    meta = tm.build_metadata(slug, dem, bbox, summit=(lng, lat, summit_elev_m), exaggeration=exaggeration)
    verts, faces, colors = tm.build_mesh(dem, bbox, minElevM=meta["minElevM"], exaggeration=exaggeration)
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_colors=colors, process=False)
    glb = trimesh.exchange.gltf.export_glb(mesh)
    sc.write_terrain_model(slug, glb)
    sc.write_terrain_meta(slug, json.dumps(meta))
    print(f"baked {slug}: {len(verts)} verts, {len(glb)} GLB bytes")


FT_TO_M = 0.3048


def main():
    MOUNTAINS = json.loads((pathlib.Path(__file__).parent / "peaks.json").read_text())
    ap = argparse.ArgumentParser()
    ap.add_argument("--mountain")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--span", type=float, default=0.06)
    ap.add_argument("--exaggeration", type=float, default=1.6)
    a = ap.parse_args()
    targets = MOUNTAINS if a.all else [m for m in MOUNTAINS if m["slug"] == a.mountain]
    for m in targets:
        bake_one(m["slug"], m["lat"], m["lng"], m["summit"] * FT_TO_M, a.span, a.exaggeration)


if __name__ == "__main__":
    main()
