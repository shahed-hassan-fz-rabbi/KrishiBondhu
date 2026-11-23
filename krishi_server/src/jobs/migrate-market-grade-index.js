import "../config/env.config.js";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { MarketPriceObservation } from "../models/marketpriceobservation.model.js";

/**
 * Migration for the market observation uniqueness rule (Part: market SMS automation).
 * The legacy unique index omitted `grade`, so two grades of the same crop,
 * market, source and date could not coexist. The replacement includes grade.
 *
 * Safe by default: without --apply this only reports what would happen.
 * No documents are modified or deleted, and conflicting data is reported
 * before any index change.
 */

export const LEGACY_INDEX_NAME = "market_observation_location_frequency_source_unique";
export const GRADE_INDEX_NAME = "market_observation_location_frequency_source_grade_unique";
export const GRADE_INDEX_KEYS = Object.freeze({
  commodityKey: 1,
  division: 1,
  district: 1,
  upazila: 1,
  market: 1,
  frequency: 1,
  priceType: 1,
  unit: 1,
  observedOn: 1,
  source: 1,
  grade: 1,
});

export async function findGradeIndexConflicts(model = MarketPriceObservation) {
  return model.aggregate([
    {
      $group: {
        _id: {
          commodityKey: "$commodityKey", division: "$division", district: "$district",
          upazila: "$upazila", market: "$market", frequency: "$frequency",
          priceType: "$priceType", unit: "$unit", observedOn: "$observedOn",
          source: "$source", grade: "$grade",
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]);
}

export async function migrateMarketObservationGradeIndex({
  model = MarketPriceObservation,
  apply = false,
} = {}) {
  await model.init();

  const indexes = await model.collection.indexes();
  const legacy = indexes.find((item) => item.name === LEGACY_INDEX_NAME);
  const current = indexes.find((item) => item.name === GRADE_INDEX_NAME);
  const report = {
    legacyFound: Boolean(legacy),
    gradeIndexFound: Boolean(current),
    gradeIndexCorrect: Boolean(current && Object.keys(current.key || {}).includes("grade")),
    droppedLegacy: false,
    createdGradeIndex: false,
    conflicts: 0,
    applied: apply,
  };

  const conflicts = await findGradeIndexConflicts(model);
  report.conflicts = conflicts.length;
  if (conflicts.length) {
    throw new Error(
      `Cannot migrate market grade index: ${conflicts.length} duplicate observation group(s) exist under the new key. Resolve data first.`
    );
  }

  if (report.gradeIndexCorrect && !legacy) return report;
  if (!apply) return report;

  if (legacy) {
    await model.collection.dropIndex(LEGACY_INDEX_NAME);
    report.droppedLegacy = true;
  }
  if (current && !report.gradeIndexCorrect) {
    await model.collection.dropIndex(GRADE_INDEX_NAME);
  }
  await model.collection.createIndex(GRADE_INDEX_KEYS, {
    unique: true,
    name: GRADE_INDEX_NAME,
  });
  report.createdGradeIndex = true;
  return report;
}

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDatabase({ required: true });
  try {
    const report = await migrateMarketObservationGradeIndex({ apply });
    console.log("[market-grade-index]", JSON.stringify(report));
    if (!apply) console.log("[market-grade-index] dry run only; pass --apply to modify indexes");
  } finally {
    await disconnectDatabase();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`[market-grade-index] ${error.message}`);
    process.exitCode = 1;
  });
}
