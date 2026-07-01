"""Server-side condition tone + verdict (contract §6).

Scoring is ported verbatim from the original prototype's data.js summarize():
    score = (maxWind>45?2:maxWind>32?1:0) + (maxGust>55?1:0)
          + (precip>0.1?2:pop>50?1:0) + (danger>=4?2:danger==3?1:0)
          + (high<10?1:0)
    tone  = score>=4 ? alert : score>=2 ? caution : good
The `pop>50` branch is dropped (POC ModelDaySummary has no pop); precip still scores.
"""


def bucket(score: int) -> str:
    """Map a raw score to a tone label (Favorable/Marginal/Hazardous)."""
    if score >= 4:
        return "alert"
    if score >= 2:
        return "caution"
    return "good"


def score_tone(
    max_wind: float,
    max_gust: float,
    precip: float,
    nwac_danger: int | None,
    high_f: float,
) -> tuple[str, int]:
    """Return (tone_label, raw_score). nwac_danger may be None (no rating)."""
    danger = nwac_danger if nwac_danger is not None else 0
    score = 0
    score += 2 if max_wind > 45 else 1 if max_wind > 32 else 0
    score += 1 if max_gust > 55 else 0
    score += 2 if precip > 0.1 else 0
    score += 2 if danger >= 4 else 1 if danger == 3 else 0
    score += 1 if high_f < 10 else 0
    return bucket(score), score


def verdict(
    tone: str,
    max_wind: float,
    max_gust: float,
    precip: float,
    nwac_danger: int | None,
    high_f: float,
    freezing_level_ft: float,
    summit_ft: float,
) -> str:
    """Deterministic editorial sentence templated from tone + dominant driver."""
    danger = nwac_danger if nwac_danger is not None else 0
    if tone == "alert":
        if max_wind > 45 or max_gust > 55:
            return "High wind shuts the summit down"
        if danger >= 4:
            return "Considerable avalanche danger above treeline"
        if precip > 0.1:
            return "Storm system dominates the window"
        return "Hazardous conditions on the summit"
    if tone == "caution":
        if precip > 0.05:
            return "Precipitation moving through the window"
        if max_wind > 32 or max_gust > 55:
            return "Gusty winds aloft to watch"
        if danger == 3:
            return "Considerable avalanche danger to manage"
        if high_f < 10:
            return "Cold but workable on the summit"
        return "Marginal window — watch the trend"
    # good
    if high_f < 10:
        return "Cold window holds before a front"
    return "Favorable window on the summit"
