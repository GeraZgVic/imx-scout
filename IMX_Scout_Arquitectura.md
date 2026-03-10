# IMX Scout v2 — Arquitectura del Sistema

## Descripción General

IMX Scout v2 convierte la herramienta de línea de comandos de v1 en un sistema interno completo con interfaz web, base de datos persistente e historial de precios.

El equipo puede ingresar URLs y ASINs directamente desde el navegador, ejecutar scraping bajo demanda, ver el historial por producto y revisar alertas de cambios en precio o tiempo de entrega sin editar archivos manualmente.

---

## Qué cambia respecto a v1

| Aspecto | v1 | v2 |
|---|---|---|
| Entrada de datos | Edición manual de `input/urls.json` | Interfaz web con pegado manual de URLs y ASINs |
| Ejecución | `npm start` en terminal | Botón en la UI |
| Resultados | Archivos `results.json` / `results.csv` | Base de datos + visualización en pantalla |
| Persistencia | Ninguna | MySQL — historial completo de cada producto |
| Notificaciones | Ninguna | Alertas en UI cuando cambia precio o el tiempo de tramitación/entrega |
| Despliegue | Script local | Operación local validada; despliegue a servidor queda como siguiente etapa |

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
| Contenedor | Docker + docker-compose | Planeado para la etapa de despliegue a servidor |
| Proxy | Traefik | Planeado para operación en servidor |

---

## Arquitectura General

```
┌─────────────────────────────────────────┐
│            Navegador local              │
│       Vite (:5173) en desarrollo        │
└────────────────┬────────────────────────┘
                 │  /api/*
┌────────────────▼────────────────────────┐
│         Express.js (:3000)              │
│  ├── API REST                           │
│  ├── ScraperService (Playwright)        │
│  └── Sirve build React en producción    │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│               MySQL 8                   │
│         Prisma + historial              │
└─────────────────────────────────────────┘
```

Hoy la operación validada es local: Vite corre separado en desarrollo y proxea `/api/*` hacia Express. El servicio de Express puede servir el build estático de React en producción local. Docker y Traefik siguen siendo parte del plan de despliegue posterior.

---

## Estructura del Proyecto

```
imx-scout/
├── .env.example
├── package.json
├── vite.config.js
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
        └── src/
            ├── main.jsx
            ├── App.jsx
            └── styles.css
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
| `envio` | String (nullable) | Información de envío hacia Laredo, TX 78041 |
| `tiempo_entrega` | String (nullable) | Promesa de entrega/tramitación reportada por la plataforma |
| `destino_consultado` | String (nullable) | Etiqueta del destino usado para consultar logística |
| `status` | Enum `ok / error` | Resultado del scraping |
| `error_mensaje` | String (nullable) | Descripción del error si aplica |
| `timestamp` | DateTime | Fecha y hora del registro |

### Tabla `Alerta`

Registra cambios detectados entre el último scraping y el anterior.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | Int (PK) | Identificador interno |
| `productoId` | Int (FK) | Referencia al producto |
| `tipo` | Enum | `precio_cambio / tiempo_entrega_cambio` |
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
Ingresa URLs/ASINs manualmente
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
  └── Si hay cambio de precio o tiempo de entrega → crea Alerta
       │
       ▼
Respuesta a la UI con resultados
  └── La UI muestra resultados de la corrida,
      historial por producto y badge con alertas nuevas
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
- Estado general del sistema
- Input manual para URLs/ASINs
- Resumen de la última corrida
- Alertas recientes y acceso rápido al inventario

### Productos
Lista de todos los productos que el equipo ha procesado alguna vez. Permite:
- Ver el historial de cada producto en un drawer lateral
- Eliminar un producto del seguimiento

### Alertas
Lista de cambios detectados en las últimas ejecuciones:
- Cambios de precio
- Cambios en tiempo de tramitación/entrega
- Permite marcar alertas como leídas

---

## Servicio de Alertas

`alertaService.js` se ejecuta automáticamente al final de cada scraping.

Por cada producto procesado exitosamente:

1. Consulta el registro anterior en `RegistroPrecio`
2. Compara el precio actual con el anterior
3. Compara el tiempo de tramitación/entrega actual con el anterior
4. Ignora fragmentos volátiles como countdowns de compra cuando no cambian la promesa logística real
5. Si detecta un cambio real, crea un registro en `Alerta`

Las alertas son visibles en la UI en la próxima carga de página. No hay notificaciones push en v2 — las alertas se consultan manualmente desde la sección Alertas.

---

## Entrada de Datos — Formatos Soportados

### Pegado manual en UI
El equipo escribe o pega URLs y ASINs directamente en un campo de texto, uno por línea. El procesamiento pasa por `urlProcessor.js` y la validación/clasificación es equivalente a v1.

### Carga masiva
La importación por CSV/Excel sigue contemplada, pero no forma parte del flujo cerrado actual de v2. Se considera siguiente etapa funcional.

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

Esta sección describe la arquitectura objetivo para despliegue. No forma parte del cierre funcional actual de v2 local.

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
| Autenticación en servidor | Traefik Basic Auth | JWT en código | Decisión reservada para la etapa de despliegue. En servidor, proteger a nivel de infraestructura sería más simple y consistente con otros sistemas internos. |
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
- **Coherencia con la infraestructura** — la operación local y el futuro despliegue a servidor se diseñan sin romper el patrón ya establecido

---

## Estado por Etapa

### v2 local — Cerrando alcance actual
- Interfaz web para operación local
- Ingreso manual de URLs y ASINs
- Base de datos MySQL con Prisma
- Historial de precios por producto con índice `(productoId, timestamp)`
- Alertas de cambios en UI para precio y tiempo de entrega
- Normalización básica para evitar ruido en countdowns de compra
- Confirmación visual del destino consultado (`Laredo, TX 78041`)
- Concurrencia controlada con `p-limit` (`MAX_CONCURRENT_SCRAPERS`)
- Timeout por URL con `Promise.race()` (`SCRAPER_TIMEOUT_MS`)
- Logs estructurados con `pino`
- Layout de workspace con Dashboard, Productos y Alertas

### v2 servidor — Planeado, no cerrado todavía
- Despliegue con Docker + Traefik
- Operación con build estático servido por Express
- Protección por infraestructura (por ejemplo Traefik Basic Auth)
- Separación de app y base de datos en contenedores

## Roadmap

### v1 — MVP (completado)
- Scraping de Amazon US y eBay desde línea de comandos
- Soporte de URLs completas y ASINs
- Configuración automática de dirección a Laredo TX (ZIP 78041)
- Exportación a JSON y CSV

### v2 — Sistema interno con UI
- Backend, scrapers, historial, alertas y UI local operativos
- Cierre funcional actual enfocado en operación local validada
- Despliegue a servidor tratado como subetapa posterior de v2, no como entregable ya cerrado

### v3 — Futuro
- Importación/exportación masiva
- Monitoreo automático programado (cron jobs)
- Notificaciones por canal externo (email, Telegram, etc.)
- Soporte para más marketplaces
- Gráficas de evolución de precio por producto
- Filtros, búsqueda y acciones masivas sobre inventario/alertas
