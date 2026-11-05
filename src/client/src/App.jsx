import React, { startTransition, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BellDot,
  Boxes,
  Check,
  CircleCheckBig,
  Clock3,
  ExternalLink,
  History,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import "./styles.css";

const EMPTY_STATUS = { activo: false, inicio: null, total: 0, procesados: 0, errores: 0 };
const EMPTY_COLLECTION = [];
const DEFAULT_PRODUCT_FILTERS = {
  search: "",
  prioridad: "all",
  estado: "all",
  plataforma: "all",
};
const NAV_ITEMS = [
  { id: "productos", label: "Productos", icon: Boxes },
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
  { id: "alertas", label: "Alertas", icon: AlertCircle },
];

const VIEW_META = {
  dashboard: {
    title: "Resumen",
    description: "Consultas recientes y elementos que requieren atención.",
  },
  productos: {
    title: "Productos",
    description: "Precios y estado de consulta, reunidos por producto.",
  },
  alertas: {
    title: "Alertas",
    description: "Cambios de precio y entrega que aún no has revisado.",
  },
};

const DEFAULT_DESTINATION_LABEL = "Laredo, TX 78041";

function getViewFromPath(pathname) {
  if (pathname === "/" || pathname === "/productos") return "productos";
  if (pathname === "/dashboard") return "dashboard";
  if (pathname === "/alertas") return "alertas";
  return "productos";
}

function readRouteFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const historialId = Number(params.get("historial"));

  return {
    view: getViewFromPath(window.location.pathname),
    historialId: Number.isInteger(historialId) && historialId > 0 ? historialId : null,
    filters: {
      ...DEFAULT_PRODUCT_FILTERS,
      search: params.get("q") || "",
      prioridad: params.get("prioridad") || DEFAULT_PRODUCT_FILTERS.prioridad,
      estado: params.get("estado") || DEFAULT_PRODUCT_FILTERS.estado,
      plataforma: params.get("plataforma") || DEFAULT_PRODUCT_FILTERS.plataforma,
    },
  };
}

function buildUrl(view, historialId = null, filters = null) {
  const pathname = view === "dashboard" ? "/dashboard" : `/${view}`;
  const params = new URLSearchParams();

  if (view === "productos" && historialId) {
    params.set("historial", String(historialId));
  }

  if (view === "productos" && filters) {
    if (filters.search) params.set("q", filters.search);
    if (filters.prioridad && filters.prioridad !== "all") params.set("prioridad", filters.prioridad);
    if (filters.estado && filters.estado !== "all") params.set("estado", filters.estado);
    if (filters.plataforma && filters.plataforma !== "all") params.set("plataforma", filters.plataforma);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function hasActiveProductFilters(filters) {
  return (
    filters.search !== DEFAULT_PRODUCT_FILTERS.search ||
    filters.prioridad !== DEFAULT_PRODUCT_FILTERS.prioridad ||
    filters.estado !== DEFAULT_PRODUCT_FILTERS.estado ||
    filters.plataforma !== DEFAULT_PRODUCT_FILTERS.plataforma
  );
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

function getReviewStateMeta(value, status) {
  if (status === "error") {
    return {
      tone: "error",
      label: "Error",
      detail: "La última consulta falló; los datos no se actualizaron",
    };
  }

  if (!value) {
    return {
      tone: "warning",
      label: "Sin consulta",
      detail: "Aún no hay una consulta registrada",
    };
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 24) {
    return {
      tone: "success",
      label: "Al dia",
      detail: "Consultado en las ultimas 24 horas",
    };
  }

  if (diffHours <= 72) {
    return {
      tone: "warning",
      label: "Por revisar",
      detail: "Conviene revisarlo pronto",
    };
  }

  return {
    tone: "error",
    label: "Atrasado",
    detail: "Supera las 72 horas sin consulta",
  };
}

function getHistorySignature(item) {
  return JSON.stringify({
    precio: item.precio || null,
    envio: item.envio || null,
    tiempo_entrega: item.tiempo_entrega || null,
    destino: inferDestino(item.destino_consultado, item.tiempo_entrega),
    status: item.status || null,
    error: item.error_mensaje || null,
  });
}

function compactHistory(historial) {
  if (!Array.isArray(historial) || historial.length === 0) return EMPTY_COLLECTION;

  const groups = [];

  for (const item of historial) {
    const signature = getHistorySignature(item);
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.signature === signature) {
      lastGroup.items.push(item);
      lastGroup.firstTimestamp = item.timestamp;
      continue;
    }

    groups.push({
      id: item.id,
      signature,
      items: [item],
      firstTimestamp: item.timestamp,
      lastTimestamp: item.timestamp,
      representative: item,
    });
  }

  return groups;
}

function matchesReviewState(producto, reviewStateFilter) {
  if (reviewStateFilter === "all") return true;
  return getReviewStateMeta(
    producto.ultimoRegistro?.timestamp,
    producto.ultimoRegistro?.status
  ).label.toLowerCase() === reviewStateFilter;
}

function splitEntries(text) {
  return text
    .split("\n")
    .map((e) => e.trim())
    .filter(Boolean);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(payload?.error || `Request failed: ${response.status}`);
  return payload;
}

function getItems(payload) {
  return Array.isArray(payload?.items) ? payload.items : EMPTY_COLLECTION;
}

function inferDestino(destinoConsultado, tiempoEntrega) {
  if (typeof destinoConsultado === "string" && destinoConsultado.trim()) {
    const zipMatch = destinoConsultado.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zipMatch && zipMatch[1] === "78041") return DEFAULT_DESTINATION_LABEL;
    if (zipMatch) return `Destino ${zipMatch[1]}`;
    return destinoConsultado;
  }

  if (typeof tiempoEntrega === "string") {
    const zipMatch = tiempoEntrega.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zipMatch && zipMatch[1] === "78041") return DEFAULT_DESTINATION_LABEL;
    if (zipMatch) return `Destino ${zipMatch[1]}`;
  }

  return "Destino no confirmado";
}

function PageHeading({ title, description, children }) {
  return (
    <header className="view-header">
      <div className="view-header-copy">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="view-header-actions">{children}</div>}
    </header>
  );
}

function SectionHeading({ title, detail, action }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function ActionButton({ icon: Icon, children, className = "", ...props }) {
  const isBusy = Icon === LoaderCircle;

  return (
    <button className={`button ${className}`.trim()} aria-busy={isBusy || undefined} {...props}>
      {Icon && <Icon className={isBusy ? "icon--loading" : undefined} size={16} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  );
}

function ReviewStateBadge({ value, status }) {
  const meta = getReviewStateMeta(value, status);
  const Icon = meta.label === "Al dia"
    ? CircleCheckBig
    : meta.label === "Por revisar"
      ? Clock3
      : meta.label === "Atrasado"
        ? TriangleAlert
        : AlertCircle;

  return (
    <span className={`state-badge state-badge--${meta.tone}`}>
      <Icon size={12} strokeWidth={2.2} />
      {meta.label}
    </span>
  );
}

function DataUnavailable({ title, description, onRetry }) {
  return (
    <section className="catalog-empty catalog-empty--compact" role="status">
      <ShieldAlert size={27} strokeWidth={1.7} />
      <h2>{title}</h2>
      <p>{description}</p>
      <ActionButton className="button--secondary" type="button" onClick={onRetry} icon={RefreshCw}>Volver a intentar</ActionButton>
    </section>
  );
}

/* ─────────────────────────────────────────────
   DASHBOARD VIEW
───────────────────────────────────────────── */
function DashboardView({
  estado,
  loading,
  dataLoadError,
  lastRun,
  entriesText,
  executing,
  setEntriesText,
  handleRunScraping,
  productos,
  alertas,
  handleLoadHistorial,
  handleRecheckProducto,
  recheckingProductId,
  handleMarkAlertaLeida,
  markingAlertId,
  goToProductos,
  goToAlertas,
  openRegister,
}) {
  const unreadByProduct = new Set(alertas.map((alerta) => alerta.productoId));
  const needsAttention = productos.filter((producto) => {
    const state = getReviewStateMeta(producto.ultimoRegistro?.timestamp, producto.ultimoRegistro?.status).label;
    return state === "Error" || state === "Atrasado" || state === "Por revisar";
  }).slice(0, 5);
  const errorCount = productos.filter((producto) => producto.ultimoRegistro?.status === "error").length;
  const lastRunItems = lastRun?.resultados?.slice(0, 5) || [];

  return (
    <div className="view">
      <PageHeading title="Resumen" description="Consultas recientes y elementos que requieren atención." />

      <section className={`run-status ${estado.activo ? "run-status--active" : ""}`} aria-live="polite">
        <span className="run-status-mark" aria-hidden="true" />
        <div>
          <strong>{loading ? "Cargando estado" : dataLoadError ? "Estado no disponible" : estado.activo ? "Consulta en curso" : "Sin consulta en curso"}</strong>
          <p>{loading
            ? "Estamos obteniendo los datos del catálogo."
            : dataLoadError
              ? "No se pudo recuperar el estado del catálogo."
              : estado.activo
            ? `${estado.procesados} de ${estado.total} entradas procesadas · ${estado.errores} con error`
            : estado.total > 0
              ? `Última corrida: ${estado.procesados} procesadas · ${estado.errores} con error`
              : "Aún no hay una corrida registrada en esta sesión."}</p>
        </div>
        <span className="run-status-count">{loading || dataLoadError ? "—" : `${productos.length} productos`}</span>
      </section>

      <div className="dashboard-layout">
        <section className="surface-section batch-section">
          <SectionHeading title="Consultar por lote" detail="Pega una URL o ASIN por línea para registrar y consultar productos." />
          <form onSubmit={handleRunScraping} className="batch-form">
            <label className="sr-only" htmlFor="scrape-entries">URLs o ASINs, uno por línea</label>
            <textarea
              id="scrape-entries"
              className="textarea"
              placeholder={"B0DSVVJXK5\nhttps://www.ebay.com/itm/325528865399"}
              value={entriesText}
              onChange={(event) => setEntriesText(event.target.value)}
            />
            <div className="form-footer">
              <ActionButton className="button--primary" type="submit" disabled={executing} icon={executing ? LoaderCircle : RefreshCw}>
                {executing ? "Consultando…" : "Iniciar consulta"}
              </ActionButton>
              <span className="form-hint">Los resultados y errores quedan en el historial de cada producto.</span>
            </div>
          </form>
          <button className="text-action" type="button" onClick={openRegister}>
            <Plus size={15} /> Registrar sin consultar todavía
          </button>
        </section>

        <section className="surface-section attention-section">
          <SectionHeading
            title="Por revisar"
            detail={`${errorCount} ${errorCount === 1 ? "consulta fallida" : "consultas fallidas"} en el catálogo`}
            action={<button className="text-action" type="button" onClick={goToProductos}>Ver productos <ArrowRight size={15} /></button>}
          />
          {needsAttention.length === 0 ? (
            <p className="quiet-empty">{dataLoadError ? "No se pudieron cargar los productos." : loading ? "Cargando catálogo…" : "No hay productos que requieran atención ahora."}</p>
          ) : (
            <div className="attention-list">
              {needsAttention.map((producto) => {
                const meta = getReviewStateMeta(producto.ultimoRegistro?.timestamp, producto.ultimoRegistro?.status);
                const isUnread = unreadByProduct.has(producto.id);
                return (
                  <div className="attention-row" key={producto.id}>
                    <button className="attention-product" type="button" onClick={() => handleLoadHistorial(producto)}>
                      <span className={`attention-mark attention-mark--${meta.tone}`} />
                      <span><strong>{producto.nombre || producto.asin || `Producto ${producto.id}`}</strong><small>{isUnread ? "Tiene un cambio sin revisar" : meta.detail}</small></span>
                    </button>
                    <button
                      className="icon-text-button"
                      type="button"
                      disabled={recheckingProductId === producto.id}
                      aria-busy={recheckingProductId === producto.id || undefined}
                      onClick={() => handleRecheckProducto(producto)}
                    >
                      {recheckingProductId === producto.id ? <LoaderCircle className="icon--loading" size={14} /> : <RefreshCw size={14} />} {recheckingProductId === producto.id ? "Consultando" : "Reconsultar"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="surface-section recent-run-section">
          <SectionHeading title="Última corrida" detail={lastRun ? `${lastRunItems.length} resultados recientes de esta sesión` : "Los resultados aparecerán aquí después de consultar."} />
          {lastRunItems.length === 0 ? (
            <p className="quiet-empty">Todavía no se ejecuta una consulta desde esta sesión.</p>
          ) : (
            <div className="run-results">
              {lastRunItems.map((item) => (
                <div className="run-result-row" key={`${item.url}-${item.timestamp}`}>
                  <div className="run-result-copy">
                    <strong>{item.nombre || item.url}</strong>
                    <span>{item.plataforma || "Marketplace"} · {item.precio || "Sin precio"}</span>
                    {item.error_mensaje && <small>{item.error_mensaje}</small>}
                  </div>
                  <span className={`state-badge state-badge--${item.status === "ok" ? "success" : "error"}`}>
                    {item.status === "ok" ? <CircleCheckBig size={13} /> : <ShieldAlert size={13} />}
                    {item.status === "ok" ? "Consultado" : "Error"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="surface-section alert-preview-section">
          <SectionHeading
            title="Cambios recientes"
            detail={alertas.length ? `${alertas.length} por revisar` : "Los cambios detectados aparecerán aquí."}
            action={alertas.length > 0 ? <button className="text-action" type="button" onClick={goToAlertas}>Ver alertas <ArrowRight size={15} /></button> : null}
          />
          {alertas.length === 0 ? (
            <p className="quiet-empty">{dataLoadError ? "No se pudieron cargar las alertas." : loading ? "Cargando alertas…" : "No hay cambios sin revisar."}</p>
          ) : (
            <div className="recent-alerts">
              {alertas.slice(0, 4).map((alerta) => (
                <div className="recent-alert" key={alerta.id}>
                  <span className="change-signal" aria-hidden="true" />
                  <div className="recent-alert-copy">
                    <strong>{alerta.producto?.nombre || `Producto ${alerta.productoId}`}</strong>
                    <span>{alerta.tipo === "precio_cambio" ? "Precio" : "Entrega"}: {alerta.valor_anterior} <ArrowRight size={12} /> {alerta.valor_nuevo}</span>
                  </div>
                  <button className="icon-button" type="button" disabled={markingAlertId !== null} aria-busy={markingAlertId === alerta.id || undefined} aria-label={`Marcar alerta de ${alerta.producto?.nombre || "producto"} como revisada`} onClick={() => handleMarkAlertaLeida(alerta.id)}>
                    {markingAlertId === alerta.id ? <LoaderCircle className="icon--loading" size={16} /> : <Check size={16} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PRODUCTOS VIEW
───────────────────────────────────────────── */
function ProductosView({
  loading,
  dataLoadError,
  onRetryLoad,
  productos,
  alertas,
  routeFilters,
  onFiltersChange,
  handleLoadHistorial,
  handleReviewProductChanges,
  reviewingProductId,
  handleRecheckProducto,
  handleRecheckPrioritarios,
  recheckingPrioritarios,
  recheckingProductId,
  handleTogglePrioridad,
  togglingPriorityId,
  handleDeleteProducto,
  priorityNotice,
  clearFilters,
  openRegister,
}) {
  const searchTerm = routeFilters.search || "";
  const priorityFilter = routeFilters.prioridad || "all";
  const reviewStateFilter = routeFilters.estado || "all";
  const platformFilter = routeFilters.plataforma || "all";
  const prioritizedCount = productos.filter((producto) => producto.prioritario).length;
  const hasActiveFilters = hasActiveProductFilters(routeFilters);
  const alertsByProduct = alertas.reduce((result, alerta) => {
    const current = result.get(alerta.productoId) || [];
    current.push(alerta);
    result.set(alerta.productoId, current);
    return result;
  }, new Map());
  const filteredProducts = productos.filter((producto) => {
    const query = searchTerm.trim().toLowerCase();
    const productText = [
      producto.nombre || "",
      producto.asin || "",
      producto.url || "",
      producto.plataforma || "",
    ]
      .join(" ")
      .toLowerCase();

    if (query && !productText.includes(query)) return false;
    if (priorityFilter === "prioritarios" && !producto.prioritario) return false;
    if (priorityFilter === "normales" && producto.prioritario) return false;
    if (platformFilter !== "all" && producto.plataforma !== platformFilter) return false;
    if (!matchesReviewState(producto, reviewStateFilter)) return false;
    return true;
  });

  return (
    <div className="view">
      <PageHeading title="Productos" description="Precios y estado de consulta, reunidos por producto.">
        {prioritizedCount > 0 && <ActionButton
            className="button--secondary"
            type="button"
            disabled={recheckingPrioritarios}
            onClick={handleRecheckPrioritarios}
          icon={recheckingPrioritarios ? LoaderCircle : RefreshCw}
          >
            {recheckingPrioritarios ? "Consultando prioritarios…" : "Consultar prioritarios"}
          </ActionButton>}
      </PageHeading>

      <div className="catalog-summary" aria-live="polite">
        {dataLoadError ? <span>Resumen del catálogo no disponible.</span> : loading ? <span>Cargando resumen del catálogo…</span> : <>
          <span><strong>{productos.length}</strong> {productos.length === 1 ? "producto" : "productos"}</span>
          <span className="summary-separator" aria-hidden="true">/</span>
          <span>{alertas.length} {alertas.length === 1 ? "cambio por revisar" : "cambios por revisar"}</span>
          <span className="summary-separator" aria-hidden="true">/</span>
          <span>{prioritizedCount} prioritarios</span>
        </>}
      </div>
      {priorityNotice && <div className="info-banner">{priorityNotice}</div>}
      {loading ? (
        <div className="catalog-loading" aria-live="polite"><span className="spinner" /> Cargando productos…</div>
      ) : dataLoadError ? (
        <DataUnavailable title="No se pudo cargar el catálogo" description="El servicio no devolvió los productos. Reintenta cuando la conexión esté disponible." onRetry={onRetryLoad} />
      ) : productos.length === 0 ? (
        <section className="catalog-empty">
          <PackageSearch size={28} strokeWidth={1.7} />
          <h2>Tu catálogo empieza aquí</h2>
          <p>Registra un ASIN o una URL compatible. Puedes consultar el precio ahora o dejarlo preparado para después.</p>
          <ActionButton className="button--primary" type="button" onClick={openRegister} icon={Plus}>Registrar primer producto</ActionButton>
        </section>
      ) : (
        <section className="catalog-surface" aria-label="Catálogo de productos">
          <div className="catalog-toolbar">
            <label className="search-control">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Buscar productos</span>
              <input
                type="search"
                value={searchTerm}
                placeholder="Nombre, ASIN o URL"
                onChange={(event) => onFiltersChange({ search: event.target.value })}
              />
            </label>
            <label className="select-control"><span className="sr-only">Filtrar por plataforma</span>
              <select value={platformFilter} onChange={(event) => onFiltersChange({ plataforma: event.target.value })}>
                <option value="all">Todas las plataformas</option>
                <option value="amazon">Amazon</option>
                <option value="ebay">eBay</option>
              </select>
            </label>
            <label className="select-control"><span className="sr-only">Filtrar por estado</span>
              <select value={reviewStateFilter} onChange={(event) => onFiltersChange({ estado: event.target.value })}>
                <option value="all">Todos los estados</option>
                <option value="al dia">Al día</option>
                <option value="por revisar">Por revisar</option>
                <option value="atrasado">Atrasado</option>
                <option value="error">Error</option>
                <option value="sin consulta">Sin consulta</option>
              </select>
            </label>
            <label className="select-control"><span className="sr-only">Filtrar por prioridad</span>
              <select value={priorityFilter} onChange={(event) => onFiltersChange({ prioridad: event.target.value })}>
                <option value="all">Toda prioridad</option>
                <option value="prioritarios">Prioritarios</option>
                <option value="normales">Normales</option>
              </select>
            </label>
            <span className="visible-count">{filteredProducts.length} de {productos.length}</span>
          </div>
          {hasActiveFilters && (
            <div className="filter-context">
              <span>Filtros aplicados</span>
              <button className="text-action" type="button" onClick={clearFilters}>Limpiar filtros <X size={14} /></button>
            </div>
          )}
          {filteredProducts.length === 0 ? (
            <div className="quiet-empty catalog-no-results">No hay productos que coincidan con estos filtros.</div>
          ) : (
            <div className="table-wrap" role="region" aria-label="Productos y últimos resultados" tabIndex="0">
              <table className="table">
                <thead><tr>
                  <th scope="col">Producto</th><th scope="col">Marketplace</th><th scope="col">Último precio</th><th scope="col">Entrega</th><th scope="col">Consulta</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th>
                </tr></thead>
                <tbody>
                  {filteredProducts.map((producto) => {
                    const productAlerts = alertsByProduct.get(producto.id) || [];
                    const isChanged = productAlerts.length > 0;
                    const lastAttempt = producto.ultimoRegistro;
                    const lastValid = lastAttempt?.status === "ok" ? lastAttempt : producto.ultimoDatoValido;
                    const state = getReviewStateMeta(lastAttempt?.timestamp, lastAttempt?.status);
                    const priceAlert = productAlerts.find((alerta) => alerta.tipo === "precio_cambio");
                    const deliveryAlert = productAlerts.find((alerta) => alerta.tipo === "tiempo_entrega_cambio");
                    const label = producto.nombre || producto.asin || `Producto ${producto.id}`;
                    return (
                      <tr className={isChanged ? "product-row product-row--changed" : "product-row"} key={producto.id}>
                        <td data-label="Producto">
                          <div className="product-cell">
                            <button className={`priority-star ${producto.prioritario ? "priority-star--active" : ""}`} type="button" disabled={togglingPriorityId === producto.id} onClick={() => handleTogglePrioridad(producto)} aria-label={producto.prioritario ? `Quitar ${label} de prioritarios` : `Marcar ${label} como prioritario`} aria-pressed={producto.prioritario}>
                              <Star size={15} fill={producto.prioritario ? "currentColor" : "none"} />
                            </button>
                            <div className="product-identity">
                              <strong>{label}</strong>
                              <span>{producto.asin || producto.url}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Marketplace"><span className={`marketplace marketplace--${producto.plataforma}`}>{producto.plataforma === "ebay" ? "eBay" : "Amazon"}</span></td>
                        <td data-label="Último precio">
                          <div className="price-cell">
                            <strong>{lastValid?.precio || "—"}</strong>
                            {lastAttempt?.status === "error" && lastValid?.precio && <small>Último dato válido</small>}
                            {!lastAttempt && <small>Sin consultar</small>}
                            {priceAlert && <small className="change-detail"><ArrowRight size={13} /> {priceAlert.valor_anterior} → {priceAlert.valor_nuevo}</small>}
                          </div>
                        </td>
                        <td data-label="Entrega">
                          <div className="delivery-cell"><span>{lastValid?.tiempo_entrega || "—"}</span>
                            {lastValid?.destino_consultado && <small>{inferDestino(lastValid.destino_consultado, lastValid.tiempo_entrega)}</small>}
                            {deliveryAlert && <small className="change-detail">Entrega modificada</small>}
                          </div>
                        </td>
                        <td data-label="Consulta"><span className="query-time">{formatDate(lastAttempt?.timestamp)}</span>{lastAttempt?.status === "error" && <small className="cell-detail">Falló; se conserva el último dato válido</small>}</td>
                        <td data-label="Estado">
                          <div className="state-cell">
                            {isChanged ? <span className="state-badge state-badge--change"><span className="change-signal" />Cambio nuevo</span> : <ReviewStateBadge value={lastAttempt?.timestamp} status={lastAttempt?.status} />}
                            {lastAttempt?.status === "error" && <small className="cell-detail cell-detail--error">{lastAttempt.error_mensaje || "La consulta no actualizó los datos."}</small>}
                          </div>
                        </td>
                        <td data-label="Acciones">
                          <div className="row-actions">
                            {isChanged ? (
                              <button className="row-action row-action--review" type="button" disabled={reviewingProductId !== null} aria-busy={reviewingProductId === producto.id || undefined} onClick={() => handleReviewProductChanges(producto, productAlerts)}>
                                {reviewingProductId === producto.id ? <LoaderCircle className="icon--loading" size={14} /> : <ArrowRight size={14} />}
                                {reviewingProductId === producto.id ? "Revisando…" : "Revisar"}
                              </button>
                            ) : (
                              <button className="row-action" type="button" onClick={() => handleLoadHistorial(producto)} aria-label={`Abrir historial de ${label}`}>
                                <History size={15} /> Historial
                              </button>
                            )}
                            <button className={`row-icon-action ${recheckingProductId === producto.id ? "row-icon-action--loading" : ""}`} type="button" disabled={recheckingProductId === producto.id} aria-busy={recheckingProductId === producto.id || undefined} onClick={() => handleRecheckProducto(producto)} aria-label={`Reconsultar ${label}`} title="Reconsultar">
                              {recheckingProductId === producto.id ? <LoaderCircle size={15} /> : <RefreshCw size={15} />}
                            </button>
                            <a className="row-icon-action" href={producto.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${label} en ${producto.plataforma}`} title="Abrir producto"><ExternalLink size={15} /></a>
                            <button className="row-icon-action row-icon-action--danger" type="button" onClick={() => handleDeleteProducto(producto.id)} aria-label={`Eliminar ${label}`} title="Eliminar"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="catalog-footer">
            <span>Precios y entregas corresponden a la última consulta exitosa.</span>
            <button className="text-action" type="button" onClick={openRegister}><Plus size={15} /> Registrar producto</button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ALERTAS VIEW
───────────────────────────────────────────── */
function AlertasView({ loading, dataLoadError, onRetryLoad, alertas, markingAlertId, handleMarkAlertaLeida, handleLoadHistorial, goToProductos }) {
  return (
    <div className="view">
      <PageHeading title="Alertas" description="Cambios de precio y entrega que aún no has revisado.">
        <ActionButton className="button--secondary" type="button" onClick={goToProductos} icon={Boxes}>Ver catálogo</ActionButton>
      </PageHeading>
      <div className="catalog-summary" aria-live="polite">{dataLoadError ? "No se pudo confirmar el estado de las alertas." : loading ? "Cargando alertas…" : <><strong>{alertas.length}</strong> {alertas.length === 1 ? "cambio pendiente" : "cambios pendientes"}</>}</div>
      {loading ? (
        <div className="catalog-loading"><span className="spinner" /> Cargando alertas…</div>
      ) : dataLoadError ? (
        <DataUnavailable title="No se pudieron cargar las alertas" description="No podemos confirmar si hay cambios pendientes. Reintenta cuando la conexión esté disponible." onRetry={onRetryLoad} />
      ) : alertas.length === 0 ? (
        <section className="catalog-empty catalog-empty--compact">
          <CircleCheckBig size={27} strokeWidth={1.7} />
          <h2>Todo revisado</h2>
          <p>Cuando un precio o la entrega cambien, la alerta quedará aquí hasta que la revises.</p>
        </section>
      ) : (
        <section className="alert-queue" aria-label="Alertas pendientes">
          {alertas.map((alerta) => {
            const name = alerta.producto?.nombre || `Producto ${alerta.productoId}`;
            const isPrice = alerta.tipo === "precio_cambio";
            return (
              <article className="alert-entry" key={alerta.id}>
                <span className="alert-entry-signal" aria-hidden="true"><span /></span>
                <div className="alert-entry-main">
                  <div className="alert-entry-title">
                    <div><h2>{name}</h2><span>{alerta.producto?.plataforma === "ebay" ? "eBay" : "Amazon"} · {isPrice ? "Cambio de precio" : "Cambio en entrega"}</span></div>
                    <time dateTime={alerta.timestamp}>{formatDate(alerta.timestamp)}</time>
                  </div>
                  <div className="alert-comparison">
                    <div><span>Anterior</span><strong>{alerta.valor_anterior}</strong></div>
                    <ArrowRight size={16} aria-hidden="true" />
                    <div><span>Ahora</span><strong>{alerta.valor_nuevo}</strong></div>
                  </div>
                  <div className="alert-entry-actions">
                    <button className="row-action" type="button" onClick={() => handleLoadHistorial(alerta.producto)}><History size={15} /> Abrir historial</button>
                    <button className="row-action row-action--review" type="button" disabled={markingAlertId !== null} aria-busy={markingAlertId === alerta.id || undefined} onClick={() => handleMarkAlertaLeida(alerta.id)}>
                      {markingAlertId === alerta.id ? <LoaderCircle className="icon--loading" size={15} /> : <Check size={15} />}
                      {markingAlertId === alerta.id ? "Guardando…" : "Marcar revisada"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function ProductRegistrationDialog({
  open,
  onClose,
  onSubmit,
  value,
  setValue,
  consultAfterCreate,
  setConsultAfterCreate,
  submitting,
}) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog className="product-dialog" ref={dialogRef} aria-labelledby="register-title" aria-describedby="register-description" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-heading">
        <div><span className="dialog-mark"><PackageSearch size={18} /></span><h2 id="register-title">Registrar producto</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar registro"><X size={18} /></button>
      </div>
      <p className="dialog-description" id="register-description">Agrega un ASIN de Amazon o una URL de Amazon o eBay.</p>
      <form className="register-form" onSubmit={onSubmit}>
        <label htmlFor="product-entry">ASIN o URL</label>
        <input ref={inputRef} id="product-entry" name="product" type="text" autoComplete="url" value={value} onChange={(event) => setValue(event.target.value)} placeholder="B0DSVVJXK5 o https://…" required />
        <span className="field-help">El producto se guardará en el catálogo aunque la consulta falle.</span>
        <label className="check-field"><input type="checkbox" checked={consultAfterCreate} onChange={(event) => setConsultAfterCreate(event.target.checked)} /><span><strong>Consultar ahora</strong><small>Obtener el primer precio y estado de entrega al registrarlo.</small></span></label>
        <div className="dialog-actions">
          <button className="button button--secondary" type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
          <ActionButton className="button--primary" type="submit" disabled={submitting} icon={submitting ? LoaderCircle : Plus}>{submitting ? "Guardando…" : consultAfterCreate ? "Registrar y consultar" : "Registrar producto"}</ActionButton>
        </div>
      </form>
    </dialog>
  );
}

/* ─────────────────────────────────────────────
   PRODUCT HISTORY DIALOG
───────────────────────────────────────────── */
function HistorialDrawer({ historialProducto, historial, historyLoading, onClose }) {
  const [compactMode, setCompactMode] = useState(true);
  const dialogRef = useRef(null);
  const open = !!historialProducto;
  const historyGroups = compactHistory(historial);
  const visibleHistory = compactMode ? historyGroups : historial;
  const productName = historialProducto?.nombre || historialProducto?.asin || `Producto ${historialProducto?.id || ""}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog className="history-dialog" ref={dialogRef} aria-labelledby="history-title" onClose={onClose}>
      <div className="history-dialog-header">
        <div><span className="history-context">Historial de consultas</span><h2 id="history-title">{productName}</h2>{historialProducto?.asin && <span className="history-product-id">{historialProducto.asin}</span>}</div>
        <button className="icon-button" type="button" onClick={() => dialogRef.current?.close()} aria-label="Cerrar historial"><X size={18} /></button>
      </div>

      {historialProducto && historial.length > 0 && (
        <div className="history-toolbar">
          <span>{compactMode ? `${historyGroups.length} grupos · ${historial.length} consultas` : `${historial.length} consultas`}</span>
          <button className="text-action" type="button" onClick={() => setCompactMode((current) => !current)}>{compactMode ? "Ver todos los registros" : "Agrupar consultas iguales"}</button>
        </div>
      )}

      {historyLoading ? (
        <div className="history-empty"><span className="spinner" /> Cargando historial…</div>
      ) : !historialProducto ? (
        <div className="history-empty"><PackageSearch size={24} /><p>Selecciona un producto desde el catálogo.</p></div>
      ) : historial.length === 0 ? (
        <div className="history-empty"><Clock3 size={24} /><p>Aún no hay consultas para este producto.</p><span>Cuando se ejecute la primera, sus resultados aparecerán aquí.</span></div>
      ) : (
        <div className="history-list">
          {compactMode
            ? visibleHistory.map((group) => {
                const item = group.representative;
                const repeated = group.items.length > 1;
                return (
                  <article className={`history-entry ${item.status === "error" ? "history-entry--error" : ""}`} key={group.id}>
                    <div className="history-entry-top"><strong>{item.precio || "Sin precio"}</strong><span className={`state-badge state-badge--${item.status === "ok" ? "success" : "error"}`}>{item.status === "ok" ? "Consultado" : "Error"}</span></div>
                    <dl><div><dt>Envío</dt><dd>{item.envio || "—"}</dd></div><div><dt>Entrega</dt><dd>{item.tiempo_entrega || "—"}</dd></div><div><dt>Destino</dt><dd>{inferDestino(item.destino_consultado, item.tiempo_entrega)}</dd></div></dl>
                    {item.error_mensaje && <p className="history-error-copy">{item.error_mensaje}</p>}
                    <time dateTime={item.timestamp}>{repeated ? `Sin cambios entre ${formatDate(group.firstTimestamp)} y ${formatDate(group.lastTimestamp)} · ${group.items.length} consultas` : formatDate(item.timestamp)}</time>
                  </article>
                );
              })
            : visibleHistory.map((item) => (
                <article className={`history-entry ${item.status === "error" ? "history-entry--error" : ""}`} key={item.id}>
                  <div className="history-entry-top"><strong>{item.precio || "Sin precio"}</strong><span className={`state-badge state-badge--${item.status === "ok" ? "success" : "error"}`}>{item.status === "ok" ? "Consultado" : "Error"}</span></div>
                  <dl><div><dt>Envío</dt><dd>{item.envio || "—"}</dd></div><div><dt>Entrega</dt><dd>{item.tiempo_entrega || "—"}</dd></div><div><dt>Destino</dt><dd>{inferDestino(item.destino_consultado, item.tiempo_entrega)}</dd></div></dl>
                  {item.error_mensaje && <p className="history-error-copy">{item.error_mensaje}</p>}
                  <time dateTime={item.timestamp}>{formatDate(item.timestamp)}</time>
                </article>
              ))}
        </div>
      )}
    </dialog>
  );
}

/* ─────────────────────────────────────────────
   ROOT APP
───────────────────────────────────────────── */
export default function App() {
  const [activeView, setActiveView] = useState(() => readRouteFromLocation().view);
  const [routeHistorialId, setRouteHistorialId] = useState(() => readRouteFromLocation().historialId);
  const [routeFilters, setRouteFilters] = useState(() => readRouteFromLocation().filters);
  const [productos, setProductos] = useState(EMPTY_COLLECTION);
  const [alertas, setAlertas] = useState(EMPTY_COLLECTION);
  const [estado, setEstado] = useState(EMPTY_STATUS);
  const [historial, setHistorial] = useState(EMPTY_COLLECTION);
  const [historialProducto, setHistorialProducto] = useState(null);
  const [entriesText, setEntriesText] = useState("");
  const [lastRun, setLastRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [recheckingProductId, setRecheckingProductId] = useState(null);
  const [reviewingProductId, setReviewingProductId] = useState(null);
  const [recheckingPrioritarios, setRecheckingPrioritarios] = useState(false);
  const [togglingPriorityId, setTogglingPriorityId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [markingAlertId, setMarkingAlertId] = useState(null);
  const [error, setError] = useState("");
  const [dataLoadError, setDataLoadError] = useState(false);
  const [priorityNotice, setPriorityNotice] = useState("");
  const [productNotice, setProductNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [productDraft, setProductDraft] = useState("");
  const [consultAfterCreate, setConsultAfterCreate] = useState(true);
  const [registeringProduct, setRegisteringProduct] = useState(false);

  function navigateToView(view, options = {}) {
    const {
      historialId = null,
      replace = false,
      filters = view === "productos" ? routeFilters : null,
    } = options;
    const nextUrl = buildUrl(view, historialId, filters);
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    setActiveView(view);
    setRouteHistorialId(historialId);
    if (view === "productos" && filters) {
      setRouteFilters(filters);
    }

    if (currentUrl === nextUrl) return;

    if (replace) {
      window.history.replaceState({}, "", nextUrl);
      return;
    }

    window.history.pushState({}, "", nextUrl);
  }

  function navigateToProductosWithFilters(partialFilters = {}, options = {}) {
    navigateToView("productos", {
      ...options,
      filters: {
        ...DEFAULT_PRODUCT_FILTERS,
        ...partialFilters,
      },
    });
  }

  async function loadDashboard() {
    try {
      const [productosData, alertasData, estadoData] = await Promise.all([
        api("/api/productos"),
        api("/api/alertas"),
        api("/api/scraping/estado"),
      ]);
      setDataLoadError(false);
      startTransition(() => {
        setProductos(getItems(productosData));
        setAlertas(getItems(alertasData));
        setEstado(estadoData || EMPTY_STATUS);
      });
    } catch (err) {
      setDataLoadError(true);
      throw err;
    }
  }

  useEffect(() => {
    const initialRoute = readRouteFromLocation();
    navigateToView(initialRoute.view, {
      historialId: initialRoute.historialId,
      filters: initialRoute.filters,
      replace: window.location.pathname === "/",
    });

    function handlePopState() {
      const nextRoute = readRouteFromLocation();
      setActiveView(nextRoute.view);
      setRouteHistorialId(nextRoute.historialId);
      setRouteFilters(nextRoute.filters);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");
        await loadDashboard();
      } catch (err) {
        if (active) {
          setDataLoadError(true);
          setError(err.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    bootstrap();
    const id = window.setInterval(async () => {
      try {
        const d = await api("/api/scraping/estado");
        if (active) startTransition(() => setEstado(d || EMPTY_STATUS));
      } catch {}
    }, 4000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  async function handleRetryLoad() {
    setLoading(true);
    setError("");
    try {
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeView !== "productos") return;

    if (!routeHistorialId) {
      if (historialProducto) {
        setHistorialProducto(null);
        setHistorial(EMPTY_COLLECTION);
      }
      return;
    }

    const producto = productos.find((item) => item.id === routeHistorialId);
    if (!producto || historialProducto?.id === routeHistorialId) return;

    async function syncHistorialFromRoute() {
      try {
        setHistoryLoading(true);
        setError("");
        const result = await api(`/api/productos/${producto.id}/historial`);
        setHistorialProducto(producto);
        setHistorial(getItems(result));
      } catch (err) {
        setError(err.message);
      } finally {
        setHistoryLoading(false);
      }
    }

    syncHistorialFromRoute();
  }, [activeView, routeHistorialId, productos, historialProducto]);

  async function runScrapingEntries(entries, options = {}) {
    const { resetInput = false, productToRefresh = null, targetView = "dashboard" } = options;

    if (!entries.length) {
      throw new Error("Agrega al menos una URL o ASIN.");
    }

    const result = await api("/api/scraping/ejecutar", {
      method: "POST",
      body: JSON.stringify({ entries }),
    });

    setLastRun(result);
    if (resetInput) setEntriesText("");
    await loadDashboard();

    if (productToRefresh) {
      const refreshedHistory = await api(`/api/productos/${productToRefresh.id}/historial`);
      setHistorialProducto(productToRefresh);
      setHistorial(getItems(refreshedHistory));
    }

    navigateToView(targetView, {
      historialId: targetView === "productos" ? productToRefresh?.id || routeHistorialId : null,
      filters: targetView === "productos" ? routeFilters : null,
    });
    return result;
  }

  function handleProductosFiltersChange(partialFilters) {
    const nextFilters = {
      ...routeFilters,
      ...partialFilters,
    };

    navigateToView("productos", {
      historialId: routeHistorialId,
      filters: nextFilters,
    });
  }

  async function handleRunScraping(e) {
    e.preventDefault();
    const entries = splitEntries(entriesText);
    if (!entries.length) {
      setError("Agrega al menos una URL o ASIN.");
      return;
    }
    try {
      setExecuting(true);
      setError("");
      await runScrapingEntries(entries, { resetInput: true, targetView: "dashboard" });
    } catch (err) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  }

  async function handleRegisterProduct(e) {
    e.preventDefault();
    const value = productDraft.trim();
    if (!value) return;

    const isAsin = /^[A-Z0-9]{10}$/i.test(value);
    let registeredProduct = null;
    try {
      setRegisteringProduct(true);
      setError("");
      setProductNotice("");
      registeredProduct = await api("/api/productos", {
        method: "POST",
        body: JSON.stringify(isAsin ? { asin: value } : { url: value }),
      });
      setRegisterDialogOpen(false);
      setProductDraft("");

      if (consultAfterCreate) {
        try {
          const runResult = await runScrapingEntries([registeredProduct.url], { targetView: "productos" });
          const firstResultFailed = runResult.resultados?.some((item) => item.status === "error");
          setProductNotice(firstResultFailed
            ? "Producto registrado; la primera consulta terminó con error. El catálogo conserva ese estado para reintentar."
            : "Producto registrado y primera consulta completada.");
        } catch (scrapeError) {
          await loadDashboard().catch(() => {});
          navigateToView("productos");
          setError(`El producto quedó registrado, pero no se pudo consultar: ${scrapeError.message}`);
        }
      } else {
        await loadDashboard();
        navigateToView("productos");
        setProductNotice("Producto registrado. Aún no tiene una consulta de precio.");
      }
    } catch (err) {
      if (registeredProduct) {
        setError(`Producto registrado, pero no se pudieron cargar los datos: ${err.message}`);
        setRegisterDialogOpen(false);
      } else {
        setError(err.message);
      }
    } finally {
      setRegisteringProduct(false);
    }
  }

  function openRegisterDialog() {
    setError("");
    setRegisterDialogOpen(true);
  }

  function closeRegisterDialog() {
    if (registeringProduct) return;
    setRegisterDialogOpen(false);
  }

  async function handleRecheckProducto(producto) {
    try {
      setRecheckingProductId(producto.id);
      setError("");
      await runScrapingEntries([producto.url], {
        productToRefresh: historialProducto?.id === producto.id ? producto : null,
        targetView: activeView,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setRecheckingProductId(null);
    }
  }

  async function handleRecheckPrioritarios() {
    try {
      setRecheckingPrioritarios(true);
      setError("");
      setPriorityNotice("");
      const result = await api("/api/scraping/prioritarios", {
        method: "POST",
      });
      setLastRun(result);
      await loadDashboard();
      setPriorityNotice(
        `Corrida prioritaria completada: ${result.exitosos} exitosos y ${result.errores} con error.`
      );
      navigateToView("productos", { historialId: routeHistorialId, filters: routeFilters });
    } catch (err) {
      setError(err.message);
    } finally {
      setRecheckingPrioritarios(false);
    }
  }

  async function handleTogglePrioridad(producto) {
    try {
      setTogglingPriorityId(producto.id);
      setError("");
      setPriorityNotice("");
      const nextPriority = !producto.prioritario;
      await api(`/api/productos/${producto.id}`, {
        method: "PATCH",
        body: JSON.stringify({ prioritario: nextPriority }),
      });
      await loadDashboard();
      setPriorityNotice(
        nextPriority
          ? `“${producto.nombre || producto.asin || `Producto ${producto.id}`}” ahora esta marcado como prioritario y podra entrar en corridas prioritarias.`
          : `“${producto.nombre || producto.asin || `Producto ${producto.id}`}” volvio a estado normal y ya no se incluira en corridas prioritarias.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingPriorityId(null);
    }
  }

  async function handleDeleteProducto(id) {
    try {
      setError("");
      await api(`/api/productos/${id}`, { method: "DELETE" });
      if (historialProducto?.id === id) {
        navigateToView("productos");
      }
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLoadHistorial(producto) {
    if (historialProducto?.id === producto.id && routeHistorialId === producto.id) {
      navigateToView("productos", { historialId: producto.id });
      return;
    }

    setError("");
    navigateToView("productos", { historialId: producto.id, filters: routeFilters });
  }

  async function handleReviewProductChanges(producto, relatedAlerts) {
    try {
      setReviewingProductId(producto.id);
      setError("");
      await handleLoadHistorial(producto);
      await Promise.all(relatedAlerts.map((alerta) => api(`/api/alertas/${alerta.id}/leida`, { method: "PATCH" })));
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setReviewingProductId(null);
    }
  }

  async function handleMarkAlertaLeida(id) {
    try {
      setMarkingAlertId(id);
      setError("");
      await api(`/api/alertas/${id}/leida`, { method: "PATCH" });
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingAlertId(null);
    }
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "app-shell--menu-open" : ""}`}>
      {sidebarOpen && <button className="mobile-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú" />}

      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`} aria-label="Navegación principal">
        <a className="brand" href="/productos" onClick={(event) => { event.preventDefault(); navigateToProductosWithFilters(); setSidebarOpen(false); }}>
          <span className="brand-mark"><PackageSearch size={20} strokeWidth={1.9} /></span>
          <span className="brand-copy"><strong>IMX Scout</strong><small>Seguimiento de precios</small></span>
        </a>
        <div className="nav-caption">Espacio de trabajo</div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={`nav-item ${activeView === item.id ? "nav-item--active" : ""}`} onClick={() => {
              if (item.id === "productos") navigateToProductosWithFilters();
              else navigateToView(item.id);
              setSidebarOpen(false);
            }} type="button" aria-current={activeView === item.id ? "page" : undefined}>
              <item.icon className="nav-icon" size={18} strokeWidth={1.9} aria-hidden="true" />
              <span className="nav-label">{item.label}</span>
              {item.id === "alertas" && alertas.length > 0 && <span className="nav-badge">{alertas.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className={`monitor-status ${estado.activo ? "monitor-status--active" : ""}`} aria-live="polite">
            <span className="monitor-status-dot" />
            <span>{dataLoadError ? "Estado no disponible" : estado.activo ? "Consulta en curso" : "Consulta manual"}</span>
          </div>
          <span className="sidebar-marketplaces">Amazon US <i /> eBay</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="menu-button" onClick={() => setSidebarOpen(true)} type="button" aria-label="Abrir menú" aria-expanded={sidebarOpen}>
              <Menu size={19} />
            </button>
            <div className="topbar-title"><span>IMX SCOUT</span><strong>{VIEW_META[activeView]?.title || "Productos"}</strong></div>
          </div>
          <div className="topbar-actions">
            {alertas.length > 0 && <button className="alert-count-button" type="button" onClick={() => navigateToView("alertas")}><BellDot size={16} /><span>{alertas.length} por revisar</span></button>}
            <ActionButton className="button--primary topbar-register" type="button" onClick={openRegisterDialog} icon={Plus}>Registrar producto</ActionButton>
          </div>
        </header>

        {error && <div className="notice notice--error" role="alert"><ShieldAlert size={17} /><p>{error}</p><button className="icon-button" type="button" onClick={() => setError("")} aria-label="Cerrar mensaje"><X size={17} /></button></div>}
        {productNotice && activeView === "productos" && <div className="notice notice--success" role="status"><CircleCheckBig size={17} /><p>{productNotice}</p><button className="icon-button" type="button" onClick={() => setProductNotice("")} aria-label="Cerrar mensaje"><X size={17} /></button></div>}

        <main className="content">
          <div className="content-inner">
            {activeView === "productos" && <ProductosView
              loading={loading}
              dataLoadError={dataLoadError}
              onRetryLoad={handleRetryLoad}
              productos={productos}
              alertas={alertas}
              routeFilters={routeFilters}
              onFiltersChange={handleProductosFiltersChange}
              handleLoadHistorial={handleLoadHistorial}
              handleReviewProductChanges={handleReviewProductChanges}
              reviewingProductId={reviewingProductId}
              handleRecheckProducto={handleRecheckProducto}
              handleRecheckPrioritarios={handleRecheckPrioritarios}
              recheckingPrioritarios={recheckingPrioritarios}
              recheckingProductId={recheckingProductId}
              handleTogglePrioridad={handleTogglePrioridad}
              togglingPriorityId={togglingPriorityId}
              handleDeleteProducto={handleDeleteProducto}
              priorityNotice={priorityNotice}
              clearFilters={() => navigateToProductosWithFilters()}
              openRegister={openRegisterDialog}
            />}
            {activeView === "dashboard" && <DashboardView
              estado={estado}
              loading={loading}
              dataLoadError={dataLoadError}
              lastRun={lastRun}
              entriesText={entriesText}
              executing={executing}
              setEntriesText={setEntriesText}
              handleRunScraping={handleRunScraping}
              productos={productos}
              alertas={alertas}
              handleLoadHistorial={handleLoadHistorial}
              handleRecheckProducto={handleRecheckProducto}
              recheckingProductId={recheckingProductId}
              handleMarkAlertaLeida={handleMarkAlertaLeida}
              markingAlertId={markingAlertId}
              goToProductos={() => navigateToView("productos")}
              goToAlertas={() => navigateToView("alertas")}
              openRegister={openRegisterDialog}
            />}
            {activeView === "alertas" && <AlertasView
              loading={loading}
              dataLoadError={dataLoadError}
              onRetryLoad={handleRetryLoad}
              alertas={alertas}
              markingAlertId={markingAlertId}
              handleMarkAlertaLeida={handleMarkAlertaLeida}
              handleLoadHistorial={handleLoadHistorial}
              goToProductos={() => navigateToView("productos")}
            />}
          </div>
        </main>
      </div>

      <ProductRegistrationDialog
        open={registerDialogOpen}
        onClose={closeRegisterDialog}
        onSubmit={handleRegisterProduct}
        value={productDraft}
        setValue={setProductDraft}
        consultAfterCreate={consultAfterCreate}
        setConsultAfterCreate={setConsultAfterCreate}
        submitting={registeringProduct}
      />
      {activeView === "productos" && <HistorialDrawer
        historialProducto={historialProducto}
        historial={historial}
        historyLoading={historyLoading}
        onClose={() => navigateToView("productos")}
      />}
    </div>
  );
}
