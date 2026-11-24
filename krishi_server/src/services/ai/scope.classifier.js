const AGRICULTURE_TERMS = /\b(?:agri(?:culture|cultural|tech)?|farm(?:er|ers|ing)?|crop(?:s|ping)?|cultivat(?:e|ion|ing)|plant(?:s|ing)?|seed(?:s|ling)?|harvest(?:ing)?|yield|soil|fertili[sz]er|manure|compost|irrigat(?:e|ion)|pest(?:s)?|aphid(?:s)?|mite(?:s)?|caterpillar(?:s)?|disease(?:s)?|weed(?:s|ing)?|fung(?:us|al)|blight|livestock|poultry|fish(?:ery|eries|ing)?|orchard|greenhouse|agronom(?:y|ic)|field|rice|paddy|wheat|maize|corn|tomato(?:es)?|potato(?:es)?|mango(?:es)?|banana(?:s)?|vegetable|fruit|weather|climate|rain(?:fall)?|drought|flood|temperature|humidity|forecast|market price|crop price|bazar|dam price|ndvi|evi|smap|gpm|modis|vegetation|canopy|greenness|nasa power|crop calendar|rotation planner|my farm|my farms|soil moisture|farm activity|spray(?:ing)?|pesticide|fungicide|mulch|water loss|water use|transplant(?:ing)?|sow(?:ing)?|tillage|tractor|agroforestry|aquaculture|cattle|cow|goat|duck|chicken|fish pond|leaf|leaves)\b|কৃষি|কৃষক|খামার|চাষ|ফসল|ধান|বোরো|আমন|আউশ|গম|ভুট্টা|আলু|বেগুন|টমেটো|মরিচ|সরিষা|শাক|সবজি|ফল|বীজ|চারা|রোপণ|বপন|কাটা|ফলন|জমি|মাঠ|মাটি|সার|কম্পোস্ট|জৈব|সেচ|পানি|জলাবদ্ধ|খরা|বন্যা|বৃষ্টি|আবহাওয়া|আবহাওয়া|জলবায়ু|জলবায়ু|তাপমাত্রা|আর্দ্রতা|রোগ|পোকা|কীট|আগাছা|পাতা|শিকড়|মূল|কাণ্ড|ছত্রাক|ভাইরাস|কীটনাশক|ছত্রাকনাশক|আগাছানাশক|বাজারদর|বাজারের দাম|ফসলের দাম|কৃষিপণ্য|গবাদি|গরু|ছাগল|হাঁস|মুরগি|মাছচাষ|পুকুর|যন্ত্র|ট্রাক্টর|মালচ|মালচিং|চাষাবাদ|ফসলচক্র|পঞ্জিকা|কৃষি প্রযুক্তি|মৌমাছি|পরাগায়ন|পরাগায়ন|পশুপালন|সবুজতা|গাছপালা|উদ্ভিদ|মোডিস|ধানের|ফসলের|মাটির|সারের|সেচের|কৃষির|chash|chashi|krishi|krishok|khamar|foshol|fosol|dhan|boro|aman|aus|shorisha|sarisha|mati|jomi|khet|bij|chara|ropon|bopon|poka|rog|sar|shar|shech|sech|pani|bristi|brishti|abohawa|folon|alu|begun|morich|shobji|goru|chagol|murgi|hasher|machchash/i;

const VAGUE_MESSAGE = /^(?:কিছু বলো|কিছু বলেন|বলুন|কি বলো|কী বলো|help me|help|tell me something|say something|what can you do|how can you help|hi|hello|hey|সালাম|আসসালামু আলাইকুম|নমস্কার)[.!?\s।]*$/i;
const GREETING = /^(?:hi|hello|hey|সালাম|আসসালামু আলাইকুম|নমস্কার)[.!?\s।]*$/i;
const PLATFORM_HELP = /\b(?:website|web site|site|app|page|feature|menu|sidebar|dashboard|crop rotation|rotation planner|handoff|crop calendar|data sources|settings|login|register|sign in|how to use|where can i find|my farms?|my profile|my activities|my (?:crop )?plans?|my notifications?|previous chats?|past conversations?|what do you remember|what do you know about me|what information do you have about me)\b|ওয়েবসাইট|ওয়েবসাইট|সাইট|পেজ|ফিচার|মেনু|সাইডবার|ড্যাশবোর্ড|আমার (?:খামার|প্রোফাইল|তথ্য|কাজ|পরিকল্পনা|চ্যাট)|কীভাবে ব্যবহার|কিভাবে ব্যবহার|কোথায় পাব|কোথায় পাব/i;

export function isAgricultureRelatedMessage(message) {
  return typeof message === "string" && AGRICULTURE_TERMS.test(message);
}

export function classifyAssistantScope(message, history = []) {
  const text = String(message || "").trim();
  if (isAgricultureRelatedMessage(text)) return "agriculture";
  if (PLATFORM_HELP.test(text)) return "platform";
  if (GREETING.test(text)) return "greeting";
  if (VAGUE_MESSAGE.test(text)) return "clarification";

  const recentAgriculture = Array.isArray(history) && history.slice(-6).some((turn) => {
    const content = turn?.content || turn?.parts?.map((part) => part.text || "").join(" ") || "";
    return turn?.role === "user" && isAgricultureRelatedMessage(content);
  });
  if (recentAgriculture && text.length <= 100 && /^(?:and\b|then\b|what about\b|why\b|how about\b|আর(?:\s|$)|তাহলে|এরপর|এখন|এটা|ওটা)/i.test(text)) return "agriculture";
  return "out_of_scope";
}

export function requiresVerifiedDistrict(message) {
  return /\b(?:weather forecast|forecast|outlook|rainfall|historical rainfall|climate|temperature|humidity|soil moisture|ndvi|evi|smap|gpm|nasa power|market price|crop price|price of|market rate|crop calendar|planting (?:calendar|period|season)|sowing (?:window|period|season)|weather alert|agricultural risk|local recommendation|district-specific|soil suitability|crop suitability)\b|আবহাওয়া|আবহাওয়া|পূর্বাভাস|আউটলুক|বৃষ্টিপাত|বৃষ্টি|জলবায়ু|জলবায়ু|তাপমাত্রা|আর্দ্রতা|মাটির আর্দ্রতা|বাজারদর|বাজারের দাম|ফসলের দাম|দাম কত|কত দাম|পঞ্জিকা|বপনের সময়|রোপণের সময়|সেচের সময়|মাটির উপযোগিতা|ফসলের উপযোগিতা/i.test(String(message || ""));
}
