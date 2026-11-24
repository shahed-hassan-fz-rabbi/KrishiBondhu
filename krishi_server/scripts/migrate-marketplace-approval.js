/**
 * One-time migration: legacy listings had no approvalStatus and were public.
 * Grandfather them as "approved" so existing data does not disappear when the
 * browse filter starts requiring approvalStatus: "approved".
 *
 *   node scripts/migrate-marketplace-approval.js          # dry run (default)
 *   node scripts/migrate-marketplace-approval.js --apply   # write to DB
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const apply = process.argv.includes("--apply");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_TEST_URI;
  if (!uri) throw new Error("MONGODB_URI is required.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const collection = mongoose.connection.db.collection("marketplaceproducts");
  const filter = { approvalStatus: { $exists: false } };
  const count = await collection.countDocuments(filter);
  console.log(`database: ${mongoose.connection.name}`);
  console.log(`legacy listings without approvalStatus: ${count}`);
  if (apply && count) {
    const result = await collection.updateMany(filter, { $set: { approvalStatus: "approved" } });
    console.log(`updated: ${result.modifiedCount}`);
  } else {
    console.log(apply ? "nothing to update" : "dry run — pass --apply to write");
  }
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("migration failed:", error.message);
  process.exit(1);
});
