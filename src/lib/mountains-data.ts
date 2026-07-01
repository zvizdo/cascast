// Relative import (not "@/lib/types"): this module is imported by scripts/seed-mountains.ts
// which runs under tsx, where the "@/" path alias may not resolve.
import type { Mountain } from "./types";

export const MOUNTAINS: readonly Mountain[] = [
  { name:"Mount Rainier", slug:"mt-rainier", lat:46.8517, lng:-121.7603,
    elevations:{base:5420,mid:10188,summit:14410}, nwacZone:"west-slopes-south",
    nwacZoneId:"1648", snotelStationId:"679", snotelStationTriplet:"679:WA:SNTL",
    snotelStationName:"Paradise", region:"cascades-south", timezone:"America/Los_Angeles",
    description:"The Cascades' highest, most glaciated volcano, climbed via Camp Muir and the Disappointment Cleaver from Paradise.",
    hansVolcanoId:"wa6", npsParkCode:"mora",
    mapBbox:{west:-121.8403,south:46.7717,east:-121.6803,north:46.9317},
    permits:[{label:"Mount Rainier climbing permit (NPS)",url:"https://www.nps.gov/mora/planyourvisit/climbing.htm",note:"Required above 10,000 ft or on glaciers; reserve via recreation.gov"}] },
  { name:"Mount Baker", slug:"mt-baker", lat:48.7766, lng:-121.8145,
    elevations:{base:3500,mid:6000,summit:10781}, nwacZone:"west-slopes-north",
    nwacZoneId:"1646", snotelStationId:"909", snotelStationTriplet:"909:WA:SNTL",
    snotelStationName:"Wells Creek", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A glaciated North Cascades volcano near the border, climbed via Coleman-Deming from Heliotrope Ridge.",
    hansVolcanoId:"wa2", usfsForestName:"Mt. Baker-Snoqualmie National Forest",
    mapBbox:{west:-121.8945,south:48.6966,east:-121.7345,north:48.8566},
    // No summit permit required currently; self-registration at trailhead for some routes (USFS Mt Baker-Snoqualmie NF).
    permits:[] },
  { name:"Mount Shuksan", slug:"mt-shuksan", lat:48.8315, lng:-121.6032,
    elevations:{base:4700,mid:6700,summit:9131}, nwacZone:"west-slopes-north",
    nwacZoneId:"1646", snotelStationId:"909", snotelStationTriplet:"909:WA:SNTL", // ⚠️ shares Baker's station
    snotelStationName:"Wells Creek", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A rugged North Cascades peak beside Baker, climbed via the Fisher Chimneys to the Sulphide or Hells Highway.",
    npsParkCode:"noca", usfsForestName:"Mt. Baker-Snoqualmie National Forest",
    mapBbox:{west:-121.6832,south:48.7515,east:-121.5232,north:48.9115} },
  { name:"Glacier Peak", slug:"glacier-peak", lat:48.1119, lng:-121.1142,
    elevations:{base:2100,mid:7300,summit:10541}, nwacZone:"west-slopes-central",
    nwacZoneId:"1647", snotelStationId:"606", snotelStationTriplet:"606:WA:SNTL",
    snotelStationName:"Lyman Lake", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"Washington's most remote volcano, deep in the Glacier Peak Wilderness via the North Fork Sauk.",
    hansVolcanoId:"wa3", usfsForestName:"Mt. Baker-Snoqualmie National Forest",
    mapBbox:{west:-121.1942,south:48.0319,east:-121.0342,north:48.1919} },
  { name:"Mount Adams", slug:"mt-adams", lat:46.2024, lng:-121.4909,
    elevations:{base:5600,mid:9300,summit:12281}, nwacZone:"east-slopes-south", // ⚠️ Adams has a separate special forecast; geographic best-fit
    nwacZoneId:"1656", snotelStationId:"702", snotelStationTriplet:"702:WA:SNTL", // ⚠️ Potato Hill, NW flank proxy
    snotelStationName:"Potato Hill", region:"cascades-south", timezone:"America/Los_Angeles",
    description:"Washington's second-highest volcano, a non-technical South Spur climb past the Lunch Counter.",
    hansVolcanoId:"wa1", usfsForestName:"Gifford Pinchot National Forest",
    mapBbox:{west:-121.5709,south:46.1224,east:-121.4109,north:46.2824},
    // No verified recreation.gov climbing-permit page for Adams (the Cougar Rock/Wilderness pass is sold
    // seasonally by Gifford Pinchot NF, not a stable deep-link). Left empty → Permits card omits. Verify later.
    permits:[] },
  { name:"Mount St. Helens", slug:"mt-st-helens", lat:46.1912, lng:-122.1944,
    elevations:{base:3700,mid:4800,summit:8363}, nwacZone:"west-slopes-south",
    nwacZoneId:"1648", snotelStationId:"553", snotelStationTriplet:"553:WA:SNTL",
    snotelStationName:"June Lake", region:"cascades-south", timezone:"America/Los_Angeles",
    description:"The active 1980-eruption volcano, climbed via Monitor Ridge from Climbers Bivouac to the crater rim.",
    hansVolcanoId:"wa4", usfsForestName:"Gifford Pinchot National Forest",
    mapBbox:{west:-122.2744,south:46.1112,east:-122.1144,north:46.2712},
    // recreation.gov permit 4675309 = "Mount St. Helens Climbing Permit" (API-verified facility name 2026-06-20).
    permits:[{label:"Mount St. Helens climbing permit (USFS)", url:"https://www.recreation.gov/permits/4675309", note:"Required above 4,800 ft (Monitor Ridge route); via recreation.gov"}] },
  { name:"Mount Hood", slug:"mt-hood", lat:45.3736, lng:-121.6958,
    elevations:{base:5960,mid:8470,summit:11249}, nwacZone:"mt-hood",
    nwacZoneId:"1657", snotelStationId:"651", snotelStationTriplet:"651:OR:SNTL",
    snotelStationName:"Mt Hood Test Site", region:"oregon", timezone:"America/Los_Angeles",
    description:"Oregon's highest peak, a glaciated volcano climbed via the Hogsback and Pearly Gates above Timberline.",
    usfsForestName:"Mount Hood National Forest",
    mapBbox:{west:-121.7758,south:45.2936,east:-121.6158,north:45.4536} },

  // ── Oregon Cascades volcanoes (5 peaks) ──────────────────────────────────
  // South of NWAC coverage area; weather + satellite always active; SNOTEL where available.
  // Coordinates: USGS Cascades Volcano Observatory (primary) + Wikipedia/SummitPost (cross-check)
  // Elevations: USGS CVO page (primary) + Wikipedia NAVD 88 (cross-check)
  // NWAC: none — OR Cascades are not covered by NWAC avalanche zones
  // SNOTEL: NRCS AWDB active station list (wcc.sc.egov.usda.gov, fetched 2026-06-21) nearest within ~12 mi
  // Forest: Wikipedia + USFS official recreation pages per peak
  // Permits: recreation.gov (200 GET-verified 2026-06-21) + USFS pages
  // HANS: USGS HANS API (volcanoes.usgs.gov/hans-public/api/volcano/getMonitoredVolcanoes, fetched 2026-06-21)
  //   or13 = Mt Jefferson | or20 = Three Sisters (complex; covers South/Middle/North as a group)
  //   Mt Thielsen = not present in HANS (extinct, not monitored)

  // Mount Jefferson — Oregon's 2nd highest; Mt Jefferson Wilderness (Willamette+Deschutes NF boundary)
  // lat/lng: USGS CVO page 44.674°N / 121.8°W | Wikipedia 44°40′27″N 121°47′58″W (44.6742°N / 121.7994°W) ✓
  // summit: USGS CVO 10,495 ft | Wikipedia 10,502 ft (NAVD 88) — use USGS 10,495
  // Summit straddles Willamette NF / Deschutes NF boundary (+ Warm Springs on east, no public access).
  //   Omitting usfsForestName — genuinely ambiguous; Wikipedia + USFS pages confirm dual-NF boundary.
  // SNOTEL: Marion Forks 614 at 44.60°N / 121.967°W (~9 mi NW, best available); Linn County OR:SNTL
  // Permits: Central Cascades Wilderness Overnight (recreation.gov/permits/4675311, 200 verified 2026-06-21)
  //          Central Cascades Day Use (recreation.gov/ticket/facility/300009, 200 verified 2026-06-21)
  //          Covers Mt Jefferson Wilderness June 15–Oct 15
  { name:"Mount Jefferson", slug:"mt-jefferson", lat:44.6742, lng:-121.7994,
    elevations:{base:5400,mid:8000,summit:10495}, nwacZone:"",
    nwacZoneId:"", snotelStationId:"614", snotelStationTriplet:"614:OR:SNTL",
    snotelStationName:"Marion Forks", region:"oregon", timezone:"America/Los_Angeles",
    description:"Oregon's second-highest peak and the most technical of the Cascade volcanoes, climbed via the South Ridge from Pamelia Lake with steep snow and Class 4 rock on the summit pinnacle.",
    hansVolcanoId:"or13",
    mapBbox:{west:-121.8794,south:44.5942,east:-121.7194,north:44.7542},
    permits:[
      {label:"Central Cascades Wilderness overnight permit (USFS)", url:"https://www.recreation.gov/permits/4675311", note:"Required for overnight stays June 15–Oct 15 in Mt Jefferson Wilderness; $6/group via recreation.gov"},
      {label:"Central Cascades Wilderness day-use permit (USFS)", url:"https://www.recreation.gov/ticket/facility/300009", note:"Required at 19 trailheads June 15–Oct 15; $1/person via recreation.gov"},
    ] },

  // South Sister — Three Sisters Wilderness (Willamette+Deschutes NF boundary; summit in Lane County)
  // lat/lng: USGS CVO 44.103°N / 121.768°W (South Sister representative) | Wikipedia 44°06′12″N 121°46′09″W (44.1034°N / 121.7692°W) ✓
  // summit: USGS CVO 10,358 ft | Wikipedia 10,363 ft (NAVD 88) — USGS CVO explicitly shows 10,358 for the complex's high point
  // Forest: Three Sisters Wilderness straddles Willamette NF (west) + Deschutes NF (east); South Sister summit on boundary.
  //   Omitting usfsForestName — summit genuinely on boundary per Wikipedia + USFS recreation pages.
  // SNOTEL: Three Creeks Meadow 815 at 44.15°N / 121.633°W (~8 mi E); Deschutes County OR:SNTL
  // HANS: or20 (Three Sisters complex — all three sisters share this volcano code)
  // Permits: Central Cascades Wilderness (same system as Jefferson — covers Three Sisters Wilderness)
  { name:"South Sister", slug:"south-sister", lat:44.1034, lng:-121.7692,
    elevations:{base:5800,mid:9200,summit:10358}, nwacZone:"",
    nwacZoneId:"", snotelStationId:"815", snotelStationTriplet:"815:OR:SNTL",
    snotelStationName:"Three Creeks Meadow", region:"oregon", timezone:"America/Los_Angeles",
    description:"Oregon's third-highest peak and only walk-up major volcano, climbed via the Devil's Lake trailhead to the summit crater with its Teardrop Pool.",
    hansVolcanoId:"or20",
    mapBbox:{west:-121.8492,south:44.0234,east:-121.6892,north:44.1834},
    permits:[
      {label:"Central Cascades Wilderness overnight permit (USFS)", url:"https://www.recreation.gov/permits/4675311", note:"Required for overnight stays June 15–Oct 15 in Three Sisters Wilderness; $6/group via recreation.gov"},
      {label:"Central Cascades Wilderness day-use permit (USFS)", url:"https://www.recreation.gov/ticket/facility/300009", note:"Required at 19 trailheads June 15–Oct 15; $1/person via recreation.gov"},
    ] },

  // Middle Sister — Three Sisters Wilderness (Willamette+Deschutes NF boundary)
  // lat/lng: OregonHikers/latitude.to 44.1484°N / 121.7841°W — consistent across sources
  // summit: USGS geology summary 10,047 ft | Wikipedia 10,052 ft (NAVD 88) — use USGS 10,047
  //   (task brief listed 9,182 ft but that is Mt Thielsen's elevation; all authoritative sources show ~10,047 ft)
  // Forest: Willamette NF (west) / Deschutes NF (east) boundary — omitting usfsForestName (same dual-NF issue)
  // SNOTEL: Three Creeks Meadow 815 at 44.15°N / 121.633°W (~8 mi ESE); same station as South Sister
  // HANS: or20 (Three Sisters complex)
  { name:"Middle Sister", slug:"middle-sister", lat:44.1484, lng:-121.7841,
    elevations:{base:5800,mid:8500,summit:10047}, nwacZone:"",
    nwacZoneId:"", snotelStationId:"815", snotelStationTriplet:"815:OR:SNTL",
    snotelStationName:"Three Creeks Meadow", region:"oregon", timezone:"America/Los_Angeles",
    description:"The most remote of the Three Sisters, climbed via the Pole Creek Trail and Hayden Glacier with crevasse navigation and moderate glacier travel to the summit.",
    hansVolcanoId:"or20",
    mapBbox:{west:-121.8641,south:44.0684,east:-121.7041,north:44.2284},
    permits:[
      {label:"Central Cascades Wilderness overnight permit (USFS)", url:"https://www.recreation.gov/permits/4675311", note:"Required for overnight stays June 15–Oct 15 in Three Sisters Wilderness; $6/group via recreation.gov"},
      {label:"Central Cascades Wilderness day-use permit (USFS)", url:"https://www.recreation.gov/ticket/facility/300009", note:"Required at 19 trailheads June 15–Oct 15; $1/person via recreation.gov"},
    ] },

  // North Sister — Three Sisters Wilderness (Deschutes NF / Willamette NF boundary; Lane County)
  // lat/lng: USGS/AllTrails 44.1663°N / 121.7725°W — confirmed by multiple hiking sources
  // summit: Wikipedia 10,090 ft (NAVD 88) | AllTrails/USGS 10,085 ft — use 10,085 (USGS CVO regional figure)
  // Forest: Deschutes NF (east approach dominant) / Willamette NF boundary — omitting usfsForestName (boundary peak)
  // SNOTEL: Three Creeks Meadow 815 at 44.15°N / 121.633°W (~8 mi ESE); nearest OR:SNTL within 12 mi
  // HANS: or20 (Three Sisters complex)
  { name:"North Sister", slug:"north-sister", lat:44.1663, lng:-121.7725,
    elevations:{base:5800,mid:8800,summit:10085}, nwacZone:"",
    nwacZoneId:"", snotelStationId:"815", snotelStationTriplet:"815:OR:SNTL",
    snotelStationName:"Three Creeks Meadow", region:"oregon", timezone:"America/Los_Angeles",
    description:"The oldest and most technically demanding of the Three Sisters, with rotten volcanic rock on the classic South Ridge route via the Pole Creek Trail and Hayden Glacier.",
    hansVolcanoId:"or20",
    mapBbox:{west:-121.8525,south:44.0863,east:-121.6925,north:44.2463},
    permits:[
      {label:"Central Cascades Wilderness overnight permit (USFS)", url:"https://www.recreation.gov/permits/4675311", note:"Required for overnight stays June 15–Oct 15 in Three Sisters Wilderness; $6/group via recreation.gov"},
      {label:"Central Cascades Wilderness day-use permit (USFS)", url:"https://www.recreation.gov/ticket/facility/300009", note:"Required at 19 trailheads June 15–Oct 15; $1/person via recreation.gov"},
    ] },

  // Mount Thielsen — Mt Thielsen Wilderness (Umpqua+Fremont-Winema+Deschutes NF; summit in Umpqua per standard approach)
  // lat/lng: USGS media image caption 43.1527°N / 122.0666°W | Wikipedia 43°09′10″N 122°03′59″W (43.1528°N / 122.0664°W) ✓
  // summit: USGS media 9,182 ft | Wikipedia 9,184 ft (NAVD 88) — use 9,182 ft (USGS)
  // Forest: Standard approach via Diamond Lake / OR-138 is in Umpqua NF; most commonly cited as highest point of Umpqua NF.
  // SNOTEL: Diamond Lake 442 at 43.183°N / 122.133°W (~4.1 mi NW); Douglas County OR:SNTL (5,280 ft elev)
  // HANS: not present in the HANS API — Thielsen is extinct/dormant (last erupted 250,000 yr ago), not monitored
  // Permits: free self-issued wilderness permit (Memorial Day–Oct 31) + NW Forest Pass for parking
  //   NW Forest Pass Umpqua NF (recreation.gov/activitypass/AP21859, 200 verified 2026-06-21)
  { name:"Mount Thielsen", slug:"mt-thielsen", lat:43.1527, lng:-122.0666,
    elevations:{base:5500,mid:7800,summit:9182}, nwacZone:"",
    nwacZoneId:"", snotelStationId:"442", snotelStationTriplet:"442:OR:SNTL",
    snotelStationName:"Diamond Lake", region:"oregon", timezone:"America/Los_Angeles",
    description:"The 'Lightning Rod of the Cascades', an extinct spire-shaped volcano in the Mt Thielsen Wilderness above Diamond Lake, climbed via the PCT and a Class 4 scramble on the crumbly summit pinnacle.",
    usfsForestName:"Umpqua National Forest",
    mapBbox:{west:-122.1466,south:43.0727,east:-121.9866,north:43.2327},
    // Free self-issue wilderness permit required; NW Forest Pass for parking at Umpqua NF trailhead.
    permits:[
      {label:"Northwest Forest Pass (USFS – Umpqua NF)", url:"https://www.recreation.gov/activitypass/AP21859", note:"Required for parking at Mt Thielsen trailhead; $5/day or $30/year via recreation.gov"},
    ] },
  { name:"Colchuck Peak", slug:"colchuck-peak", lat:47.4783, lng:-120.8465,
    elevations:{base:3400,mid:5570,summit:8705}, nwacZone:"east-slopes-central",
    nwacZoneId:"1655", snotelStationId:"478", snotelStationTriplet:"478:WA:SNTL",
    snotelStationName:"Fish Lake", region:"cascades-central", timezone:"America/Los_Angeles",
    description:"A Stuart Range granite peak above Colchuck Lake in the Enchantments, with the classic NE Couloir.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.9265,south:47.3983,east:-120.7665,north:47.5583} },
  { name:"Liberty Bell", slug:"liberty-bell", lat:48.5154, lng:-120.6579,
    elevations:{base:5200,mid:7000,summit:7720}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"711", snotelStationTriplet:"711:WA:SNTL",
    snotelStationName:"Rainy Pass", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A striking granite spire at Washington Pass on Hwy 20, home to the Beckey Route.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.7379,south:48.4354,east:-120.5779,north:48.5954} },
  { name:"Mount Olympus", slug:"mt-olympus", lat:47.8013, lng:-123.7108,
    elevations:{base:600,mid:4200,summit:7980}, nwacZone:"olympics",
    nwacZoneId:"1645", snotelStationId:"1107", snotelStationTriplet:"1107:WA:SNTL", // ⚠️⚠️ remote; all Olympic SNOTEL on drier NE side
    snotelStationName:"Buckinghorse", region:"olympics", timezone:"America/Los_Angeles",
    description:"The glaciated high point of the Olympics, via a long Hoh Rainforest approach and the Blue Glacier.",
    npsParkCode:"olym",
    mapBbox:{west:-123.7908,south:47.7213,east:-123.6308,north:47.8813} },
  { name:"Mount Whitney", slug:"mt-whitney", lat:36.5785, lng:-118.2920,
    elevations:{base:8360,mid:12000,summit:14505}, nwacZone:"",
    nwacZoneId:"", snotelStationId:"", snotelStationTriplet:"",
    snotelStationName:"", region:"sierra-nevada", timezone:"America/Los_Angeles", // out of NWAC/SNOTEL region — weather+satellite only
    description:"The highest summit in the contiguous United States, in California's Eastern Sierra, climbed via the Mount Whitney Trail from Whitney Portal.",
    npsParkCode:"seki",
    mapBbox:{west:-118.3720,south:36.4985,east:-118.2120,north:36.6585},
    // Recreation.gov Whitney Zone overnight permit (200 GET-verified 2026-06-20): https://www.recreation.gov/permits/445860
    // NPS info page (200 verified 2026-06-20): https://www.nps.gov/seki/planyourvisit/whitney.htm
    permits:[
      {label:"Mount Whitney Trail permit (NPS / SEKI)", url:"https://www.recreation.gov/permits/445860", note:"Overnight and day-hike permits required May 1–Nov 1; via recreation.gov"},
      {label:"Whitney Zone information (NPS)", url:"https://www.nps.gov/seki/planyourvisit/whitney.htm"},
    ] },
  // ── North Cascades cluster (13 peaks) ────────────────────────────────────
  // Coordinates: Wikipedia (primary) + getamap.net/topozone.com/WTA (cross-check)
  // Elevations: Wikipedia (primary) + PeakVisor/topozone (cross-check)
  // NWAC zones: avalanche.org map-layer API (geometry) + NWAC zone map visual check
  // SNOTEL: NRCS AWDB station list (wcc.sc.egov.usda.gov) nearest-station selection
  // NPS/NF boundaries: Wikipedia + NPS/USFS official pages per peak
  // Permits: NPS NOCA page + USFS pages (200 verified 2026-06-21)

  // Eldorado Peak — West Slopes North, in NoCa NP
  // lat/lng: Wikipedia 48.537408°N 121.134501°W | getamap.net 48.5376/-121.1343 ✓
  // summit: Wikipedia 8,872.9 ft | PeakVisor 8,873 ft ✓
  // base: Eldorado Creek Trailhead ~2,100 ft (WTA) | mid: Inspiration Glacier high camp ~7,500 ft (NW Alpine Guides)
  // NWAC: API polygon → west-slopes-north; west drainage via Marble/Cascade River to Skagit ✓
  // SNOTEL: Thunder Basin 817 at 48.53N/120.99W (~7 mi NE, best available in the cluster)
  // NPS: noca (North Cascades NP, Skagit County) — no usfsForestName
  // Permits: recreation.gov/permits/4675322 (NoCa backcountry, 200 verified 2026-06-21)
  //          nps.gov/noca/planyourvisit/permits.htm (NPS info, 200 verified 2026-06-21)
  { name:"Eldorado Peak", slug:"eldorado-peak", lat:48.5374, lng:-121.1345,
    elevations:{base:2100,mid:7500,summit:8873}, nwacZone:"west-slopes-north",
    nwacZoneId:"1646", snotelStationId:"817", snotelStationTriplet:"817:WA:SNTL",
    snotelStationName:"Thunder Basin", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A remote North Cascades National Park peak above Marble Creek, climbed via a steep climbers' trail to the Inspiration Glacier and knife-edge summit ridge.",
    npsParkCode:"noca",
    mapBbox:{west:-121.2145,south:48.4574,east:-121.0545,north:48.6174},
    permits:[
      {label:"North Cascades backcountry permit (NPS)", url:"https://www.recreation.gov/permits/4675322", note:"Required for overnight camping; $6 reservation fee + $10/person/night; via recreation.gov"},
      {label:"North Cascades permit info (NPS)", url:"https://www.nps.gov/noca/planyourvisit/permits.htm"},
    ] },

  // Forbidden Peak — West Slopes North, in NoCa NP
  // lat/lng: Wikipedia 48.5115°N 121.0579°W | WTA 48.5116/-121.0578 ✓
  // summit: Wikipedia 8,815 ft | PeakVisor 8,815 ft ✓
  // base: Boston Basin Trailhead ~3,200 ft (NW Alpine Guides) | mid: Boston Basin high camp ~6,500 ft
  // NWAC: API polygon → west-slopes-north; west drainage via Cascade River ✓
  // SNOTEL: Thunder Basin 817 (~7 mi, nearest in Cascade Pass cluster)
  // NPS: noca — no usfsForestName
  { name:"Forbidden Peak", slug:"forbidden-peak", lat:48.5115, lng:-121.0579,
    elevations:{base:3200,mid:6500,summit:8815}, nwacZone:"west-slopes-north",
    nwacZoneId:"1646", snotelStationId:"817", snotelStationTriplet:"817:WA:SNTL",
    snotelStationName:"Thunder Basin", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A glaciated horn in North Cascades NP above Boston Basin, with the classic West Ridge route featured in Fifty Classic Climbs of North America.",
    npsParkCode:"noca",
    mapBbox:{west:-121.1379,south:48.4315,east:-120.9779,north:48.5915},
    permits:[
      {label:"North Cascades backcountry permit (NPS)", url:"https://www.recreation.gov/permits/4675322", note:"Required for overnight camping; $6 reservation fee + $10/person/night; via recreation.gov"},
    ] },

  // Sahale Peak — West Slopes North, in NoCa NP
  // lat/lng: Wikipedia 48.4912°N 121.0390°W | WTA/Steven's Peakbagging 48.491113/-121.038632 ✓
  // summit: Wikipedia 8,680+ ft | PeakVisor 8,680 ft ✓
  // base: Cascade Pass Trailhead ~3,600 ft (NPS/WTA) | mid: Sahale Glacier Camp ~7,600 ft (TheOutbound)
  // NWAC: API polygon → west-slopes-north; Cascade Pass (5,400 ft) drains west to Skagit ✓
  // SNOTEL: Thunder Basin 817 (~8 mi, nearest in Cascade Pass cluster)
  // NPS: noca — no usfsForestName
  { name:"Sahale Peak", slug:"sahale-peak", lat:48.4912, lng:-121.0390,
    elevations:{base:3600,mid:7600,summit:8680}, nwacZone:"west-slopes-north",
    nwacZoneId:"1646", snotelStationId:"817", snotelStationTriplet:"817:WA:SNTL",
    snotelStationName:"Thunder Basin", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A jagged peak above Cascade Pass in North Cascades NP, approached via the scenic Sahale Arm glacier camp with a straightforward snow/glacier ascent to the summit.",
    npsParkCode:"noca",
    mapBbox:{west:-121.1190,south:48.4112,east:-120.9590,north:48.5712},
    permits:[
      {label:"North Cascades backcountry permit (NPS)", url:"https://www.recreation.gov/permits/4675322", note:"Required for overnight camping; $6 reservation fee + $10/person/night; via recreation.gov"},
    ] },

  // Bonanza Peak — East Slopes Central (east of Cascade crest, Wenatchee NF)
  // lat/lng: Wikipedia 48.2382°N 120.8664°W | PeakVisor/WTA 48.2379/-120.8662 ✓
  // summit: Wikipedia 9,516 ft | PeakVisor 9,516 ft ✓ (highest non-volcanic WA peak)
  // base: Railroad Creek / Holden Campground ~3,200 ft (WTA) | mid: Holden Lake ~5,278 ft
  // NWAC: API polygon → east-slopes-central; east of crest in Wenatchee NF ✓
  // SNOTEL: Lyman Lake 606 at 48.20N/120.92W (~6 mi, best available; also used by Glacier Peak as proxy)
  // ⚠️ Lyman Lake shares with Glacier Peak — nearest station in the Glacier Peak Wilderness east lobe
  // Okanogan-Wenatchee NF — no npsParkCode
  { name:"Bonanza Peak", slug:"bonanza-peak", lat:48.2382, lng:-120.8664,
    elevations:{base:3200,mid:5280,summit:9516}, nwacZone:"east-slopes-central",
    nwacZoneId:"1655", snotelStationId:"606", snotelStationTriplet:"606:WA:SNTL",
    snotelStationName:"Lyman Lake", // ⚠️ shares with Glacier Peak; ~6 mi NW, best available
    region:"cascades-north", timezone:"America/Los_Angeles",
    description:"Washington's highest non-volcanic peak in the Glacier Peak Wilderness, reached via the Holden Village ferry approach and Mary Green Glacier.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.9464,south:48.1582,east:-120.7864,north:48.3182},
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP22171", note:"Required for parking at trailheads in Okanogan-Wenatchee NF; $30/year or $5/day"},
    ] },

  // Mount Goode — East Slopes North (east drainage via Bridge/Park Creek to Stehekin/Lake Chelan)
  // lat/lng: Wikipedia 48.4829°N 120.9109°W | PeakVisor 48.483/-120.911 ✓
  // summit: Wikipedia 9,220+ ft | NPS NOCA page "9,220 ft" ✓ (highest point in NoCa NP)
  // base: Bridge Creek/PCT junction ~2,800 ft (AllTrails Goode Ridge) | mid: NE Buttress approach camp ~5,500 ft
  // NWAC: API polygon → east-slopes-north; east of Cascade crest, drains to Stehekin/Lake Chelan ✓
  // SNOTEL: Thunder Basin 817 at 48.53N/120.99W (~7 mi N, best available east-side station)
  // NPS: noca — no usfsForestName
  { name:"Mount Goode", slug:"mt-goode", lat:48.4829, lng:-120.9109,
    elevations:{base:2800,mid:5500,summit:9220}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"817", snotelStationTriplet:"817:WA:SNTL",
    snotelStationName:"Thunder Basin", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"The highest peak in North Cascades National Park, a remote and seldom-climbed mountain rising over 6,000 ft above Bridge Creek, best reached via the Northeast Buttress.",
    npsParkCode:"noca",
    mapBbox:{west:-120.9909,south:48.4029,east:-120.8309,north:48.5629},
    permits:[
      {label:"North Cascades backcountry permit (NPS)", url:"https://www.recreation.gov/permits/4675322", note:"Required for overnight camping; $6 reservation fee + $10/person/night; via recreation.gov"},
    ] },

  // Mount Buckner — West Slopes North (summit straddles crest, accessed via Cascade Pass from west)
  // lat/lng: Wikipedia 48.4951°N 120.9979°W | mountainzone.com 48.4951/-120.9979 ✓
  // summit: Wikipedia 9,114 ft | PeakVisor 9,114 ft ✓ (highest in Skagit County)
  // base: Cascade Pass Trailhead ~3,600 ft | mid: Sahale Glacier Camp / Horseshoe Basin ~6,500 ft
  // NWAC: API polygon → west-slopes-north; standard approach from west via Cascade River Road ✓
  // SNOTEL: Thunder Basin 817 at 48.53N/120.99W (~6 mi N, nearest in Cascade Pass cluster)
  // NPS: noca (Stephen Mather Wilderness) — no usfsForestName
  { name:"Mount Buckner", slug:"mt-buckner", lat:48.4951, lng:-120.9979,
    elevations:{base:3600,mid:6500,summit:9114}, nwacZone:"west-slopes-north",
    nwacZoneId:"1646", snotelStationId:"817", snotelStationTriplet:"817:WA:SNTL",
    snotelStationName:"Thunder Basin", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"Skagit County's highest peak in North Cascades NP, accessed via Cascade Pass and either the Sahale Arm or Horseshoe Basin for a mixed rock-and-glacier climb.",
    npsParkCode:"noca",
    mapBbox:{west:-121.0779,south:48.4151,east:-120.9179,north:48.5751},
    permits:[
      {label:"North Cascades backcountry permit (NPS)", url:"https://www.recreation.gov/permits/4675322", note:"Required for overnight camping; $6 reservation fee + $10/person/night; via recreation.gov"},
    ] },

  // Mount Logan — East Slopes North (east of crest; Park Creek/Thunder Creek drainage)
  // lat/lng: Wikipedia 48.5367°N 120.9519°W | PeakVisor 48.537/-120.952 ✓
  // summit: Wikipedia 9,087 ft | PeakVisor 9,087 ft ✓
  // base: Colonial Creek Campground (Thunder Creek TH) ~1,200 ft | mid: high camp near Park Creek Pass ~6,350 ft
  // NWAC: API polygon → east-slopes-north; summit east of crest, Park Creek drains to Stehekin ✓
  // SNOTEL: Thunder Basin 817 at 48.53N/120.99W (~5 mi W — closest available; ⚠️ east-vs-west proxy)
  // NPS: noca — no usfsForestName
  { name:"Mount Logan", slug:"mt-logan", lat:48.5367, lng:-120.9519,
    elevations:{base:1200,mid:6350,summit:9087}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"817", snotelStationTriplet:"817:WA:SNTL",
    snotelStationName:"Thunder Basin", // ⚠️ ~5 mi W of summit; best available for this remote NP peak
    region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A remote North Cascades NP peak requiring a 20-mile approach via Thunder Creek or Park Creek Pass, with glacier travel on the Fremont or Banded Glacier to the summit.",
    npsParkCode:"noca",
    mapBbox:{west:-121.0319,south:48.4567,east:-120.8719,north:48.6167},
    permits:[
      {label:"North Cascades backcountry permit (NPS)", url:"https://www.recreation.gov/permits/4675322", note:"Required for overnight camping; $6 reservation fee + $10/person/night; via recreation.gov"},
    ] },

  // Jack Mountain — East Slopes North (Pasayten Wilderness, Okanogan-Wenatchee NF)
  // lat/lng: Wikipedia 48.7728°N 120.9562°W | WTA 48.7724/-120.9570 ✓
  // summit: Wikipedia 9,075 ft (NAVD 88) | PeakVisor 9,066 ft (minor rounding difference; use USGS 9,075)
  // base: East Bank Trail TH at Hwy 20 ~1,610 ft (NPS east bank page) | mid: Nohokomeen Glacier camp ~6,500 ft
  // NWAC: API polygon → east-slopes-north; Pasayten Wilderness, east of Cascade crest ✓
  // SNOTEL: No station genuinely nearby (Harts Pass 515 at 48.72N/120.66W ~15 mi E too far)
  // ⚠️ Setting snotel fields to "" — worker early-returns; peaks in Pasayten are very remote
  // Okanogan-Wenatchee NF — no npsParkCode
  { name:"Jack Mountain", slug:"jack-mountain", lat:48.7728, lng:-120.9562,
    elevations:{base:1610,mid:6500,summit:9075}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"", snotelStationTriplet:"",
    snotelStationName:"", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"The highest summit in the Pasayten Wilderness, rising 7,450 ft above Ross Lake with technical climbing via the Nohokomeen Headwall on the Okanogan-Wenatchee side.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-121.0362,south:48.6928,east:-120.8762,north:48.8528},
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP22171", note:"Required for parking at trailheads in Okanogan-Wenatchee NF; $30/year or $5/day"},
    ] },

  // Black Peak — East Slopes North (NoCa NP, east of Cascade crest near Washington Pass)
  // lat/lng: Wikipedia 48.5236°N 120.8161°W | SummitPost notes 48.523/-120.818 ✓
  // summit: Wikipedia 8,975 ft | PeakVisor 8,975 ft ✓
  // base: Rainy Pass Picnic Area TH ~4,850 ft (AllTrails) | mid: Wing Lake ~7,000 ft
  // NWAC: API polygon → east-slopes-north; east of crest near Washington Pass, Liberty Bell already 1654 ✓
  // SNOTEL: Rainy Pass 711 at 48.52N/120.74W (~3 mi E — very close; also used by Liberty Bell)
  // NPS: noca (Stephen Mather Wilderness) — no usfsForestName
  { name:"Black Peak", slug:"black-peak", lat:48.5236, lng:-120.8161,
    elevations:{base:4850,mid:7000,summit:8975}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"711", snotelStationTriplet:"711:WA:SNTL",
    snotelStationName:"Rainy Pass", // ⚠️ shares with Liberty Bell; ~3 mi E, best nearby station
    region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A dramatic peak in North Cascades NP above Wing Lake near Washington Pass, climbed via the Wing Lake approach on the Stephen Mather Wilderness east slopes.",
    npsParkCode:"noca",
    mapBbox:{west:-120.8961,south:48.4436,east:-120.7361,north:48.6036},
    permits:[
      {label:"North Cascades backcountry permit (NPS)", url:"https://www.recreation.gov/permits/4675322", note:"Required for overnight camping; $6 reservation fee + $10/person/night; via recreation.gov"},
    ] },

  // Dome Peak — West Slopes Central (Glacier Peak Wilderness, Mt Baker-Snoqualmie NF, west/Suiattle drainage)
  // lat/lng: Wikipedia 48.3034°N 121.0295°W | topozone 48.3018/-121.0318 ✓
  // summit: Wikipedia 8,920+ ft | PeakVisor 8,920 ft ✓ (topozone shows 8,852 — use Wikipedia/Peakbagger)
  // base: Downey Creek TH ~1,450 ft (WTA, Suiattle River Road) | mid: Bachelor Creek/ridgeline camp ~6,200 ft
  // NWAC: API polygon → west-slopes-central; west of Cascade crest, Suiattle River drains west to Sauk/Skagit ✓
  // SNOTEL: No station genuinely nearby — Lyman Lake 606 (48.20N/120.92W) is ~12 mi but east of crest
  // ⚠️ Setting snotel fields to "" — no west-side station close enough; worker early-returns
  // Mt Baker-Snoqualmie NF (Glacier Peak Wilderness) — no npsParkCode
  { name:"Dome Peak", slug:"dome-peak", lat:48.3034, lng:-121.0295,
    elevations:{base:1450,mid:6200,summit:8920}, nwacZone:"west-slopes-central",
    nwacZoneId:"1647", snotelStationId:"", snotelStationTriplet:"",
    snotelStationName:"", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A massive glaciated peak in the Glacier Peak Wilderness, reached via the Ptarmigan Traverse or the long Downey Creek approach, with several glaciers draping its flanks.",
    usfsForestName:"Mt. Baker-Snoqualmie National Forest",
    mapBbox:{west:-121.1095,south:48.2234,east:-120.9495,north:48.3834},
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP24333", note:"Required for parking at Mt. Baker-Snoqualmie NF trailheads; $30/year or $5/day"},
    ] },

  // Sloan Peak — West Slopes Central (Mt Baker-Snoqualmie NF, Mountain Loop area)
  // lat/lng: Wikipedia 48.0415°N 121.3402°W | WTA/AllTrails trailhead 48.0863/-121.3084; summit coords from Wikipedia ✓
  // summit: Wikipedia 7,835 ft | PeakVisor 7,835 ft ✓
  // base: Bedal Creek TH ~2,790 ft (Rock N Rope NW, AllTrails) | mid: Bedal Basin camp ~5,500 ft
  // NWAC: API polygon → west-slopes-central; Mountain Loop Highway area, same zone as Glacier Peak ✓
  // SNOTEL: No station genuinely nearby (Decline Creek 1319 at 48.24N/121.46W ~14 mi N)
  // ⚠️ Setting snotel fields to "" — no representative station; worker early-returns
  // Mt Baker-Snoqualmie NF — no npsParkCode
  { name:"Sloan Peak", slug:"sloan-peak", lat:48.0415, lng:-121.3402,
    elevations:{base:2790,mid:5500,summit:7835}, nwacZone:"west-slopes-central",
    nwacZoneId:"1647", snotelStationId:"", snotelStationTriplet:"",
    snotelStationName:"", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"The 'Matterhorn of the Cascades', a striking spire in the Mt Baker-Snoqualmie NF above Bedal Basin with a classic and challenging Corkscrew route on its southeast face.",
    usfsForestName:"Mt. Baker-Snoqualmie National Forest",
    mapBbox:{west:-121.4202,south:47.9615,east:-121.2602,north:48.1215},
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP24333", note:"Required for parking at Mt. Baker-Snoqualmie NF trailheads; $30/year or $5/day"},
    ] },

  // Whitehorse Mountain — West Slopes Central (Mt Baker-Snoqualmie NF, Boulder River Wilderness, Darrington)
  // lat/lng: Wikipedia 48.2115°N 121.6782°W | topozone/WTA 48.210933/-121.677704 ✓
  // summit: Wikipedia 6,840+ ft | PeakVisor 6,840 ft ✓
  // base: Niederprum TH ~900 ft (One Hike A Week; 6,310 ft gain to summit) | mid: NW Shoulder glacier ~4,500 ft
  // NWAC: API polygon → west-slopes-central (south of 1646 boundary); Darrington area
  // SNOTEL: Deer Pass 1345 at 48.33N/121.72W (~9 mi N, nearest available)
  // Mt Baker-Snoqualmie NF (Boulder River Wilderness near) — no npsParkCode
  { name:"Whitehorse Mountain", slug:"whitehorse-mountain", lat:48.2115, lng:-121.6782,
    elevations:{base:900,mid:4500,summit:6840}, nwacZone:"west-slopes-central",
    nwacZoneId:"1647", snotelStationId:"1345", snotelStationTriplet:"1345:WA:SNTL",
    snotelStationName:"Deer Pass", // ⚠️ ~9 mi N; best available near Darrington corridor
    region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A dramatic peak near Darrington with a 6,000 ft north-face wall, climbed via the Niederprum Trail and Northwest Shoulder with steep glacier travel near the summit.",
    usfsForestName:"Mt. Baker-Snoqualmie National Forest",
    mapBbox:{west:-121.7582,south:48.1315,east:-121.5982,north:48.2915},
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP24333", note:"Required for parking at Mt. Baker-Snoqualmie NF trailheads; $30/year or $5/day"},
    ] },

  // Three Fingers — West Slopes Central (Mt Baker-Snoqualmie NF, Whitehorse Wilderness, Mountain Loop area)
  // lat/lng: Wikipedia 48.1699°N 121.6878°W | WTA 48.169874/-121.687848 ✓
  // summit: Wikipedia 6,858 ft | PeakVisor 6,859 ft ✓ (south peak with historic lookout)
  // base: Tupso Pass TH ~3,020 ft (willhiteweb.com; note: road washed out, approach adds miles) | mid: Goat Flats ~5,200 ft
  // NWAC: API polygon → west-slopes-central (south of 1646 boundary); Mountain Loop/Darrington area
  // SNOTEL: Deer Pass 1345 at 48.33N/121.72W (~9 mi N, nearest available; shares with Whitehorse)
  // Mt Baker-Snoqualmie NF — no npsParkCode
  { name:"Three Fingers", slug:"three-fingers", lat:48.1699, lng:-121.6878,
    elevations:{base:3020,mid:5200,summit:6858}, nwacZone:"west-slopes-central",
    nwacZoneId:"1647", snotelStationId:"1345", snotelStationTriplet:"1345:WA:SNTL",
    snotelStationName:"Deer Pass", // ⚠️ ~9 mi N; shares with Whitehorse, best available in the corridor
    region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A triple-summited peak in Mt Baker-Snoqualmie NF above Goat Flats, topped by a historic 1933 fire lookout reached via a glacier traverse and exposed ladders on the south peak.",
    usfsForestName:"Mt. Baker-Snoqualmie National Forest",
    mapBbox:{west:-121.7678,south:48.0899,east:-121.6078,north:48.2499},
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP24333", note:"Required for parking at Mt. Baker-Snoqualmie NF trailheads; $30/year or $5/day"},
    ] },

  // ── Stuart Range + Entiat cluster (6 peaks) ──────────────────────────────
  // Coordinates: Wikipedia (primary) + PeakVisor (cross-check) — all pairs agree within 70 m ✓
  // Elevations: Wikipedia (primary) + SummitPost/PeakVisor (cross-check)
  // NWAC zones: avalanche.org map-layer API polygon containment (fetched 2026-06-21) ✓
  //   Stuart/Dragontail/Cannon → east-slopes-central 1655 (same zone as colchuck-peak)
  //   Fernow/Maude/Seven-Fingered-Jack → east-slopes-north 1654 (lat 48.1+, above zone boundary)
  // SNOTEL: NRCS AWDB stations API (wcc.sc.egov.usda.gov) nearest active station
  // NF: Okanogan-Wenatchee National Forest (Alpine Lakes Wilderness for Stuart Range;
  //     Glacier Peak Wilderness for Entiat peaks) — no npsParkCode (not inside a National Park)
  // Permits: recreation.gov + fs.usda.gov (200 GET-verified 2026-06-21)

  // Mount Stuart — East Slopes Central, Alpine Lakes Wilderness
  // lat/lng: Wikipedia 47°28′30″N 120°54′11″W (47.4751/-120.9031) | PeakVisor 47.4750/-120.9025 ✓ (46 m apart)
  // summit: Wikipedia 9,415 ft (highest non-volcanic WA peak south of Glacier Peak) | PeakVisor 9,419 ft ✓
  // base: Ingalls Creek/Esmeralda TH ~4,243 ft (USFS/Wenatchee Outdoors) | mid: bivy at bottom of Cascadian Couloir ~7,600 ft
  // NWAC: API polygon → east-slopes-central 1655 ✓
  // SNOTEL: Fish Lake 478 at 47.536N/121.086W (~9.5 mi, nearest active; same station as colchuck-peak)
  // Enchantment Permit Area covers non-Core zones; Stuart zone is part of the permit system
  // recreation.gov/permits/233273 Advanced Lottery (200 verified 2026-06-21): covers Stuart Lake Zone
  // recreation.gov/permits/445863 Daily Lottery (200 verified 2026-06-21): covers Stuart Lake Zone
  { name:"Mount Stuart", slug:"mt-stuart", lat:47.4751, lng:-120.9031,
    elevations:{base:4243,mid:7600,summit:9415}, nwacZone:"east-slopes-central",
    nwacZoneId:"1655", snotelStationId:"478", snotelStationTriplet:"478:WA:SNTL",
    snotelStationName:"Fish Lake", // ⚠️ ~9.5 mi W; same station as colchuck-peak, best available in Stuart Range
    region:"cascades-central", timezone:"America/Los_Angeles",
    description:"The highest non-volcanic peak in the Alpine Lakes Wilderness, climbed via the Cascadian Couloir or the classic West Ridge from the Ingalls Creek trailhead.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.9831,south:47.3951,east:-120.8231,north:47.5551},
    // recreation.gov Enchantment Permit Area (200 verified 2026-06-21): https://www.recreation.gov/permits/233273
    // recreation.gov Enchantment Daily Lottery (200 verified 2026-06-21): https://www.recreation.gov/permits/445863
    permits:[
      {label:"Enchantment Permit Area – Advanced Lottery (USFS)", url:"https://www.recreation.gov/permits/233273", note:"Overnight permit required May 15–Oct 31 in Stuart Lake Zone; $6 app fee + $5/person/night via recreation.gov"},
      {label:"Enchantment Permit Area – Daily Lottery (USFS)", url:"https://www.recreation.gov/permits/445863", note:"Same permit area, day-before daily lottery; NW Forest Pass required for trailhead parking"},
    ] },

  // Dragontail Peak — East Slopes Central, Alpine Lakes Wilderness / Enchantment Permit Area
  // lat/lng: Wikipedia 47.4787°N 120.8334°W | PeakVisor 47.4789/-120.8331 ✓ (32 m apart)
  // summit: Wikipedia 8,840 ft | topozone.com 8,840 ft ✓ (PeakVisor 2,701 m = 8,859 ft — use USGS-cited 8,840)
  // base: Stuart Lake / Colchuck Lake TH ~3,400 ft (AllTrails/WTA) | mid: Aasgard Pass ~7,800 ft
  // NWAC: API polygon → east-slopes-central 1655 ✓
  // SNOTEL: Fish Lake 478 at 47.536N/121.086W (~12.4 mi, nearest active for this cluster)
  // Enchantment Permit Area — Colchuck Lake Zone covers the Dragontail/Colchuck approach
  // recreation.gov/permits/233273 Advanced Lottery (200 verified 2026-06-21): Colchuck Lake Zone
  // recreation.gov/permits/445863 Daily Lottery (200 verified 2026-06-21): Colchuck Lake Zone
  { name:"Dragontail Peak", slug:"dragontail-peak", lat:47.4787, lng:-120.8334,
    elevations:{base:3400,mid:7800,summit:8840}, nwacZone:"east-slopes-central",
    nwacZoneId:"1655", snotelStationId:"478", snotelStationTriplet:"478:WA:SNTL",
    snotelStationName:"Fish Lake", // ⚠️ ~12.4 mi W; nearest active for the Enchantments cluster
    region:"cascades-central", timezone:"America/Los_Angeles",
    description:"A dramatic granite tower anchoring the east end of the Enchantments in the Alpine Lakes Wilderness, climbed via the Colchuck Lake approach and steep Aasgard Pass.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.9134,south:47.3987,east:-120.7534,north:47.5587},
    // recreation.gov Enchantment Permit Area (200 verified 2026-06-21): https://www.recreation.gov/permits/233273
    // recreation.gov Enchantment Daily Lottery (200 verified 2026-06-21): https://www.recreation.gov/permits/445863
    permits:[
      {label:"Enchantment Permit Area – Advanced Lottery (USFS)", url:"https://www.recreation.gov/permits/233273", note:"Overnight permit required May 15–Oct 31 in Colchuck Lake Zone; $6 app fee + $5/person/night via recreation.gov"},
      {label:"Enchantment Permit Area – Daily Lottery (USFS)", url:"https://www.recreation.gov/permits/445863", note:"Same permit area, day-before daily lottery; NW Forest Pass required for trailhead parking"},
    ] },

  // Cannon Mountain — East Slopes Central, Alpine Lakes Wilderness / Enchantment Permit Area
  // lat/lng: Wikipedia 47°30′10″N 120°48′09″W (47.5028/-120.8024) | PeakVisor 47.5022/-120.8027 ✓ (70 m apart)
  // summit: Wikipedia 8,652 ft | PeakVisor 8,652 ft ✓
  // base: Stuart Lake TH ~3,225 ft (AllTrails; same access as Dragontail via Snow Lakes traverse) | mid: Core Enchantments plateau ~7,500 ft
  // NWAC: API polygon → east-slopes-central 1655 ✓
  // SNOTEL: Fish Lake 478 at 47.536N/121.086W (~13.4 mi, nearest active)
  // Enchantment Permit Area — Core Enchantment Zone covers Cannon Mountain
  // recreation.gov/permits/233273 Advanced Lottery (200 verified 2026-06-21): Core Enchantment Zone
  // recreation.gov/permits/445863 Daily Lottery (200 verified 2026-06-21): Core Enchantment Zone
  { name:"Cannon Mountain", slug:"cannon-mountain", lat:47.5028, lng:-120.8024,
    elevations:{base:3225,mid:7500,summit:8652}, nwacZone:"east-slopes-central",
    nwacZoneId:"1655", snotelStationId:"478", snotelStationTriplet:"478:WA:SNTL",
    snotelStationName:"Fish Lake", // ⚠️ ~13.4 mi W; nearest active for the Enchantments cluster
    region:"cascades-central", timezone:"America/Los_Angeles",
    description:"A granite peak in the Core Enchantment Zone of the Alpine Lakes Wilderness, reached via the Enchantments traverse from Aasgard Pass across the iconic high alpine plateau.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.8824,south:47.4228,east:-120.7224,north:47.5828},
    // recreation.gov Enchantment Permit Area (200 verified 2026-06-21): https://www.recreation.gov/permits/233273
    // recreation.gov Enchantment Daily Lottery (200 verified 2026-06-21): https://www.recreation.gov/permits/445863
    permits:[
      {label:"Enchantment Permit Area – Advanced Lottery (USFS)", url:"https://www.recreation.gov/permits/233273", note:"Overnight permit required May 15–Oct 31 in Core Enchantment Zone; $6 app fee + $5/person/night via recreation.gov"},
      {label:"Enchantment Permit Area – Daily Lottery (USFS)", url:"https://www.recreation.gov/permits/445863", note:"Same permit area, day-before daily lottery; NW Forest Pass required for trailhead parking"},
    ] },

  // Cashmere Mountain — East Slopes Central, Alpine Lakes Wilderness / Enchantment Permit Area (Eightmile/Caroline Zone)
  // Named "Cashmere Mountain" (not "Mount Cashmere"); Wenatchee Mountains near Leavenworth, Chelan County.
  // lat/lng: Wikipedia 47.558737°N 120.847262°W | GNIS/GPS waypoint 47.5587294/-120.8470346 ✓ (~15 m apart)
  // summit: Wikipedia 8,514 ft (USGS) | The Mountaineers "cashmere-8501" cites 8,501 ft — 13 ft apart, use USGS 8,514
  // base: Eightmile Lake TH ~3,300 ft (Eightmile Creek Rd; web search + Wenatchee Outdoors) | mid: Lake Caroline ~6,200 ft (standard Windy Pass scramble approach)
  // NWAC: avalanche.org map-layer API polygon containment (verified 2026-06-30) → east-slopes-central 1655
  //   (same zone as neighboring Colchuck/Cannon/Stuart; point-in-polygon computed locally)
  // SNOTEL: Fish Lake 478 at 47.536N/121.086W (~11 mi W, nearest active; same station as the Enchantments cluster)
  // Enchantment Permit Area — Eightmile/Caroline Zone covers the Eightmile Lake → Lake Caroline approach
  //   recreation.gov/permits/233273 Advanced Lottery + /445863 Daily Lottery (same system as Stuart/Colchuck)
  // Okanogan-Wenatchee NF (Alpine Lakes Wilderness) — no npsParkCode; not a volcano — no hansVolcanoId
  { name:"Cashmere Mountain", slug:"cashmere-mountain", lat:47.5587, lng:-120.8473,
    elevations:{base:3300,mid:6200,summit:8514}, nwacZone:"east-slopes-central",
    nwacZoneId:"1655", snotelStationId:"478", snotelStationTriplet:"478:WA:SNTL",
    snotelStationName:"Fish Lake", // ⚠️ ~11 mi W; same station as the Enchantments cluster, best available near Leavenworth
    region:"cascades-central", timezone:"America/Los_Angeles",
    description:"A triple-summited granite peak in the Wenatchee Mountains above Leavenworth, climbed as a long scramble via Eightmile Lake, Lake Caroline, and Windy Pass in the Alpine Lakes Wilderness.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.9273,south:47.4787,east:-120.7673,north:47.6387},
    permits:[
      {label:"Enchantment Permit Area – Advanced Lottery (USFS)", url:"https://www.recreation.gov/permits/233273", note:"Overnight permit required May 15–Oct 31 in Eightmile/Caroline Zone; $6 app fee + $5/person/night via recreation.gov"},
      {label:"Enchantment Permit Area – Daily Lottery (USFS)", url:"https://www.recreation.gov/permits/445863", note:"Same permit area, day-before daily lottery; NW Forest Pass required for trailhead parking"},
    ] },

  // Mount Fernow — East Slopes North, Glacier Peak Wilderness / Entiat Mountains
  // lat/lng: Wikipedia 48°9′43″N 120°48′29″W (48.16194/-120.80806) | PeakVisor 48.1624/-120.8076 ✓ (61 m apart)
  // summit: Wikipedia 9,249 ft (highest Entiat peak, 8th highest in WA) | PeakVisor 9,249 ft ✓
  // base: Phelps Creek TH ~3,500 ft (WTA/USFS; standard western approach via Leroy Creek Basin) | mid: upper Leroy Creek Basin ~6,800 ft
  // NWAC: API polygon → east-slopes-north 1654 ✓ (Entiat Mountains fall above the east-slopes-central boundary)
  // SNOTEL: Trinity 1171 at 48.075N/120.850W (~6.3 mi SE, nearest active station)
  // ⚠️ Trinity is the closest available; no station directly in the Entiat drainage
  // Glacier Peak Wilderness, Okanogan-Wenatchee NF — no npsParkCode
  // recreation.gov/activitypass/AP22171 NW Forest Pass (200 verified 2026-06-21)
  { name:"Mount Fernow", slug:"mt-fernow", lat:48.1619, lng:-120.8082,
    elevations:{base:3500,mid:6800,summit:9249}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"1171", snotelStationTriplet:"1171:WA:SNTL",
    snotelStationName:"Trinity", // ⚠️ ~6.3 mi SE; nearest active station for the Entiat peaks
    region:"cascades-central", timezone:"America/Los_Angeles",
    description:"The highest peak of the Entiat Mountains and Washington's third-highest non-volcanic summit, in the Glacier Peak Wilderness, approached via Leroy Creek Basin from the Phelps Creek trailhead.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.8882,south:48.0819,east:-120.7282,north:48.2419},
    // recreation.gov NW Forest Pass (200 verified 2026-06-21): https://www.recreation.gov/activitypass/AP22171
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP22171", note:"Required for parking at Okanogan-Wenatchee NF trailheads; $30/year or $5/day"},
    ] },

  // Mount Maude — East Slopes North, Glacier Peak Wilderness / Entiat Mountains
  // lat/lng: Wikipedia 48.1373508°N 120.8039882°W | PeakVisor 48.1375/-120.8037 ✓ (27 m apart)
  // summit: Wikipedia 9,082 ft | SummitPost/WTA 9,082 ft ✓ (15th highest in WA)
  // base: Phelps Creek TH ~3,500 ft (WTA; same western approach as Fernow via Leroy Creek Basin) | mid: Leroy Basin high camp ~6,800 ft
  // NWAC: API polygon → east-slopes-north 1654 ✓
  // SNOTEL: Trinity 1171 at 48.075N/120.850W (~4.8 mi SE, nearest active; closest of the three Entiat peaks)
  // Glacier Peak Wilderness, Okanogan-Wenatchee NF — no npsParkCode
  // recreation.gov/activitypass/AP22171 NW Forest Pass (200 verified 2026-06-21)
  { name:"Mount Maude", slug:"mt-maude", lat:48.1374, lng:-120.8040,
    elevations:{base:3500,mid:6800,summit:9082}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"1171", snotelStationTriplet:"1171:WA:SNTL",
    snotelStationName:"Trinity", // ⚠️ ~4.8 mi SE; nearest active station for the Entiat peaks
    region:"cascades-central", timezone:"America/Los_Angeles",
    description:"A rugged Glacier Peak Wilderness peak in the Entiat Mountains, climbed alongside neighbor Seven Fingered Jack via Leroy Creek Basin from the Phelps Creek trailhead.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.884,south:48.0574,east:-120.724,north:48.2174},
    // recreation.gov NW Forest Pass (200 verified 2026-06-21): https://www.recreation.gov/activitypass/AP22171
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP22171", note:"Required for parking at Okanogan-Wenatchee NF trailheads; $30/year or $5/day"},
    ] },

  // Seven Fingered Jack — East Slopes North, Glacier Peak Wilderness / Entiat Mountains
  // lat/lng: Wikipedia 48.15056°N 120.81389°W | PeakVisor 48.1503/-120.8145 ✓ (54 m apart)
  // summit: Wikipedia/The Mountaineers 9,100 ft | SummitPost 9,100 ft ✓ (USGS also cites 9,022 ft from older survey; use 9,100 from current sources)
  // base: Phelps Creek TH ~3,500 ft (WTA; western approach via Leroy Creek Basin) | mid: upper Leroy Basin camp ~6,800 ft
  // NWAC: API polygon → east-slopes-north 1654 ✓
  // SNOTEL: Trinity 1171 at 48.075N/120.850W (~5.5 mi SE, nearest active)
  // Glacier Peak Wilderness, Okanogan-Wenatchee NF — no npsParkCode
  // recreation.gov/activitypass/AP22171 NW Forest Pass (200 verified 2026-06-21)
  { name:"Seven Fingered Jack", slug:"seven-fingered-jack", lat:48.1506, lng:-120.8139,
    elevations:{base:3500,mid:6800,summit:9100}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"1171", snotelStationTriplet:"1171:WA:SNTL",
    snotelStationName:"Trinity", // ⚠️ ~5.5 mi SE; nearest active station for the Entiat peaks
    region:"cascades-central", timezone:"America/Los_Angeles",
    description:"A multi-buttressed Glacier Peak Wilderness peak in the Entiat Mountains, named for its seven prominent ridges, climbed via Leroy Creek Basin from the Phelps Creek trailhead.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-120.8939,south:48.0706,east:-120.7339,north:48.2306},
    // recreation.gov NW Forest Pass (200 verified 2026-06-21): https://www.recreation.gov/activitypass/AP22171
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP22171", note:"Required for parking at Okanogan-Wenatchee NF trailheads; $30/year or $5/day"},
    ] },

  // ── Olympics + South Cascades cluster (3 peaks) ──────────────────────────
  // Coordinates: Wikipedia (primary) + PeakVisor (cross-check) — all pairs agree within 30 m ✓
  // Elevations: Wikipedia (primary) + PeakVisor (cross-check)
  // NWAC zones: avalanche.org map-layer API polygon containment (fetched 2026-06-21) ✓
  //   Constance/Deception → olympics 1645; Gilbert Peak → east-slopes-south 1656
  // SNOTEL: NRCS AWDB stations API (wcc.sc.egov.usda.gov) nearest active station
  // NP/NF boundaries: Wikipedia + NPS/USFS official pages per peak (verified 2026-06-21)
  // Permits: recreation.gov + fs.usda.gov (200 GET-verified 2026-06-21)

  // Mount Constance — Olympics zone, summit on ONP/Buckhorn Wilderness boundary
  // lat/lng: Wikipedia 47.772815°N 123.127354°W | PeakVisor 47.772568/-123.127446 ✓ (27 m apart)
  // summit: Wikipedia 7,756 ft | PeakVisor 7,756 ft ✓
  // base: Lake Constance Trailhead ~1,400 ft (Dosewallips River Road closure point)
  // mid: Lake Constance base camp ~4,800 ft (WTA/HikeWithKurt sources)
  // NWAC: API polygon → olympics 1645 ✓ (summit in eastern Olympics)
  // SNOTEL: Mount Crag 648 at 47°46'N/123°2'W (~4.7 mi SE, Dosewallips watershed)
  // NP: npsParkCode "olym" — summit on ONP/Buckhorn boundary; standard approach via Olympic NP
  // Permits: recreation.gov/permits/4098362 (Olympic NP Wilderness Permit, 200 verified 2026-06-21)
  //          nps.gov/olym/planyourvisit/wilderness-reservations.htm (NPS info, 200 verified 2026-06-21)
  { name:"Mount Constance", slug:"mt-constance", lat:47.7728, lng:-123.1274,
    elevations:{base:1400,mid:4800,summit:7756}, nwacZone:"olympics",
    nwacZoneId:"1645", snotelStationId:"648", snotelStationTriplet:"648:WA:SNTL",
    snotelStationName:"Mount Crag", region:"olympics", timezone:"America/Los_Angeles",
    description:"The third-highest Olympic peak at the range's eastern edge, with a brutal 3,300-ft trail to Lake Constance base camp followed by technical scrambling and the South Chute to the summit.",
    npsParkCode:"olym",
    mapBbox:{west:-123.2074,south:47.6928,east:-123.0474,north:47.8528},
    permits:[
      {label:"Olympic National Park Wilderness Permit (NPS)", url:"https://www.recreation.gov/permits/4098362", note:"Required for overnight camping in the Daniel J. Evans Wilderness; $6 reservation fee + $8/person/night; via recreation.gov"},
      {label:"Olympic NP wilderness permit info (NPS)", url:"https://www.nps.gov/olym/planyourvisit/wilderness-reservations.htm"},
    ] },

  // Mount Deception — Olympics zone, inside Olympic National Park
  // lat/lng: Wikipedia 47°48′47″N 123°14′00″W (47.8131/-123.2333) | PeakVisor 47.813181/-123.233572 ✓ (26 m apart)
  // summit: Wikipedia 7,788 ft | PeakVisor 7,788 ft (2,374 m × 3.28084 = 7,789 ft; USGS cited 7,788) ✓
  // base: Upper Dungeness Trailhead ~2,500 ft (ProTrails/WTA)
  // mid: Royal Lake ~5,100 ft (NPS Royal Basin page + AllTrails)
  // NWAC: API polygon → olympics 1645 ✓ (NE Olympics)
  // SNOTEL: Dungeness 943 at 47°52'N/123°5'W (~8.4 mi NE, nearest available in NE Olympics)
  // NPS: olym — confirmed inside Olympic National Park (Wikipedia + NPS Royal Basin page)
  // Permits: recreation.gov/permits/4098362 (Olympic NP Wilderness Permit, 200 verified 2026-06-21)
  { name:"Mount Deception", slug:"mt-deception", lat:47.8131, lng:-123.2335,
    elevations:{base:2500,mid:5100,summit:7788}, nwacZone:"olympics",
    nwacZoneId:"1645", snotelStationId:"943", snotelStationTriplet:"943:WA:SNTL", // ⚠️ Dungeness ~8.4 mi NE; nearest in NE Olympics
    snotelStationName:"Dungeness", region:"olympics", timezone:"America/Los_Angeles",
    description:"The second-highest peak of the Olympics inside Olympic National Park, approached via the Upper Dungeness Trail and Royal Basin for technical summit climbing on the northeast ridge.",
    npsParkCode:"olym",
    mapBbox:{west:-123.3135,south:47.7331,east:-123.1535,north:47.8931},
    permits:[
      {label:"Olympic National Park Wilderness Permit (NPS)", url:"https://www.recreation.gov/permits/4098362", note:"Required for overnight camping in the Daniel J. Evans Wilderness; $6 reservation fee + $8/person/night; via recreation.gov"},
      {label:"Olympic NP wilderness permit info (NPS)", url:"https://www.nps.gov/olym/planyourvisit/wilderness-reservations.htm"},
    ] },

  // Gilbert Peak — East Slopes South, Goat Rocks Wilderness, Okanogan-Wenatchee NF (east of crest)
  // lat/lng: Wikipedia 46.48833°N 121.40694°W | PeakVisor 46.488118/-121.407931 ✓ (23 m apart)
  // summit: Wikipedia 8,184 ft | PeakVisor 8,184 ft ✓ (survey marker reads 8,201 ft — use USGS map 8,184)
  // base: Conrad Meadows / South Fork Tieton TH ~3,900 ft (Goat Rocks Okanogan-Wenatchee NF page; WTA notes 4,100 ft gate)
  // mid: Conrad Glacier approach camp ~6,500 ft (trip reports: Conrad Meade route)
  // NWAC: API polygon → east-slopes-south 1656 ✓ (east of Cascade crest, Tieton drainage, Yakima County)
  // SNOTEL: Pigtail Peak 692 at 46°37'N/121°23'W (~9 mi N, nearest available; Yakima County)
  // ⚠️ Pigtail Peak is ~9 mi N — nearest available in Goat Rocks area; no closer active station
  // Okanogan-Wenatchee NF (standard route via Conrad Meadows on east side) — no npsParkCode
  // Permits: recreation.gov/activitypass/AP22171 NW Forest Pass (200 verified 2026-06-21); free self-issued wilderness permit at trailhead
  { name:"Gilbert Peak", slug:"gilbert-peak", lat:46.4881, lng:-121.4079,
    elevations:{base:3900,mid:6500,summit:8184}, nwacZone:"east-slopes-south",
    nwacZoneId:"1656", snotelStationId:"692", snotelStationTriplet:"692:WA:SNTL", // ⚠️ Pigtail Peak ~9 mi N; nearest available
    snotelStationName:"Pigtail Peak", region:"cascades-south", timezone:"America/Los_Angeles",
    description:"The highest summit in the Goat Rocks Wilderness — eroded remnants of an ancient volcano — climbed via Conrad Meadows and the Conrad Glacier on the east flank.",
    usfsForestName:"Okanogan-Wenatchee National Forest",
    mapBbox:{west:-121.4879,south:46.4081,east:-121.3279,north:46.5681},
    permits:[
      {label:"Northwest Forest Pass (USFS)", url:"https://www.recreation.gov/activitypass/AP22171", note:"Required for parking at Okanogan-Wenatchee NF trailheads; $30/year or $5/day"},
    ] },
] as const;

export const mountainBySlug = (slug: string): Mountain | undefined =>
  MOUNTAINS.find((m) => m.slug === slug);

export const mountainsByName = (): Mountain[] =>
  [...MOUNTAINS].sort((a, b) => a.name.localeCompare(b.name));
