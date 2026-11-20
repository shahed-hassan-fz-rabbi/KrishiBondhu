import mongoose from "mongoose";
import { MarketPriceAlert } from "../models/marketpricealert.model.js";
import { sendMarketPriceAlertSms } from "../services/sms.service.js";
import { getBangladeshDateKey } from "../utils/bangladesh-date.js";
import { errorResponse, successResponse } from "../utils/response.js";
import { MarketPriceObservation } from "../models/marketpriceobservation.model.js";
import { executePythonMarketForecast } from "../services/market/forecast.service.js";

function normalizeKey(value) { return value.trim().toLocaleLowerCase("en"); }
function exactName(value) { return new RegExp(`^${value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`, "i"); }
const MARKET_DIVISIONS = ["Dhaka", "Chattogram", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Sylhet", "Mymensingh", "National"];
const MARKET_FREQUENCIES = ["daily", "weekly", "monthly"];

export async function getMarketPriceHistory(req, res, next) {
  try {
    const commodity = typeof req.query.commodity === "string" ? req.query.commodity.trim().slice(0, 80) : "";
    const division = typeof req.query.division === "string" ? req.query.division.trim().slice(0, 40) : "";
    const priceType = req.query.priceType || "wholesale";
    const frequency = String(req.query.frequency || "daily").toLowerCase();
    const market = typeof req.query.market === "string" ? req.query.market.trim().slice(0, 120) : "";
    const district = typeof req.query.district === "string" ? req.query.district.trim().slice(0, 60) : "";
    const upazila = typeof req.query.upazila === "string" ? req.query.upazila.trim().slice(0, 60) : "";
    const unit = typeof req.query.unit === "string" ? req.query.unit.trim().slice(0, 24) : "";
    const source = typeof req.query.source === "string" ? req.query.source.trim().slice(0, 160) : "";
    if (!commodity || !["producer", "wholesale", "retail"].includes(priceType) || !MARKET_FREQUENCIES.includes(frequency) || (division && !MARKET_DIVISIONS.includes(division))) return errorResponse(res, 400, "Choose a commodity, frequency, Bangladesh division, and valid price type", "INVALID_MARKET_QUERY");
    const query = { commodityKey: normalizeKey(commodity), priceType, frequency, qualityStatus: "verified" };
    if (division) query.division = division;
    else query.division = { $ne: "National" };
    if (market) query.market = exactName(market);
    if (district) query.district = exactName(district);
    if (upazila) query.upazila = exactName(upazila);
    if (unit) query.unit = unit;
    if (source) query.source = source;
    const observations = await MarketPriceObservation.find(query).sort({ observedOn: 1 }).limit(5000).select("commodity division district upazila market frequency priceType unit priceMin priceMax observedOn source sourceUrl licence -_id").lean();
    return successResponse(res, 200, { observations, count: observations.length, frequency });
  } catch (error) { next(error); }
}

export async function getMarketPriceForecast(req, res, next) {
  try {
    const commodity = typeof req.query.commodity === "string" ? req.query.commodity.trim().slice(0, 80) : "";
    const division = typeof req.query.division === "string" ? req.query.division.trim().slice(0, 40) : "";
    const priceType = req.query.priceType || "wholesale";
    const frequency = String(req.query.frequency || "daily").toLowerCase();
    const horizonDays = Number(req.query.horizonDays || 30);
    const market = typeof req.query.market === "string" ? req.query.market.trim().slice(0, 120) : "";
    const district = typeof req.query.district === "string" ? req.query.district.trim().slice(0, 60) : "";
    const upazila = typeof req.query.upazila === "string" ? req.query.upazila.trim().slice(0, 60) : "";
    const unit = typeof req.query.unit === "string" ? req.query.unit.trim().slice(0, 24) : "";
    const source = typeof req.query.source === "string" ? req.query.source.trim().slice(0, 160) : "";
    const maxHorizonDays = frequency === "daily" ? 30 : frequency === "weekly" ? 28 : 30;
    if (!commodity || !["producer", "wholesale", "retail"].includes(priceType) || !MARKET_FREQUENCIES.includes(frequency) || (division && !MARKET_DIVISIONS.includes(division)) || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > maxHorizonDays) return errorResponse(res, 400, "Choose a commodity, frequency, Bangladesh division, valid price type, and supported forecast range", "INVALID_MARKET_QUERY");
    const query = { commodityKey: normalizeKey(commodity), priceType, frequency, qualityStatus: "verified" };
    if (division) query.division = division;
    else query.division = { $ne: "National" };
    if (market) query.market = exactName(market);
    if (district) query.district = exactName(district);
    if (upazila) query.upazila = exactName(upazila);
    if (unit) query.unit = unit;
    if (source) query.source = source;
    const observations = await MarketPriceObservation.find(query).sort({ observedOn: 1 }).limit(5000).select("commodity division district upazila market frequency priceType observedOn priceMin priceMax unit source sourceUrl licence -_id").lean();
    if (!observations.length) return errorResponse(res, 404, "No verified price history is loaded for this commodity, division, and price type yet", "MARKET_HISTORY_UNAVAILABLE");
    const locations = [...new Set(observations.map((item) => JSON.stringify([item.division, item.district || "", item.upazila || "", item.market || ""])))].map((key) => JSON.parse(key));
    if (locations.length > 1) return errorResponse(res, 409, "Choose one exact market location before forecasting; observations from different locations are not combined.", "MARKET_LOCATION_AMBIGUOUS", { locations: locations.map(([itemDivision, itemDistrict, itemUpazila, itemMarket]) => ({ division: itemDivision, district: itemDistrict, upazila: itemUpazila, market: itemMarket })) });
    const sources = [...new Set(observations.map((item) => item.source))];
    if (sources.length > 1) return errorResponse(res, 409, "Choose one source before forecasting; separate source histories are not combined.", "MARKET_SOURCE_AMBIGUOUS", { sources });
    const units = [...new Set(observations.map((item) => item.unit))];
    if (units.length > 1) return errorResponse(res, 409, "Choose a measurement unit before forecasting; incompatible units are not combined.", "MARKET_UNIT_AMBIGUOUS", { units });
    const freshnessDays = frequency === "daily" ? 7 : frequency === "weekly" ? 35 : 100;
    const latestObservedOn = observations[observations.length - 1].observedOn;
    const ageDays = (Date.now() - new Date(latestObservedOn).getTime()) / 86_400_000;
    if (ageDays > freshnessDays) return errorResponse(res, 409, `Latest verified ${frequency} observation is stale (${new Date(latestObservedOn).toISOString().slice(0, 10)}); a forecast is withheld until fresh source data is imported.`, "STALE_MARKET_HISTORY");
    const modelUnit = observations[observations.length - 1].unit;
    const result = await executePythonMarketForecast({
      observations: observations.map((item) => ({ date: new Date(item.observedOn).toISOString().slice(0, 10), priceMin: item.priceMin, priceMax: item.priceMax })),
      horizonDays, priceType, unit: modelUnit, source: observations[0].source,
      frequency, market: market || undefined, district: district || undefined, upazila: upazila || undefined,
    });
    if (!result.success) return errorResponse(res, 422, result.message, result.error.toUpperCase());
    return successResponse(res, 200, { ...result, commodity: observations[0].commodity, division: division || observations[0].division, market: market || observations[0].market || null, district: district || observations[0].district || null, upazila: upazila || observations[0].upazila || null, frequency, sourceUrl: observations[0].sourceUrl, licence: observations[0].licence });
  } catch (error) { next(error); }
}

export async function compareMarketMargins(req, res, next) {
  try {
    const crops = req.body?.crops;
    const division = typeof req.body?.division === "string" ? req.body.division.trim() : "";
    const priceType = req.body?.priceType || "wholesale";
    const horizonDays = Number(req.body?.horizonDays || 30);
    if (!Array.isArray(crops) || crops.length < 2 || crops.length > 8 || !["producer", "wholesale"].includes(priceType) || (division && !MARKET_DIVISIONS.includes(division)) || !Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 90) return errorResponse(res, 400, "Send 2–8 crops, verified cost/yield inputs, a valid Bangladesh division, and a 1–90 day horizon", "INVALID_MARGIN_COMPARISON");
    const calculations = await Promise.all(crops.map(async (crop) => {
      const commodity = typeof crop?.commodity === "string" ? crop.commodity.trim().slice(0, 80) : "";
      const totalCostBdt = Number(crop?.totalCostBdt);
      const expectedYieldKg = Number(crop?.expectedYieldKg);
      if (!commodity || !Number.isFinite(totalCostBdt) || totalCostBdt < 0 || totalCostBdt > 100000000 || !Number.isFinite(expectedYieldKg) || expectedYieldKg <= 0 || expectedYieldKg > 1000000) return { commodity: commodity || "Unknown", success: false, error: "Enter this crop's total cost and expected harvest in kilograms." };
      const query = { commodityKey: normalizeKey(commodity), priceType, qualityStatus: "verified" };
      if (division) query.division = division;
      else query.division = { $ne: "National" };
      const records = await MarketPriceObservation.find(query).sort({ observedOn: 1 }).limit(5000).select("observedOn priceMin priceMax unit source sourceUrl -_id").lean();
      if (!records.length) return { commodity, success: false, error: "No verified price history is loaded for this crop and selected location." };
      const latest = records[records.length - 1];
      const latestAgeDays = (Date.now() - new Date(latest.observedOn).getTime()) / 86_400_000;
      if (latestAgeDays > 7) return { commodity, success: false, error: "Latest verified observation is stale. Import a current official report before estimating a sale window." };
      const locations = new Set(records.map((item) => JSON.stringify([item.division, item.district || "", item.upazila || "", item.market || ""])));
      const sources = new Set(records.map((item) => item.source));
      if (locations.size !== 1 || sources.size !== 1) return { commodity, success: false, error: "Choose one exact market location and source; this comparison will not combine separate price series." };
      const unit = records[records.length - 1].unit;
      if (unit !== "BDT/kg" || records.some((item) => item.unit !== unit)) return { commodity, success: false, error: "Margin comparison currently requires consistently normalized BDT/kg observations." };
      if (records.some((item) => item.priceMin <= 0 || item.priceMax < item.priceMin)) return { commodity, success: false, error: "The imported price history contains invalid ranges and cannot be used for a margin estimate." };
      const outlook = await executePythonMarketForecast({ observations: records.map((item) => ({ date: new Date(item.observedOn).toISOString().slice(0, 10), priceMin: item.priceMin, priceMax: item.priceMax })), horizonDays, priceType, unit, source: records[0].source });
      if (!outlook.success) return { commodity, success: false, error: outlook.message };
      const forecast = outlook.data.forecast;
      const mean = (key) => forecast.reduce((sum, point) => sum + point[key], 0) / forecast.length;
      const expectedPrice = mean("price");
      const lowerPrice = mean("lower90");
      const upperPrice = mean("upper90");
      return {
        commodity, success: true, totalCostBdt, expectedYieldKg, unit,
        estimatedRevenueBdt: Math.round(expectedPrice * expectedYieldKg),
        estimatedNetBdt: Math.round(expectedPrice * expectedYieldKg - totalCostBdt),
        estimatedNetRangeBdt: { lower: Math.round(lowerPrice * expectedYieldKg - totalCostBdt), upper: Math.round(upperPrice * expectedYieldKg - totalCostBdt) },
        averageForecastPrice: Number(expectedPrice.toFixed(2)),
        historyStart: outlook.meta.historyStart, historyEnd: outlook.meta.historyEnd,
        backtestMae: outlook.meta.backtest.mae, sourceUrl: records[0].sourceUrl,
      };
    }));
    const ranked = calculations.filter((item) => item.success).sort((a, b) => b.estimatedNetBdt - a.estimatedNetBdt);
    return successResponse(res, 200, { results: calculations, ranked: ranked.map((item, index) => ({ ...item, rank: index + 1 })), division: division || "National / all-division reference", priceType, horizonDays, limitations: "Planning comparison from the farmer's own cost and expected yield plus observed DAM price history. It does not include unentered losses, grade discounts, changing costs, or shocks; it is not a profit guarantee." });
  } catch (error) { next(error); }
}

export async function listPriceAlerts(req, res, next) {
  try {
    const alerts = await MarketPriceAlert.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    return successResponse(res, 200, { alerts });
  } catch (error) { next(error); }
}

export async function createPriceAlert(req, res, next) {
  try {
    const commodity = typeof req.body?.commodity === "string" ? req.body.commodity.trim().slice(0, 80) : "";
    const market = typeof req.body?.market === "string" ? req.body.market.trim().slice(0, 120) : "";
    const priceType = req.body?.priceType || "retail";
    const unit = req.body?.unit;
    const targetPrice = Number(req.body?.targetPrice);
    if (!commodity || !Number.isFinite(targetPrice) || targetPrice <= 0 || targetPrice > 10000000 || !["producer", "wholesale", "retail"].includes(priceType) || !["kg", "maund"].includes(unit)) {
      return errorResponse(res, 400, "Enter a commodity, valid price type, target price, and kg or maund unit", "INVALID_PRICE_ALERT");
    }
    if (await MarketPriceAlert.countDocuments({ userId: req.user._id }) >= 20) {
      return errorResponse(res, 400, "You can keep up to 20 active price alerts", "PRICE_ALERT_LIMIT");
    }
    const alert = await MarketPriceAlert.create({ userId: req.user._id, commodity, market, priceType, unit, targetPrice });
    return successResponse(res, 201, { alert }, { message: "Price alert created" });
  } catch (error) { next(error); }
}

export async function recordMarketQuote(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, "Invalid alert ID", "INVALID_ID");
    const observedPrice = Number(req.body?.observedPrice);
    const observedOn = typeof req.body?.observedOn === "string" ? req.body.observedOn : "";
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(observedOn) ? new Date(`${observedOn}T00:00:00.000Z`) : null;
    const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === observedOn && observedOn <= getBangladeshDateKey();
    if (!Number.isFinite(observedPrice) || observedPrice <= 0 || observedPrice > 10000000 || !validDate) {
      return errorResponse(res, 400, "Enter the DAM quote and its report date", "INVALID_MARKET_QUOTE");
    }
    const alert = await MarketPriceAlert.findOne({ _id: req.params.id, userId: req.user._id });
    if (!alert) return errorResponse(res, 404, "Price alert not found", "NOT_FOUND");
    if (alert.lastObservedOn && observedOn < alert.lastObservedOn) {
      return errorResponse(res, 409, "This report date is older than your latest saved quote", "STALE_MARKET_QUOTE");
    }
    const previousPrice = alert.lastObservedPrice;
    const crossed = observedPrice >= alert.targetPrice && (previousPrice === null || previousPrice < alert.targetPrice);
    alert.lastObservedPrice = observedPrice;
    alert.lastObservedOn = observedOn;
    if (crossed) {
      alert.lastTriggeredAt = new Date();
      alert.lastTriggeredPrice = observedPrice;
    }
    await alert.save();
    let smsDelivery = "off";
    if (crossed && req.user.smsAlertsEnabled && req.user.phone) {
      const smsResult = await sendMarketPriceAlertSms(req.user, alert);
      smsDelivery = smsResult.sent ? "sent" : "failed";
    }
    return successResponse(res, 200, { alert, crossed, smsDelivery }, { message: crossed ? "Your target price was reached" : "Latest quote saved" });
  } catch (error) { next(error); }
}

export async function deletePriceAlert(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 400, "Invalid alert ID", "INVALID_ID");
    const result = await MarketPriceAlert.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (!result.deletedCount) return errorResponse(res, 404, "Price alert not found", "NOT_FOUND");
    return successResponse(res, 200, { deleted: true });
  } catch (error) { next(error); }
}
