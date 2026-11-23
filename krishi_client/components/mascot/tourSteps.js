export const BONDHU_TOUR_STEPS = Object.freeze([
  { id: "home", route: "/", target: "home.hero", requiresAuth: false, en: "Start here to find the main field services.", bn: "এখান থেকে কৃষির প্রয়োজনীয় সেবাগুলো খুঁজুন।" },
  { id: "dashboard", route: "/dashboard", target: "dashboard.overview", requiresAuth: false, en: "See your district and the latest available field information here.", bn: "এখানে আপনার জেলা ও পাওয়া কৃষি তথ্য দেখুন।" },
  { id: "market", route: "/market", target: "market.overview", requiresAuth: false, en: "Review market reports with their dates and source details.", bn: "তারিখ ও উৎসসহ বাজারের রিপোর্ট দেখুন।" },
  { id: "weather", route: "/climate", target: "weather.overview", requiresAuth: false, en: "Choose a district to review weather and climate information.", bn: "জেলা বেছে আবহাওয়া ও জলবায়ুর তথ্য দেখুন।" },
  { id: "planning", route: "/crop-rotation", target: "planning.rotation", requiresAuth: false, en: "Compare crop choices using your land and season details.", bn: "জমি ও মৌসুমের তথ্য দিয়ে ফসলের তুলনা করুন।" },
  { id: "map", route: "/map", target: "map.overview", requiresAuth: true, en: "Explore the agricultural map after signing in.", bn: "সাইন ইন করে কৃষি মানচিত্র দেখুন।" },
  { id: "farm", route: "/my-farm", target: "farm.overview", requiresAuth: true, en: "Add your field and keep its crop work together.", bn: "আপনার মাঠ যোগ করে কাজের তথ্য রাখুন।" },
  { id: "assistant", route: "/assistant", target: "assistant.overview", requiresAuth: true, en: "Ask the existing field assistant in Bangla or English.", bn: "বিদ্যমান কৃষি সহকারীকে বাংলায় বা ইংরেজিতে প্রশ্ন করুন।" },
]);

export function getTourStepIndexForRoute(route, steps = BONDHU_TOUR_STEPS) {
  return steps.findIndex((step) => route === step.route || (step.route !== "/" && route?.startsWith(`${step.route}/`)));
}

export function findEligibleTourStepIndex(startIndex, isAuthenticated, steps = BONDHU_TOUR_STEPS, direction = 1) {
  for (let index = startIndex; index >= 0 && index < steps.length; index += direction) {
    if (!steps[index].requiresAuth || isAuthenticated) return index;
  }
  return -1;
}

export function normalizeTourProgress(value, stepCount = BONDHU_TOUR_STEPS.length) {
  if (!Number.isInteger(value)) return 0;
  return Math.max(0, Math.min(Math.max(0, stepCount - 1), value));
}
