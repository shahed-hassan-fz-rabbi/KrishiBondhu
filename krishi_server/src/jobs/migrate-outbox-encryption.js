import "../config/env.config.js";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { env } from "../config/env.config.js";
import { SmsOutbox } from "../models/smsOutbox.model.js";
import {
  encryptOutboxMessage,
  isOutboxEncryptionConfigured,
  MESSAGE_ALGORITHM,
} from "../services/sms/smsOutboxCrypto.service.js";

/**
 * Encrypt legacy plaintext outbox messages in place. Dry-run by default.
 * No records are deleted; failures are reported and left untouched.
 */
export async function migrateOutboxEncryption({
  model = SmsOutbox,
  key = env.smsOutboxEncryptionKey,
  apply = false,
  batchSize = 200,
} = {}) {
  if (!isOutboxEncryptionConfigured({ smsOutboxEncryptionKey: key })) {
    throw new Error("SMS_OUTBOX_ENCRYPTION_KEY is missing or invalid");
  }
  const report = { scanned: 0, encrypted: 0, failed: 0, applied: apply };
  const cursor = model.find({ messageProtected: { $ne: true } }).select("+message").cursor();
  for await (const job of cursor) {
    report.scanned += 1;
    try {
      const plaintext = String(job.message || "");
      if (!plaintext) { report.failed += 1; continue; }
      const ciphertext = encryptOutboxMessage(plaintext, { key });
      if (apply) {
        await model.updateOne(
          { _id: job._id, messageProtected: { $ne: true } },
          { $set: { message: ciphertext, messageProtected: true, messageAlgorithm: MESSAGE_ALGORITHM } }
        );
      }
      report.encrypted += 1;
    } catch {
      report.failed += 1;
    }
    if (report.scanned >= batchSize) break;
  }
  return report;
}

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDatabase({ required: true });
  try {
    console.log("[outbox-encryption]", JSON.stringify(await migrateOutboxEncryption({ apply })));
    if (!apply) console.log("[outbox-encryption] dry run only; pass --apply to encrypt");
  } finally {
    await disconnectDatabase();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`[outbox-encryption] ${error.message}`);
    process.exitCode = 1;
  });
}
