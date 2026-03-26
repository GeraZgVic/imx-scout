# IMX Scout

IMX Scout es un sistema interno para monitoreo de productos en Amazon US y eBay. La aplicación recibe URLs o ASINs, ejecuta scraping con Playwright, guarda historial de precios en MySQL y genera alertas cuando detecta cambios entre ejecuciones.

## Descripción

La base del proyecto nace en `v2`, pero el estado actual ya incorpora una primera capa funcional de `v3` para monitoreo operativo. Hoy incluye:

- API REST con Express
- Interfaz web local con React + Vite
- Persistencia en MySQL con Prisma
- Scraping de Amazon y eBay con Playwright
- Historial de `RegistroPrecio`
- Alertas de cambios de precio o tiempos de tramitacion/entrega
- Confirmación visual del destino consultado (`Laredo, TX 78041`)
- Estado en memoria del scraping en curso
- Prioridad persistente por producto
- Reconsulta de productos prioritarios
- Estado operativo por producto basado en la última consulta real
- Filtros persistentes por URL en la vista de productos
- Historial compacto por defecto con opción de ver todo
- Navegación persistente por URL entre vistas y drawer de historial

Estado actual del alcance:

- `v2 local`: cerrada
- `v3 inicial`: monitoreo operativo ya funcional
- `despliegue a servidor`: siguiente etapa, fuera del cierre actual
- `v3 siguiente`: importación/exportación masiva, automatización y escalamiento funcional

## Requisitos Previos

- Node.js 18 o superior
- npm
- Docker y Docker Compose o Docker Engine
- Navegador Chromium de Playwright

Instalación de Playwright:

```bash
npx playwright install chromium
```

## Configuración Local

1. Clona el repositorio:

```bash
git clone <repo-url>
cd imx-scout
```

2. Instala dependencias:

```bash
npm install
npx playwright install chromium
```

3. Crea tu archivo `.env` a partir del ejemplo:

```bash
cp .env.example .env
```

4. Levanta MySQL con Docker:

```bash
docker run --name imxscout-db \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=imxscout \
  -e MYSQL_USER=imx \
  -e MYSQL_PASSWORD=imxpass \
  -p 3306:3306 \
  -d mysql:8.0
```

5. Ajusta `DATABASE_URL` en `.env`:

```env
DATABASE_URL="mysql://imx:imxpass@localhost:3306/imxscout"
```

6. Ejecuta migraciones:

```bash
npx prisma migrate deploy
```

Si estás creando la base local desde cero y quieres trabajar en modo desarrollo:

```bash
npx prisma migrate dev
```

7. Inicia la API:

```bash
npm run dev
```

8. En otra terminal, inicia la UI:

```bash
npm run client:dev
```

URLs locales:

- API: `http://localhost:3000`
- UI: `http://localhost:5173`

## Despliegue En Servidor Con Traefik

Para servidores con una red externa de Traefik como `cscart_production_net`, el proyecto incluye:

- `docker-compose.server.yml`
- `.env.server.example`

Flujo sugerido:

1. Copia el proyecto a una ruta como `/srv/imx-scout`
2. Crea un archivo `.env.server` a partir de `.env.server.example`
3. Ajusta:
   - `IMXSCOUT_HOST`
   - `IMXSCOUT_DB_PASSWORD`
   - `IMXSCOUT_DB_ROOT_PASSWORD`
4. Levanta el stack:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml up --build -d
```

5. Revisa estado y logs:

```bash
docker compose --env-file .env.server -f docker-compose.server.yml ps
docker compose --env-file .env.server -f docker-compose.server.yml logs -f imxscout-app
```

Notas:

- la app publica su tráfico por Traefik, no por puertos directos
- el contenedor app expone internamente el puerto `3000`
- la base queda aislada en la red interna `imxscout_internal`
- el servicio responde `GET /healthz` para healthchecks
- el arranque ejecuta `npx prisma migrate deploy`

## Estructura Del Proyecto

```text
imx-scout/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── api/
│   │   └── routes/
│   │       ├── alertas.js
│   │       ├── productos.js
│   │       └── scraping.js
│   ├── lib/
│   │   └── prisma.js
│   ├── parsers/
│   │   └── dataParser.js
│   ├── processors/
│   │   └── urlProcessor.js
│   ├── scrapers/
│   │   ├── amazonScraper.js
│   │   └── ebayScraper.js
│   ├── services/
│   │   ├── alertaService.js
│   │   └── scraperService.js
│   ├── utils/
│   │   ├── extractFirst.js
│   │   └── logger.js
│   ├── client/
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.jsx
│   │       ├── main.jsx
│   │       └── styles.css
│   └── server.js
├── .env.example
├── .env.server.example
├── .dockerignore
├── Dockerfile
├── docker-compose.server.yml
├── vite.config.js
├── package.json
└── README.md
```

## API

### GET /api/productos

Lista todos los productos registrados.

Ejemplo de request:

```bash
curl http://localhost:3000/api/productos
```

Ejemplo de response:

```json
{
  "items": [
    {
      "id": 1,
      "url": "https://www.amazon.com/dp/B0DSVVJXK5",
      "asin": "B0DSVVJXK5",
      "plataforma": "amazon",
      "nombre": "Producto de ejemplo",
      "activo": true,
      "prioritario": false,
      "ultimoRegistro": {
        "timestamp": "2026-03-25T19:20:00.000Z",
        "status": "ok"
      },
      "createdAt": "2026-03-09T23:40:00.000Z",
      "updatedAt": "2026-03-09T23:40:00.000Z"
    }
  ]
}
```

### POST /api/productos

Crea un producto a partir de `url` o `asin`.

Ejemplo con ASIN:

```bash
curl -X POST http://localhost:3000/api/productos \
  -H "Content-Type: application/json" \
  -d '{"asin":"B0DSVVJXK5"}'
```

Ejemplo con URL:

```bash
curl -X POST http://localhost:3000/api/productos \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.ebay.com/itm/1234567890"}'
```

Ejemplo de response:

```json
{
  "id": 2,
  "url": "https://www.amazon.com/dp/B0DSVVJXK5",
  "asin": "B0DSVVJXK5",
  "plataforma": "amazon",
  "nombre": null,
  "activo": true,
  "createdAt": "2026-03-09T23:42:00.000Z",
  "updatedAt": "2026-03-09T23:42:00.000Z"
}
```

Errores esperados:

- `400` si falta `url` y `asin`, o si la entrada no es válida
- `409` si la URL ya existe en la base

### PATCH /api/productos/:id

Actualiza atributos operativos del producto. Actualmente soporta `prioritario`.

Ejemplo de request:

```bash
curl -X PATCH http://localhost:3000/api/productos/2 \
  -H "Content-Type: application/json" \
  -d '{"prioritario":true}'
```

Errores esperados:

- `400` si el `id` es inválido o `prioritario` no es boolean
- `404` si el producto no existe

### DELETE /api/productos/:id

Elimina un producto y sus relaciones en cascada.

Ejemplo de request:

```bash
curl -X DELETE http://localhost:3000/api/productos/2 -i
```

Respuesta esperada:

- `204 No Content`

### GET /api/productos/:id/historial

Devuelve el historial de `RegistroPrecio` de un producto.

Ejemplo de request:

```bash
curl http://localhost:3000/api/productos/1/historial
```

Ejemplo de response:

```json
{
  "items": [
    {
      "id": 1,
      "productoId": 1,
      "precio": "$19.99",
      "envio": "FREE delivery",
      "tiempo_entrega": "Wednesday, March 12",
      "destino_consultado": "Laredo, TX 78041",
      "status": "ok",
      "error_mensaje": null,
      "timestamp": "2026-03-09T23:45:00.000Z"
    }
  ]
}
```

### GET /api/alertas

Lista las alertas no leídas.

Ejemplo de request:

```bash
curl http://localhost:3000/api/alertas
```

Ejemplo de response:

```json
{
  "items": [
    {
      "id": 3,
      "productoId": 1,
      "tipo": "precio_cambio",
      "valor_anterior": "$19.99",
      "valor_nuevo": "$17.99",
      "leida": false,
      "timestamp": "2026-03-10T00:10:00.000Z",
      "producto": {
        "id": 1,
        "url": "https://www.amazon.com/dp/B0DSVVJXK5",
        "asin": "B0DSVVJXK5",
        "plataforma": "amazon",
        "nombre": "Producto de ejemplo"
      }
    }
  ]
}
```

### PATCH /api/alertas/:id/leida

Marca una alerta como leída.

Ejemplo de request:

```bash
curl -X PATCH http://localhost:3000/api/alertas/3/leida
```

Ejemplo de response:

```json
{
  "id": 3,
  "productoId": 1,
  "tipo": "precio_cambio",
  "valor_anterior": "$19.99",
  "valor_nuevo": "$17.99",
  "leida": true,
  "timestamp": "2026-03-10T00:10:00.000Z"
}
```

### GET /api/scraping/estado

Devuelve el estado actual del scraping.

Ejemplo de request:

```bash
curl http://localhost:3000/api/scraping/estado
```

Ejemplo de response:

```json
{
  "activo": false,
  "inicio": null,
  "total": 0,
  "procesados": 0,
  "errores": 0
}
```

### POST /api/scraping/ejecutar

Ejecuta scraping para una lista de URLs o ASINs.

Ejemplo de request:

```bash
curl -X POST http://localhost:3000/api/scraping/ejecutar \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      "B0DSVVJXK5",
      "https://www.ebay.com/itm/1234567890"
    ]
  }'
```

Ejemplo de response:

```json
{
  "total": 1,
  "exitosos": 1,
  "errores": 0,
  "resultados": [
    {
      "url": "https://www.amazon.com/dp/B0DSVVJXK5",
      "plataforma": "amazon",
      "nombre": "Producto de ejemplo",
      "precio": "$19.99",
      "envio": "FREE delivery",
      "tiempo_entrega": "Wednesday, March 12",
      "destino_consultado": "Laredo, TX 78041",
      "timestamp": "2026-03-09T23:50:00.000Z",
      "status": "ok",
      "error_mensaje": null
    }
  ]
}
```

Errores esperados:

- `400` si `entries` no existe o está vacío
- `400` si ya hay un scraping en curso
- `400` si se excede `MAX_URLS_PER_REQUEST`
- `500` si ocurre un error inesperado del servidor

### POST /api/scraping/prioritarios

Ejecuta scraping sobre todos los productos marcados como prioritarios y activos.

Ejemplo de request:

```bash
curl -X POST http://localhost:3000/api/scraping/prioritarios
```

Errores esperados:

- `400` si no hay productos prioritarios
- `400` si ya hay un scraping en curso

## Cómo Correr Scraping Desde curl

1. Verifica el estado actual:

```bash
curl http://localhost:3000/api/scraping/estado
```

2. Lanza una ejecución:

```bash
curl -X POST http://localhost:3000/api/scraping/ejecutar \
  -H "Content-Type: application/json" \
  -d '{"entries":["B0DSVVJXK5"]}'
```

3. Consulta productos guardados:

```bash
curl http://localhost:3000/api/productos
```

4. Consulta el historial del producto:

```bash
curl http://localhost:3000/api/productos/1/historial
```

5. Consulta alertas no leídas:

```bash
curl http://localhost:3000/api/alertas
```

## Interfaz Web

La UI local tiene tres vistas principales:

- `Dashboard` (`/dashboard`): centro operativo con estado general, nueva ejecución, alertas recientes y resumen de la última corrida
- `Productos` (`/productos`): inventario monitoreado con prioridad, estado operativo, filtros y drawer lateral de historial
- `Alertas` (`/alertas`): bandeja de cambios relevantes para precio y tiempo de entrega

La UI muestra el destino logístico consultado como `Laredo, TX 78041` cuando corresponde.

Persistencia actual de UX:

- La navegación entre vistas usa URL reales
- El historial puede abrirse por URL con `?historial=:id`
- Los filtros de productos se conservan en query params (`q`, `prioridad`, `estado`, `plataforma`)
- El historial se abre en vista compactada por defecto para reducir ruido

## Variables De Entorno

Archivo base: `.env.example`

```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL="mysql://user:password@localhost:3306/imxscout"
MAX_CONCURRENT_SCRAPERS=5
MAX_URLS_PER_REQUEST=100
SCRAPER_TIMEOUT_MS=30000
```

Explicación:

- `PORT`: puerto HTTP donde se levanta Express
- `NODE_ENV`: modo de ejecución, normalmente `development` o `production`
- `LOG_LEVEL`: nivel del logger `pino`
- `DATABASE_URL`: cadena de conexión MySQL usada por Prisma
- `MAX_CONCURRENT_SCRAPERS`: número máximo de scrapers corriendo en paralelo
- `MAX_URLS_PER_REQUEST`: límite de entradas por ejecución
- `SCRAPER_TIMEOUT_MS`: timeout por URL en milisegundos

## Comandos Útiles

Instalar dependencias:

```bash
npm install
```

Iniciar en desarrollo:

```bash
npm run dev
```

Iniciar frontend local:

```bash
npm run client:dev
```

Construir frontend:

```bash
npm run client:build
```

Ejecutar migraciones:

```bash
npx prisma migrate deploy
```

Abrir Prisma Studio:

```bash
npx prisma studio
```
