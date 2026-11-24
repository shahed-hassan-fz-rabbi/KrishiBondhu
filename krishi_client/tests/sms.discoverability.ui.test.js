import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (parts) => readFileSync(path.join(root, ...parts), "utf8");

test("homepage has a prominent truthful SMS alerts section and CTA", () => {
  const home = read(["app", "page.js"]);
  assert.match(home, /id="sms-alerts"/);
  assert.match(home, /SMSAlerts|Set Up SMS Alerts|SMS চালু করুন/);
  assert.match(home, /\/settings#sms-alerts-heading/);
  assert.match(home, /dry-run|ড্রাই-রান/i);
  assert.match(home, /Weather alerts|আবহাওয়ার সতর্কতা/);
  assert.match(home, /Market price|বাজারদর/);
  assert.match(home, /Farm activity|খামারের কাজ/);
  assert.match(home, /data-bondhu-no-fly/);
});

test("dashboard SMS card reads real preferences and never fabricates delivery counts", () => {
  const card = read(["components", "dashboard", "SmsStatusCard.js"]);
  assert.match(card, /fetchSmsSubscriptions\(\)/);
  assert.match(card, /preferences\?\.phone\?\.verified/);
  assert.match(card, /preferences\?\.phone\?\.last4/);
  assert.match(card, /farmReminder/);
  assert.match(card, /\/settings#sms-alerts-heading/);
  assert.doesNotMatch(card, /delivered|sentCount|successCount|totalSent/i);
  assert.match(card, /data-bondhu-no-fly/);

  const workspace = read(["components", "dashboard", "DashboardWorkspace.js"]);
  assert.match(workspace, /<SmsStatusCard \/>/);
});

test("sidebar exposes SMS Alerts without touching the mobile bottom nav", () => {
  const nav = read(["lib", "nav.js"]);
  assert.match(nav, /\/settings#sms-alerts-heading/);
  assert.match(nav, /nav\.smsAlerts/);
  const sidebar = read(["components", "layout", "AppSidebar.js"]);
  assert.match(sidebar, /\/settings#sms-alerts-heading/);
  assert.match(sidebar, /baseHref = href\.split\("#"\)\[0\]/);
  const bottom = read(["components", "layout", "BottomNav.js"]);
  assert.doesNotMatch(bottom, /sms-alerts-heading|nav\.smsAlerts/);
  const translations = read(["lib", "i18n", "translations.js"]);
  assert.match(translations, /smsAlerts: "SMS Alerts"/);
  assert.match(translations, /smsAlerts: "এসএমএস অ্যালার্ট"/);
});
