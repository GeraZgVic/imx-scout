Scope: IMX Scout's whole web application. Visitor mode: Operate.

Audience and task: A future operator needs to register monitored products, consult marketplace data, and understand detected price or delivery changes and failed checks. The first design must make the product catalog the working surface and keep each result attached to its product. Amazon US and eBay are current; Amazon BB and Mercado Libre remain future plans. Expected catalog size and monitoring cadence are undecided.

Content and constraints: Keep actual product values, source, query time, status, errors, and history truthful. Never imply a scrape succeeded when it failed or show stale values as current. Support Amazon and eBay workflows, priority checks, alerts, query history, and existing destination context. Preserve IMX Scout and Plus Jakarta Sans. Future integrations stay unrepresented until their scope is agreed.

## Direction contract

THESIS: The product row is the unit of trust: identity, latest result, query time, change, and failure stay together. Refuse disconnected KPI tiles as the main experience.

OWN-WORLD: Use graphite and cool silver for the working surface, a persistent yellow signal for unread changes, and clear red for failed checks. Keep Plus Jakarta Sans and tabular numerals. Use familiar web navigation, filters, forms, and tables. Translate the selected board into stable data columns and row states; do not use airport graphics, route diagrams, boarding passes, or travel language.

STORY: The operator registers an ASIN or supported URL, sees an explicit unqueried state until data arrives, compares current values with the last result, and opens that product's history to understand a change. A failed scrape keeps the last known result visibly distinct from current data and gives a direct retry.

FIRST VIEWPORT: Open on the product catalog. Keep a compact navigation rail at left, a clear catalog title and primary “Registrar producto” action at the top, then a full-width filter row and stable table columns for product, marketplace, latest price, delivery, query time, and status. Keep unread change treatment inside its product row. Include the add-product flow and an explicit empty state when the catalog has no records.

FORM: Build code-led from the user's selected “Tablero de cambios” sketch, challenger `vernacular-ephemera-boarding-pass-and-gate-board`, one of the competitive directions; seed:6531ea023c267532. Its composition is the reference, not a license to literalize airport artifacts.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Open decisions: product success measure, primary operator specifics, catalog scale, query frequency, and future marketplace presentation.
