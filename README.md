# IMX Scout

IMX Scout es una herramienta interna para investigacion de productos en Amazon US y eBay.

El estado actual de este repositorio corresponde a la v1: una herramienta CLI que lee URLs o ASINs desde un archivo local, ejecuta scraping con Playwright y exporta resultados en JSON y CSV.

## Estado del proyecto

- `v1 actual`: CLI operativa basada en archivos locales.
- `v2 objetivo`: evolucion hacia sistema interno con interfaz web, base de datos, historial de precios y alertas.

La arquitectura objetivo de v2 esta documentada en [IMX_Scout_Arquitectura.md](./IMX_Scout_Arquitectura.md). Ese documento describe el sistema planeado, no el estado implementado hoy en este repositorio.

## Alcance de v1

La v1 resuelve el flujo base de investigacion:

- Lectura de entradas desde `input/urls.json`
- Clasificacion de URLs por plataforma
- Scraping de Amazon y eBay con Playwright
- Normalizacion del resultado
- Exportacion a `output/results.json` y `output/results.csv`

## Requisitos

- Node.js 18+
- npm

## Instalacion

```bash
npm install
npx playwright install chromium
```

## Uso

1. Agrega las URLs o ASINs a revisar en `input/urls.json`:

```json
{
  "urls": [
    "https://www.amazon.com/dp/...",
    "https://www.ebay.com/itm/...",
    "B0DSVVJXK5"
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

## Estructura actual

```text
imx-scout/
|-- src/
|   |-- index.js
|   |-- scrapers/
|   |   |-- amazonScraper.js
|   |   `-- ebayScraper.js
|   |-- processors/
|   |   `-- urlProcessor.js
|   |-- parsers/
|   |   `-- dataParser.js
|   |-- exporters/
|   |   `-- resultExporter.js
|   `-- utils/
|       `-- logger.js
|-- input/
|   `-- urls.json
`-- output/
    |-- results.json
    `-- results.csv
```

## Formato de salida

Cada resultado tiene la siguiente estructura:

| Campo | Descripcion |
|---|---|
| `url` | URL original del producto |
| `plataforma` | `amazon` o `ebay` |
| `nombre` | Nombre del producto |
| `precio` | Precio del producto |
| `envio` | Informacion de envio |
| `tiempo_entrega` | Tiempo estimado de entrega |
| `timestamp` | Fecha y hora del scraping en ISO 8601 |
| `status` | `ok` o `error` |
| `error_mensaje` | Descripcion del error si aplica |

## Evolucion planeada

La v2 busca conservar la logica de scraping de v1 y moverla a una arquitectura mas completa:

- Interfaz web para ingreso manual y carga de archivos
- API REST para ejecucion y consulta
- Base de datos persistente con historial
- Alertas por cambios de precio o disponibilidad
- Despliegue con Docker y proxy reverso

La idea es que este repositorio deje trazabilidad clara entre la base CLI estable y la siguiente etapa del sistema.
