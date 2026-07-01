import asyncio
import os

import pytest

from satellite_worker import copernicus_client as cc


@pytest.mark.live
def test_real_cdse_returns_recent_rainier_scene():
    """Spike: real CDSE OAuth + Catalog search for Rainier. Needs CDSE_CLIENT_ID/
    CDSE_CLIENT_SECRET in the environment; deselected in CI (-m 'not live')."""
    if not (os.environ.get("CDSE_CLIENT_ID") and os.environ.get("CDSE_CLIENT_SECRET")):
        pytest.skip("CDSE credentials not set")
    cc._reset_token_cache()
    bbox = cc.bbox_for(46.8517, -121.7603)
    scene = asyncio.run(cc.search_latest_scene(bbox))
    assert scene is not None
    assert len(scene["latestImageDate"]) == 10  # YYYY-MM-DD
    assert scene["cloudCoverPercent"] < cc.CLOUD_THRESHOLD
    print("LIVE Rainier scene:", scene)
