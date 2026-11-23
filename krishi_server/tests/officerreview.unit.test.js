import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { OfficerReview } from "../src/models/officerreview.model.js";
import {
  createOfficerReview,
  listMyOfficerReviews,
  getOfficerReviewById,
  updateOfficerReview,
  deleteOfficerReview,
  listOfficerReviewQueue,
  submitOfficerReview,
} from "../src/controllers/officerreview.controller.js";

test("OfficerReview controller exports all required consultation CRUD functions", () => {
  assert.equal(typeof createOfficerReview, "function");
  assert.equal(typeof listMyOfficerReviews, "function");
  assert.equal(typeof getOfficerReviewById, "function");
  assert.equal(typeof updateOfficerReview, "function");
  assert.equal(typeof deleteOfficerReview, "function");
  assert.equal(typeof listOfficerReviewQueue, "function");
  assert.equal(typeof submitOfficerReview, "function");
});

test("OfficerReview schema validates supported consultation categories", () => {
  const validCategories = ["crop_planning", "crop_disease", "soil_fertilizer", "irrigation", "market_advice"];
  for (const cat of validCategories) {
    const doc = new OfficerReview({
      farmerId: new mongoose.Types.ObjectId(),
      districtCode: "chattogram",
      upazila: "Hathazari",
      category: cat,
      farmerQuestion: "How to treat leaf blight?",
    });
    const err = doc.validateSync();
    assert.equal(err, undefined, `Category ${cat} should be valid`);
  }

  const invalidDoc = new OfficerReview({
    farmerId: new mongoose.Types.ObjectId(),
    districtCode: "chattogram",
    upazila: "Hathazari",
    category: "invalid_category",
    farmerQuestion: "How to treat leaf blight?",
  });
  const err = invalidDoc.validateSync();
  assert.ok(err?.errors?.category, "Invalid category should fail validation");
});

test("OfficerReview schema validates consultation statuses and priorities", () => {
  const validStatuses = ["PENDING", "IN_PROGRESS", "REVIEWED", "RESOLVED"];
  for (const st of validStatuses) {
    const doc = new OfficerReview({
      farmerId: new mongoose.Types.ObjectId(),
      districtCode: "cumilla",
      upazila: "Chandina",
      status: st,
      farmerQuestion: "Need advice on soil fertility",
    });
    const err = doc.validateSync();
    assert.equal(err, undefined, `Status ${st} should be valid`);
  }

  const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
  for (const pr of validPriorities) {
    const doc = new OfficerReview({
      farmerId: new mongoose.Types.ObjectId(),
      districtCode: "cumilla",
      upazila: "Chandina",
      priority: pr,
      farmerQuestion: "Need advice on soil fertility",
    });
    const err = doc.validateSync();
    assert.equal(err, undefined, `Priority ${pr} should be valid`);
  }
});

test("OfficerReview schema supports checklist items and farmer notes", () => {
  const doc = new OfficerReview({
    farmerId: new mongoose.Types.ObjectId(),
    districtCode: "chattogram",
    upazila: "Sitakunda",
    farmerQuestion: "Checking irrigation drainage after flash rainfall",
    farmerNotes: "Field drainage ditch cleared on Sunday.",
    checklist: [
      { task: "Measure standing water", completed: true },
      { task: "Apply potash after drain", completed: false },
    ],
  });
  const err = doc.validateSync();
  assert.equal(err, undefined);
  assert.equal(doc.checklist.length, 2);
  assert.equal(doc.checklist[0].completed, true);
  assert.equal(doc.checklist[1].completed, false);
  assert.equal(doc.farmerNotes, "Field drainage ditch cleared on Sunday.");
});
