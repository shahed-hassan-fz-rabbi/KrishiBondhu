import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (parts) => readFileSync(path.join(root, ...parts), "utf8");

test("SMS subscription API client uses the exact Part 3A endpoints", () => {
  const api = read(["services", "api.js"]);
  assert.match(api, /export async function fetchSmsSubscriptions\(\)[\s\S]{0,120}request\("\/sms-subscriptions"\)/);
  assert.match(api, /export async function updateSmsSubscription\(category, enabled\)/);
  assert.match(api, /request\(`\/sms-subscriptions\/\$\{encodeURIComponent\(category\)\}`/);
  assert.match(api, /method: "PATCH"/);
  assert.match(api, /enabled: Boolean\(enabled\), source: "settings"/);
  assert.match(api, /export async function unsubscribeAllSms\(\)/);
  assert.match(api, /request\("\/sms-subscriptions\/unsubscribe-all", \{ method: "POST" \}\)/);
});

test("SMS settings UI loads real preferences and never exposes full phone numbers", () => {
  const ui = read(["components", "settings", "SmsAlertsSettings.js"]);
  assert.match(ui, /fetchSmsSubscriptions\(\)/);
  assert.match(ui, /updateSmsSubscription\(pendingCategory, true\)/);
  assert.match(ui, /updateSmsSubscription\(category, false\)/);
  assert.match(ui, /unsubscribeAllSms\(\)/);
  assert.match(ui, /preferences\?\.phone\?\.last4/);
  assert.doesNotMatch(ui, /preferences\.phone\.phone\b/);
  assert.doesNotMatch(ui, /api_key|senderid|SMS_LIVE|BULKSMSBD/);
});

test("SMS settings UI requires explicit consent and confirmation", () => {
  const ui = read(["components", "settings", "SmsAlertsSettings.js"]);
  // Enabling never calls the API directly from the switch.
  assert.match(ui, /onClick=\{\(\) => \(isOn \? disableCategory\(key\) : setPendingCategory\(key\)\)\}/);
  assert.match(ui, /role="switch"/);
  assert.match(ui, /aria-checked=\{isOn\}/);
  assert.match(ui, /confirmEnable/);
  assert.match(ui, /setConfirmUnsubscribe\(true\)/);
  assert.match(ui, /doUnsubscribeAll/);
});

test("SMS settings UI handles API error states and delayed state updates", () => {
  const ui = read(["components", "settings", "SmsAlertsSettings.js"]);
  for (const code of ["401", "403", "429", "PHONE_NOT_VERIFIED"]) assert.ok(ui.includes(code));
  assert.match(ui, /result\??\.status === 401/);
  assert.match(ui, /result\??\.status === 403/);
  assert.match(ui, /result\??\.status === 429/);
  assert.match(ui, /code === "PHONE_NOT_VERIFIED"/);
  assert.match(ui, /#phone-heading/);
  // State is only updated after the server confirms success.
  assert.match(ui, /if \(result\.success\)[\s\S]{0,160}setPreferences\(result\.data\.preferences\)/);
});

test("SMS settings highlights the dry-run alert pipeline for reviewers", () => {
  const ui = read(["components", "settings", "SmsAlertsSettings.js"]);
  assert.match(ui, /pipelineTitle/);
  assert.match(ui, /dryRunBadge/);
  assert.match(ui, /pipelineStep1/);
  assert.match(ui, /pipelineStep4/);
  const translations = read(["lib", "i18n", "translations.js"]);
  assert.match(translations, /no real SMS/i);
  assert.match(translations, /pipelineTitle:/);
  assert.match(translations, /dryRunBadge:/);
});

test("SMS settings UI is bilingual and accessible", () => {
  const ui = read(["components", "settings", "SmsAlertsSettings.js"]);
  assert.match(ui, /useLang\(\)/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /aria-label=/);
  assert.match(ui, /focus-visible:outline/);
  const translations = read(["lib", "i18n", "translations.js"]);
  assert.match(translations, /smsAlerts: \{/);
  assert.match(translations, /weatherDesc:/);
  assert.match(translations, /farmReminderDesc:/);
  assert.match(translations, /consentBody:/);
  assert.match(translations, /verificationNeededBody:/);
});
