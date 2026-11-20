# KrishiBondhu Design System

The visual language of KrishiBondhu: a calm agricultural product built on warm ivory
surfaces, deep forest green actions, and honest, source-labelled data.

Reference for layout quality and interaction polish: Mati Kohon. KrishiBondhu keeps its
own name, brand, mascot (Krishu), content and data.

## Colour tokens

All colours live in `app/globals.css` under `:root` and `.dark`, and are exposed to
Tailwind through `@theme inline`. Always prefer the semantic token over a raw hex value.

| Token | Light value | Purpose |
| --- | --- | --- |
| `--km-bg` | `#F8F7F2` | Warm ivory page background |
| `--km-surface` | `#FFFFFF` | Card / raised surface |
| `--km-surface-2` | `#EEF2EA` | Subtle inset surface |
| `--km-text` | `#173B2A` | Primary ink |
| `--km-text-muted` | `#56665E` | Secondary text (AA contrast on cream) |
| `--km-border` | `#DFE6DB` | Hairlines |
| `--km-forest` | `#247A4B` | Primary green (actions, links) |
| `--km-forest-700` | `#1B6B40` | Accessible green text |
| `--km-forest-900` | `#123D2A` | Dark forest green |
| `--km-emerald` | `#56B870` | Fresh leaf green |
| `--km-sage` | `#E8F2E9` | Soft sage green |
| `--km-earth` | `#AC8052` | Earth brown |
| `--km-amber` | `#D99631` | Warning amber |
| `--km-climate` | `#2878C8` | Climate / weather blue |
| `--km-danger` | `#D95D59` | Risk red |

Semantic Tailwind utilities: `bg-surface`, `text-content`, `text-muted`, `border-line`,
`bg-forest`, `text-forest`, `bg-sage`, `bg-amber`, `text-danger`, etc. Dark mode flips
the surface and text tokens only; brand colours stay constant.

## Elevation

`--e1` … `--e4` are soft, forest-tinted shadows. Use `.mati-card` for the standard card
(white surface, hairline border, `--e1`, 18px radius, hover lift). Avoid heavy shadows,
large blurs and glassmorphism.

## Radius & spacing

Radius scale: 8 / 12 / 16 / 24px (`--kb-radius-sm … xl`). Buttons and pills use `999px`.
Spacing follows Tailwind's 4px-based scale; keep section rhythm at 64–112px on desktop
and 40–68px on mobile.

## Typography

- English: Inter (`var(--font-inter)`).
- Bengali: Noto Sans Bengali (`var(--font-bengali)`), automatically applied when
  `html[lang="bn"]`.
- Localised numerals use `Intl("bn-BD")` / the shared `formatLocalizedNumber` helpers.
- Keep Bengali body text at >= 12px and tap targets >= 44px.

## Motion

`--kb-ease: cubic-bezier(.2,.8,.3,1)`, `--kb-duration: 240ms`, `--kb-duration-fast: 150ms`.
Page entrances use `kb-page-enter`; staggered content uses `.kb-reveal`. Card hovers lift
by 3px. Every animation is wrapped in `prefers-reduced-motion: no-preference`, with
static fallbacks for reduced motion.

## Data honesty

Never present an unavailable dataset as zero, a snapshot as live, or a modelled estimate
as a market quote. Keep source, observation date and provenance visible wherever data is
shown. This rule applies equally to marketing copy and charts.
