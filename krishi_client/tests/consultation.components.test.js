import test from "node:test";
import assert from "node:assert/strict";

import {
  NATIONAL_AGRICULTURAL_SUPPORT,
  DISTRICT_DAE_OFFICES,
  VERIFIED_UPAZILA_OFFICES,
  getAgriSupportContacts,
} from "../lib/officialAgriContacts.js";

test("Consultation categories coverage includes all 5 required agronomic domains", async () => {
  const fs = await import("node:fs");
  const modalContent = fs.readFileSync("krishi_client/components/support/ConsultationModal.js", "utf8");

  assert.ok(modalContent.includes('"crop_planning"'), "Must include Crop Planning");
  assert.ok(modalContent.includes('"crop_disease"'), "Must include Crop Disease");
  assert.ok(modalContent.includes('"soil_fertilizer"'), "Must include Soil & Fertilizer");
  assert.ok(modalContent.includes('"irrigation"'), "Must include Irrigation");
  assert.ok(modalContent.includes('"market_advice"'), "Must include Market Advice");
});

test("Future Work Preview modal covers all 6 required roadmap features", async () => {
  const fs = await import("node:fs");
  const futureModalContent = fs.readFileSync("krishi_client/components/support/FutureSupportModal.js", "utf8");

  // 1. Verified Agricultural Officer Accounts
  assert.ok(
    futureModalContent.includes("Verified Agricultural Officer Accounts") ||
    futureModalContent.includes("officer_accounts"),
    "Must include Verified Agricultural Officer Accounts"
  );

  // 2. Farmer–Officer Connection
  assert.ok(
    futureModalContent.includes("Farmer–Officer Connection") ||
    futureModalContent.includes("farmer_officer_connection"),
    "Must include Farmer–Officer Connection"
  );

  // 3. Virtual Farm Profile Sharing
  assert.ok(
    futureModalContent.includes("Virtual Farm Profile Sharing") ||
    futureModalContent.includes("farm_profile_sharing"),
    "Must include Virtual Farm Profile Sharing"
  );

  // 4. Online Crop Plan Review
  assert.ok(
    futureModalContent.includes("Online Crop Plan Review") ||
    futureModalContent.includes("online_crop_plan_review"),
    "Must include Online Crop Plan Review"
  );

  // 5. Personalized Agricultural Advisory
  assert.ok(
    futureModalContent.includes("Personalized Agricultural Advisory") ||
    futureModalContent.includes("personalized_advisory"),
    "Must include Personalized Agricultural Advisory"
  );

  // 6. Direct Consultation & Follow-up
  assert.ok(
    futureModalContent.includes("Direct Consultation & Follow-up") ||
    futureModalContent.includes("direct_consultation_followup"),
    "Must include Direct Consultation & Follow-up"
  );

  // Coming soon labels
  assert.ok(futureModalContent.includes("Coming Soon"), "Must clearly label features as Coming Soon");
});

test("Interactive checklist and personal notes features exist in ConsultationCard", async () => {
  const fs = await import("node:fs");
  const cardContent = fs.readFileSync("krishi_client/components/support/ConsultationCard.js", "utf8");

  assert.ok(cardContent.includes("onUpdateChecklist"), "Must handle interactive checklist updates");
  assert.ok(cardContent.includes("onSaveNotes"), "Must handle personal notes saving");
  assert.ok(cardContent.includes("onUpdateStatus"), "Must handle consultation status tracking");
  assert.ok(cardContent.includes("onDelete"), "Must allow farmers to delete consultation records");
  assert.ok(cardContent.includes("onEdit"), "Must allow farmers to edit consultation records");
});

test("Verified DAE contacts and transparent empty states are enforced", () => {
  // Verified district offices
  assert.equal(DISTRICT_DAE_OFFICES.chattogram.phone, "02334419299");
  assert.equal(DISTRICT_DAE_OFFICES.cumilla.phone, "+880-2334436896");

  // National hotline
  assert.equal(NATIONAL_AGRICULTURAL_SUPPORT.hotline, "16123");

  // Verified upazila returns true verified state
  const verifiedUpz = getAgriSupportContacts("chattogram", "hathazari");
  assert.equal(verifiedUpz.isUpazilaVerified, true);
  assert.ok(verifiedUpz.upazila.phone);

  // Unverified upazila returns null for upazila so empty state displays, never fabricating fake data
  const unverifiedUpz = getAgriSupportContacts("chattogram", "anwara");
  assert.equal(unverifiedUpz.isUpazilaVerified, false);
  assert.equal(unverifiedUpz.upazila, null);
});
