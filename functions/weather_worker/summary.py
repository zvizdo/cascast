"""Target-date summary derivation (contract §6)."""

from shared.models import CombinedForecastBlob, CurrentSummary, ModelDaySummary, ModelSeries

MIXED_BAND_FT = 500  # freezing level within ±500 ft of summit -> mixed


def _hours_on(series: ModelSeries, target_date: str) -> list[int]:
    """Indices of series.time entries on the target ISO date (YYYY-MM-DD prefix)."""
    return [i for i, t in enumerate(series.time) if t[:10] == target_date]


def _summit_temps(series: ModelSeries, idxs: list[int]) -> list[float]:
    """Prefer the resolved summit-band temp; fall back to 2m if the band is empty."""
    band = series.temp_summit_f
    src = band if any(v is not None for v in band) else series.temperature_2m
    return [src[i] for i in idxs if i < len(src) and src[i] is not None]


def _noon_index(series: ModelSeries, idxs: list[int]) -> int:
    for i in idxs:
        if series.time[i][11:16] == "12:00":
            return i
    return idxs[0]


def _sum(values: list[float | None], idxs: list[int]) -> float:
    return round(sum(values[i] for i in idxs if i < len(values) and values[i] is not None), 3)


def model_day_summary(series: ModelSeries, target_date: str) -> ModelDaySummary:
    """Per-model summary for the target date (contract §3 weatherSnapshots.models)."""
    if not series.available:
        return ModelDaySummary(available=False)
    idxs = _hours_on(series, target_date)
    if not idxs:
        return ModelDaySummary(available=False)
    temps = _summit_temps(series, idxs)
    # Short-range models (HRRR ~48h) null-pad their time array out to forecast_days,
    # so idxs can be non-empty while every value is null. Treat "no usable temps for
    # the date" as not-available so choose_summary_model falls through to GFS/ECMWF.
    if not temps:
        return ModelDaySummary(available=False)
    gusts = [series.wind_gusts_10m[i] for i in idxs
             if i < len(series.wind_gusts_10m) and series.wind_gusts_10m[i] is not None]
    sustained = [series.wind_speed_10m[i] for i in idxs
                 if i < len(series.wind_speed_10m) and series.wind_speed_10m[i] is not None]
    noon = _noon_index(series, idxs)
    fl = series.freezing_level_height
    return ModelDaySummary(
        available=True,
        summitHighF=max(temps) if temps else None,
        summitLowF=min(temps) if temps else None,
        summitMaxWindMph=max(gusts) if gusts else None,
        summitMaxSustainedWindMph=max(sustained) if sustained else None,
        summitPrecipIn=_sum(series.precipitation, idxs),
        freezingLevelFtNoon=fl[noon] if noon < len(fl) else None,
        snowfallIn=_sum(series.snowfall, idxs),
    )


def _dates_in(series: ModelSeries) -> list[str]:
    """Distinct ISO dates (YYYY-MM-DD) present in series.time, in first-seen order."""
    seen: list[str] = []
    for t in series.time:
        d = t[:10]
        if d not in seen:
            seen.append(d)
    return seen


def all_model_summaries_by_day(blob: CombinedForecastBlob) -> dict:
    """Per-model, per-day summaries for ALL forecast days (powers target-date evolution).

    Shape: {hrrr: {"2026-06-17": <ModelDaySummary dict>, ...}, gfs: {...}, ecmwf: {...}}.
    Only days with usable data are included (model_day_summary returns available=False
    for null-padded days, which are skipped). A model with no usable day -> {} map.
    """
    out: dict[str, dict] = {}
    for key in ("hrrr", "gfs", "ecmwf"):
        series = getattr(blob, key)
        by_day: dict[str, dict] = {}
        if series is not None and series.available:
            for d in _dates_in(series):
                s = model_day_summary(series, d)
                if s.available:
                    by_day[d] = s.model_dump()
        out[key] = by_day
    return out


def choose_summary_model(blob: CombinedForecastBlob, target_date: str) -> tuple[str, ModelDaySummary]:
    """Precedence HRRR -> GFS -> ECMWF, first with data for the target date (contract §6)."""
    for key in ("hrrr", "gfs", "ecmwf"):
        series = getattr(blob, key)
        if series is None:
            continue
        s = model_day_summary(series, target_date)
        if s.available:
            return key, s
    return "gfs", ModelDaySummary(available=False)


def precip_type(precip: float, snowfall: float, freezing_level_ft: float, summit_ft: float) -> str:
    """contract §6: snow / rain / mixed / none from precip + freezing level vs summit."""
    if precip <= 0 and snowfall <= 0:
        return "none"
    if abs(freezing_level_ft - summit_ft) <= MIXED_BAND_FT:
        return "mixed"
    if snowfall > 0 and freezing_level_ft < summit_ft:
        return "snow"
    if freezing_level_ft > summit_ft:
        return "rain"
    return "snow" if snowfall > 0 else "rain"


def build_current_summary(
    blob: CombinedForecastBlob, target_date: str, summit_ft: float, tone: str, verdict: str
) -> CurrentSummary:
    """Assemble currentSummary from the chosen model + tone/verdict (contract §3/§6/§8)."""
    model, day = choose_summary_model(blob, target_date)
    fl = day.freezingLevelFtNoon if day.freezingLevelFtNoon is not None else 0.0
    return CurrentSummary(
        targetDateHigh=day.summitHighF,
        targetDateLow=day.summitLowF,
        targetDateWind=day.summitMaxWindMph,
        targetDatePrecip=day.summitPrecipIn,
        freezingLevelFt=day.freezingLevelFtNoon,
        precipType=precip_type(day.summitPrecipIn or 0.0, day.snowfallIn or 0.0, fl, summit_ft),
        summaryModel=model,
        tone=tone,
        verdict=verdict,
    )
