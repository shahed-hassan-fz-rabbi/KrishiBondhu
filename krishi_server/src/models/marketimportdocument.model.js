import mongoose from "mongoose";

const marketImportDocumentSchema = new mongoose.Schema({
  filename: { type: String, required: true, maxlength: 180 },
  contentType: { type: String, enum: ["application/pdf"], required: true },
  sha256: { type: String, required: true, index: true },
  fileData: { type: Buffer, required: true },
  extractedText: { type: String, default: "", maxlength: 1_000_000 },
  sourceUrl: { type: String, required: true, maxlength: 500 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reportDate: { type: Date, default: null },
  recordsImported: { type: Number, default: 0 },
}, { timestamps: true });

export const MarketImportDocument = mongoose.models.MarketImportDocument || mongoose.model("MarketImportDocument", marketImportDocumentSchema);
