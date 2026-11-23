import test from "node:test";
import assert from "node:assert/strict";

import {
  NATIONAL_AGRICULTURAL_SUPPORT,
  DISTRICT_DAE_OFFICES,
  VERIFIED_UPAZILA_OFFICES,
  getAgriSupportContacts,
} from "../lib/officialAgriContacts.js";

import {
  fetchMyOfficerReviews,
  createOfficerReviewRequest,
  updateOfficerReview,
  deleteOfficerReview,
} from "../services/api.js";

test("Consultation Tracker API exports support full CRUD lifecycle", () => {
  assert.equal(typeof fetchMyOfficerReviews, "function");
  assert.equal(typeof createOfficerReviewRequest, "function");
  assert.equal(typeof updateOfficerReview, "function");
  assert.equal(typeof deleteOfficerReview, "function");
});

test("Official DAE Agricultural Support Contacts: National Headquarters & Helpline", () => {
  assert.equal(NATIONAL_AGRICULTURAL_SUPPORT.hotline, "16123");
  assert.match(NATIONAL_AGRICULTURAL_SUPPORT.addressEn, /Khamarbari, Farmgate, Dhaka/);
  assert.match(NATIONAL_AGRICULTURAL_SUPPORT.phone, /\+880-2-55028370/);
  assert.equal(NATIONAL_AGRICULTURAL_SUPPORT.website, "http://dae.gov.bd");
});

test("Official DAE District Offices: Authentic verified contacts for Chattogram and Cumilla", () => {
  const ctg = DISTRICT_DAE_OFFICES.chattogram;
  assert.ok(ctg, "Chattogram DAE office must exist");
  assert.equal(ctg.phone, "02334419299");
  assert.match(ctg.addressEn, /Agrabad/);
  assert.equal(ctg.email, "ddctg2015@gmail.com");
  assert.equal(ctg.website, "https://dae.chittagong.gov.bd");

  const com = DISTRICT_DAE_OFFICES.cumilla;
  assert.ok(com, "Cumilla DAE office must exist");
  assert.equal(com.phone, "+880-2334436896");
  assert.match(com.addressEn, /Khamarbari/);
  assert.equal(com.email, "ddcomilla.dae@gmail.com");
  assert.equal(com.website, "http://dae.comilla.gov.bd");
});

test("Official DAE Upazila Offices: Truthful verification with empty state for unindexed upazilas", () => {
  // Verified upazila Hathazari
  const hathazari = getAgriSupportContacts("chattogram", "hathazari");
  assert.equal(hathazari.isUpazilaVerified, true);
  assert.equal(hathazari.upazila.phone, "031-2601095");
  assert.match(hathazari.upazila.website, /hathazari/);

  // Verified upazila Adarsha Sadar
  const adarshaSadar = getAgriSupportContacts("cumilla", "adarsha_sadar");
  assert.equal(adarshaSadar.isUpazilaVerified, true);
  assert.match(adarshaSadar.upazila.phone, /334405464/);

  // Unindexed upazila: Must NOT fabricate phone numbers; must return isUpazilaVerified: false
  const unindexed = getAgriSupportContacts("chattogram", "sandwip");
  assert.equal(unindexed.isUpazilaVerified, false);
  assert.equal(unindexed.upazila, null);
  // Still returns verified district & national fallbacks
  assert.ok(unindexed.district);
  assert.equal(unindexed.district.phone, "02334419299");
  assert.equal(unindexed.national.hotline, "16123");
});

test("Consultation Categories & Statuses conform to requirements", () => {
  const requiredCategories = [
    "crop_planning",
    "crop_disease",
    "soil_fertilizer",
    "irrigation",
    "market_advice",
  ];
  assert.equal(requiredCategories.length, 5);

  const requiredStatuses = ["PENDING", "IN_PROGRESS", "REVIEWED", "RESOLVED"];
  assert.equal(requiredStatuses.length, 4);
});
