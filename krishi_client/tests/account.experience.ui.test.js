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
  // SMS preferences now come from the dedicated subscription API component.
  assert.match(settings, /<SmsAlertsSettings \/>/);
  assert.doesNotMatch(settings, /updateProfile\(\{ smsAlertsEnabled: next \}\)/);
  assert.match(settings, /await logout\(\)/);
  assert.match(settings, /aria-label=\{bn \? "লগআউট নিশ্চিত করুন" : "Confirm sign out"\}/);
  assert.match(settings, /changePassword\(currentPassword, newPassword\)/);
  assert.match(settings, /data-bondhu-no-fly/g);
  assert.match(settings, /updateProfile\(\{ avatarUrl: dataUrl \}\)/);
  assert.doesNotMatch(settings, /deleteAccount|resetPassword/);
});

test("Assistant retains the real chat and voice services with a mobile-safe composer", () => {
  const assistant = read("app/(app)/assistant/page.js");
  assert.match(assistant, /sendAssistantMessage/);
  assert.match(assistant, /useVoiceInput/);
  assert.match(assistant, /useVoiceOutput/);
  assert.match(assistant, /fetchAssistantConversation/);
  assert.match(assistant, /createSavedAdvisory/);
  assert.match(assistant, /pb-\[calc\(env\(safe-area-inset-bottom\)\+0\.5rem\)\]/);
  assert.match(assistant, /min-h-11 min-w-11/);
});

test("Assistant guest gate explains the service and keeps chat private behind login", () => {
  const access = read("components/auth/PrivateAccess.js");
  const loading = read("components/assistant/AssistantLoadingState.js");
  assert.match(access, /isAssistant/);
  assert.match(access, /\/login\?redirect=\$\{encodeURIComponent\(pathname\)\}/);
  assert.match(access, /\/register\?redirect=\$\{encodeURIComponent\(pathname\)\}/);
  assert.match(access, /assistantFeatures/);
  assert.match(access, /assistantPrivacyBody/);
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-busy="true"/);
});

test("Assistant reserves the application shell space and keeps the composer in its flex layout", () => {
  const assistant = read("app/(app)/assistant/page.js");
  assert.match(assistant, /h-\[calc\(100dvh-13\.5rem\)\].*lg:h-\[calc\(100dvh-7\.75rem\)\]/);
  assert.match(assistant, /flex min-h-0 w-full flex-1 flex-col overflow-hidden/);
  assert.match(assistant, /shrink-0 bg-transparent px-3 pb-\[calc\(env\(safe-area-inset-bottom\)\+0\.5rem\)\]/);
  assert.doesNotMatch(assistant, /sticky bottom-0 bg-gradient-to-r/);
  assert.match(assistant, /assistant\.headerDescription/);
  assert.match(assistant, /assistant\.contextLabel/);
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
