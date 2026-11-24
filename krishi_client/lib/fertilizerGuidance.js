const SOURCE_URL = "https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf";

export const FERTILIZER_GUIDANCE_SOURCE = {
  organization: "Bangladesh Agricultural Research Council (BARC)",
  title: "Fertilizer Recommendation Guide 2024",
  url: SOURCE_URL,
  verifiedOn: "2026-11-24",
};

/**
 * Return only crop-specific steps verified in BARC FRG-2024.
 * Product doses are intentionally withheld until a field soil test is recorded.
 */
export function getFarmFertilizerGuidance(farm, lang = "bn") {
  const isBn = lang === "bn";
  const cropCode = farm?.crop?.cropCode;
  const irrigation = farm?.water?.irrigationAvailability;
  const method = String(farm?.crop?.cultivationMethod || "").toLowerCase();
  const broadcastOrDirectSeeded = /broadcast|direct|ছিটিয়ে|সরাসরি বপন/.test(method);
  const isLightSoil = ["sandy", "sandy_loam"].includes(farm?.soil?.type);

  if (cropCode === "mustard") {
    const rainfed = irrigation === "unavailable";
    return {
      status: "verified_schedule_dose_pending_soil_test",
      cropLabel: isBn ? "সরিষা" : "Mustard",
      page: "86",
      summary: isBn
        ? "সার দেওয়ার ধাপ BARC-এর ২০২৪ নির্দেশিকা থেকে নেওয়া। মাটি পরীক্ষার ফল না থাকায় এই মাঠের কেজি-পরিমাণ দেখানো হচ্ছে না।"
        : "Application timing follows BARC's 2024 guide. Field-specific kg amounts are withheld because no soil-test result is recorded.",
      schedule: rainfed
        ? [
            { title: isBn ? "জমি তৈরির সময়" : "During final land preparation", text: isBn ? "বৃষ্টিনির্ভর চাষে নির্দেশিকা অনুযায়ী নির্ধারিত সার একবারে মাটিতে মিশিয়ে দিন। পরিমাণ মাটি পরীক্ষার ফল ছাড়া নির্ধারণ করবেন না।" : "For rainfed cultivation, incorporate the soil-test-based fertilizer dose during final land preparation." },
          ]
        : irrigation === "limited"
        ? [
            { title: isBn ? "জমি তৈরির সময়" : "During final land preparation", text: isBn ? "সেচ দেওয়া হলে নাইট্রোজেনের অর্ধেক এবং মাটি পরীক্ষায় প্রয়োজনীয় অন্যান্য সার মাটিতে মিশিয়ে দিন।" : "If irrigating, incorporate half the nitrogen and the soil-test-based amounts of other required nutrients." },
            { title: isBn ? "বীজ বোনার প্রায় ২৫ দিন পর" : "About 25 days after sowing", text: isBn ? "সেচের সুযোগ ও ফসলের অবস্থা অনুযায়ী বাকি অর্ধেক নাইট্রোজেন ফুল আসা শুরুর সময় দিন। বৃষ্টিনির্ভর হলে সব সার জমি তৈরির সময় দেওয়ার নির্দেশিকা দেখুন।" : "Where irrigation is available, apply the remaining half of nitrogen at flower initiation. For rainfed cultivation, use the basal schedule above." },
          ]
        : [
            { title: isBn ? "জমি তৈরির সময়" : "During final land preparation", text: isBn ? "নাইট্রোজেনের অর্ধেক এবং মাটি পরীক্ষায় প্রয়োজনীয় অন্যান্য সার মাটিতে মিশিয়ে দিন।" : "Incorporate half the nitrogen and soil-test-based amounts of other required nutrients." },
            { title: isBn ? "বীজ বোনার প্রায় ২৫ দিন পর" : "About 25 days after sowing", text: isBn ? "ফুল আসা শুরু হলে বাকি অর্ধেক নাইট্রোজেন উপরি প্রয়োগ করুন।" : "Apply the remaining half of nitrogen as top dressing at flower initiation." },
          ],
      precautions: isBn
        ? ["জমির মাটি পরীক্ষা না করে কোনো সারের পরিমাণ অনুমান করবেন না।", "সার বীজ ও কচি শিকড়ের গায়ে দেবেন না; মাটিতে ভালোভাবে মিশিয়ে দিন।", "সার প্রয়োগের দিন ও ব্যবহৃত পরিমাণ খাতায় লিখে রাখুন।"]
        : ["Do not estimate a dose without a soil test.", "Keep fertilizer away from seed and young roots; mix it into the soil.", "Record the date and amount applied."],
    };
  }

  if (["boro_rice", "aus_rice", "monsoon_aman"].includes(cropCode)) {
    return {
      status: "verified_schedule_dose_pending_soil_test",
      cropLabel: isBn
        ? ({ boro_rice: "বোরো ধান", aus_rice: "আউশ ধান", monsoon_aman: "আমন ধান" }[cropCode])
        : ({ boro_rice: "Boro rice", aus_rice: "Aus rice", monsoon_aman: "Aman rice" }[cropCode]),
      page: cropCode === "boro_rice" ? "72" : "73–76",
      summary: isBn
        ? "ধানের সার প্রয়োগের ধাপ BARC-এর নির্দেশিকা থেকে নেওয়া। জাত, চাষপদ্ধতি ও মাটি পরীক্ষার ফল ছাড়া এই মাঠের কেজি-পরিমাণ নির্ধারণ করা নিরাপদ নয়।"
        : "Rice application timing follows BARC guidance. A field-specific kg dose needs the variety, cultivation method, and soil-test results.",
      schedule: broadcastOrDirectSeeded
        ? [
            { title: isBn ? "জমি তৈরির সময়" : "During final land preparation", text: isBn ? "মাটি পরীক্ষায় প্রয়োজন হলে ফসফরাস, পটাশ, গন্ধক ও দস্তা মাটিতে মিশিয়ে দিন। নাইট্রোজেনের প্রথম অর্ধেক দিন।" : "Apply soil-test-required phosphorus, potassium, sulphur and zinc into the soil. Apply the first half of nitrogen." },
            { title: isBn ? "সর্বোচ্চ কুশি গজানোর সময়" : "At maximum tillering", text: isBn ? "নাইট্রোজেনের বাকি অর্ধেক দিন।" : "Apply the remaining half of nitrogen." },
          ]
        : [
            { title: isBn ? "জমি তৈরি / চারা প্রতিষ্ঠার পর" : "Final land preparation / after seedling establishment", text: isBn ? "মাটি পরীক্ষায় প্রয়োজন হলে ফসফরাস, পটাশ, গন্ধক ও দস্তা মাটিতে মিশিয়ে দিন। নাইট্রোজেনের প্রথম এক-তৃতীয়াংশ দিন।" : "Apply soil-test-required phosphorus, potassium, sulphur and zinc into the soil. Apply the first third of nitrogen." },
            { title: isBn ? "কুশি গজানোর শুরুতে" : "At early tillering", text: isBn ? "নাইট্রোজেনের দ্বিতীয় এক-তৃতীয়াংশ দিন।" : "Apply the second third of nitrogen." },
            { title: isBn ? "থোড় আসার ৫–৭ দিন আগে" : "5–7 days before panicle initiation", text: isBn ? "নাইট্রোজেনের শেষ এক-তৃতীয়াংশ দিন। হালকা বুনটের মাটিতে শেষ কিস্তির সঙ্গে পটাশের বাকি অর্ধেক দেওয়ার নির্দেশিকা দেখুন।" : "Apply the final third of nitrogen. For light-textured soils, apply the remaining half of potassium with this split." },
          ],
      isLightSoil,
      precautions: isBn
        ? ["জমিতে দাঁড়ানো পানি থাকলে ইউরিয়া দেবেন না। উপরি প্রয়োগের সময় মাটি আর্দ্র রাখুন।", "সার চারা, বীজ বা কচি শিকড়ের গায়ে দেবেন না; মাটির সঙ্গে মিশিয়ে দিন।", "মাটি পরীক্ষা ও নির্দিষ্ট জাতের সুপারিশ ছাড়া কেজি-পরিমাণ ঠিক করবেন না।"]
        : ["Do not apply urea into standing water. Apply top dressing to moist soil.", "Keep fertilizer away from seedlings, seed, and young roots; mix it into the soil.", "Do not set kg amounts without a soil test and variety-specific recommendation."],
    };
  }

  return {
    status: "unverified",
    cropLabel: farm?.crop?.cropName || (isBn ? "এই ফসল" : "This crop"),
    page: null,
    summary: isBn ? "এই ফসলের জন্য যাচাইকৃত সার নির্দেশনা পাওয়া যায়নি।" : "No verified fertilizer guidance is available for this crop.",
    schedule: [],
    precautions: [],
  };
}
