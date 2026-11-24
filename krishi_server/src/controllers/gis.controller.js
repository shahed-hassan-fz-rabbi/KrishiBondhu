/**
 * GIS & Geospatial Intelligence Controller.
 * Delivers verified BBS 2020 Admin-2 GeoJSON district boundaries,
 * multi-sensor observation locations, and sensor footprint envelopes.
 *
 * Strictly Read-Only:
 * - Reads BBS GeoJSON from server/data/gis/bbs_admin2_cumilla_chattogram.geojson.
 * - Reads existing SMAP & MODIS observations from MongoDB without modification.
 * - Zero database writes.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DISTRICTS } from "../config/climate.config.js";
import { SMAP } from "../config/smap.config.js";
import { MODIS } from "../config/modis.config.js";
import { SmapObservation } from "../models/smapobservation.model.js";
import { ModisObservation } from "../models/modisobservation.model.js";
import { GpmObservation } from "../models/gpmobservation.model.js";
import { NasaObservation } from "../models/nasaobservation.model.js";
import { GPM } from "../config/gpm.config.js";
import { errorResponse, successResponse } from "../utils/response.js";
import { snapshotService } from "../services/snapshot.service.js";
import { gpmFinalDistrictFilter, summarizeGpmLocalDay } from "../services/nasa/gpm.validation.js";
import { findLatestGoodModisObservation, isGoodModisObservation, latestGoodModisSnapshot } from "../services/nasa/modis.quality.js";
import { findLatestRecommendedSmapObservation, latestRecommendedSmapSnapshot } from "../services/nasa/smap.quality.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const geojsonPath = path.resolve(__dirname, "../../data/gis/bbs_admin2_cumilla_chattogram.geojson");
const admin3GeojsonPath = path.resolve(__dirname, "../../data/gis/bgd_admin3_ocha_simplified.geojson");

// District P-Code mapping
const DISTRICT_MAP = {
  cumilla: {
    code: "cumilla",
    nameEn: "Cumilla",
    nameBn: "কুমিল্লা",
    pCode: "BD2019",
    refCoord: [91.18503, 23.46186], // [lon, lat]
    bbox: [90.63, 23.048, 91.3719, 23.7956], // [minLon, minLat, maxLon, maxLat]
    center: [23.46186, 91.18503], // [lat, lon]
    zoom: 10,
  },
  chattogram: {
    code: "chattogram",
    nameEn: "Chattogram",
    nameBn: "চট্টগ্রাম",
    pCode: "BD2015",
    refCoord: [91.8317, 22.3384], // [lon, lat]
    bbox: [91.3111, 21.8579, 92.2163, 22.9892],
    center: [22.3384, 91.8317],
    zoom: 9,
  },
};

let cachedGeoJson = null;
let cachedAdmin3GeoJson = null;

function loadGeoJson() {
  if (cachedGeoJson) return cachedGeoJson;
  if (!fs.existsSync(geojsonPath)) {
    throw new Error(`GeoJSON file missing at ${geojsonPath}`);
  }
  const raw = fs.readFileSync(geojsonPath, "utf-8");
  cachedGeoJson = JSON.parse(raw);
  return cachedGeoJson;
}

function loadAdmin3GeoJson() {
  if (cachedAdmin3GeoJson) return cachedAdmin3GeoJson;
  if (!fs.existsSync(admin3GeojsonPath)) throw new Error(`Upazila boundary file missing at ${admin3GeojsonPath}`);
  cachedAdmin3GeoJson = JSON.parse(fs.readFileSync(admin3GeojsonPath, "utf-8"));
  return cachedAdmin3GeoJson;
}

function pointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] || [];
    const [xj, yj] = ring[j] || [];
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const crosses = (yi > latitude) !== (yj > latitude)
      && longitude < ((xj - xi) * (latitude - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygonGeometry(longitude, latitude, geometry) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.some((rings) => Array.isArray(rings) && rings.length > 0
    && pointInRing(longitude, latitude, rings[0])
    && !rings.slice(1).some((ring) => pointInRing(longitude, latitude, ring)));
}

function representativePoint(feature) {
  const polygons = feature?.geometry?.type === "Polygon" ? [feature.geometry.coordinates]
    : feature?.geometry?.type === "MultiPolygon" ? feature.geometry.coordinates : [];
  let largest = null;
  let largestArea = -1;
  for (const polygon of polygons) {
    const ring = polygon?.[0];
    if (!Array.isArray(ring) || ring.length < 4) continue;
    let twiceArea = 0;
    let longitudeSum = 0;
    let latitudeSum = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      const cross = x1 * y2 - x2 * y1;
      twiceArea += cross;
      longitudeSum += (x1 + x2) * cross;
      latitudeSum += (y1 + y2) * cross;
    }
    const area = Math.abs(twiceArea);
    if (area > largestArea && area > 0) {
      largestArea = area;
      largest = [longitudeSum / (3 * twiceArea), latitudeSum / (3 * twiceArea)];
    }
  }
  if (largest && pointInPolygonGeometry(largest[0], largest[1], feature.geometry)) return largest;

  // A bounds midpoint is a safe fallback for narrow/concave polygons.
  let minLon = Infinity; let minLat = Infinity; let maxLon = -Infinity; let maxLat = -Infinity;
  const visit = (coords) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
      minLon = Math.min(minLon, coords[0]); maxLon = Math.max(maxLon, coords[0]);
      minLat = Math.min(minLat, coords[1]); maxLat = Math.max(maxLat, coords[1]);
      return;
    }
    coords.forEach(visit);
  };
  visit(feature?.geometry?.coordinates);
  if ([minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  return null;
}

/** GET /api/v1/gis/upazilas?district=cumilla — BBS/OCHA 2020 Admin-3 polygons. */
export async function getGisUpazilas(req, res, next) {
  try {
    const districtCode = (req.query.district || "").trim().toLowerCase();
    const mapping = DISTRICT_MAP[districtCode];
    if (!mapping) return errorResponse(res, 400, "Choose a supported district to load its upazilas.", "INVALID_DISTRICT");

    const districtFeature = loadGeoJson().features.find((feature) => feature.properties?.adm2_pcode === mapping.pCode);
    if (!districtFeature) return errorResponse(res, 404, "District boundary is unavailable.", "BOUNDARY_NOT_FOUND");

    const features = loadAdmin3GeoJson().features.flatMap((feature) => {
      const point = representativePoint(feature);
      if (!point || !pointInPolygonGeometry(point[0], point[1], districtFeature.geometry)) return [];
      return [{
        ...feature,
        properties: {
          ...feature.properties,
          districtCode,
          representativePoint: { latitude: point[1], longitude: point[0] },
        },
      }];
    });

    return successResponse(res, 200, { type: "FeatureCollection", features }, {
      provenance: "geoBoundaries ADM3, sourced from Bangladesh Bureau of Statistics (BBS) and OCHA ROAP",
      sourceUrl: "https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM3/",
      sourceDataset: "Bangladesh ADM3 2020 (simplified geometry)",
      license: "CC BY 3.0 IGO",
      districtCode,
      featureCount: features.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/gis/districts
 * Returns list of supported districts with geospatial metadata and available layers.
 */
export async function getGisDistricts(req, res, next) {
  try {
    const list = Object.values(DISTRICT_MAP).map((d) => ({
      code: d.code,
      nameEn: d.nameEn,
      nameBn: d.nameBn,
      pCode: d.pCode,
      center: d.center,
      zoom: d.zoom,
      bbox: d.bbox,
      refCoord: d.refCoord,
      availableSensors: ["gpm", "smap", "modis", "power"],
    }));

    return successResponse(res, 200, list, {
      crs: "EPSG:4326 (WGS 84)",
      boundaryAuthority: "Bangladesh Bureau of Statistics (BBS) 2020 Admin-2",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/gis/boundaries?district=cumilla
 * Returns verified BBS Admin-2 GeoJSON for one or all supported districts.
 */
export async function getGisBoundaries(req, res, next) {
  try {
    const geo = loadGeoJson();
    const districtQuery = req.query.district ? req.query.district.trim().toLowerCase() : null;

    if (districtQuery) {
      const mapping = DISTRICT_MAP[districtQuery];
      if (!mapping) {
        return errorResponse(
          res,
          400,
          `Unsupported district '${districtQuery}'. Supported: ${Object.keys(DISTRICT_MAP).join(", ")}`,
          "INVALID_DISTRICT"
        );
      }

      const feature = geo.features.find((f) => f.properties.adm2_pcode === mapping.pCode);
      if (!feature) {
        return errorResponse(res, 404, `Boundary polygon not found for ${districtQuery}`, "BOUNDARY_NOT_FOUND");
      }

      return successResponse(
        res,
        200,
        {
          type: "FeatureCollection",
          features: [feature],
          districtMeta: mapping,
        },
        {
          provenance: geo.provenance,
          sourceDataset: "bgd_admbnda_adm2_bbs_20201113",
          licensing: "Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)",
          crs: "EPSG:4326 (WGS 84)",
        }
      );
    }

    // Return all features
    return successResponse(res, 200, geo, {
      provenance: geo.provenance,
      sourceDataset: "bgd_admbnda_adm2_bbs_20201113",
      crs: "EPSG:4326 (WGS 84)",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/gis/layers?district=cumilla
 * Combines boundary polygon, latest SMAP pixel & footprint, latest MODIS pixel,
 * and NASA POWER reference coordinates into unified spatial layer manifest.
 */
export async function getGisLayers(req, res, next) {
  try {
    const districtCode = (req.query.district || "").trim().toLowerCase();
    const mapping = DISTRICT_MAP[districtCode];

    if (!mapping) {
      return errorResponse(
        res,
        400,
        `Unsupported district '${districtCode}'. Supported: ${Object.keys(DISTRICT_MAP).join(", ")}`,
        "INVALID_DISTRICT"
      );
    }

    const geo = loadGeoJson();
    const boundaryFeature = geo.features.find((f) => f.properties.adm2_pcode === mapping.pCode);

    // Fetch latest SMAP observation from MongoDB or snapshot fallback
    let latestSmap = null;
    let latestModis = null;
    let latestGpm = null;
    let latestPower = null;

    if (snapshotService.isDbConnected()) {
      try {
        latestSmap = await findLatestRecommendedSmapObservation(SmapObservation, districtCode);
      } catch {
        latestSmap = null;
      }

      try {
        latestModis = await findLatestGoodModisObservation(ModisObservation, districtCode);
      } catch {
        latestModis = null;
      }

      try {
        latestGpm = await GpmObservation.findOne({ ...gpmFinalDistrictFilter(districtCode), sourceQuality: "valid", precipitationMm: { $type: "number", $gte: 0 } })
          .sort({ dateLabel: -1, intervalStartUtc: -1 }).lean();
        if (latestGpm) {
          const dayDocs = await GpmObservation.find({ ...gpmFinalDistrictFilter(districtCode), dateLabel: latestGpm.dateLabel }).sort({ intervalStartUtc: 1 }).lean();
          latestGpm.dailySummary = summarizeGpmLocalDay(districtCode, latestGpm.dateLabel, dayDocs);
        }
      } catch { latestGpm = null; }

      try {
        const climateDocs = await Promise.all(["PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN", "RH2M"].map((parameter) =>
          NasaObservation.findOne({ datasetKey: "nasa:power:daily:point", districtCode, parameter, quality: "ok" }).sort({ dateLabel: -1 }).lean()
        ));
        latestPower = Object.fromEntries(climateDocs.filter(Boolean).map((doc) => [doc.parameter, { value: doc.value, unit: doc.unit, observationDate: doc.dateLabel, ingestedAt: doc.createdAt, quality: doc.quality, timeStandard: doc.timeStandard }]));
      } catch { latestPower = null; }
    }

    if (!latestSmap) {
      const smapSnap = snapshotService.getSmapSnapshot(districtCode);
      latestSmap = latestRecommendedSmapSnapshot(smapSnap, districtCode);
    }

    if (!latestModis) {
      const modisSnap = snapshotService.getModisSnapshot(districtCode);
      latestModis = latestGoodModisSnapshot(modisSnap, districtCode);
    }

    // Construct Spatial Layers Payload
    const layers = {
      district: mapping,
      boundary: boundaryFeature || null,
      sensors: {
        climate: {
          sensorName: "NASA POWER",
          location: {
            latitude: mapping.refCoord[1],
            longitude: mapping.refCoord[0],
          },
          nativeResolution: "0.5° × 0.625° grid (~50 km)",
          timeStandard: "LST (Local Solar Time)",
          description: "Regional assimilation gridded climate estimates (Precipitation, Temperature, Solar Radiation)",
          observations: latestPower || {},
          limitation: "NASA POWER is historical gridded reanalysis and climate context, not live weather or a farm-scale measurement.",
        },
        precipitation: latestGpm ? {
          sensorName: GPM.product,
          datasetKey: GPM.datasetKey,
          location: { latitude: latestGpm.latitude, longitude: latestGpm.longitude },
          nativeResolution: GPM.spatialResolution,
          temporalResolution: "30-minute source intervals; daily totals use Bangladesh UTC+06:00 days",
          observation: {
            latestInterval: { dateLabel: latestGpm.dateLabel, intervalStartUtc: latestGpm.intervalStartUtc, precipitationMm: latestGpm.precipitationMm, precipitationRateMmHr: latestGpm.precipitationRateMmHr, quality: latestGpm.sourceQuality, ingestedAt: latestGpm.createdAt },
            dailySummary: latestGpm.dailySummary,
          },
          spatialDisclosure: "Regional 0.1° grid point estimate; not a district-wide field measurement. Daily total is null unless all 48 unique intervals are valid.",
        } : null,
        soilMoisture: latestSmap
          ? {
              sensorName: "NASA SMAP (SPL3SMP_E V006)",
              extractedPixelLocation: {
                latitude: latestSmap.latitude,
                longitude: latestSmap.longitude,
              },
              referenceLocation: {
                latitude: latestSmap.targetReferenceLat,
                longitude: latestSmap.targetReferenceLon,
              },
              geodesicDistanceKm: latestSmap.geodesicDistanceKm,
              footprintEnvelopes: {
                gridPostingRadiusMeters: 4500, // Nominal 9 km EASE-Grid 2.0 cell radius
                radiometerFootprintRadiusMeters: 18000, // ~36 km native L-band antenna 3dB footprint radius
              },
              observation: {
                dateLabel: latestSmap.dateLabel,
                orbit: latestSmap.orbit,
                soilMoisture: latestSmap.soilMoisture,
                unit: latestSmap.unit,
                retrievalQualityFlag: latestSmap.retrievalQualityFlag,
                isRecommendedQuality: latestSmap.isRecommendedQuality,
                qualityClassification: latestSmap.qualityClassification,
                surfaceFlag: latestSmap.surfaceFlag,
                surfaceTemperatureK: latestSmap.surfaceTemperatureK,
                clayFraction: latestSmap.clayFraction,
                granuleId: latestSmap.granuleId,
              },
              spatialDisclosure:
                "Nominal 9 km grid posting on EASE-Grid 2.0; actual radiometer native spatial footprint is ~36 km. " +
                "Point observation represents top 5cm volume-averaged soil moisture for this regional cell, NOT individual farm fields.",
            }
          : null,
        vegetation: latestModis && isGoodModisObservation(latestModis, districtCode)
          ? {
              sensorName: "NASA MODIS (MOD13Q1.061)",
              extractedPixelLocation: Number.isFinite(latestModis.latitude) && Number.isFinite(latestModis.longitude)
                ? { latitude: latestModis.latitude, longitude: latestModis.longitude }
                : null,
              footprintEnvelopes: {
                pixelRadiusMeters: 125, // 250m nominal pixel resolution radius (6.25 hectares)
              },
              observation: {
                dateLabel: latestModis.dateLabel,
                compositeDayOfYear: latestModis.compositeDayOfYear,
                ndvi: latestModis.ndvi,
                evi: latestModis.evi,
                pixelReliability: latestModis.pixelReliability,
                isReliableQuality: latestModis.isReliableQuality,
                qualityClassification: latestModis.qualityClassification,
                modisTile: latestModis.metadata?.modisTile || "h26v06",
                sourceGranuleId: latestModis.sourceGranuleId,
              },
              spatialDisclosure:
                "250m sinusoidal grid resolution. Quantifies regional canopy chlorophyll vigor across 6.25 hectares, " +
                "NOT individual farm plots or direct crop yields.",
            }
          : null,
      },
    };

    return successResponse(res, 200, layers, {
      boundaryProvenance: "BBS 2020 Admin-2 / UN OCHA HDX",
      smapProvenance: SMAP.datasetKey,
      modisProvenance: MODIS.datasetKey,
      gpmProvenance: GPM.datasetKey,
      provenance: !snapshotService.isDbConnected() ? "SNAPSHOT" : "HISTORICAL_DATABASE",
      databaseConnected: snapshotService.isDbConnected(),
    });
  } catch (error) {
    next(error);
  }
}
