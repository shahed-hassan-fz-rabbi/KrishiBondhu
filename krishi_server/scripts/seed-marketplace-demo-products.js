import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { MarketplaceProduct } from "../src/models/marketplaceproduct.model.js";
import { User } from "../src/models/user.model.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const SAFE_DB_NAME = /^kb_(?:dev|test)_[a-z0-9][a-z0-9_-]*$/i;
const TEST_DB_NAME = /^kb_test_[a-z0-9][a-z0-9_-]*$/i;
const DEMO_DESCRIPTION = "DEMO / SAMPLE DATA only. Fictional listing and fictional BDT asking price for UI testing; not an authentic Bangladesh market price.";

export const MARKETPLACE_DEMO_PRODUCTS = Object.freeze([
  { id: "d3e000000000000000000001", crop: "Potato", quantity: 500, unit: "kg", price: 32, district: "Cumilla", upazila: "Burichang" },
  { id: "d3e000000000000000000002", crop: "Eggplant", quantity: 180, unit: "kg", price: 41, district: "Chattogram", upazila: "Hathazari" },
  { id: "d3e000000000000000000003", crop: "Tomato", quantity: 250, unit: "kg", price: 47.5, district: "Cumilla", upazila: "Debidwar" },
  { id: "d3e000000000000000000004", crop: "Green chilli", quantity: 75, unit: "kg", price: 86, district: "Chattogram", upazila: "Patiya" },
  { id: "d3e000000000000000000005", crop: "Onion", quantity: 1.5, unit: "ton", price: 28500, district: "Cumilla", upazila: "Daudkandi" },
  { id: "d3e000000000000000000006", crop: "Cucumber", quantity: 220, unit: "kg", price: 29, district: "Chattogram", upazila: "Raozan" },
  { id: "d3e000000000000000000007", crop: "Rice", quantity: 8, unit: "quintal", price: 3150, district: "Cumilla", upazila: "Muradnagar" },
  { id: "d3e000000000000000000008", crop: "Pumpkin", quantity: 350, unit: "kg", price: 24, district: "Chattogram", upazila: "Fatikchhari" },
  { id: "d3e000000000000000000009", crop: "Okra", quantity: 90, unit: "kg", price: 38, district: "Cumilla", upazila: "Laksam" },
  { id: "d3e000000000000000000010", crop: "Carrot", quantity: 140, unit: "kg", price: 44, district: "Chattogram", upazila: "Sitakunda" },
].map(Object.freeze));

function databaseTargetFromUri(uri) {
  if (typeof uri !== "string" || !/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error("MONGODB_TEST_URI must be an explicit MongoDB test/development URI.");
  }
  try {
    const parsed = new URL(uri.replace(/^mongodb(?:\+srv)?:\/\//i, "https://"));
    return {
      databaseName: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      hostname: parsed.hostname.toLowerCase(),
    };
  } catch {
    throw new Error("MONGODB_TEST_URI is not a valid MongoDB URI.");
  }
}

export function resolveMarketplaceDemoSeedConfig(environment, args = []) {
  const nodeEnv = String(environment.NODE_ENV || "").toLowerCase();
  if (!["development", "test"].includes(nodeEnv)) throw new Error("Marketplace demo seeding is allowed only in development or test environments.");
  if (String(environment.RENDER || "").toLowerCase() === "true" || environment.RENDER_EXTERNAL_URL || environment.VERCEL) {
    throw new Error("Marketplace demo seeding is disabled on hosted deployments.");
  }
  if (args.some((argument) => argument !== "--apply")) throw new Error("Only the optional --apply flag is supported.");

  const mongoUri = environment.MONGODB_TEST_URI;
  if (!mongoUri) throw new Error("Set MONGODB_TEST_URI to a dedicated non-production database; MONGODB_URI fallback is not allowed.");
  const target = databaseTargetFromUri(mongoUri);
  if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
    throw new Error("Marketplace demo seeding is restricted to a local MongoDB instance; remote databases are not accepted.");
  }
  const uriDbName = target.databaseName;
  const databaseName = String(environment.MARKETPLACE_DEMO_DB_NAME || "").trim();
  if (!databaseName || databaseName !== uriDbName || !SAFE_DB_NAME.test(databaseName)) {
    throw new Error("MARKETPLACE_DEMO_DB_NAME must explicitly match a kb_dev_* or kb_test_* database in MONGODB_TEST_URI.");
  }
  if (nodeEnv === "test" && !TEST_DB_NAME.test(databaseName)) {
    throw new Error("NODE_ENV=test may seed only a kb_test_* database.");
  }

  const farmerId = String(environment.MARKETPLACE_DEMO_FARMER_ID || "").trim();
  if (!mongoose.isObjectIdOrHexString(farmerId)) {
    throw new Error("Set MARKETPLACE_DEMO_FARMER_ID to the existing demo farmer's MongoDB ObjectId.");
  }

  return { apply: args.includes("--apply"), databaseName, farmerId, mongoUri };
}

export function assertDemoFarmer(user) {
  if (!user || user.role !== "farmer") {
    throw new Error("Configured demo account was not found as a farmer; no listings were written.");
  }
  return user._id;
}

export function buildMarketplaceDemoDocuments(ownerId) {
  if (!mongoose.isObjectIdOrHexString(ownerId)) throw new Error("A valid farmer ObjectId is required.");
  const resolvedOwnerId = new mongoose.Types.ObjectId(ownerId);
  return MARKETPLACE_DEMO_PRODUCTS.map((sample) => ({
    _id: new mongoose.Types.ObjectId(sample.id),
    ownerId: resolvedOwnerId,
    productName: `[DEMO / SAMPLE] ${sample.crop}`,
    description: DEMO_DESCRIPTION,
    quantity: sample.quantity,
    unit: sample.unit,
    askingPricePerUnit: sample.price,
    district: sample.district,
    upazila: sample.upazila,
    status: "active",
  }));
}

export async function seedMarketplaceDemoProducts({ productModel, ownerId, apply = false }) {
  if (!productModel?.find || !productModel?.bulkWrite) throw new Error("A MarketplaceProduct model is required.");
  const documents = buildMarketplaceDemoDocuments(ownerId);
  const ids = documents.map((document) => document._id);
  const existing = await productModel.find({ _id: { $in: ids } }).select("_id ownerId").lean();
  const ownerIdText = String(ownerId);
  const conflicting = existing.find((item) => String(item.ownerId) !== ownerIdText);
  if (conflicting) throw new Error("A stable demo listing ID is already owned by another account; refusing to modify or replace it.");

  const existingIds = new Set(existing.map((item) => String(item._id)));
  const wouldInsert = documents.length - existingIds.size;
  if (!apply) return { mode: "dry-run", total: documents.length, existing: existingIds.size, wouldInsert, inserted: 0 };

  const operations = documents.map((document) => ({
    updateOne: {
      filter: { _id: document._id, ownerId: document.ownerId },
      update: { $setOnInsert: document },
      upsert: true,
    },
  }));
  const result = await productModel.bulkWrite(operations, { ordered: true });
  return { mode: "apply", total: documents.length, existing: existingIds.size, wouldInsert, inserted: result.upsertedCount || 0 };
}

async function main() {
  dotenv.config({ path: path.resolve(scriptDir, "../.env") });
  const config = resolveMarketplaceDemoSeedConfig(process.env, process.argv.slice(2));
  process.env.MONGODB_TEST_URI = config.mongoUri;
  await connectDatabase({ databaseName: config.databaseName, required: true });
  if (mongoose.connection.name !== config.databaseName) {
    throw new Error("Connected database identity does not match the explicitly approved demo database.");
  }

  const farmer = await User.findById(config.farmerId).select("_id role").lean();
  const ownerId = assertDemoFarmer(farmer);
  const result = await seedMarketplaceDemoProducts({ productModel: MarketplaceProduct, ownerId, apply: config.apply });
  if (result.mode === "dry-run") {
    console.log(`[marketplace-demo-seed] DRY RUN: ${result.total} fictional demo listings prepared; ${result.wouldInsert} would be inserted, ${result.existing} stable IDs already exist. No database writes performed. Add --apply to insert.`);
  } else {
    console.log(`[marketplace-demo-seed] Applied ${result.inserted} fictional demo listings; ${result.existing} stable IDs were already present. Existing listings were not overwritten.`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[marketplace-demo-seed] ${error.message}`);
    process.exitCode = 1;
  }).finally(disconnectDatabase);
}
