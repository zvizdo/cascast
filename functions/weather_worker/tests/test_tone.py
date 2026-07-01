import pytest

from weather_worker import tone


def test_good_when_calm_warm_dry_no_danger():
    assert tone.score_tone(max_wind=15, max_gust=25, precip=0.0,
                           nwac_danger=1, high_f=25) == ("good", 0)


def test_caution_at_score_2_from_moderate_wind_and_danger3():
    # wind 35>32 -> 1 ; danger 3 -> 1 ; total 2 -> caution
    label, s = tone.score_tone(max_wind=35, max_gust=40, precip=0.0,
                               nwac_danger=3, high_f=25)
    assert (label, s) == ("caution", 2)


def test_alert_at_score_4_high_wind_precip_danger():
    # wind 50>45 -> 2 ; precip 0.2>0.1 -> 2 ; total 4 -> alert
    label, s = tone.score_tone(max_wind=50, max_gust=40, precip=0.2,
                               nwac_danger=None, high_f=25)
    assert (label, s) == ("alert", 4)


def test_gust_and_cold_each_add_one():
    # gust 60>55 -> 1 ; cold high 5<10 -> 1 ; total 2 -> caution
    label, s = tone.score_tone(max_wind=20, max_gust=60, precip=0.0,
                               nwac_danger=0, high_f=5)
    assert (label, s) == ("caution", 2)


def test_danger4_scores_two():
    label, s = tone.score_tone(max_wind=10, max_gust=10, precip=0.0,
                               nwac_danger=4, high_f=25)
    assert s == 2 and label == "caution"


def test_none_danger_treated_as_no_contribution():
    label, s = tone.score_tone(max_wind=10, max_gust=10, precip=0.0,
                               nwac_danger=None, high_f=25)
    assert (label, s) == ("good", 0)


@pytest.mark.parametrize("score_in,expected", [(0, "good"), (1, "good"),
                                               (2, "caution"), (3, "caution"),
                                               (4, "alert"), (6, "alert")])
def test_bucket_thresholds(score_in, expected):
    assert tone.bucket(score_in) == expected


def test_verdict_alert_high_wind():
    v = tone.verdict("alert", max_wind=55, max_gust=70, precip=0.0,
                     nwac_danger=3, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "High wind shuts the summit down"


def test_verdict_alert_avalanche_when_danger_dominant():
    v = tone.verdict("alert", max_wind=20, max_gust=30, precip=0.0,
                     nwac_danger=4, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Considerable avalanche danger above treeline"


def test_verdict_caution_incoming_precip():
    v = tone.verdict("caution", max_wind=20, max_gust=30, precip=0.15,
                     nwac_danger=2, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Precipitation moving through the window"


def test_verdict_good_cold_clear():
    v = tone.verdict("good", max_wind=12, max_gust=20, precip=0.0,
                     nwac_danger=1, high_f=8, freezing_level_ft=6000, summit_ft=14410)
    assert v == "Cold window holds before a front"


def test_verdict_good_default():
    v = tone.verdict("good", max_wind=12, max_gust=20, precip=0.0,
                     nwac_danger=1, high_f=30, freezing_level_ft=6000, summit_ft=14410)
    assert v == "Favorable window on the summit"


# --- C1: verdict() branch coverage (lines 56-58, 62-68, 74) ---
def test_verdict_alert_precip_dominant():
    # alert, no high wind/gust, danger<4, precip>0.1 -> storm branch
    v = tone.verdict("alert", max_wind=20, max_gust=30, precip=0.2,
                     nwac_danger=2, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Storm system dominates the window"


def test_verdict_alert_fallback():
    # alert, none of wind/gust/danger/precip dominant -> fallback
    v = tone.verdict("alert", max_wind=20, max_gust=30, precip=0.0,
                     nwac_danger=2, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Hazardous conditions on the summit"


def test_verdict_caution_gusty_wind():
    # caution, precip<=0.05, max_wind>32 -> gusty winds
    v = tone.verdict("caution", max_wind=35, max_gust=30, precip=0.0,
                     nwac_danger=2, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Gusty winds aloft to watch"


def test_verdict_caution_danger3():
    # caution, no precip/wind, danger==3 -> avalanche
    v = tone.verdict("caution", max_wind=20, max_gust=30, precip=0.0,
                     nwac_danger=3, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Considerable avalanche danger to manage"


def test_verdict_caution_cold():
    # caution, no precip/wind/danger, high<10 -> cold
    v = tone.verdict("caution", max_wind=20, max_gust=30, precip=0.0,
                     nwac_danger=2, high_f=5, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Cold but workable on the summit"


def test_verdict_caution_fallback():
    # caution, nothing dominant -> fallback
    v = tone.verdict("caution", max_wind=20, max_gust=30, precip=0.0,
                     nwac_danger=2, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Marginal window — watch the trend"


def test_verdict_good_favorable_default():
    # good, high>=10 -> favorable (covers the simplified single return)
    v = tone.verdict("good", max_wind=12, max_gust=20, precip=0.0,
                     nwac_danger=1, high_f=30, freezing_level_ft=15000, summit_ft=14410)
    assert v == "Favorable window on the summit"
