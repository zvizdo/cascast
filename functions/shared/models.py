from datetime import date, datetime  # noqa: F401  (date kept for downstream imports)

from pydantic import BaseModel, ConfigDict, Field


# ---- Open-Meteo (dynamic hourly keys) ----
class OMHourly(BaseModel):
    model_config = ConfigDict(extra="allow")  # temperature_2m_<model>, *_previous_dayN_<model>
    time: list[str]


class OMResponse(BaseModel):
    latitude: float
    longitude: float
    elevation: float
    utc_offset_seconds: int
    timezone: str
    hourly_units: dict = {}
    hourly: OMHourly


class OMError(BaseModel):
    error: bool
    reason: str


# ---- Normalized per-model series stored in combined.json ----
class ModelSeries(BaseModel):
    available: bool = True
    time: list[str] = []
    temperature_2m: list[float | None] = []
    apparent_temperature: list[float | None] = []
    wind_speed_10m: list[float | None] = []
    wind_gusts_10m: list[float | None] = []
    wind_direction_10m: list[float | None] = []
    precipitation: list[float | None] = []
    precipitation_probability: list[float | None] = []
    snowfall: list[float | None] = []
    freezing_level_height: list[float | None] = []  # feet (converted from meters)
    cloud_cover: list[float | None] = []
    visibility: list[float | None] = []
    weather_code: list[int | None] = []
    # pressure-level band temps (feet-keyed bands resolved by worker)
    temp_base_f: list[float | None] = []
    temp_mid_f: list[float | None] = []
    temp_summit_f: list[float | None] = []


class CombinedForecastBlob(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    mountain_id: str = Field(alias="mountainId")
    timezone: str
    fetched_at: datetime = Field(alias="fetchedAt")
    hrrr: ModelSeries | None = None
    gfs: ModelSeries | None = None
    ecmwf: ModelSeries | None = None


class ModelDaySummary(BaseModel):
    available: bool
    summitHighF: float | None = None
    summitLowF: float | None = None
    summitMaxWindMph: float | None = None
    summitMaxSustainedWindMph: float | None = None
    summitPrecipIn: float | None = None
    freezingLevelFtNoon: float | None = None
    snowfallIn: float | None = None


class CurrentSummary(BaseModel):
    targetDateHigh: float | None
    targetDateLow: float | None
    targetDateWind: float | None
    targetDatePrecip: float | None
    freezingLevelFt: float | None
    precipType: str
    summaryModel: str
    tone: str            # "good" | "caution" | "alert"
    verdict: str         # editorial sentence


# ---- NWAC (imported by P2 nwac_worker) ----
class NwacDanger(BaseModel):
    upper: int | None
    middle: int | None
    lower: int | None


class NwacProblem(BaseModel):
    problemId: int
    name: str
    likelihood: str | None = None
    sizeMin: str | None = None
    sizeMax: str | None = None
    aspects: dict   # {"upper": {"N": bool, ...}, "middle": {...}, "lower": {...}}
    description: str | None = None


class NwacForecast(BaseModel):
    zoneId: str
    zoneName: str
    productId: int
    season: str
    productType: str
    publishedTime: datetime
    expiresTime: datetime
    forecastDate: str
    danger: dict   # {"current": NwacDanger, "tomorrow": NwacDanger}
    problems: list[NwacProblem] = []
    bottomLine: str | None = None
    hazardDiscussion: str | None = None
    weatherDiscussion: str | None = None


# ---- SNOTEL (imported by P2 snotel_worker) ----
class SnotelReading(BaseModel):
    date: str
    snowDepthIn: float | None = None
    sweIn: float | None = None
    sweMedianIn: float | None = None
    percentOfMedian: float | None = None
    tempMaxF: float | None = None
    tempMinF: float | None = None
    precipAccumIn: float | None = None


class SnotelData(BaseModel):
    stationId: str
    stationTriplet: str
    stationName: str
    elevationFt: float
    lat: float
    lng: float
    current: SnotelReading
    trend: list[SnotelReading]


# ---- Satellite (imported by P2 satellite_worker) ----
class SatelliteCache(BaseModel):
    mountainId: str
    latestImageDate: str | None = None
    cloudCoverPercent: float | None = None
    sceneId: str | None = None
    tileUrlTemplate: str
    tileSource: str
    attribution: str
    boundingBox: dict   # {north, south, east, west}
