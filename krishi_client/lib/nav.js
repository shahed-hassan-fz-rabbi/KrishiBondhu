/** Central navigation config shared by the sidebar, topbar, and landing CTAs. */
export const appNav = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/my-farm", key: "nav.myFarm" },
  { href: "/market", key: "publicHeader.market" },
  { href: "/marketplace/my-listings", key: "nav.marketplaceListings", roles: ["farmer"] },
  { href: "/settings#sms-alerts-heading", key: "nav.smsAlerts", roles: ["farmer"] },
  { href: "/rotation-planner", key: "publicHeader.cropRotation" },
  { href: "/assistant", key: "nav.assistant" },
  { href: "/handoff", key: "nav.handoff" },
  { href: "/climate", key: "publicHeader.climateData" },
  { href: "/map", key: "nav.map" },
  { href: "/crop-calendar", key: "nav.cropCalendar" },
  { href: "/data-sources", key: "nav.dataSources" },
  { href: "/my-farm/reviews", key: "nav.myReviews", roles: ["farmer"] },
  { href: "/officer/reviews", key: "nav.officerReviews", roles: ["extension_officer", "admin"] },
];

/** Sidebar groups keep the existing route list and role rules as the source of truth. */
export const appNavGroups = [
  { key: "Work", keyBn: "কাজ", hrefs: ["/dashboard", "/my-farm", "/assistant", "/market", "/marketplace/my-listings", "/settings#sms-alerts-heading", "/my-farm/reviews", "/officer/reviews"] },
  { key: "Plan", keyBn: "পরিকল্পনা", hrefs: ["/crop-calendar", "/rotation-planner", "/handoff"] },
  { key: "Field", keyBn: "মাঠ", hrefs: ["/climate", "/map"] },
  { key: "Data & evidence", keyBn: "তথ্য ও প্রমাণ", hrefs: ["/data-sources"] },
];
