const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Login only displays fixed OAuth errors and never reflects query message text", () => {
  const login = read("app/login/page.js");
  assert.doesNotMatch(login, /searchParams\.get\(["']message["']\)/);
  assert.doesNotMatch(login, /messageParam/);
  assert.match(login, /const cleanGoogleError = t\(["']auth\.googleAuthFailed["']\)/);
  assert.match(login, /safeReturnTo\(searchParams\.get\(["']redirect["']\)\)/);
});

test("Google sign-in keeps the GIS flow and offers the configured backend OAuth redirect as fallback", () => {
  const button = read("components/auth/GoogleSignInButton.js");
  const login = read("app/login/page.js");
  const register = read("app/register/page.js");
  assert.match(button, /verifyGoogleIdTokenDirect/);
  assert.match(button, /getGoogleAuthEndpoint\(\)/);
  assert.match(button, /AUTH_RETURN_KEY/);
  assert.match(button, /scriptLoadTimer/);
  assert.match(button, /alternate sign-in option/);
  assert.match(login, /redirectTo=\{returnTo\}/);
  assert.match(login, /redirectLabel=\{t\("auth\.googleRedirectFallback"\)\}/);
  assert.match(register, /redirectLabel=\{t\("auth\.googleRedirectFallback"\)\}/);
  assert.match(register, /redirectTo=\{safeReturnTo\(typeof window === "undefined" \? null/);
});

test("Profile settings only expose current persisted preferences and existing account actions", () => {
  const settings = read("app/(app)/settings/page.js");
  assert.match(settings, /updateProfile\(\{ name: nextName \}\)/);
  assert.match(settings, /setSelectedDistrict\(event\.target\.value\)/);
  assert.match(settings, /setLocale\("bn"\)/);
  assert.match(settings, /setTheme\("dark"\)/);
  assert.match(settings, /requestPhoneVerification\(\)/);
  assert.match(settings, /confirmPhoneVerification\(verificationCode\)/);
  assert.match(settings, /updateProfile\(\{ smsAlertsEnabled: next \}\)/);
  assert.match(settings, /await logout\(\)/);
  assert.match(settings, /aria-label=\{bn \? "লগআউট নিশ্চিত করুন" : "Confirm sign out"\}/);
  assert.doesNotMatch(settings, /changePassword|deleteAccount|resetPassword/);
});

test("Assistant retains the real chat and voice services with a mobile-safe composer", () => {
  const assistant = read("app/(app)/assistant/page.js");
  assert.match(assistant, /sendAssistantMessage/);
  assert.match(assistant, /useVoiceInput/);
  assert.match(assistant, /useVoiceOutput/);
  assert.match(assistant, /fetchAssistantConversation/);
  assert.match(assistant, /createSavedAdvisory/);
  assert.match(assistant, /pb-\[calc\(env\(safe-area-inset-bottom\)\+1rem\)\]/);
  assert.match(assistant, /min-h-11 min-w-11/);
});

test("Administrative pages preserve role checks and truthful status/import safeguards", () => {
  const officer = read("app/(app)/officer/reviews/page.js");
  const marketAdmin = read("app/(public-data)/market-import/page.js");
  assert.match(officer, /user\?\.role === "extension_officer" \|\| user\?\.role === "admin"/);
  assert.match(officer, /fetchOfficerReviewQueue\(status\)/);
  assert.match(officer, /respondToOfficerReview\(id/);
  assert.match(marketAdmin, /user\?\.role !== "admin"/);
  assert.match(marketAdmin, /fetchMarketPriceDataStatus\(\)/);
  assert.match(marketAdmin, /Import history is unavailable/);
  assert.match(marketAdmin, /!preview\?\.records\?\.length \|\| !humanVerified/);
});
