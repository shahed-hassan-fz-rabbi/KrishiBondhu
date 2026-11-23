"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CloudRain,
  CloudSun,
  Database,
  Droplets,
  Leaf,
  Moon,
  Sprout,
  Store,
  Sun,
  Tractor,
  TrendingUp,
} from "lucide-react";
import "./dark-mode-demo.module.css";

const services = [
  {
    title: "Market reports",
    text: "Review dated market observations with source details.",
    image: "/img/photos/market-produce.jpg",
    Icon: Store,
  },
  {
    title: "Weather & soil",
    text: "See local forecasts and regional soil context together.",
    image: "/img/photos/weather-climate.jpg",
    Icon: CloudSun,
  },
  {
    title: "Crop planning",
    text: "Compare crop sequences and seasonal sowing windows.",
    image: "/img/photos/crop-rotation-cycle.jpg",
    Icon: Tractor,
  },
  {
    title: "Bangla AI assistant",
    text: "Ask in Bangla or English and explore cited information.",
    image: "/img/photos/ai-assistant.avif",
    Icon: Sprout,
  },
];

export default function DarkModeDemoPage() {
  const [dark, setDark] = useState(true);

  return (
    <main className={"kdm-page"} data-theme={dark ? "dark" : "light"}>
      <header className={"kdm-header"}>
        <Link href="/" className={"kdm-brand"} aria-label="KrishiBondhu home">
          <span className={"kdm-brandMark"}><Sprout size={22} /></span>
          <span><strong>KrishiBondhu</strong><small>From seed to market</small></span>
        </Link>
        <span className={"kdm-previewLabel"}>FULL WEBSITE THEME PREVIEW</span>
        <div className={"kdm-headerActions"}>
          <Link href="/" className={"kdm-backLink"}>Back to website</Link>
          <button type="button" className={"kdm-themeButton"} onClick={() => setDark((value) => !value)}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            Preview {dark ? "light" : "dark"} mode
          </button>
        </div>
      </header>

      <section className={"kdm-hero"}>
        <Image src="/img/agri-field-background.webp" alt="" fill priority sizes="100vw" className={"kdm-heroImage"} />
        <div className={"kdm-heroShade"} />
        <div className={"kdm-heroContent"}>
          <span className={"kdm-eyebrow"}><Leaf size={15} /> A clearer view of your farm</span>
          <h1>Farm decisions,<br /><em>in a calmer light.</em></h1>
          <p>Dark mode carries across the page, so every section stays comfortable to read—from the navigation to the data and cards.</p>
          <div className={"kdm-heroActions"}>
            <a href="#services" className={"kdm-primaryButton"}>Explore farm tools <ArrowRight size={17} /></a>
            <a href="#weather" className={"kdm-ghostButton"}>See weather preview</a>
          </div>
        </div>
        <div className={"kdm-heroNote"}><span /> Contrast stays clear over the field photo</div>
      </section>

      <section className={"kdm-services"} id="services">
        <div className={"kdm-sectionHeading"}>
          <div><span className={"kdm-kicker"}>TOOLS FOR YOUR FARM</span><h2>Everything works together</h2></div>
          <p>Surfaces, labels, borders and actions all adapt to the selected theme.</p>
        </div>
        <div className={"kdm-serviceGrid"}>
          {services.map(({ title, text, image, Icon }) => (
            <article className={"kdm-serviceCard"} key={title}>
              <div className={"kdm-serviceImage"}><Image src={image} alt="" fill sizes="(max-width: 700px) 100vw, 25vw" /></div>
              <div className={"kdm-serviceBody"}>
                <span className={"kdm-serviceIcon"}><Icon size={20} /></span>
                <h3>{title}</h3><p>{text}</p>
                <a href="#weather">Explore <ArrowRight size={15} /></a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={"kdm-weather"} id="weather">
        <div className={"kdm-weatherHeading"}>
          <span className={"kdm-kicker"}>WEATHER & SOIL</span>
          <h2>Useful context, easy to read</h2>
          <p>Weather panels keep their meaning and contrast in both themes.</p>
        </div>
        <div className={"kdm-weatherPanel"}>
          <div className={"kdm-panelTitle"}><span><CloudSun size={18} /> Cumilla region · 7-day outlook</span><a href="#services">View climate <ArrowRight size={15} /></a></div>
          <div className={"kdm-metricGrid"}>
            <article className={"kdm-metricCard"}>
              <span className={"kdm-metricLabel"}><Sun size={16} /> Temperature range</span>
              <strong>18° – 30°C</strong><small>Source: Open-Meteo forecast</small>
            </article>
            <article className={"kdm-metricCard"}>
              <span className={"kdm-metricLabel"}><CloudRain size={16} /> Rain outlook</span>
              <strong>6 mm</strong><small>7-day total · 2 rain days expected</small>
            </article>
            <article className={"kdm-metricCard"}>
              <span className={"kdm-metricLabel"}><Droplets size={16} /> Soil moisture</span>
              <strong>0.187 m³/m³</strong><small>Regional satellite proxy</small>
            </article>
          </div>
          <div className={"kdm-dataNote"}><Database size={16} /> Sources and dates remain visible in every theme.</div>
        </div>
      </section>

      <footer className={"kdm-footer"}>
        <div><span className={"kdm-kicker"}>KRISHIBONDHU</span><h2>One theme across the whole experience.</h2><p>This is a preview page. Your current website theme has not been changed.</p></div>
        <TrendingUp className={"kdm-footerIcon"} size={44} />
      </footer>
      <p className={"kdm-disclaimer"}>Theme preview · Use the button above to compare light and dark mode.</p>
    </main>
  );
}
