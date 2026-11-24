/**
 * GIS and Geospatial Routes.
 * Mounted at /api/v1/gis.
 */

import { Router } from "express";
import {
  getGisBoundaries,
  getGisDistricts,
  getGisLayers,
  getGisUpazilas,
} from "../../controllers/gis.controller.js";

const router = Router();

router.get("/districts", getGisDistricts);
router.get("/boundaries", getGisBoundaries);
router.get("/layers", getGisLayers);
router.get("/upazilas", getGisUpazilas);

export default router;
