const BENGALI_SOWING_PERIODS = {
  "Late June to Early July (Mid Asharh)": "জুনের শেষ থেকে জুলাইয়ের শুরু (মধ্য আষাঢ়)",
  "Early July to Mid July (Late Asharh)": "জুলাইয়ের শুরু থেকে মাঝামাঝি (শেষ আষাঢ়)",
  "Mid November to Early December (Agrahayan)": "নভেম্বরের মাঝামাঝি থেকে ডিসেম্বরের শুরু (অগ্রহায়ণ)",
  "Late November to Mid December (Agrahayan)": "নভেম্বরের শেষ থেকে ডিসেম্বরের মাঝামাঝি (অগ্রহায়ণ)",
  "Mid March to Mid April (Chaitra-Baishakh)": "মার্চের মাঝামাঝি থেকে এপ্রিলের মাঝামাঝি (চৈত্র-বৈশাখ)",
  "Late March to Mid April (Chaitra-Baishakh)": "মার্চের শেষ থেকে এপ্রিলের মাঝামাঝি (চৈত্র-বৈশাখ)",
  "Early November to Mid November (Kartik)": "নভেম্বরের শুরু থেকে মাঝামাঝি (কার্তিক)",
  "Late November to Early December (Agrahayan)": "নভেম্বরের শেষ থেকে ডিসেম্বরের শুরু (অগ্রহায়ণ)",
};

export function localizeSowingPeriod(period, lang) {
  if (lang !== "bn" || !period) return period;
  return BENGALI_SOWING_PERIODS[period] || "সরকারি ক্যালেন্ডারে উল্লেখিত বপনের সময়";
}

export function localizeCropPlanningMessage(message, crop, lang) {
  if (lang !== "bn") return message;

  const season = crop?.seasonBn || "নির্ধারিত";
  const period = localizeSowingPeriod(crop?.sowingPeriod, lang);
  const water = crop?.waterRequirementMmTotal ?? "—";
  const code = crop?.cropCode;

  if (message.startsWith("Aligned with official ")) {
    return `${season} মৌসুমের সরকারি ক্যালেন্ডারের সঙ্গে মেলে। বপনের সময়: ${period}।`;
  }
  if (message.startsWith("Crop is traditionally cultivated in ")) {
    return `এই ফসল সাধারণত ${season} মৌসুমে (${period}) চাষ করা হয়, যা আপনার পছন্দের মৌসুমের সঙ্গে মেলে না।`;
  }
  if (message === "Direct match for farmer's crop interest.") return "আপনার পছন্দের ফসলের সঙ্গে মেলে।";
  if (message.startsWith("Boro rice requires high cumulative irrigation")) {
    return `শুষ্ক রবি মৌসুমে বোরো ধানে মোট প্রায় ${water} মিমি সেচের পানি লাগে। নিশ্চিত সেচ না থাকলে শুধু বৃষ্টির পানিতে চাষে ফসল নষ্ট হওয়ার ঝুঁকি আছে।`;
  }
  if (message.startsWith("Requires careful Alternate Wetting and Drying")) {
    return `সেচের পানি সীমিত হওয়ায় বোরো ধানে পালাক্রমে ভেজানো ও শুকানোর (AWD) পদ্ধতিতে সতর্কভাবে পানি ব্যবস্থাপনা দরকার (প্রায় ${water} মিমি)।`;
  }
  if (message.startsWith("Assured irrigation meets")) return `নিশ্চিত সেচের ব্যবস্থা বোরোর শুষ্ক মৌসুমের ${water} মিমি পানির চাহিদা পূরণ করে।`;
  if (message.startsWith("Irrigation availability is unknown, so Boro")) return "সেচের পানির প্রাপ্যতা জানা নেই, তাই দেওয়া তথ্য থেকে বোরো ধানের পানির ব্যবস্থা যাচাই করা যাচ্ছে না।";
  if (message.startsWith("Low moisture requirement")) return `সরিষার পানির চাহিদা কম (প্রায় ${water} মিমি)। জমিতে থাকা অবশিষ্ট আর্দ্রতা ও ১–২ বার হালকা সেচে চাষ করা যেতে পারে।`;
  if (message.startsWith("Irrigation availability is unknown; residual soil moisture")) return "সেচের পানির প্রাপ্যতা জানা নেই। জমির অবশিষ্ট আর্দ্রতা ও প্রয়োজনে সেচের ব্যবস্থা স্থানীয়ভাবে যাচাই করুন।";
  if (message.startsWith("Can be cultivated with residual soil moisture")) return `আমন ধান কাটার পর জমিতে থাকা আর্দ্রতায় সরিষা চাষ করা যেতে পারে (মোট পানির চাহিদা প্রায় ${water} মিমি)।`;
  if (message.startsWith("Primary monsoon-fed crop")) return "খরিফ-২ মৌসুমের এই প্রধান ফসল বৃষ্টিনির্ভর; এলাকার বর্ষার বৃষ্টি সাধারণত চাষে সহায়তা করে।";
  if (message.startsWith("Monsoon rainfall supported with supplemental irrigation")) return "কুশি গঠন বা শীষ বের হওয়ার সময় বৃষ্টি কম হলে অতিরিক্ত সেচ দিয়ে আমন ধানের চাষে সহায়তা করা যায়।";
  if (message.startsWith("Moderate water requirement")) return `খরিফ-১ মৌসুমে আউশ ধানের পানির চাহিদা মাঝারি (প্রায় ${water} মিমি)।`;
  if (message.startsWith("Lowland is prone to deep monsoon submergence")) return "নিচু জমি বর্ষায় ৫০ সেন্টিমিটারের বেশি পানিতে ডুবে যেতে পারে। চারা নষ্ট হওয়া ঠেকাতে বন্যা-সহনশীল জাত (যেমন BRRI dhan51/52) বেছে নিন।";
  if (message.startsWith("Lowland is well-suited for Boro rice")) return "শীতের শুরুতে উপরিভাগের বন্যার পানি নেমে যাওয়ায় নিচু জমি বোরো ধানের জন্য উপযোগী হতে পারে।";
  if (message.startsWith("Lowland may stay waterlogged after monsoon")) return "বর্ষার পর নিচু জমিতে পানি জমে থাকতে পারে। সরিষার বীজ পচা এড়াতে সময়মতো পানি নিষ্কাশন দরকার।";
  if (message.startsWith("High to medium-high land provides good drainage")) return "উঁচু ও মাঝারি-উঁচু জমিতে পানি ভালোভাবে নেমে যায়, যা সরিষার শিকড়ের বাতাস চলাচল ও বীজ গজানোর জন্য দরকারি।";
  if (message.startsWith("Medium-high land is prime")) return "নিয়ন্ত্রিত আইলসহ রোপা আমন ধানের জন্য মাঝারি-উঁচু জমি উপযোগী।";
  if (message.startsWith("Waterlogged drainage is detrimental to mustard")) return "জমিতে পানি জমে থাকলে সরিষার চারা গজানো বাধাগ্রস্ত হয়। উঁচু বেড তৈরি বা নালা কেটে পানি নিষ্কাশন করুন।";
  if (message.startsWith("Selected planting date falls within")) return `আপনার বেছে নেওয়া রোপণের তারিখ সরকারি বপন-সময়ের মধ্যে: ${period}।`;
  if (message.startsWith("Selected planting date is outside")) return `আপনার বেছে নেওয়া রোপণের তারিখ সরকারি বপন-সময়ের বাইরে। উপযুক্ত সময় ${period}; স্থানীয় কৃষি কর্মকর্তার সঙ্গে মিলিয়ে নিন।`;
  if (message.startsWith("The official sowing window could not be compared")) return "সরকারি বপন-সময়ের সঙ্গে আপনার তারিখের তুলনা করা যায়নি। স্থানীয় কৃষি কর্মকর্তার সঙ্গে সময়টি যাচাই করুন।";

  // Keep future server messages in the selected language instead of leaking English text.
  return code === "mustard"
    ? "সরিষার উপযোগিতা ও চাষের সময় স্থানীয় কৃষি কর্মকর্তার সঙ্গে যাচাই করুন।"
    : "এই ফসলের উপযোগিতা ও চাষের সময় স্থানীয় কৃষি কর্মকর্তার সঙ্গে যাচাই করুন।";
}
