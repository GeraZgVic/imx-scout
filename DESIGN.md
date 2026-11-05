---
name: IMX Scout
description: A product-monitoring workspace that keeps price, delivery, change, and query state together.
colors:
  ground: "#0b0e11"
  rail: "#0e1216"
  surface: "#12171b"
  surface-raised: "#181e23"
  surface-hover: "#20272d"
  line: "#303940"
  line-soft: "#252d33"
  ink: "#f1f3f4"
  ink-soft: "#c0c7cc"
  ink-muted: "#9aa4ab"
  ink-dim: "#78848c"
  signal: "#ffd400"
  signal-ink: "#242008"
  signal-wash: "#24210f"
  error: "#ff8278"
  error-wash: "#2a1717"
  success: "#9ad3a3"
  success-wash: "#15241a"
typography:
  headline:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "clamp(25px, 2.2vw, 32px)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  button:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
  label:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "5px"
  md: "8px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
  catalog-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# Design System: IMX Scout

## Overview

**Creative North Star: "The Product Ledger"**

IMX Scout is an Operate interface for registering products and following their marketplace data. Its working language is graphite and cool silver, with Plus Jakarta Sans and compact, familiar web controls. The product catalog is the default view, and each product row holds the identity, latest valid result, latest query attempt, status, change signal, and related actions together.

The yellow signal marks unread changes and selected priority; red marks failed checks; muted green marks successful checks. Tabular numerals keep prices and times easy to compare. Surface contrast and fine borders organize the dense catalog, while the summary and alerts views support the same product-centered workflow.

**Key Characteristics:**
- Product-first catalog with stable, scannable data columns.
- Graphite surfaces and cool-silver text and dividers.
- Yellow unread-change signal, with red failure and muted-green success states.
- Plus Jakarta Sans with tabular numerals for data values.
- Standard web navigation, forms, filters, tables, dialogs, and drawers.

## Colors

The palette uses cool graphite layers and silver text, reserving yellow for change and priority signals and red or green for explicit query outcomes.

### Primary
- **Signal Yellow**: The persistent accent for unread changes, priority, active navigation, focus, and primary actions.
- **Signal Ink and Wash**: Dark text on the bright primary action and a subdued yellow-tinted surface behind alert counts.

### Neutral
- **Graphite Ground and Rail**: The page canvas and the slightly distinct navigation rail.
- **Graphite Surface, Raised, and Hover**: The catalog, panels, secondary controls, and hover response.
- **Cool Silver Lines**: The stronger panel borders and softer row dividers.
- **Cool Silver Ink**: Primary, secondary, muted, and dim text levels for content, metadata, and labels.
- **Tabular Silver**: Numeric content uses the same ink hierarchy with tabular numeral shaping.

### Failure
- **Failure Coral and Wash**: Failed checks, service errors, and error detail use red foregrounds over a dark red surface.

### Success
- **Muted Green and Wash**: Successful check status and confirmation notices use restrained green contrast.

**The Status-With-Text Rule.** Every status uses a visible label or explanatory copy alongside its color treatment.

## Typography

- **Display Font:** Plus Jakarta Sans (with sans-serif fallback)
- **Body Font:** Plus Jakarta Sans (with sans-serif fallback)
- **Label/Mono Font:** Plus Jakarta Sans; numeric values use tabular figures rather than a separate mono face.

**Character:** The single sans-serif family keeps product names, controls, and data values cohesive. Compact labels and metadata make room for dense rows; restrained headline sizing keeps attention on catalog content.

### Hierarchy
- **Headline** (700, 25–32px, 1.18 line-height): View titles, scaling with viewport width.
- **Title** (700, 17px, 1.35 line-height): Dialog and history headings.
- **Body** (400, 13px, 1.6 line-height): View descriptions and readable supporting copy.
- **Button** (700, 12px): Primary and secondary actions.
- **Label** (700, 9px, 0.08em letter-spacing): Table headers and compact metadata; table headers use uppercase styling.

**The Numeric-Alignment Rule.** Prices, timestamps, and comparisons retain tabular numerals so changing values keep their columns visually steady.

## Layout

The desktop shell pairs a persistent left navigation rail with a fluid main area. The content column is centered within a 1580px maximum width, with responsive side padding. The product catalog opens first; its filter row sits above a full-width table whose stable columns keep product identity, marketplace, price, delivery, query time, status, and actions attached to each record. The dashboard uses a two-column panel layout on wide screens and a single column below 940px.

At 1250px, the rail and table minimum widths tighten and filters may wrap. At 940px, navigation becomes a slide-in drawer behind a scrim. At 680px, the product table becomes a two-column grid of row cards: the product identity spans the top, each remaining value gains its field label, and actions occupy a full-width footer. The filter controls become a compact two-column arrangement, while alert entries and dialogs reduce their side padding. The layout has a 320px minimum viewport width.

**The Product-Row Rule.** Keep identity, latest valid data, latest query attempt, status, unread change, and next actions in the same product row at every viewport.

## Elevation & Depth

The system is mostly flat. Distinct graphite surfaces, thin borders, and row dividers establish hierarchy; the product and history dialogs use the shared deep shadow, and the mobile navigation drawer uses a softer directional shadow. Small status and focus glows are state cues rather than a general card treatment.

### Shadow Vocabulary
- **Dialog**: The shared dialog shadow separates registration and history overlays from the page.

**The Flat-At-Rest Rule.** Panels and rows use tonal contrast and borders at rest; reserve shadows for overlays and active state cues.

## Shapes

Catalog and summary surfaces use gently rounded corners; controls and navigation use a tighter radius. Badges and marketplace tags have compact corners, and mobile product rows use a slightly more open card shape. Borders stay thin and quiet. The registration dialog is rounded on desktop and becomes a bottom sheet on narrow screens; the history dialog becomes a full-height drawer.

## Components

### Buttons
- **Character:** Compact and direct, with a clear primary action and a quiet secondary action.
- **Shape:** Slightly rounded corners (5px); the standard button is at least 39px high with 13px horizontal padding.
- **Primary:** Signal yellow fill with dark signal ink; hover brightens the yellow and press shifts down by one pixel.
- **Secondary:** Raised graphite fill, cool-silver text, and a thin line; hover moves to the next graphite surface.
- **Focus / Disabled:** Visible focus uses a yellow 2px outline with a 3px offset. Disabled controls reduce opacity and use a not-allowed cursor.

### Chips
- **Style:** Compact status badges use a thin border, dark tinted fill, and small icon plus label.
- **State:** Yellow identifies an unread change; red identifies an error; muted green identifies a successful query; neutral badges cover warning and review states.

### Cards / Containers
- **Corner Style:** Catalog and panel surfaces use 8px corners; mobile product row cards use 6px.
- **Background:** Graphite surface over the darker page ground, with a one-pixel border.
- **Shadow Strategy:** Flat at rest; dialogs and the mobile navigation drawer carry the available shadows.
- **Internal Padding:** Summary panels use 18px on wide screens and 14px on narrow screens. Catalog rows use compact vertical padding and fine dividers.

### Inputs / Fields
- **Style:** Search, filter, and registration controls use dark fills, silver text, and compact rounded borders. Search and select controls are 37px high; the registration field is 43px high.
- **Focus:** Search highlights its border with a restrained yellow tint; other keyboard-focused controls use the shared visible yellow outline.
- **Form:** The registration dialog accepts an Amazon ASIN or supported marketplace URL and presents an optional consult-after-create checkbox.

### Navigation
- **Style:** A compact left rail groups Productos, Resumen, and Alertas. The current destination uses a graphite selection surface and a narrow yellow edge marker; hover increases contrast.
- **Mobile:** Below 940px the rail becomes a slide-in navigation drawer with a scrim and a menu button in the top bar.

### Product Row
- **Character:** A record-centered table row keeps changing marketplace data in context.
- **Desktop:** Product identity and marketplace, latest price, delivery, query time, status, and actions stay in stable columns. A failed latest attempt keeps the last valid value visible with an explicit label and separate error detail.
- **Unread change:** A yellow-tinted row and border treatment keep the change attached to its product; the badge includes the text “Cambio nuevo.”
- **Mobile:** The semantic table is restyled as row cards with visible field labels and actions in a dedicated footer.

### History Drawer
- **Character:** A full-height detail panel keeps one product's query history in view.
- **Content:** Each entry groups price, delivery, destination, status, error detail when present, and query time. Repeated states can be grouped in the displayed history.

## Do's and Don'ts

### Do:
- Do keep product identity, the latest valid values, the latest query attempt, status, unread change, and next actions together in its row.
- Do label a retained value as the last valid data when the latest attempt failed.
- Do pair yellow, red, and green status colors with readable text and the interface's icon or detail treatment.
- Do use tabular numerals for prices, timestamps, and comparison values.
- Do keep the product catalog as the first working view and preserve the standard navigation, filters, forms, tables, and responsive row cards.
- Do preserve the IMX Scout name and Plus Jakarta Sans.

### Don't:
- Don't imply that the last known value is the result of a failed or unavailable query.
- Don't use color as the only explanation of a change, success, warning, or failure.
- Don't turn the primary catalog into disconnected summary tiles; the product row is the unit that carries its result and state.
- Don't introduce a different typeface or replace the graphite, cool-silver, and yellow signal palette with unrelated accents.
