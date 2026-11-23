import "../config/env.config.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { MarketPriceObservation } from "../models/marketpriceobservation.model.js";
import { normalizeMarketGrade } from "../config/marketAlert.config.js";

const allowedDivisions = new Set(["Dhaka", "Chattogram", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Sylhet", "Mymensingh", "National"]);
const allowedTypes = new Set(["producer", "wholesale", "retail"]);
const allowedHosts = new Set(["dam.gov.bd", "www.dam.gov.bd", "market.dam.gov.bd", "data.mendeley.com", "objectstorage.ap-dcc-gazipur-1.oraclecloud15.com"]);

function cleanRow(row, index) {
  const commodity = typeof row?.commodity === "string" ? row.commodity.trim().slice(0, 80) : "";
  const division = typeof row?.division === "string" ? row.division.trim() : "";
  const priceType = row?.priceType;
  const unit = typeof row?.unit === "string" ? row.unit.trim().slice(0, 24) : "";
  const source = typeof row?.source === "string" ? row.source.trim().slice(0, 160) : "";
  const sourceUrl = typeof row?.sourceUrl === "string" ? row.sourceUrl.trim() : "";
  const dateText = typeof row?.date === "string" ? row.date : "";
  const observedOn = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T00:00:00.000Z`) : null;
  const priceMin = Number(row?.priceMin);
  const priceMax = Number(row?.priceMax);
  let sourceHost = "";
  try { sourceHost = new URL(sourceUrl).hostname.toLowerCase(); } catch {}
  if (!commodity || !allowedDivisions.has(division) || !allowedTypes.has(priceType) || !unit || !source || !allowedHosts.has(sourceHost) || !observedOn || Number.isNaN(observedOn.getTime()) || observedOn.toISOString().slice(0, 10) !== dateText || !Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin <= 0 || priceMax < priceMin) {
    throw new Error(`Invalid market record at row ${index + 1}; see the market data format in science/README.md.`);
  }
  return {
    commodity, commodityKey: commodity.toLocaleLowerCase("en"), division,
    district: typeof row.district === "string" ? row.district.trim().slice(0, 60) : "",
    market: typeof row.market === "string" ? row.market.trim().slice(0, 120) : "",
    priceType, unit, priceMin, priceMax, observedOn, source, sourceUrl,
    grade: normalizeMarketGrade(row?.grade),
    licence: typeof row.licence === "string" ? row.licence.trim().slice(0, 120) : "",
    qualityStatus: row.qualityStatus === "verified" ? "verified" : "review",
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: npm run import:market-prices -- <normalized-json-file>");
  const absolutePath = path.resolve(process.cwd(), inputPath);
  const document = JSON.parse(await fs.readFile(absolutePath, "utf8"));
  const rows = Array.isArray(document) ? document : document?.observations;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Input must be a non-empty JSON array or { observations: [...] }.");
  const records = rows.map(cleanRow);
  await connectDatabase({ required: true });
  const operations = records.map((record) => ({
    updateOne: {
      filter: { commodityKey: record.commodityKey, division: record.division, priceType: record.priceType, unit: record.unit, observedOn: record.observedOn, source: record.source },
      update: { $set: record }, upsert: true,
    },
  }));
  let changed = 0;
  for (let start = 0; start < operations.length; start += 500) {
    const result = await MarketPriceObservation.bulkWrite(operations.slice(start, start + 500), { ordered: false });
    changed += result.upsertedCount + result.modifiedCount;
  }
  console.log(`[market-import] records=${records.length} insertedOrUpdated=${changed} defaultQuality=review`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => { console.error(`[market-import] ${error.message}`); process.exitCode = 1; }).finally(disconnectDatabase);
}
