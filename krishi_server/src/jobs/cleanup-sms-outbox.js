import "../config/env.config.js";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.config.js";
import { applySmsRetention } from "../services/sms/smsOutboxRetention.service.js";

/** Dry-run by default; pass --apply to delete aged terminal records. */
async function main() {
  const apply = process.argv.includes("--apply");
  await connectDatabase({ required: true });
  try {
    const report = await applySmsRetention({
      now: new Date(),
      retentionDays: env.smsOutboxRetentionDays,
      apply,
    });
    console.log("[sms-retention]", JSON.stringify(report));
    if (!apply) console.log("[sms-retention] dry run only; pass --apply to delete");
  } finally {
    await disconnectDatabase();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`[sms-retention] ${error.message}`);
    process.exitCode = 1;
  });
}
