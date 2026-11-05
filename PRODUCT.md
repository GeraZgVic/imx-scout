# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

There are no active users yet. IMX Scout is a prototype in development. The intended primary operator and their working context remain undecided.

## Product Purpose

IMX Scout is an internal prototype for monitoring product information on Amazon US and eBay. It accepts product URLs or Amazon ASINs, scrapes product data, stores price history in MySQL, and surfaces alerts when prices or delivery details change. The product's success criteria are not yet defined.

## Brand Commitments

- Keep the product name IMX Scout.
- Preserve Plus Jakarta Sans, which the user explicitly chose to keep. Other visual decisions may be replaced for the redesign.

## Positioning

The product's distinct value compared with manual checks or other tools has not yet been defined.

## Operating Context

The current project is a web application developed locally with a React/Vite client, an Express API, MySQL persistence, and Playwright scrapers. Server deployment is a future project stage. There are no active production users.

## Capabilities and Constraints

- Current monitoring supports Amazon US and eBay.
- The current workflow accepts product URLs or ASINs, keeps query history, tracks priority products, and shows alerts for changes in price or delivery details.
- The current interface shows the queried destination as Laredo, TX 78041.
- Planned work includes additional Amazon scraping, described by the user as checking “BB” (the precise scope is undecided), and a future Mercado Libre integration. These are plans, not current capabilities, and their representation in the interface is undecided.
- Monitoring frequency, expected catalog size, and the future primary user's needs are undecided.

## Evidence on Hand

The source repository and README document the current prototype and capabilities. No customer testimonials, usage metrics, or approved marketing claims are available. Do not invent them.

## Product Principles

- Support the operator's end-to-end workflow: register products, consult prices, and understand detected changes or errors in context.
- Show whether product data is current, stale, missing, or unavailable without implying a successful check when one has not occurred.
- Keep each product's changes traceable through its query history.
- Make room for additional marketplace integrations without presenting planned integrations as available features.
- Surface changes and failed checks with enough context to support an operator's next action.
