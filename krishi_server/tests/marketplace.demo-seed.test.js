import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { MarketplaceProduct } from "../src/models/marketplaceproduct.model.js";
import {
  assertDemoFarmer,
  buildMarketplaceDemoDocuments,
  MARKETPLACE_DEMO_PRODUCTS,
  resolveMarketplaceDemoSeedConfig,
  seedMarketplaceDemoProducts,
} from "../scripts/seed-marketplace-demo-products.js";

const farmerId = new mongoose.Types.ObjectId("64b000000000000000000001");
const validEnvironment = {
  NODE_ENV: "development",
  MONGODB_TEST_URI: "mongodb://127.0.0.1:27017/kb_dev_marketplace",
  MARKETPLACE_DEMO_DB_NAME: "kb_dev_marketplace",
  MARKETPLACE_DEMO_FARMER_ID: farmerId.toString(),
};

test("demo listings pass MarketplaceProduct schema validation and label fictional prices", () => {
  assert.equal(MARKETPLACE_DEMO_PRODUCTS.length, 10);
  for (const crop of ["Potato", "Eggplant", "Tomato", "Green chilli", "Onion", "Cucumber", "Rice", "Pumpkin"]) {
    assert.ok(MARKETPLACE_DEMO_PRODUCTS.some((item) => item.crop === crop));
  }
  for (const document of buildMarketplaceDemoDocuments(farmerId)) {
    const model = new MarketplaceProduct(document);
    assert.equal(model.validateSync(), undefined);
    assert.match(model.productName, /DEMO \/ SAMPLE/);
    assert.match(model.description, /fictional.*not an authentic Bangladesh market price/i);
  }
});

test("dry-run reads stable IDs and performs no database writes", async () => {
  let bulkWriteCalls = 0;
  const fakeModel = {
    find(filter) {
      assert.equal(filter._id.$in.length, 10);
      return { select(fields) { assert.equal(fields, "_id ownerId"); return this; }, lean: async () => [] };
    },
    async bulkWrite() { bulkWriteCalls += 1; throw new Error("must not write in dry-run"); },
  };
  const result = await seedMarketplaceDemoProducts({ productModel: fakeModel, ownerId: farmerId, apply: false });
  assert.deepEqual(result, { mode: "dry-run", total: 10, existing: 0, wouldInsert: 10, inserted: 0 });
  assert.equal(bulkWriteCalls, 0);
});

test("repeated apply is idempotent and never overwrites existing demo documents", async () => {
  const records = new Map();
  let bulkWriteCalls = 0;
  const fakeModel = {
    find(filter) {
      const found = filter._id.$in.flatMap((id) => records.has(String(id)) ? [records.get(String(id))] : []);
      return { select() { return this; }, lean: async () => found };
    },
    async bulkWrite(operations) {
      bulkWriteCalls += 1;
      let upsertedCount = 0;
      for (const operation of operations) {
        const { filter, update } = operation.updateOne;
        const key = String(filter._id);
        if (!records.has(key)) {
          records.set(key, update.$setOnInsert);
          upsertedCount += 1;
        }
      }
      return { upsertedCount };
    },
  };

  const first = await seedMarketplaceDemoProducts({ productModel: fakeModel, ownerId: farmerId, apply: true });
  const firstSnapshot = [...records.values()].map((item) => ({ ...item }));
  const second = await seedMarketplaceDemoProducts({ productModel: fakeModel, ownerId: farmerId, apply: true });
  assert.equal(first.inserted, 10);
  assert.equal(second.inserted, 0);
  assert.equal(second.existing, 10);
  assert.equal(records.size, 10);
  assert.deepEqual([...records.values()], firstSnapshot);
  assert.equal(bulkWriteCalls, 2);
});

test("stable-ID collision owned by another user fails closed without writing", async () => {
  let bulkWriteCalls = 0;
  const fakeModel = {
    find(filter) {
      const collision = { _id: filter._id.$in[0], ownerId: new mongoose.Types.ObjectId("64b000000000000000000099") };
      return { select() { return this; }, lean: async () => [collision] };
    },
    async bulkWrite() { bulkWriteCalls += 1; },
  };
  await assert.rejects(seedMarketplaceDemoProducts({ productModel: fakeModel, ownerId: farmerId, apply: true }), /owned by another account/);
  assert.equal(bulkWriteCalls, 0);
});

test("configuration refuses production, hosted, implicit, or mismatched databases", () => {
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, NODE_ENV: "production" }), /only in development or test/);
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, RENDER: "true" }), /hosted deployments/);
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, MONGODB_TEST_URI: "mongodb+srv://user:pass@cluster.example/kb_dev_marketplace" }), /local MongoDB instance/);
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, MONGODB_TEST_URI: undefined }), /MONGODB_TEST_URI/);
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, MONGODB_TEST_URI: "mongodb://localhost/prod" }), /must explicitly match/);
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, MARKETPLACE_DEMO_DB_NAME: "prod" }), /must explicitly match/);
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, NODE_ENV: "test", MARKETPLACE_DEMO_DB_NAME: "kb_dev_marketplace", MONGODB_TEST_URI: "mongodb://localhost/kb_dev_marketplace" }), /NODE_ENV=test/);
  assert.equal(resolveMarketplaceDemoSeedConfig(validEnvironment).apply, false);
  assert.equal(resolveMarketplaceDemoSeedConfig(validEnvironment, ["--apply"]).apply, true);
});

test("demo farmer configuration and role must be valid and explicit", () => {
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, MARKETPLACE_DEMO_FARMER_ID: "" }), /MARKETPLACE_DEMO_FARMER_ID/);
  assert.throws(() => resolveMarketplaceDemoSeedConfig({ ...validEnvironment, MARKETPLACE_DEMO_FARMER_ID: "not-an-object-id" }), /MARKETPLACE_DEMO_FARMER_ID/);
  assert.throws(() => assertDemoFarmer(null), /not found as a farmer/);
  assert.throws(() => assertDemoFarmer({ _id: farmerId, role: "extension_officer" }), /not found as a farmer/);
  assert.equal(assertDemoFarmer({ _id: farmerId, role: "farmer" }), farmerId);
});
