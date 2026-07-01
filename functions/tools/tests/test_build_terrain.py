import numpy as np

from functions.tools import build_terrain as bt


def test_bake_one_uploads_glb_and_meta(monkeypatch):
    dem = np.full((8, 8), 1500.0, dtype="float32")
    bbox = (-121.82, 46.79, -121.70, 46.91)
    monkeypatch.setattr(bt, "fetch_dem", lambda *a, **k: (dem, bbox))
    uploaded = {}
    monkeypatch.setattr(bt.sc, "write_terrain_model", lambda mid, glb: uploaded.update(glb=(mid, len(glb))) or "p")
    monkeypatch.setattr(bt.sc, "write_terrain_meta", lambda mid, j: uploaded.update(meta=(mid, j)) or "p")
    bt.bake_one("mt-rainier", lat=46.8517, lng=-121.7603, summit_elev_m=4392.0, span=0.06, exaggeration=1.6)
    assert uploaded["glb"][0] == "mt-rainier" and uploaded["glb"][1] > 0
    assert uploaded["meta"][0] == "mt-rainier" and '"slug": "mt-rainier"' in uploaded["meta"][1]
