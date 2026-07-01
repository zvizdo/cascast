"""Pure DEM-array -> mesh math for the terrain bake (no network/IO)."""
from __future__ import annotations
import math
import numpy as np

METERS_PER_DEG_LAT = 111_320.0

def build_metadata(slug, dem, bbox, summit, exaggeration):
    west, south, east, north = bbox
    center_lat = (south + north) / 2
    center_lng = (west + east) / 2
    s_lng, s_lat, s_elev = summit
    return {
        "slug": slug,
        "bbox": {"west": west, "east": east, "south": south, "north": north},
        "centerLat": center_lat, "centerLng": center_lng,
        "metersPerDegLat": METERS_PER_DEG_LAT,
        "metersPerDegLng": METERS_PER_DEG_LAT * math.cos(math.radians(center_lat)),
        "minElevM": float(np.min(dem)), "maxElevM": float(np.max(dem)),
        "exaggeration": exaggeration,
        "summit": {"lng": s_lng, "lat": s_lat, "elevM": s_elev},
    }

def build_mesh(dem, bbox, minElevM, exaggeration):
    """Return (vertices Nx3 float32, faces Mx3 int32, colors Nx3 uint8).
    dem is row 0 = north edge (descending latitude), col 0 = west edge."""
    rows, cols = dem.shape
    west, south, east, north = bbox
    center_lat = (south + north) / 2
    center_lng = (west + east) / 2
    mpd_lat = METERS_PER_DEG_LAT
    mpd_lng = METERS_PER_DEG_LAT * math.cos(math.radians(center_lat))
    lons = np.linspace(west, east, cols)
    lats = np.linspace(north, south, rows)
    xs = (lons - center_lng) * mpd_lng
    zs = -(lats - center_lat) * mpd_lat
    gx, gz = np.meshgrid(xs, zs)
    gy = (dem - minElevM) * exaggeration
    verts = np.column_stack([gx.ravel(), gy.ravel(), gz.ravel()]).astype("float32")
    idx = np.arange(rows * cols).reshape(rows, cols)
    tl, tr, bl, br = idx[:-1, :-1], idx[:-1, 1:], idx[1:, :-1], idx[1:, 1:]
    faces = np.concatenate([
        np.stack([tl, bl, br], axis=-1).reshape(-1, 3),
        np.stack([tl, br, tr], axis=-1).reshape(-1, 3),
    ]).astype("int32")
    colors = _hypsometric_hillshade(dem, exaggeration)
    return verts, faces, colors

# Natural elevation ramp (low→high): forest → meadow → tan rock → scree → snow.
# Brighter than the old slate ramp so the bare terrain reads as a mountain, not a dark blob.
_RAMP = [
    (0.00, (78, 102, 76)),    # deep forest green
    (0.28, (120, 130, 96)),   # heather / meadow
    (0.48, (150, 134, 110)),  # tan rock
    (0.66, (176, 168, 156)),  # light rock / scree
    (0.82, (224, 226, 230)),  # near-snow
    (1.00, (247, 249, 251)),  # snow
]


def _ramp_color(t):
    """Piecewise-linear hypsometric color for normalized elevation t in [0,1]."""
    rgb = np.zeros(t.shape + (3,), dtype="float32")
    for i in range(len(_RAMP) - 1):
        t0, c0 = _RAMP[i]
        t1, c1 = _RAMP[i + 1]
        # last segment is inclusive of the top so t==1 is covered
        m = (t >= t0) & (t <= t1) if i < len(_RAMP) - 2 else (t >= t0)
        local = np.clip((t - t0) / max(t1 - t0, 1e-6), 0.0, 1.0)
        c = np.array(c0, dtype="float32") + (np.array(c1, dtype="float32") - np.array(c0, dtype="float32")) * local[..., None]
        rgb[m] = c[m]
    return rgb


def _hypsometric_hillshade(dem, exaggeration):
    """Natural hypsometric tint modulated by a punchy hillshade (Nx3 uint8)."""
    rng = max(float(np.ptp(dem)), 1.0)
    t = (dem - float(np.min(dem))) / rng
    tint = _ramp_color(t)
    gy, gx = np.gradient(dem * exaggeration)
    slope = np.pi / 2 - np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(45)
    hs = (np.sin(alt) * np.sin(slope) +
          np.cos(alt) * np.cos(slope) * np.cos(az - aspect))
    # Stronger contrast (and a touch >1 on lit faces) so relief pops without satellite.
    hs = np.clip(0.5 + 0.62 * hs, 0.42, 1.22)
    shaded = np.clip(tint * hs[..., None], 0, 255).astype("uint8")
    return shaded.reshape(-1, 3)
