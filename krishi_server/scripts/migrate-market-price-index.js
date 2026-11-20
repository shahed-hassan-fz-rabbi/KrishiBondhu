import "../src/config/env.config.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { MarketPriceObservation } from "../src/models/marketpriceobservation.model.js";

async function main() {
  await connectDatabase({ required: true });
  const collection = MarketPriceObservation.collection;
  const indexes = await collection.indexes();
  const key = { commodityKey: 1, division: 1, district: 1, upazila: 1, market: 1, frequency: 1, priceType: 1, unit: 1, observedOn: 1, source: 1 };
  const current = indexes.find((index) => index.name === "market_observation_location_frequency_source_unique");
  const needsLocationMigration = current && JSON.stringify(Object.entries(current.key)) !== JSON.stringify(Object.entries(key));
  if (needsLocationMigration) {
    // The previous index omitted upazila, so replace it to preserve subdistrict-level quotes.
    await collection.dropIndex(current.name);
    console.log(`[market-index] replaced market uniqueness index ${current.name} with upazila-aware key`);
  }
  if (!current || needsLocationMigration) await collection.createIndex(key, { unique: true, name: "market_observation_location_frequency_source_unique" });
  for (const index of indexes) {
    if (!index.unique || !index.key?.commodityKey || !index.key?.observedOn || !index.key?.source) continue;
    if (index.name === "market_observation_location_frequency_source_unique") continue;
    if (index.key.market || index.key.district || index.key.frequency) continue;
    await collection.dropIndex(index.name);
    console.log(`[market-index] replaced legacy unique index ${index.name}`);
  }
  console.log("[market-index] location and frequency aware uniqueness is ready");
}

main().catch((error) => { console.error(`[market-index] ${error.message}`); process.exitCode = 1; }).finally(disconnectDatabase);
