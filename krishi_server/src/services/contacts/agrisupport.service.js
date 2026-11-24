/**
 * Verified Government Agricultural Extension (DAE) Contacts Service for KrishiBondhu.
 * Sourced directly from official Bangladesh Government portals:
 * - DAE Headquarters, Khamarbari, Dhaka (dae.gov.bd / moa.gov.bd)
 * - Office of the Deputy Director, DAE Chattogram (dae.chittagong.gov.bd)
 * - Office of the Deputy Director, DAE Cumilla (dae.comilla.gov.bd)
 * - National Agricultural Call Center (16123 - Krishi Call Center)
 *
 * Enforces zero-fabrication: Never invents numbers, emails, or officer personnel details.
 */

export const NATIONAL_AGRICULTURAL_SUPPORT = {
  officeNameEn: "Department of Agricultural Extension (DAE) - Central Headquarters",
  officeNameBn: "কৃষি সম্প্রসারণ অধিদপ্তর (ডিএই) - প্রধান কার্যালয়",
  ministryEn: "Ministry of Agriculture, Government of the People's Republic of Bangladesh",
  ministryBn: "কৃষি মন্ত্রণালয়, গণপ্রজাতন্ত্রী বাংলাদেশ সরকার",
  addressEn: "Khamarbari, Farmgate, Dhaka-1215, Bangladesh",
  addressBn: "খামারবাড়ি, ফার্মগেট, ঢাকা-১২১৫, বাংলাদেশ",
  phone: "+880-2-55028370, +880-2-55028369",
  hotline: "16123",
  hotlineLabelEn: "Krishi Call Center (Toll-Free / Standard Call)",
  hotlineLabelBn: "কৃষক বন্ধু সেবা ও কৃষি কল সেন্টার",
  email: "info@dae.gov.bd",
  website: "http://dae.gov.bd",
  operatingHoursEn: "Sunday - Thursday: 9:00 AM - 5:00 PM (Govt. working days)",
  operatingHoursBn: "রবিবার - বৃহস্পতিবার: সকাল ৯:০০ - বিকাল ৫:০০ (সরকারি কর্মদিবস)",
  source: "http://dae.gov.bd",
};

export const DISTRICT_DAE_OFFICES = {
  chattogram: {
    districtCode: "chattogram",
    districtNameEn: "Chattogram",
    districtNameBn: "চট্টগ্রাম",
    officeNameEn: "Office of the Deputy Director, Department of Agricultural Extension, Chattogram",
    officeNameBn: "উপপরিচালকের কার্যালয়, কৃষি সম্প্রসারণ অধিদপ্তর, চট্টগ্রাম",
    addressEn: "Khamarbari, Agrabad C/A, Chattogram, Bangladesh",
    addressBn: "খামারবাড়ি, আগ্রাবাদ বাণিজ্যিক এলাকা, চট্টগ্রাম",
    phone: "02334419299",
    email: "ddctg2015@gmail.com",
    website: "https://dae.chittagong.gov.bd",
    hotline: "16123",
    servicesEn: [
      "Crop production planning & monitoring",
      "Pest & disease emergency response",
      "Fertilizer & seed quality oversight",
      "Agricultural technology demonstration",
    ],
    servicesBn: [
      "ফসল উৎপাদন পরিকল্পনা ও বাস্তবায়ন",
      "বালাই ও রোগবালাই প্রতিরোধ সহায়তা",
      "সার ও বীজের মান পর্যবেক্ষণ",
      "উন্নত কৃষি প্রযুক্তি সম্প্রসারণ",
    ],
    source: "https://dae.chittagong.gov.bd",
  },
  cumilla: {
    districtCode: "cumilla",
    districtNameEn: "Cumilla",
    districtNameBn: "কুমিল্লা",
    officeNameEn: "Office of the Deputy Director, Department of Agricultural Extension, Cumilla",
    officeNameBn: "উপপরিচালকের কার্যালয়, কৃষি সম্প্রসারণ অধিদপ্তর, কুমিল্লা",
    addressEn: "Khamarbari, Cumilla, Bangladesh",
    addressBn: "খামারবাড়ি, কুমিল্লা",
    phone: "+880-2334436896",
    email: "ddcomilla.dae@gmail.com",
    website: "http://dae.comilla.gov.bd",
    hotline: "16123",
    servicesEn: [
      "Seasonal crop acreage planning",
      "Soil fertility management guidance",
      "Irrigation & drainage coordination",
      "Upazila agriculture extension oversight",
    ],
    servicesBn: [
      "মৌসুমি ফসল চাষাবাদ পরিকল্পনা",
      "মাটির উর্বরতা ও সার সুপারিশ",
      "সেচ ও নিষ্কাশন ব্যবস্থাপনা",
      "উপজেলা কৃষি সম্প্রসারণ কার্যক্রম তদারকি",
    ],
    source: "http://dae.comilla.gov.bd",
  },
};

export const VERIFIED_UPAZILA_OFFICES = {
  hathazari: {
    districtCode: "chattogram",
    upazilaCode: "hathazari",
    upazilaNameEn: "Hathazari",
    upazilaNameBn: "হাটহাজারী",
    officeNameEn: "Upazila Agriculture Officer's Office, Hathazari",
    officeNameBn: "উপজেলা কৃষি কর্মকর্তার কার্যালয়, হাটহাজারী",
    addressEn: "Upazila Parishad Complex, Hathazari Bus Station, Hathazari, Chattogram",
    addressBn: "উপজেলা পরিষদ চত্বর, বাস স্টেশন, হাটহাজারী, চট্টগ্রাম",
    phone: "031-2601095",
    mobileOfficial: "+880 1700-715656",
    email: "uaohathazari@dae.gov.bd",
    website: "https://hathazari.chittagong.gov.bd",
    verified: true,
  },
  sitakunda: {
    districtCode: "chattogram",
    upazilaCode: "sitakunda",
    upazilaNameEn: "Sitakunda",
    upazilaNameBn: "সীতাকুণ্ড",
    officeNameEn: "Upazila Agriculture Officer's Office, Sitakunda",
    officeNameBn: "উপজেলা কৃষি কর্মকর্তার কার্যালয়, সীতাকুণ্ড",
    addressEn: "Upazila Parishad Complex, Sitakunda, Chattogram",
    addressBn: "উপজেলা পরিষদ চত্বর, সীতাকুণ্ড, চট্টগ্রাম",
    phone: "02334456334",
    email: "uaositadae@gmail.com",
    website: "https://sitakunda.chittagong.gov.bd",
    verified: true,
  },
  adarsha_sadar: {
    districtCode: "cumilla",
    upazilaCode: "adarsha_sadar",
    upazilaNameEn: "Adarsha Sadar",
    upazilaNameBn: "আদর্শ সদর",
    officeNameEn: "Upazila Agriculture Office, Cumilla Adarsha Sadar",
    officeNameBn: "উপজেলা কৃষি অফিস, আদর্শ সদর, কুমিল্লা",
    addressEn: "Ground Floor, Upazila Parishad Complex, Cumilla Adarsha Sadar, Cumilla",
    addressBn: "নিচতলা, উপজেলা পরিষদ চত্বর, আদর্শ সদর, কুমিল্লা",
    phone: "+880 2 334405464",
    mobileOfficial: "+880 1700-715665",
    email: "uaoadarsasadarcomilla@gmail.com",
    website: "https://dae.comillasadar.comilla.gov.bd",
    verified: true,
  },
  chandina: {
    districtCode: "cumilla",
    upazilaCode: "chandina",
    upazilaNameEn: "Chandina",
    upazilaNameBn: "চান্দিনা",
    officeNameEn: "Upazila Agriculture Officer's Office, Chandina",
    officeNameBn: "উপজেলা কৃষি কর্মকর্তার কার্যালয়, চান্দিনা",
    addressEn: "Ground Floor (North Side), Upazila Parishad Complex, Chandina, Cumilla",
    addressBn: "নিচতলা (উত্তর পাশ), উপজেলা পরিষদ চত্বর, চান্দিনা, কুমিল্লা",
    phone: "02-334408620",
    mobileOfficial: "+880 1700-715659",
    email: "uao.chandina@gmail.com",
    website: "https://dae.chandina.comilla.gov.bd",
    verified: true,
  },
};

export function getAgriSupportContacts(districtCode, upazilaCodeOrName = "") {
  const normDistrict = String(districtCode || "").trim().toLowerCase();
  const districtOffice = DISTRICT_DAE_OFFICES[normDistrict] || null;

  let upazilaOffice = null;
  const normUpazila = String(upazilaCodeOrName || "").trim().toLowerCase().replace(/\s+/g, "_");

  if (normUpazila) {
    if (VERIFIED_UPAZILA_OFFICES[normUpazila]) {
      upazilaOffice = VERIFIED_UPAZILA_OFFICES[normUpazila];
    } else {
      const match = Object.values(VERIFIED_UPAZILA_OFFICES).find(
        (o) =>
          o.districtCode === normDistrict &&
          (o.upazilaCode === normUpazila ||
            o.upazilaNameEn.toLowerCase() === upazilaCodeOrName.trim().toLowerCase() ||
            o.upazilaNameBn === upazilaCodeOrName.trim())
      );
      if (match) upazilaOffice = match;
    }
  }

  return {
    national: NATIONAL_AGRICULTURAL_SUPPORT,
    district: districtOffice,
    upazila: upazilaOffice,
    isUpazilaVerified: Boolean(upazilaOffice && upazilaOffice.verified),
  };
}
