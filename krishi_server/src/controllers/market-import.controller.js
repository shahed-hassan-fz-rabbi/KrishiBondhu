import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorResponse, successResponse } from "../utils/response.js";
import { MarketPriceObservation } from "../models/marketpriceobservation.model.js";
import { MarketImportDocument } from "../models/marketimportdocument.model.js";
import { MarketPriceSync } from "../models/marketpricesync.model.js";
import { normalizeMarketGrade } from "../config/marketAlert.config.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const pdfExtractor = path.resolve(thisDir, "../../science/extract_market_pdf_text.py");
const auditPath = path.resolve(thisDir, "../../science/data/processed/market_data_audit.json");
const sciencePython = path.resolve(thisDir, "../../science/.venv/Scripts/python.exe");
const publicDamUrl = "https://market.dam.gov.bd/market_daily_price_report/?L=E";
const divisionNames = new Set(["Dhaka", "Chattogram", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Sylhet", "Mymensingh", "National", "Unspecified"]);
const priceTypes = new Set(["producer", "wholesale", "retail"]);
const frequencies = new Set(["daily", "weekly", "monthly"]);
const allowedHosts = new Set(["market.dam.gov.bd", "service.moa.gov.bd", "dam.gov.bd", "www.dam.gov.bd"]);

function isAdmin(req, res, next) {
  if (req.user?.role !== "admin") return errorResponse(res, 403, "Administrator access is required to import official market records.", "ADMIN_REQUIRED");
  return next();
}

function csvRows(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  if (quoted) throw Object.assign(new Error("CSV has an unclosed quoted field."), { status: 400 });
  return rows;
}

function headerKey(value) { return String(value || "").replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function parsePrice(value) {
  const parts = String(value ?? "").replace(/,/g, "").trim().split(/\s*(?:--|–|—|\bto\b)\s*/i);
  const low = Number(parts[0]);
  const high = parts.length > 1 ? Number(parts[1]) : low;
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

export function parsePriceCsv(csvText) {
  const rows = csvRows(csvText);
  if (rows.length < 2) throw Object.assign(new Error("CSV needs a header and at least one price row."), { status: 400 });
  const headers = rows[0].map(headerKey);
  const pick = (values, names) => {
    const index = headers.findIndex((header) => names.includes(header));
    return index < 0 ? "" : String(values[index] ?? "").trim();
  };
  const records = [];
  for (const [rowIndex, values] of rows.slice(1).entries()) {
    const rawPrice = pick(values, ["price", "pricerange", "priceband"]);
    const range = rawPrice ? parsePrice(rawPrice) : null;
    const minRaw = pick(values, ["pricemin", "minimumprice", "lowestprice", "min"]);
    const maxRaw = pick(values, ["pricemax", "maximumprice", "highestprice", "max"]);
    const priceMin = range?.low ?? Number(minRaw);
    const priceMax = range?.high ?? (maxRaw ? Number(maxRaw) : priceMin);
    const priceType = pick(values, ["pricetype", "type"]).toLowerCase();
    const dateText = pick(values, ["date", "observedon", "observationdate", "pricedate"]);
    const record = {
      commodity: pick(values, ["commodity", "crop", "product", "productname", "commodityname"]),
      date: dateText,
      division: pick(values, ["division", "region"]),
      district: pick(values, ["district"]),
      upazila: pick(values, ["upazila", "subdistrict"]),
      market: pick(values, ["market", "marketname", "bazar"]),
      priceType,
      frequency: pick(values, ["frequency", "periodicity"]).toLowerCase() || "daily",
      unit: pick(values, ["unit", "measurement", "priceunit"]),
      grade: normalizeMarketGrade(pick(values, ["grade", "productgrade", "qualitygrade"])),
      priceMin, priceMax,
    };
    const rowDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText) && !Number.isNaN(Date.parse(`${dateText}T00:00:00Z`));
    if (!record.commodity || !rowDate || !divisionNames.has(record.division) || !priceTypes.has(priceType) || !frequencies.has(record.frequency) || !record.unit || !Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin <= 0 || priceMax < priceMin) {
      throw Object.assign(new Error(`Invalid CSV row ${rowIndex + 2}. Required: date, commodity, division, market, priceType, unit, priceMin, priceMax.`), { status: 400 });
    }
    records.push(record);
  }
  return records;
}

function checkedSourceUrl(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { return null; }
  return url.protocol === "https:" && allowedHosts.has(url.hostname.toLowerCase()) ? url.toString() : null;
}

function extractPdf(buffer) {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON || (existsSync(sciencePython) ? sciencePython : "python");
    const child = spawn(python, [pdfExtractor], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => reject(Object.assign(new Error(`Could not start PDF text extraction: ${error.message}`), { status: 503 })));
    child.on("close", (code) => {
      try {
        const result = JSON.parse(stdout);
        if (code !== 0) return reject(Object.assign(new Error(stderr.slice(0, 500) || "PDF text extraction failed."), { status: 422 }));
        if (!result.text?.trim()) return reject(Object.assign(new Error("No selectable text found. Use the CSV import, or transcribe the official printed report into the provided template."), { status: 422 }));
        resolve(result);
      } catch (error) { reject(Object.assign(new Error(error.message || "PDF text extraction failed."), { status: error.status || 422 })); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(buffer);
  });
}

export function requireMarketAdmin(req, res, next) { return isAdmin(req, res, next); }

export async function previewMarketCsv(req, res, next) {
  try {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) return errorResponse(res, 400, "Upload a non-empty CSV file under 12 MiB.", "INVALID_IMPORT_FILE");
    const records = parsePriceCsv(buffer.toString("utf8"));
    if (new Set(records.map((row) => row.frequency)).size > 1) return errorResponse(res, 400, "Import one frequency at a time so daily, weekly, and monthly series stay separate.", "MIXED_IMPORT_FREQUENCIES");
    return successResponse(res, 200, { records, previewCount: records.length, frequency: records[0].frequency, defaultQualityStatus: "review" });
  } catch (error) {
    if (error.status) return errorResponse(res, error.status, error.message, "INVALID_MARKET_CSV");
    return next(error);
  }
}

export async function previewMarketPdf(req, res, next) {
  try {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buffer.length || buffer.length > 12 * 1024 * 1024 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") return errorResponse(res, 400, "Upload a valid PDF report under 12 MiB.", "INVALID_IMPORT_FILE");
    const sourceUrl = checkedSourceUrl(req.get("x-source-url") || publicDamUrl);
    if (!sourceUrl) return errorResponse(res, 400, "PDF source must be an HTTPS DAM or Ministry of Agriculture URL.", "INVALID_MARKET_SOURCE");
    const extracted = await extractPdf(buffer);
    const recognized = /department of agricultural marketing|daily price list report|daily market price/i.test(extracted.text);
    if (!recognized) return errorResponse(res, 422, "PDF text does not look like a DAM daily price report. Check the source document.", "UNRECOGNIZED_DAM_PDF");
    const reportDateMatch = extracted.text.match(/Report\s*Date\s*:\s*(\d{1,2}\s+[A-Za-z]+,?\s+\d{4})/i);
    const reportDate = reportDateMatch ? new Date(reportDateMatch[1]) : null;
    let uploadedName = String(req.get("x-file-name") || "DAM-market-report.pdf");
    try { uploadedName = decodeURIComponent(uploadedName); } catch {}
    const filename = uploadedName.replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 180);
    const document = await MarketImportDocument.create({
      filename, contentType: "application/pdf", sha256: createHash("sha256").update(buffer).digest("hex"),
      fileData: buffer, extractedText: extracted.text.slice(0, 1_000_000), sourceUrl,
      uploadedBy: req.user._id, reportDate: Number.isNaN(reportDate?.getTime()) ? null : reportDate,
    });
    return successResponse(res, 201, {
      documentId: document._id, filename, sha256: document.sha256, pageCount: extracted.pageCount,
      reportDate: document.reportDate, extractedText: extracted.text.slice(0, 60_000),
      workflow: "PDF is stored as source evidence. Confirm the date, market, commodity, unit, and price type in the PDF, then import its rows using the CSV template. Extracted PDF text is not automatically treated as verified prices.",
    });
  } catch (error) {
    if (error.status) return errorResponse(res, error.status, error.message, "DAM_PDF_IMPORT_FAILED");
    return next(error);
  }
}

export async function commitMarketImport(req, res, next) {
  try {
    const records = req.body?.records;
    const source = String(req.body?.source || "DAM official report").trim().slice(0, 160);
    const sourceUrl = checkedSourceUrl(req.body?.sourceUrl || publicDamUrl);
    const sourceDocumentId = req.body?.sourceDocumentId ? String(req.body.sourceDocumentId) : "";
    if (!Array.isArray(records) || !records.length || records.length > 5000) return errorResponse(res, 400, "Provide 1–5,000 reviewed price rows.", "INVALID_IMPORT_ROWS");
    if (!sourceUrl) return errorResponse(res, 400, "Source URL must use the official DAM or Ministry of Agriculture HTTPS domain.", "INVALID_MARKET_SOURCE");
    if (sourceDocumentId) {
      const evidence = await MarketImportDocument.findOne({ _id: sourceDocumentId, uploadedBy: req.user._id }).select("_id").lean();
      if (!evidence) return errorResponse(res, 404, "Uploaded PDF evidence was not found for this administrator.", "IMPORT_EVIDENCE_NOT_FOUND");
    }
    const humanVerified = req.body?.humanVerified === true;
    const cleaned = [];
    for (const [index, item] of records.entries()) {
      const dateText = String(item?.date || "");
      const observedOn = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T00:00:00.000Z`) : null;
      const recordFrequency = String(item?.frequency || "daily").toLowerCase();
      const priceMin = Number(item?.priceMin), priceMax = Number(item?.priceMax);
      const division = String(item?.division || "").trim();
      const market = String(item?.market || "").trim().slice(0, 120);
      const commodity = String(item?.commodity || "").trim().slice(0, 80);
      const priceType = String(item?.priceType || "").toLowerCase();
      const unit = String(item?.unit || "").trim().slice(0, 24);
      if (!commodity || !observedOn || Number.isNaN(observedOn.getTime()) || observedOn.toISOString().slice(0, 10) !== dateText || !divisionNames.has(division) || !priceTypes.has(priceType) || !frequencies.has(recordFrequency) || !unit || !Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin <= 0 || priceMax < priceMin || (humanVerified && (!market || division === "Unspecified" || priceType === "producer"))) {
        return errorResponse(res, 400, `Invalid or incomplete location-level market row ${index + 1}. Verified imports need a named market, date, price type, unit, and price range.`, "INVALID_IMPORT_ROW");
      }
      cleaned.push({
        commodity, commodityKey: commodity.toLocaleLowerCase("en"), division,
        district: String(item?.district || "").trim().slice(0, 60), upazila: String(item?.upazila || "").trim().slice(0, 60), market,
        frequency: recordFrequency, priceType, unit, priceMin, priceMax, observedOn,
        grade: normalizeMarketGrade(item?.grade),
        source, sourceUrl, licence: "Official DAM report; source report retained in import record",
        qualityStatus: humanVerified ? "verified" : "review",
      });
    }
    if (new Set(cleaned.map((row) => row.frequency)).size > 1) return errorResponse(res, 400, "Import one frequency at a time.", "MIXED_IMPORT_FREQUENCIES");
    const operations = cleaned.map((record) => ({ updateOne: {
      filter: {
        commodityKey: record.commodityKey, division: record.division, district: record.district,
        market: record.market, frequency: record.frequency, priceType: record.priceType,
        unit: record.unit, observedOn: record.observedOn, source: record.source,
      },
      update: { $set: record }, upsert: true,
    } }));
    const result = await MarketPriceObservation.bulkWrite(operations, { ordered: false });
    const frequency = cleaned[0].frequency;
    const importedRecords = result.upsertedCount + result.modifiedCount;
    const lastSuccessfulSyncAt = new Date();
    await MarketPriceSync.findOneAndUpdate({ sourceKey: `dam-admin-${frequency}` }, {
      $set: { sourceKey: `dam-admin-${frequency}`, source, sourceUrl, frequency, lastSuccessfulSyncAt, importedRecords: cleaned.length, verifiedRecords: humanVerified ? cleaned.length : 0 },
    }, { upsert: true, new: true });
    if (sourceDocumentId) await MarketImportDocument.updateOne({ _id: sourceDocumentId }, { $set: { recordsImported: cleaned.length } });
    return successResponse(res, 201, {
      submittedRecords: cleaned.length, insertedOrUpdated: importedRecords, qualityStatus: humanVerified ? "verified" : "review",
      frequency, lastSuccessfulSyncAt, sourceDocumentId: sourceDocumentId || null,
      note: humanVerified
        ? "Admin-confirmed source rows are available to current-price and frequency-specific forecast tools, and become eligible for the next automatic market alert cycle."
        : "Rows remain review-only and are excluded from farmer current-price and forecast results until an administrator verifies them.",
    });
  } catch (error) { return next(error); }
}

export async function getVerifiedMarketCatalog(_req, res, next) {
  try {
    const rows = await MarketPriceObservation.aggregate([
      { $match: { qualityStatus: "verified" } },
      { $group: {
        _id: { commodity: "$commodity", commodityKey: "$commodityKey", frequency: "$frequency", priceType: "$priceType", unit: "$unit", division: "$division" },
        records: { $sum: 1 }, firstObservedOn: { $min: "$observedOn" }, lastObservedOn: { $max: "$observedOn" },
        marketSet: { $addToSet: "$market" }, sourceSet: { $addToSet: "$source" },
      } },
      { $sort: { "_id.commodity": 1, "_id.frequency": 1, "_id.division": 1 } },
    ]);
    const catalog = rows.map((row) => ({
      ...row._id, records: row.records, firstObservedOn: row.firstObservedOn,
      lastObservedOn: row.lastObservedOn, markets: row.marketSet.filter(Boolean).sort(),
      sources: row.sourceSet.sort(),
    }));
    return successResponse(res, 200, { series: catalog, cropCount: new Set(catalog.map((row) => row.commodityKey)).size });
  } catch (error) { return next(error); }
}

export async function getMarketSourceCatalog(_req, res, next) {
  try {
    const audit = JSON.parse(await readFile(auditPath, "utf8"));
    const sources = Object.entries(audit.sources || {}).map(([sourceKey, source]) => ({
      sourceKey, source: source.source || sourceKey, sourceUrl: source.sourceUrl || null,
      records: Number(source.normalizedRows || source.rowsOutput || 0),
      cropCount: Number(source.uniqueCrops || 0), crops: source.crops || {},
      frequency: source.frequency || [], priceTypes: source.priceTypes || [], units: source.units || [],
      firstObservedOn: source.dateStart || null, lastObservedOn: source.dateEnd || null,
      locationCount: Number(source.markets || source.districts || 0), qualityStatus: source.qualityStatus || ["review"],
      inclusion: sourceKey === "worldbank_rtfp" ? "monthly_modeled_reference_only" : sourceKey === "agripricebd_daily" ? "historical_daily_dataset_only" : "research_review_only",
    }));
    const cropMap = new Map();
    for (const item of sources) for (const [crop, records] of Object.entries(item.crops)) {
      const key = crop.trim().toLocaleLowerCase("en");
      const existing = cropMap.get(key) || { commodity: crop, recordsBySource: [], frequencies: new Set(), priceTypes: new Set(), firstObservedOn: null, lastObservedOn: null };
      existing.recordsBySource.push({ sourceKey: item.sourceKey, records, status: item.qualityStatus.includes("verified_source_estimate") ? "modeled_reference" : "review" });
      item.frequency.forEach((value) => existing.frequencies.add(value));
      item.priceTypes.forEach((value) => existing.priceTypes.add(value));
      existing.firstObservedOn = !existing.firstObservedOn || (item.firstObservedOn && item.firstObservedOn < existing.firstObservedOn) ? item.firstObservedOn : existing.firstObservedOn;
      existing.lastObservedOn = !existing.lastObservedOn || (item.lastObservedOn && item.lastObservedOn > existing.lastObservedOn) ? item.lastObservedOn : existing.lastObservedOn;
      cropMap.set(key, existing);
    }
    const crops = [...cropMap.values()].map((item) => ({ ...item, frequencies: [...item.frequencies], priceTypes: [...item.priceTypes] })).sort((a, b) => a.commodity.localeCompare(b.commodity));
    return successResponse(res, 200, { cropCount: crops.length, crops, sources, generatedAt: audit.generatedAt || null, note: "Source archive catalog only. Actual market quotes require fresh administrator-verified DAM imports; review-only rows and monthly modeled estimates are never shown as today's price." });
  } catch (error) {
    if (error.code === "ENOENT") return errorResponse(res, 503, "Market archive catalog has not been built on this server yet.", "MARKET_CATALOG_NOT_READY");
    return next(error);
  }
}

export async function getMarketDataStatus(_req, res, next) {
  try {
    const syncs = await MarketPriceSync.find({}).sort({ lastSuccessfulSyncAt: -1 }).select("source sourceUrl frequency lastSuccessfulSyncAt importedRecords verifiedRecords -_id").lean();
    const verifiedCommodities = await MarketPriceObservation.distinct("commodityKey", { qualityStatus: "verified" });
    const latestDaily = await MarketPriceObservation.findOne({ qualityStatus: "verified", frequency: "daily" }).sort({ observedOn: -1 }).select("observedOn source sourceUrl -_id").lean();
    const now = Date.now();
    const syncStatus = syncs.map((sync) => {
      const allowedAgeDays = sync.frequency === "daily" ? 1 : sync.frequency === "weekly" ? 8 : 35;
      const ageDays = (now - new Date(sync.lastSuccessfulSyncAt).getTime()) / 86_400_000;
      return { ...sync, ageDays: Math.floor(ageDays), stale: ageDays > allowedAgeDays };
    });
    const latestDailyAgeDays = latestDaily ? (now - new Date(latestDaily.observedOn).getTime()) / 86_400_000 : null;
    return successResponse(res, 200, {
      verifiedSeriesCount: verifiedCommodities.length,
      lastSuccessfulSyncAt: syncStatus[0]?.lastSuccessfulSyncAt || null,
      syncs: syncStatus,
      latestVerifiedDailyObservation: latestDaily ? {
        observedOn: latestDaily.observedOn,
        source: latestDaily.source,
        sourceUrl: latestDaily.sourceUrl,
        ageDays: Math.floor(latestDailyAgeDays),
        stale: latestDailyAgeDays > 7,
      } : null,
      automaticSync: { enabled: false, reason: "DAM has no documented public price API or export contract; daily reports currently require administrator review and import." },
    });
  } catch (error) { return next(error); }
}
