import httpx
import pytest

RAINIER = {"lat": 46.8517, "lng": -121.7603, "timezone": "America/Los_Angeles",
           "bands_ft": {"base": 5420, "mid": 10188, "summit": 14410}}
M_TO_FT = 3.28084


@pytest.mark.live
def test_geopotential_heights_bracket_rainier_bands():
    """Spike: confirm 925/850/700 hPa geopotential heights bracket Rainier's bands.
    Records the chosen levels; not run in CI (-m 'not live')."""
    params = {
        "latitude": RAINIER["lat"], "longitude": RAINIER["lng"],
        "hourly": "geopotential_height_925hPa,geopotential_height_850hPa,"
                  "geopotential_height_700hPa,geopotential_height_500hPa",
        "models": "gfs_seamless", "timezone": RAINIER["timezone"], "forecast_days": 1,
    }
    body = httpx.get("https://api.open-meteo.com/v1/forecast", params=params, timeout=30).json()
    h = body["hourly"]
    gp = {lvl: h[f"geopotential_height_{lvl}hPa"][0] * M_TO_FT
          for lvl in ("925", "850", "700", "500")}
    # 925 hPa ≈ ~2,500 ft (near base), 850 hPa ≈ ~5,000 ft (above base/below mid),
    # 700 hPa ≈ ~10,000 ft (near mid/summit), 500 hPa ≈ ~18,000 ft (above summit).
    assert gp["925"] < gp["850"] < gp["700"] < gp["500"]
    assert 1500 < gp["925"] < 4000
    assert 8000 < gp["700"] < 12000
    print("RAINIER geopotential heights (ft):", gp)
