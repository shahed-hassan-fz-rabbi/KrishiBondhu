import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const referencePath = path.resolve(__dirname, "../../data/crops/area_input_references.json");
const unitToDecimal = { decimal: 1, acre: 100, hectare: 247.1, bigha: 33, katha: 1.65 };

export function calculateFarmInputRequirements(farm) {
  const area = Number(farm?.land?.area);
  const unit = String(farm?.land?.unit || "decimal").toLowerCase();
  if (!Number.isFinite(area) || area <= 0 || !unitToDecimal[unit]) {
    return { success: false, code: "INVALID_FARM_AREA" };
  }

  const reference = JSON.parse(fs.readFileSync(referencePath, "utf8"));
  const cropCode = String(farm?.crop?.cropCode || "").trim().toLowerCase();
  const variety = String(farm?.crop?.variety || "").trim();
  const key = `${cropCode}|${variety}`;
  const record = reference.references[key];
  const areaDecimal = area * unitToDecimal[unit];
  const areaBigha = areaDecimal / reference.metadata.decimalPerBigha;

  if (!record) {
    return {
      success: true,
      status: "verification_pending",
      crop: { code: cropCode, name: farm?.crop?.cropName || null, variety: variety || null },
      area: { value: area, unit, decimal: areaDecimal },
      requirements: { seed: null, fertilizers: null, compost: null, irrigationVolume: null },
      messageBn: "এই ফসল ও জাতের জন্য জমির পরিমাণ অনুযায়ী বীজ, সার বা কম্পোস্টের নির্ভরযোগ্য উৎসভিত্তিক হিসাব এখনো যাচাই করা হয়নি। তাই কোনো পরিমাণ অনুমান করে দেখানো হচ্ছে না।",
      messageEn: "Source-verified area rates are not yet available for this crop and variety. Seed, fertilizer and compost quantities are left blank instead of being guessed.",
      sourceCheckedOn: reference.metadata.sourceCheckedOn,
      sources: [],
    };
  }

  const round = (value) => Math.round(value * 100) / 100;
  return {
    success: true,
    status: "source_backed_area_calculation",
    crop: { code: cropCode, name: farm?.crop?.cropName || null, variety },
    area: { value: area, unit, decimal: round(areaDecimal), bigha: round(areaBigha) },
    requirements: {
      seed: record.seed,
      fertilizers: record.fertilizersPerBighaKg.map((item) => ({ ...item, amountKg: round(item.amount * areaBigha) })),
      compost: { amountKg: round(record.compostPerBighaKg * areaBigha) },
      irrigationVolume: record.waterVolume,
    },
    waterGuidance: { en: record.waterGuidanceEn, bn: record.waterGuidanceBn },
    basis: record.basis,
    sourceCheckedOn: reference.metadata.sourceCheckedOn,
    sources: record.sources,
  };
}
