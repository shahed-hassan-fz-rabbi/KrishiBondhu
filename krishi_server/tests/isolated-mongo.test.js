import test from "node:test";
import assert from "node:assert/strict";
import { connectIsolatedTestDatabase } from "./helpers/isolatedMongo.js";

test("database integration setup refuses to fall back to MONGODB_URI", async () => {
  const previousTestUri = process.env.MONGODB_TEST_URI;
  const previousProductionUri = process.env.MONGODB_URI;
  delete process.env.MONGODB_TEST_URI;
  process.env.MONGODB_URI = "mongodb://127.0.0.1/production";

  try {
    await assert.rejects(
      connectIsolatedTestDatabase("safety"),
      /MONGODB_TEST_URI is required.*refusing to use MONGODB_URI/
    );
  } finally {
    if (previousTestUri === undefined) delete process.env.MONGODB_TEST_URI;
    else process.env.MONGODB_TEST_URI = previousTestUri;
    if (previousProductionUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousProductionUri;
  }
});

test("database integration setup rejects test URIs without the approved test database name", async () => {
  const previousTestUri = process.env.MONGODB_TEST_URI;
  process.env.MONGODB_TEST_URI = "mongodb://127.0.0.1/production";

  try {
    await assert.rejects(
      connectIsolatedTestDatabase("safety"),
      /MONGODB_TEST_URI must target a database with the kb_test_ prefix/
    );
  } finally {
    if (previousTestUri === undefined) delete process.env.MONGODB_TEST_URI;
    else process.env.MONGODB_TEST_URI = previousTestUri;
  }
});

test("randomized integration database names also require the approved prefix", async () => {
  const previousTestUri = process.env.MONGODB_TEST_URI;
  process.env.MONGODB_TEST_URI = "mongodb://127.0.0.1/kb_test_local";

  try {
    await assert.rejects(
      connectIsolatedTestDatabase("safety", "production"),
      /database without the kb_test_ prefix/
    );
  } finally {
    if (previousTestUri === undefined) delete process.env.MONGODB_TEST_URI;
    else process.env.MONGODB_TEST_URI = previousTestUri;
  }
});
