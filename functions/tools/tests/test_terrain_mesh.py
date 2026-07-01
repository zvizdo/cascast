import math
import numpy as np
from functions.tools import terrain_mesh as tm

def _flat_dem(n=4, value=1000.0):
    return np.full((n, n), value, dtype="float32")

def test_metadata_centers_and_scales():
    dem = _flat_dem()
    bbox = (-121.82, 46.79, -121.70, 46.91)  # west, south, east, north
    meta = tm.build_metadata("mt-rainier", dem, bbox, summit=(-121.76, 46.8517, 4392.0), exaggeration=1.6)
    assert meta["centerLng"] == (-121.82 + -121.70) / 2
    assert meta["centerLat"] == (46.79 + 46.91) / 2
    assert meta["metersPerDegLat"] == 111320.0
    assert abs(meta["metersPerDegLng"] - 111320.0 * math.cos(math.radians(meta["centerLat"]))) < 1e-6
    assert meta["minElevM"] == 1000.0 and meta["maxElevM"] == 1000.0
    assert meta["exaggeration"] == 1.6
    assert meta["summit"] == {"lng": -121.76, "lat": 46.8517, "elevM": 4392.0}

def test_mesh_vertex_count_and_floor():
    dem = _flat_dem(n=4, value=1500.0)
    bbox = (-121.82, 46.79, -121.70, 46.91)
    verts, faces, colors = tm.build_mesh(dem, bbox, minElevM=1500.0, exaggeration=2.0)
    assert verts.shape == (16, 3)
    assert faces.shape == ((4 - 1) ** 2 * 2, 3)
    assert np.allclose(verts[:, 1], 0.0)
    half_w = ((-121.70) - (-121.82)) / 2 * (111320.0 * math.cos(math.radians((46.79 + 46.91) / 2)))
    assert abs(verts[:, 0].max() - half_w) < 1.0
    assert colors.shape == (16, 3) and colors.dtype == np.uint8

def test_height_uses_exaggeration_above_floor():
    dem = np.array([[1000.0, 1000.0], [1000.0, 2000.0]], dtype="float32")
    verts, _, _ = tm.build_mesh(dem, (-121.0, 46.0, -120.9, 46.1), minElevM=1000.0, exaggeration=1.5)
    assert abs(verts[:, 1].max() - 1500.0) < 1e-3
