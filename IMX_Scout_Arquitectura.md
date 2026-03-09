# IMX Scout v2 — Arquitectura del Sistema

## Descripción General

IMX Scout v2 convierte la herramienta de línea de comandos de v1 en un sistema interno completo con interfaz web, base de datos persistente e historial de precios.

El equipo puede ingresar URLs y ASINs directamente desde el navegador, ejecutar scraping en tiempo real, ver el historial de precios por producto y recibir notificaciones de cambios — sin editar archivos manualmente.

---

## Qué cambia respecto a v1

| Aspecto | v1 | v2 |
|---|---|---|
| Entrada de datos | Edición manual de `input/urls.json` | Interfaz web (pegado manual o carga de CSV/Excel) |
| Ejecución | `npm start` en terminal | Botón en la UI |
| Resultados | Archivos `results.json` / `results.csv` | Base de datos + visualización en pantalla + exportación |
| Persistencia | Ninguna | MySQL — historial completo de cada producto |
| Notificaciones | Ninguna | Alertas en UI cuando cambia precio o disponibilidad |
| Despliegue | Script local | Contenedor Docker + Traefik |

Los scrapers de v1 (`amazonScraper.js`, `ebayScraper.js`), el procesador de URLs y el parser de datos se reutilizan sin modificaciones estructurales. La lógica de scraping ya está validada y probada.

---

## Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Backend | Node.js + Express.js | Mismo stack que v1 y otros sistemas internos |
| Frontend | React + Vite | Build estático servido por Express en producción |
| Base de datos | MySQL | Ya operado en producción con Docker |
| ORM | Prisma | Tipado, migraciones y queries simples |
| Scraping | Playwright | Reutilizado de v1 sin cambios |
| Contenedor | Docker + docker-compose | Coherente con infraestructura existente |
| Proxy | Traefik | Mismo reverse proxy del servidor |

---

## Arquitectura General

```
┌─────────────────────────────────────────┐
│              Traefik                    │
│    imxscout.dominio.com → :3000         │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Contenedor: app                 │
│                                         │
│  Express.js (:3000)                     │
│  ├── /api/*     → API REST              │
│  └── /*         → React (build Vite)    │
│                                         │
│  ScraperService (Playwright interno)    │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Contenedor: db                  │
│         MySQL 8                         │
└─────────────────────────────────────────┘
```

Un solo contenedor de aplicación sirve tanto la API como el frontend estático. La base de datos corre en un contenedor separado, igual que el patrón ya usado en el servidor.

---

## Estructura del Proyecto

```
imx-scout/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── prisma/
│   └── schema.prisma           ← Modelos de base de datos
└── src/
    ├── server.js               ← Punto de entrada de Express
    ├── api/
    │   └── routes/
    │       ├── productos.js    ← CRUD de productos monitoreados
    │       ├── scraping.js     ← Disparo y estado del scraping
    │       └── alertas.js      ← Consulta de alertas
    ├── services/
    │   ├── scraperService.js   ← Orquesta el scraping (lógica de v1)
    │   └── alertaService.js    ← Detecta cambios y genera alertas
    ├── scrapers/               ← Reutilizados de v1
    │   ├── amazonScraper.js
    │   └── ebayScraper.js
    ├── processors/             ← Reutilizado de v1
    │   └── urlProcessor.js
    ├── parsers/                ← Reutilizado de v1
    │   └── dataParser.js
    ├── utils/
    │   └── logger.js
    └── client/                 ← Proyecto React (Vite)
        ├── index.html
        ├── vite.config.js
        └── src/
            ├── main.jsx
            ├── App.jsx
            └── pages/
                ├── Dashboard.jsx
                ├── Productos.jsx
                └── Alertas.jsx
```

---

## Modelo de Base de Datos

### Tabla `Producto`

Representa un producto que el equipo monitorea. Cada entrada es única por URL.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | Identificador interno |
| `url` | String (unique) | URL canónica del producto |
| `asin` | String (nullable) | ASIN de Amazon si aplica |
| `plataforma` | Enum `amazon / ebay` | Plataforma detectada |
| `nombre` | String (nullable) | Nombre del producto |
| `activo` | Boolean | Si el producto está siendo monitoreado |
| `createdAt` | DateTime | Fecha de alta |
| `updatedAt` | DateTime | Última actualización |

### Tabla `RegistroPrecio`

Cada vez que se ejecuta un scraping exitoso se guarda un registro. Este es el historial de precios.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | Identificador interno |
| `productoId` | Int (FK) | Referencia al producto |
| `precio` | String (nullable) | Precio tal como aparece en la página |
| `envio` | String (nullable) | Información de envío hacia ZIP 78041 |
| `tiempo_entrega` | String (nullable) | Tiempo estimado de entrega |
| `status` | Enum `ok / error` | Resultado del scraping |
| `error_mensaje` | String (nullable) | Descripción del error si aplica |
| `timestamp` | DateTime | Fecha y hora del registro |

### Tabla `Alerta`

Registra cambios detectados entre el último scraping y el anterior.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | Identificador interno |
| `productoId` | Int (FK) | Referencia al producto |
| `tipo` | Enum | `precio_cambio / disponibilidad_cambio` |
| `valor_anterior` | String | Valor antes del cambio |
| `valor_nuevo` | String | Valor después del cambio |
| `leida` | Boolean | Si el equipo ya vio la alerta |
| `timestamp` | DateTime | Fecha y hora de la alerta |

---

## Flujo del Sistema v2

```
Usuario en la UI
       │
       ▼
Ingresa URLs/ASINs (pegado manual o carga CSV/Excel)
       │
       ▼
POST /api/scraping/ejecutar
  └── Valida que no supere MAX_URLS_PER_REQUEST
       │
       ▼
scraperService.js (orquestador — lógica de v1)
  ├── urlProcessor → clasifica y valida entradas
  ├── Abre navegador Playwright (un contexto por ejecución)
  ├── p-limit → máximo MAX_CONCURRENT_SCRAPERS en paralelo
  ├── Por cada URL:
  │     ├── Promise.race([scraper(), timeout(SCRAPER_TIMEOUT_MS)])
  │     ├── Ejecuta scraper correspondiente
  │     ├── dataParser → normaliza resultado
  │     ├── Guarda RegistroPrecio en MySQL vía Prisma
  │     └── logger.info({ url, plataforma, duracion, precio }, "scrape_success")
  └── Cierra navegador (try/finally garantizado)
       │
       ▼
alertaService.js
  └── Compara nuevo registro con el anterior por producto
      └── Si hay cambio de precio o envío → crea Alerta
       │
       ▼
Respuesta a la UI con resultados
  └── La UI muestra resultados en tiempo real
      y badge con alertas nuevas
```

---

## API REST

### Productos

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/productos` | Lista todos los productos monitoreados |
| `POST` | `/api/productos` | Agrega un producto por URL o ASIN |
| `DELETE` | `/api/productos/:id` | Elimina un producto |
| `GET` | `/api/productos/:id/historial` | Historial de precios de un producto |

### Scraping

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/scraping/ejecutar` | Ejecuta scraping sobre una lista de entradas |
| `GET` | `/api/scraping/estado` | Estado del scraping en curso (si hay uno activo) |

### Alertas

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/alertas` | Lista alertas no leídas |
| `PATCH` | `/api/alertas/:id/leida` | Marca una alerta como leída |

---

## Interfaz Web

La UI tiene tres vistas principales:

### Dashboard
Vista principal. Muestra:
- Input para ingresar URLs/ASINs manualmente o cargar archivo CSV/Excel
- Botón para ejecutar scraping
- Tabla con los resultados de la última ejecución
- Badge con contador de alertas no leídas

### Productos
Lista de todos los productos que el equipo ha procesado alguna vez. Permite:
- Ver el historial de precios de cada producto como tabla
- Eliminar un producto del seguimiento

### Alertas
Lista de cambios detectados en las últimas ejecuciones:
- Cambios de precio
- Cambios en disponibilidad o envío
- Permite marcar alertas como leídas

---

## Servicio de Alertas

`alertaService.js` se ejecuta automáticamente al final de cada scraping.

Por cada producto procesado exitosamente:

1. Consulta el registro anterior en `RegistroPrecio`
2. Compara el precio actual con el anterior
3. Compara la información de envío actual con la anterior
4. Si detecta un cambio, crea un registro en `Alerta`

Las alertas son visibles en la UI en la próxima carga de página. No hay notificaciones push en v2 — las alertas se consultan manualmente desde la sección Alertas.

---

## Entrada de Datos — Formatos Soportados

### Pegado manual en UI
El equipo escribe o pega URLs y ASINs directamente en un campo de texto, uno por línea. El mismo formato que `input/urls.json` en v1, pero sin editar archivos.

### Carga de archivo CSV
```
url_o_asin
B0DSVVJXK5
https://www.amazon.com/dp/B08N5WRWNW
https://www.ebay.com/itm/325528865399
```

### Carga de archivo Excel (.xlsx)
Una columna con encabezado `url_o_asin`. El sistema lee la primera hoja.

En todos los casos el procesamiento pasa por `urlProcessor.js` — la validación y clasificación es idéntica a v1.

---

## Despliegue

### Desarrollo local

```bash
# Levantar MySQL local
docker-compose up db -d

# Instalar dependencias
npm install

# Ejecutar migraciones
npx prisma migrate dev

# Levantar servidor Express (con hot reload)
npm run dev

# En otra terminal, levantar Vite dev server
npm run client:dev
```

En desarrollo, Vite corre en `:5173` y Express en `:3000`. Vite proxea las llamadas a `/api/*` hacia Express mediante `vite.config.js`.

En desarrollo no se necesita Traefik — el acceso es directo a `localhost:5173`.

---

### Producción (servidor propio)

#### Contexto del servidor

El servidor ya opera un stack Docker con Traefik (`cscart-router-1`) que publica los puertos 80 y 443 al exterior. Todos los sistemas internos se registran en Traefik mediante labels en su propio `docker-compose.yml` y se conectan a la red compartida del router.

IMX Scout vive como un proyecto Docker independiente — sin tocar el `docker-compose.yml` de CS-Cart.

#### Ubicación en el servidor

```
/root/platform/
├── platform/          ← CS-Cart (docker-compose.yml existente)
│   └── docker-compose.yml
└── imx-scout/         ← IMX Scout v2 (proyecto independiente)
    ├── docker-compose.yml
    ├── Dockerfile
    └── .env
```

#### Flujo de tráfico en producción

```
Internet
   │
   ▼
Traefik (cscart-router-1)
   │  puerto 80/443 → 0.0.0.0
   │  detecta Host: imxscout.dominio.com
   │
   ▼
imxscout-app-1 (:3000)
   │  Express sirve API + React build
   │
   ▼
imxscout-db-1 (MySQL 8)
```

#### docker-compose.yml de producción

```yaml
services:
  app:
    build: .
    container_name: imxscout-app-1
    restart: unless-stopped
    environment:
      DATABASE_URL: mysql://user:pass@db:3306/imxscout
      PORT: 3000
      NODE_ENV: production
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.imxscout.rule=Host(`imxscout.dominio.com`)"
      - "traefik.http.routers.imxscout.entrypoints=websecure"
      - "traefik.http.routers.imxscout.tls.certresolver=letsencrypt"
      - "traefik.http.services.imxscout.loadbalancer.server.port=3000"
      - "traefik.docker.network=cscart_router_net"
    networks:
      - imxscout_net
      - cscart_router_net    # ← red compartida con Traefik
    depends_on:
      - db

  db:
    image: mysql:8.0
    container_name: imxscout-db-1
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: imxscout
      MYSQL_USER: imxscout_user
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - imxscout_mysql_data:/var/lib/mysql
    networks:
      - imxscout_net           # ← solo red interna, no expuesta a Traefik

networks:
  imxscout_net:
    driver: bridge
  cscart_router_net:
    external: true             # ← red existente de Traefik, no se recrea

volumes:
  imxscout_mysql_data:
```

**Puntos clave de este diseño:**

- `cscart_router_net` se declara como `external: true` — IMX Scout se conecta a la red ya existente de Traefik sin crearla ni modificarla
- La base de datos (`imxscout-db-1`) solo está en `imxscout_net` — no es accesible desde Traefik ni desde otros proyectos
- El contenedor `app` está en ambas redes: `imxscout_net` para hablar con su DB, y `cscart_router_net` para recibir tráfico de Traefik
- El naming `imxscout-app-1` / `imxscout-db-1` sigue el patrón `proyecto-servicio-1` del servidor

#### Dockerfile (multi-stage build)

```dockerfile
# Stage 1 — build del cliente React
FROM node:20-alpine AS client-builder
WORKDIR /app
COPY package*.json ./
COPY src/client ./src/client
RUN npm ci
RUN npm run client:build

# Stage 2 — imagen final con Express
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY prisma ./prisma
COPY --from=client-builder /app/dist ./dist
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "src/server.js"]
```

#### Comandos de despliegue en producción

```bash
# Primera vez
cd /root/platform/imx-scout
docker-compose up -d

# Ejecutar migraciones (primera vez o después de cambios de schema)
docker exec imxscout-app-1 npx prisma migrate deploy

# Actualizar a nueva versión
git pull
docker-compose build
docker-compose up -d

# Ver logs
docker logs imxscout-app-1 -f
```

IMX Scout se puede reiniciar, actualizar o detener de forma completamente independiente sin afectar CS-Cart ni ningún otro sistema del servidor.

---

## Variables de Entorno

```env
# .env.example

# Servidor
PORT=3000
NODE_ENV=development

# Base de datos
DATABASE_URL="mysql://user:password@localhost:3306/imxscout"

# Límites de scraping
MAX_CONCURRENT_SCRAPERS=5      # scrapers corriendo en paralelo (p-limit)
MAX_URLS_PER_REQUEST=100       # URLs máximas por ejecución
SCRAPER_TIMEOUT_MS=30000       # timeout por URL en milisegundos
```

---

## Decisiones Arquitectónicas

Esta sección documenta las decisiones de diseño no obvias y el razonamiento detrás de ellas, para evitar regresiones futuras.

| Decisión | Elegido | Descartado | Razonamiento |
|---|---|---|---|
| Concurrencia de scrapers | `p-limit` | Queue + Worker (BullMQ + Redis) | Para 20–50 URLs, p-limit resuelve el problema sin agregar Redis ni un contenedor extra. Queue entra en v3 si el volumen escala a 500+ productos. |
| Precio en DB | `STRING` | `DECIMAL` | Amazon y eBay devuelven formatos inconsistentes. Guardar el texto original evita bugs de parsing. Se puede agregar `precio_normalizado DECIMAL` en una migración posterior. |
| Autenticación | Traefik Basic Auth | JWT en código | El sistema es interno. Proteger a nivel de infraestructura es más simple, centralizado y consistente con los otros sistemas del servidor. Cero código adicional. |
| Timeout por URL | `Promise.race()` 30s | Sin timeout | Amazon puede colgar indefinidamente. Sin timeout, un solo scraper puede bloquear toda la ejecución. |
| Estado del scraping | Variable en memoria | Tabla `ScrapeJob` | Una sola instancia del contenedor hace suficiente una variable en memoria. `ScrapeJob` entra en v3 si se necesita persistencia entre reinicios. |
| Logs | `pino` | `console.log` | Logs estructurados (JSON) permiten filtrar por `url`, `plataforma`, `duration` directamente en `docker logs`. |

---

## Principios de Diseño

Los mismos que v1, extendidos para v2:

- **Simplicidad** — cada módulo tiene una responsabilidad clara y acotada
- **Reutilización** — los scrapers, parser y procesador de URLs de v1 no se reescriben
- **Confiabilidad** — los errores por URL se capturan sin detener el proceso completo
- **Modularidad** — agregar soporte para una nueva plataforma sigue requiriendo solo un nuevo scraper y una entrada en `ALLOWED_DOMAINS`
- **Coherencia con la infraestructura** — MySQL, Docker y Traefik siguen el patrón ya establecido en el servidor

---

## Roadmap

### v1 — MVP (completado)
- Scraping de Amazon US y eBay desde línea de comandos
- Soporte de URLs completas y ASINs
- Configuración automática de dirección a Laredo TX (ZIP 78041)
- Exportación a JSON y CSV

### v2 — Sistema interno con UI (esta versión)
- Interfaz web (ingreso manual + carga de CSV/Excel)
- Base de datos MySQL con Prisma
- Historial de precios por producto con índice `(productoId, timestamp)`
- Alertas de cambios en UI
- Concurrencia controlada con `p-limit` (`MAX_CONCURRENT_SCRAPERS`)
- Timeout por URL con `Promise.race()` (`SCRAPER_TIMEOUT_MS`)
- Logs estructurados con `pino`
- Autenticación via Traefik Basic Auth
- Docker + Traefik para despliegue en servidor propio

### v3 — Futuro
- Monitoreo automático programado (cron jobs)
- Notificaciones por canal externo (email, Telegram, etc.)
- Soporte para más marketplaces
- Gráficas de evolución de precio por producto