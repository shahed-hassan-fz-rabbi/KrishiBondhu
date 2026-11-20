import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../../src/config/database.js";

const TEST_DATABASE_PREFIX = "kb_test_";

/**
 * Open a disposable database using an explicitly configured test connection.
 * Integration tests must never fall back to MONGODB_URI (which may be production).
 */
export async function connectIsolatedTestDatabase(scope, requestedDatabaseName) {
  const uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    throw new Error("MONGODB_TEST_URI is required for database integration tests; refusing to use MONGODB_URI.");
  }

  const safeScope = String(scope || "integration")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "integration";
  let uriDatabaseName = "";
  try {
    uriDatabaseName = decodeURIComponent(new URL(uri).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("MONGODB_TEST_URI must be a valid MongoDB connection URI with an explicit test database name.");
  }
  if (!uriDatabaseName.startsWith(TEST_DATABASE_PREFIX) || !/(^|[_-])test([_-]|$)/i.test(uriDatabaseName)) {
    throw new Error("MONGODB_TEST_URI must target a database with the kb_test_ prefix.");
  }
  const databaseName = requestedDatabaseName || uriDatabaseName;
  if (!databaseName.startsWith(TEST_DATABASE_PREFIX) || !/(^|[_-])test([_-]|$)/i.test(databaseName)) {
    throw new Error("Refusing to connect integration tests to a database without the kb_test_ prefix.");
  }

  await connectDatabase({ databaseName, required: true });
  if (mongoose.connection.name !== databaseName) {
    await disconnectDatabase();
    throw new Error("Integration test database isolation check failed.");
  }

  return databaseName;
}

/** Disconnect only from the explicitly validated test database. */
export async function disconnectIsolatedTestDatabase(databaseName) {
  const connectedName = mongoose.connection.name;
  if (mongoose.connection.readyState === 1) {
    if (!databaseName || !databaseName.startsWith(TEST_DATABASE_PREFIX) || connectedName !== databaseName) {
      throw new Error("Refusing to drop a MongoDB database not created by the isolated test helper.");
    }
    await disconnectDatabase();
    return;
  }

  await disconnectDatabase();
}
