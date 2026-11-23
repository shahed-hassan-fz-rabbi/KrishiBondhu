import "../config/env.config.js";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.config.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { User } from "../models/user.model.js";
import { SmsPreferences } from "../models/smsPreferences.model.js";
import { SmsNotificationLog } from "../models/smsNotificationLog.model.js";
import { hasSmsConsent } from "../services/sms/smsPreferences.js";
import { getVerifiedSmsRecipient } from "../services/sms/smsRecipient.service.js";
import { configureSmsGatewayFromEnv } from "../services/sms/configureSmsGateway.js";
import { sendSms, getSmsMode } from "../services/sms/smsSender.service.js";
import { encryptionRequirement } from "../services/sms/smsOutboxCrypto.service.js";

/**
 * CONTROLLED single-recipient provider test command.
 * Disabled by default. This job is NOT imported by server.js. Every guard
 * must pass before the single provider call is attempted.
 * Live sending requires explicit SMS_LIVE=1 AND SMS_LIVE_TEST_ENABLED=1.
 * The provider is selected by SMS_PROVIDER (alpha_sms or bulksmsbd); the
 * wired adapter must match it, so there is no silent provider fallback.
 */

/** Compare allowlist/recipient numbers without depending on '+' or leading zero. */
function normaliseTestNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^01[3-9]\d{8}$/.test(digits)) return `88${digits}`;
  return digits;
}

export function checkLiveTestGuards({
  source = env,
  rawEnv = process.env,
  number = "",
  apply = false,
  now = new Date(),
} = {}) {
  const reasons = [];
  if (!apply) reasons.push("MISSING_APPLY_FLAG");
  if (source.smsLiveTestEnabled !== true && String(rawEnv.SMS_LIVE_TEST_ENABLED || "") !== "1") reasons.push("TEST_NOT_ENABLED");
  if (source.smsLive !== true && String(rawEnv.SMS_LIVE || "") !== "1") reasons.push("LIVE_NOT_ENABLED");
  for (const flag of ["WEATHER_ALERT_SCHEDULER_ENABLED", "SMS_OUTBOX_SCHEDULER_ENABLED", "MARKET_ALERT_SCHEDULER_ENABLED"]) {
    if (String(rawEnv[flag] || "") === "1") reasons.push(`SCHEDULER_ACTIVE:${flag}`);
  }
  const allowed = String(source.smsLiveTestAllowedNumbers || rawEnv.SMS_LIVE_TEST_ALLOWED_NUMBERS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (!allowed.some((entry) => normaliseTestNumber(entry) === normaliseTestNumber(number))) {
    reasons.push("NUMBER_NOT_ALLOWLISTED");
  }
  const crypto = encryptionRequirement({ envConfig: source, requireEncryption: true });
  if (!crypto.ok) reasons.push(crypto.reason);
  if (!rawEnv.MONGODB_TEST_URI) reasons.push("NO_TEST_DATABASE");
  return { ok: reasons.length === 0, reasons, day: now.toISOString().slice(0, 10) };
}

export async function runSmsLiveTest({
  userId,
  number,
  category = "weather",
  text = "KrishiBondhu TEST SMS only - not a real weather warning. No reply needed.",
  apply = false,
  now = new Date(),
  source = env,
  rawEnv = process.env,
  fetchImpl,
  models = { userModel: User, preferencesModel: SmsPreferences, logModel: SmsNotificationLog },
  connect = connectDatabase,
  configureGateway = configureSmsGatewayFromEnv,
  send = sendSms,
} = {}) {
  const guards = checkLiveTestGuards({ source, rawEnv, number, apply, now });
  if (!guards.ok) return { attempted: false, mode: getSmsMode(), reasons: guards.reasons };

  const testUri = String(rawEnv.MONGODB_TEST_URI || "");
  let dbName = "";
  try {
    dbName = new URL(testUri.replace("mongodb+srv://", "https://")).pathname.replace(/^\//, "");
  } catch {
    return { attempted: false, mode: getSmsMode(), reasons: ["INVALID_TEST_DATABASE"] };
  }
  if (!dbName.startsWith("kb_test_")) return { attempted: false, mode: getSmsMode(), reasons: ["NON_TEST_DATABASE"] };

  await connect({ databaseName: dbName, required: true });
  const { userModel, preferencesModel, logModel } = models;
  try {
    const recipient = await getVerifiedSmsRecipient(userId, { now, userModel });
    if (!recipient || normaliseTestNumber(recipient.phone || recipient.e164) !== normaliseTestNumber(number)) {
      return { attempted: false, mode: getSmsMode(), reasons: ["NUMBER_NOT_VERIFIED"] };
    }
    const preferences = await preferencesModel.findOne({ userId }).lean();
    if (!hasSmsConsent({ user: { ...recipient, _id: userId }, preferences, category, now })) {
      return { attempted: false, mode: getSmsMode(), reasons: ["NO_CONSENT"] };
    }

    const verifiedE164 = recipient.phone || recipient.e164;
    const dedupeKey = `sms-live-test:${verifiedE164}:${guards.day}`;
    if (await logModel.findOne({ dedupeKey })) {
      return { attempted: false, mode: getSmsMode(), reasons: ["ALREADY_ATTEMPTED"] };
    }
    const wired = configureGateway({ source, fetchImpl });
    if (!wired.registered || getSmsMode() !== "live") {
      return { attempted: false, mode: getSmsMode(), reasons: ["GATEWAY_NOT_LIVE"] };
    }
    // Never silently fall back to a different provider than SMS_PROVIDER.
    const expectedProvider = String(source.smsProvider || "").trim().toLowerCase() || "bulksmsbd";
    if (wired.name !== expectedProvider) {
      return { attempted: false, mode: getSmsMode(), reasons: ["PROVIDER_MISMATCH"] };
    }
    const result = await send({
      user: { _id: userId, phone: verifiedE164, phoneVerifiedAt: now },
      preferences,
      text,
      category,
      dedupeKey,
      now,
      logger: logModel,
    });
    return {
      attempted: true,
      mode: getSmsMode(),
      status: result.status,
      deliveryConfirmed: false,
      providerStatus: result.log?.metadata?.providerStatus || null,
      ambiguous: Boolean(result.log?.metadata?.ambiguous),
      provider: wired.name,
      requestId: result.log?.metadata?.providerRequestId || null,
      reasons: [],
    };
  } finally {
    if (connect === connectDatabase) await disconnectDatabase();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  // Avoid putting the full number on the command line: use the single
  // configured allowlist entry when --number is omitted.
  const allowlist = String(env.smsLiveTestAllowedNumbers || process.env.SMS_LIVE_TEST_ALLOWED_NUMBERS || "")
    .split(",").map((entry) => entry.trim()).filter(Boolean);
  const number = value("--number") || (allowlist.length === 1 ? allowlist[0] : undefined);
  const report = await runSmsLiveTest({
    userId: value("--user"),
    number,
    category: value("--category") || "weather",
    apply: args.includes("--apply"),
  });
  console.log("[sms-live-test]", JSON.stringify(report));
  if (!report.attempted) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`[sms-live-test] ${error.message}`);
    process.exitCode = 1;
  });
}
