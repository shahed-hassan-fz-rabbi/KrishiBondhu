import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { translations } from "../lib/i18n/translations.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("public footer explores existing pages and localizes the new project content", () => {
  const chrome = read("../components/layout/PublicChrome.js");
  const footer = chrome.slice(chrome.indexOf("export function PublicFooter"));
  for (const [href, key, page] of [
    ["/", "common.home", "../app/page.js"],
    ["/crop-rotation", "publicHeader.cropRotation", "../app/crop-rotation/page.js"],
    ["/climate", "publicHeader.climateData", "../app/(public-data)/climate/page.js"],
    ["/#how-it-works", "common.howItWorks", "../app/page.js"],
    ["/#about", "common.about", "../app/page.js"],
  ]) {
    assert.ok(chrome.includes(`{ href: "${href}", key: "${key}" }`));
    assert.ok(read(page).length > 0);
    for (const lang of ["en", "bn"]) assert.ok(key.split(".").reduce((value, part) => value[part], translations[lang]));
  }
  assert.ok(read("../app/page.js").includes('id="about"'));
  assert.ok(footer.includes('<BrandMark tone="dark" />'));
  assert.ok(footer.includes('xl:grid-cols-[minmax(0,1fr)_auto]'));
  assert.doesNotMatch(footer, /footer\.(features|account|platform)|landing\.footerRights|t\("tagline"\)/);
  assert.doesNotMatch(footer, /GITHUB_REPO_URL|footer\.(team|github|githubPlaceholder)/);
  assert.ok(read("../lib/config.js").includes('GITHUB_REPO_URL = ""'));
  for (const lang of ["en", "bn"]) {
    for (const key of ["tagline", "explore", "project", "team", "github", "githubPlaceholder", "dataFromNasa", "planningNote", "copyright"]) {
      assert.ok(translations[lang].footer[key], `${lang} footer ${key}`);
    }
  }
});

test("home page describes real farmer workflows in both locales", () => {
  for (const locale of ["en", "bn"]) {
    const landing = translations[locale].landing;
    for (const key of ["featureEvidenceDesc", "step2Desc", "step3Desc", "step4Desc", "sectionData", "sectionAboutBody"]) {
      assert.equal(typeof landing[key], "string", `${locale}.landing.${key}`);
      assert.ok(landing[key].length > 0, `${locale}.landing.${key}`);
    }
  }
  assert.match(translations.en.landing.featureRainfallDesc, /market reports/i);
  assert.match(translations.en.landing.featureTempDesc, /crop sequences/i);
  assert.match(translations.bn.landing.featureRainfallDesc, /বাজার প্রতিবেদন/);
  assert.match(translations.bn.landing.featureTempDesc, /ফসল পর্যায়ক্রম/);
  assert.match(translations.en.landing.sectionAboutBody, /independent agricultural application/i);
  assert.match(translations.bn.landing.sectionAboutBody, /স্বতন্ত্র কৃষি অ্যাপ/);
});

test("homepage satellite availability is read from the environmental data catalog", () => {
  const page = read("../app/page.js");
  assert.match(page, /fetchDataSources\(\)/);
  assert.match(page, /const getSourceStatus = \(datasetKey\)/);
  for (const datasetKey of ["nasa:smap:spl3smp_e:v006", "nasa:gpm:imerg:3imerghh:v07", "nasa:modis:mod13q1:v061"]) {
    assert.ok(page.includes(datasetKey), `${datasetKey} availability is displayed`);
  }
  assert.match(page, /historical observations/);
  assert.doesNotMatch(page, /statusPlanned/);
});

test("homepage POWER coverage is sourced and disclosed as historical data", () => {
  const page = read("../app/page.js");
  assert.match(page, /datasetKey === "nasa:power:daily:point"/);
  assert.match(page, /Number\.isFinite\(powerApiSource\?\.validObservationCount\)/);
  assert.match(page, /firstObservationDate/);
  assert.match(page, /lastObservationDate/);
  assert.match(page, /Historical climate reference/);
  assert.match(page, /Historical daily observations/);
  assert.match(page, /Historical data unavailable/);
  assert.doesNotMatch(page, /109\s*,?\s*572|Live daily observations|Live & Available|25-Year NASA baseline/);
});

test("farmer-first hero introduces Mini and links to real market and planning tools", () => {
  const page = read("../app/page.js");
  assert.match(page, /kb-story-hero|kb-hero2/);
  assert.doesNotMatch(page, /function FarmCat/);
  assert.match(read("../components/MiniGuide.js"), /<BondhuMascot/);
  assert.match(page, /href="\/market"/);
  assert.match(page, /href="\/crop-rotation"/);
  assert.match(page, /kb-story-proof|kb-hero2-proof/);
});

test("homepage uses the proposal's seed-to-market message and keeps environment data secondary", () => {
  const page = read("../app/page.js");
  assert.match(page, /From seed to market\.|t\(`landing\.heroHeadlineLine2`\)/);
  assert.match(translations.en.landing.heroHeadlineLine2 || translations.en.landing.heroTitle, /From seed to market\./);
  assert.match(translations.bn.landing.heroHeadlineLine2 || translations.bn.landing.heroTitle, /বীজ থেকে বাজারে/);
  assert.doesNotMatch(page, /NASA International Space Apps|Field Shift|NASA Hackathon/);
  assert.match(translations.en.landing.dataOverview.intro, /Crop planning, market information and farm records are at the heart/);
  assert.match(translations.bn.landing.dataOverview.intro, /ফসল পরিকল্পনা, বাজারের তথ্য ও খামারের হিসাবই কৃষিবন্ধুর মূল সেবা/);
});

test("retired Mati Kohon reference route opens KrishiBondhu instead of a separate branded iframe", () => {
  const route = read("../app/matikohon/page.js");
  assert.match(route, /redirect\("\/"\)/);
  assert.doesNotMatch(route, /iframe|Mati Kohon|NASA/);
});

test("homepage keeps one linked three-step workflow and a single service discovery grid", () => {
  const page = read("../app/page.js");
  assert.match(page, /t\(`landing\.\$\{objKey\}\.title`\)/);
  assert.match(page, /t\(`landing\.\$\{objKey\}\.desc`\)/);
  assert.equal((page.match(/id="features"/g) || []).length, 1);
  assert.equal((page.match(/id="how-it-works"/g) || []).length, 1);
  assert.match(page, /id="how-it-works" aria-labelledby="how-it-works-title"/);
  assert.match(page, /href="\/data-sources" className="kb-flow-link"/);
  assert.match(page, /href="\/crop-rotation" className="kb-flow-link"/);
  assert.match(page, /href="\/assistant" className="kb-flow-link"/);
  assert.doesNotMatch(page, /Rabi 2026|রবি ২০২৬|0\.31 m³\/m³|<5 mm \(Safe\)|25-Season Replay/);
});

test("homepage explains KrishiBondhu as a farmer app, with source limits in both languages", () => {
  const page = read("../app/page.js");
  const layout = read("../app/layout.js");
  assert.ok(page.includes('id="about"'));
  assert.match(layout, /Bangla-first farming companion for Bangladesh/);
  assert.doesNotMatch(page, /NASA International Space Apps|Field Shift|NASA Hackathon/);

  for (const locale of ["en", "bn"]) {
    const landing = translations[locale].landing;
    assert.match(landing.aboutSubtitle, /farmers in Bangladesh|বাংলাদেশের কৃষকের/);
    assert.match(landing.sectionAboutBody, /independent agricultural application|স্বতন্ত্র কৃষি অ্যাপ/);
    assert.match(landing.aboutPillar1Desc, /crop calendars|ফসল ক্যালেন্ডার/);
    assert.match(landing.aboutPillar2Desc, locale === "bn" ? /বাজার প্রতিবেদন/ : /market reports/i);
    assert.match(landing.aboutPillar3Desc, /source|উৎস/);
    const aboutCopy = Object.entries(landing)
      .filter(([key]) => key.startsWith("about") || key === "sectionAboutBody")
      .map(([, value]) => value)
      .filter((value) => typeof value === "string")
      .join(" ");
    assert.doesNotMatch(aboutCopy, /25\+|২৫\+|9,131\+|৯,১৩১\+|100%|১০০%/);
  }
});

test("NASA is attributed as a data source, not used as the product identity", () => {
  for (const locale of ["en", "bn"]) {
    const landing = translations[locale].landing;
    const footer = translations[locale].footer;
    assert.doesNotMatch(footer.description, /NASA|নাসা/i);
    assert.match(landing.aboutSimple.choice, /NASA|নাসা/i);
    assert.match(landing.aboutSimple.choice, /not measurements|সরাসরি মাপ/);
  }
  const chrome = read("../components/layout/PublicChrome.js");
  assert.match(chrome, /Open-Meteo weather/);
  assert.match(chrome, /Satellite context · source and dates shown/);
  assert.doesNotMatch(chrome, /NASA Earthdata|NASA POWER · SMAP · MODIS · GPM/);
});

test("assistant entry points focus on farming and route price outlooks through the existing Python model", () => {
  const assistant = read("../app/(app)/assistant/page.js");
  const prompts = assistant.slice(assistant.indexOf("const QUICK_QUESTIONS"), assistant.indexOf("return (", assistant.indexOf("const QUICK_QUESTIONS")));
  for (const id of ["market-price", "price-outlook", "crop-choice", "planting-window", "rainfall", "soil-water", "farm-tasks"]) {
    assert.match(prompts, new RegExp(`id: "${id}"`));
  }
  assert.doesNotMatch(prompts, /NASA|নাসা|NDVI|SMAP|MODIS/);
  assert.match(prompts, /Python price model/);

  const toolDefinitions = read("../../krishi_server/src/services/ai/tools.definition.js");
  const toolExecutor = read("../../krishi_server/src/services/ai/tools.executor.js");
  assert.match(toolDefinitions, /getMarketPriceReference/);
  assert.match(toolExecutor, /executePythonMarketForecast/);
  assert.match(toolExecutor, /versionedRows\.length >= 180/);
  assert.match(toolExecutor, /ageDays <= freshnessWindowDays/);
});

test("homepage story flow appears before service discovery and application previews", () => {
  const page = read("../app/page.js");
  const hero = page.indexOf('id="home"');
  const flow = page.indexOf('id="how-it-works"');
  const services = page.indexOf('id="features"');
  const previews = page.indexOf('id="interactive-previews"');
  const data = page.indexOf('id="data"');
  assert.ok(hero >= 0 && hero < flow && flow < services && services < previews && previews < data);
  assert.match(page.slice(flow, services), /aria-labelledby="how-it-works-title"/);
  assert.match(page.slice(flow, services), /kb-flow-card/);
  assert.match(page, /Compare crop sequences and sowing-time options/);
  assert.match(page, /ফসল পর্যায়ক্রম ও বপনের সময়ের বিকল্প তুলনা করুন/);

  assert.match(translations.en.landing.howSimple.intro, /next crop/i);
  assert.match(translations.en.landing.howSimple.body2, /soil and water/i);
  assert.match(translations.en.landing.howSimple.body3, /crop sequence/i);
  assert.match(translations.en.landing.howSimple.title4, /next crop/i);
  assert.match(translations.bn.landing.howSimple.intro, /পরের ফসল/);
  assert.match(translations.bn.landing.howSimple.body2, /মাটি ও পানি/);
  assert.match(translations.bn.landing.howSimple.body3, /ফসলের ক্রম/);
  assert.match(translations.bn.landing.howSimple.title4, /পরের ফসল/);
});
