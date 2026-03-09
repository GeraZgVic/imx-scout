# IMX Scout

Herramienta interna para investigación de productos en Amazon US y eBay.

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
npx playwright install chromium
```

## Uso

1. Agrega las URLs a revisar en `input/urls.json`:

```json
{
  "urls": [
    "https://www.amazon.com/dp/...",
    "https://www.ebay.com/itm/..."
  ]
}
```

2. Ejecuta el sistema:

```bash
npm start
```

3. Los resultados se guardan en `output/`:
   - `results.json`
   - `results.csv`

## Estructura del proyecto

```
imx-scout/
├── src/
│   ├── index.js                  # Punto de entrada
│   ├── scrapers/
│   │   ├── amazonScraper.js
│   │   └── ebayScraper.js
│   ├── processors/
│   │   └── urlProcessor.js
│   ├── parsers/
│   │   └── dataParser.js
│   ├── exporters/
│   │   └── resultExporter.js
│   └── utils/
│       └── logger.js
├── input/
│   └── urls.json
└── output/
    └── results.json
```

## Formato de salida

Cada resultado tiene la siguiente estructura:

| Campo           | Descripción                          |
|-----------------|--------------------------------------|
| `url`           | URL original del producto            |
| `plataforma`    | `amazon` o `ebay`                   |
| `nombre`        | Nombre del producto                  |
| `precio`        | Precio del producto                  |
| `envio`         | Información de envío                 |
| `tiempo_entrega`| Tiempo estimado de entrega           |
| `timestamp`     | Fecha y hora del scraping (ISO 8601) |
| `status`        | `ok` o `error`                      |
| `error_mensaje` | Descripción del error (si aplica)   |