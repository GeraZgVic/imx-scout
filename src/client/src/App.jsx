import React, { startTransition, useEffect, useState } from "react";
import "./styles.css";

const EMPTY_STATUS = { activo: false, inicio: null, total: 0, procesados: 0, errores: 0 };
const EMPTY_COLLECTION = [];
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "⬡" },
  { id: "productos", label: "Productos", icon: "◈" },
  { id: "alertas", label: "Alertas", icon: "◎" },
];

const VIEW_META = {
  dashboard: {
    eyebrow: "Control",
    title: "Centro operativo",
    description: "Revisa el estado del sistema, ejecuta una corrida y detecta lo urgente sin saturar la vista.",
    actionLabel: "Ver inventario",
  },
  productos: {
    eyebrow: "Inventario",
    title: "Productos monitoreados",
    description: "Gestiona el universo de productos, consulta historial y prepara el flujo para carga masiva.",
    actionLabel: "Nueva corrida",
  },
  alertas: {
    eyebrow: "Revision",
    title: "Alertas activas",
    description: "Prioriza cambios de precio y tiempos de entrega para actuar sobre variaciones relevantes.",
    actionLabel: "Ir a dashboard",
  },
};

const DEFAULT_DESTINATION_LABEL = "Laredo, TX 78041";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
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

function ViewHeader({ eyebrow, title, description, actionLabel, onAction }) {
  return (
    <header className="view-header">
      <div className="view-header-copy">
        <span className="label">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actionLabel && onAction && (
        <button className="btn btn--ghost" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </header>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <small className="metric-sub">{sub}</small>
    </div>
  );
}

/* ─────────────────────────────────────────────
   DASHBOARD VIEW
───────────────────────────────────────────── */
function DashboardView({
  estado,
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
  goToProductos,
  goToAlertas,
}) {
  const latestAlerts = alertas.slice(0, 2);
  const latestProducts = productos.slice(0, 3);
  const totalProcesados = estado.activo ? `${estado.procesados}/${estado.total}` : "Listo";

  return (
    <div className="view">
      <ViewHeader
        eyebrow="Control"
        title="Centro operativo"
        description="Ejecuta scraping manual, revisa la ultima corrida y detecta cambios sin mezclar toda la operacion en una sola pantalla."
        actionLabel="Ver inventario"
        onAction={goToProductos}
      />

      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="label">Sistema</span>
          <h2>{estado.activo ? "Scraping en curso" : "Sistema listo para correr"}</h2>
          <p>
            {estado.activo
              ? `Procesados ${estado.procesados} de ${estado.total} elementos en esta corrida.`
              : "Backend, scrapers y persistencia listos para una nueva ejecucion local."}
          </p>
          <div className="dashboard-pill-row">
            <div className="dashboard-pill">
              <span>Productos</span>
              <strong>{productos.length}</strong>
            </div>
            <div className="dashboard-pill">
              <span>Alertas</span>
              <strong>{alertas.length}</strong>
            </div>
            <div className="dashboard-pill">
              <span>Estado</span>
              <strong>{totalProcesados}</strong>
            </div>
          </div>
        </div>
        <div className={`live-badge ${estado.activo ? "live-badge--active" : ""}`}>
          <span className="live-dot" />
          {estado.activo ? "Activo" : "Disponible"}
        </div>
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <div className="card card--main">
            <div className="card-header">
              <div>
                <span className="label">Accion principal</span>
                <h2>Nueva ejecucion</h2>
              </div>
            </div>
            <form onSubmit={handleRunScraping} className="scrape-form">
              <label className="field-label">URLs o ASINs — una por linea</label>
              <textarea
                className="textarea"
                placeholder={"B0DSVVJXK5\nhttps://www.ebay.com/itm/325528865399"}
                value={entriesText}
                onChange={(e) => setEntriesText(e.target.value)}
              />
              <div className="form-footer">
                <button className="btn btn--primary" type="submit" disabled={executing}>
                  {executing ? (
                    <>
                      <span className="spinner" /> Ejecutando…
                    </>
                  ) : (
                    "Ejecutar scraping"
                  )}
                </button>
                <span className="hint">El backend persiste automaticamente en MySQL.</span>
              </div>
            </form>
          </div>
        </div>

        <div className="dashboard-secondary">
          <div className="card">
            <div className="card-header">
              <div>
                <span className="label">Ultima corrida</span>
                <h2>Resumen inmediato</h2>
              </div>
            </div>
            {!lastRun ? (
              <p className="empty">Todavia no ejecutas una corrida en esta sesion.</p>
            ) : (
              <div className="result-list">
                {lastRun.resultados.slice(0, 3).map((item) => (
                  <div key={`${item.url}-${item.timestamp}`} className="result-row">
                    <div className="result-info">
                      <strong>{item.nombre || item.url}</strong>
                      <span>{item.plataforma}</span>
                      <span>
                        {item.precio || "Sin precio"} · {item.tiempo_entrega || "Sin tiempo de entrega"}
                      </span>
                      <span>Destino: {inferDestino(item.destino_consultado, item.tiempo_entrega)}</span>
                    </div>
                    <span className={`badge badge--${item.status}`}>{item.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <span className="label">Urgente</span>
                <h2>Alertas recientes</h2>
              </div>
              <button className="btn btn--ghost btn--xs" type="button" onClick={goToAlertas}>
                Ver todas
              </button>
            </div>
            {latestAlerts.length === 0 ? (
              <p className="empty">Sin alertas pendientes.</p>
            ) : (
              <div className="alert-list">
                {latestAlerts.map((a) => (
                  <div className="alert-row" key={a.id}>
                    <div className="alert-row-head">
                      <strong>{a.tipo.replace("_", " ")}</strong>
                      <button
                        className="btn btn--ghost btn--xs"
                        type="button"
                        onClick={() => handleMarkAlertaLeida(a.id)}
                      >
                        Leida
                      </button>
                    </div>
                    <span className="alert-product">
                      {a.producto?.nombre || `Producto ${a.productoId}`}
                    </span>
                    <span className="alert-delta">
                      {a.valor_anterior} → {a.valor_nuevo}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card dashboard-mini-card">
            <div className="card-header">
              <div>
                <span className="label">Inventario</span>
                <h2>Productos recientes</h2>
              </div>
              <button className="btn btn--ghost btn--xs" type="button" onClick={goToProductos}>
                Abrir tabla
              </button>
            </div>
            {latestProducts.length === 0 ? (
              <p className="empty">Sin productos aun.</p>
            ) : (
              <div className="compact-list">
                {latestProducts.map((p) => (
                  <div className="compact-row compact-row--actions" key={p.id}>
                    <button
                      className="compact-row-main"
                      type="button"
                      onClick={() => handleLoadHistorial(p)}
                    >
                      <div>
                        <strong>{p.nombre || p.asin || `Producto ${p.id}`}</strong>
                        <span>{p.plataforma}</span>
                      </div>
                      <span className="arrow">›</span>
                    </button>
                    <button
                      className="btn btn--ghost btn--xs"
                      type="button"
                      disabled={recheckingProductId === p.id}
                      onClick={() => handleRecheckProducto(p)}
                    >
                      {recheckingProductId === p.id ? "Consultando..." : "Reconsultar"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PRODUCTOS VIEW
───────────────────────────────────────────── */
function ProductosView({
  loading,
  productos,
  handleLoadHistorial,
  handleRecheckProducto,
  recheckingProductId,
  handleDeleteProducto,
  goToDashboard,
}) {
  return (
    <div className="view">
      <ViewHeader
        eyebrow="Inventario"
        title="Productos monitoreados"
        description="Vista operativa para crecer el catalogo, revisar historial y preparar futuras acciones de importacion o exportacion."
        actionLabel="Nueva corrida"
        onAction={goToDashboard}
      />
      <div className="view-toolbar">
        <div className="toolbar-copy">
          <span className="label">Escala</span>
          <p>Esta tabla sera la base para filtros, importacion masiva y acciones por lote.</p>
        </div>
        <div className="toolbar-chips">
          <span className="toolbar-pill">{productos.length} productos</span>
          <span className="toolbar-pill">Historial por drawer</span>
        </div>
      </div>
      <div className="card">
        {loading ? (
          <p className="empty">Cargando…</p>
        ) : productos.length === 0 ? (
          <p className="empty">Sin productos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Plataforma</th>
                  <th>ASIN</th>
                  <th>Actualizado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nombre || "Sin nombre"}</strong>
                      <span className="url-cell">{p.url}</span>
                    </td>
                    <td>{p.plataforma}</td>
                    <td>{p.asin || "—"}</td>
                    <td>{formatDate(p.updatedAt)}</td>
                    <td className="actions">
                      <button
                        className="btn btn--primary btn--xs"
                        type="button"
                        disabled={recheckingProductId === p.id}
                        onClick={() => handleRecheckProducto(p)}
                      >
                        {recheckingProductId === p.id ? "Consultando..." : "Reconsultar"}
                      </button>
                      <button
                        className="btn btn--ghost btn--xs"
                        type="button"
                        onClick={() => handleLoadHistorial(p)}
                      >
                        Historial
                      </button>
                      <button
                        className="btn btn--danger btn--xs"
                        type="button"
                        onClick={() => handleDeleteProducto(p.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ALERTAS VIEW
───────────────────────────────────────────── */
function AlertasView({ loading, alertas, handleMarkAlertaLeida, goToDashboard }) {
  return (
    <div className="view">
      <ViewHeader
        eyebrow="Senales"
        title="Alertas activas"
        description="Revision concentrada de cambios relevantes. Esta vista debe sentirse densa y util, no decorativa."
        actionLabel="Ir a dashboard"
        onAction={goToDashboard}
      />
      <div className="view-toolbar">
        <div className="toolbar-copy">
          <span className="label">Cola de revision</span>
          <p>Prioriza precio y tiempo de entrega. Las alertas leidas salen de esta bandeja, no del historial.</p>
        </div>
        <div className="toolbar-chips">
          <span className="toolbar-pill">{alertas.length} pendientes</span>
        </div>
      </div>
      {loading ? (
        <p className="empty">Cargando…</p>
      ) : alertas.length === 0 ? (
        <div className="card">
          <p className="empty">Sin alertas pendientes.</p>
        </div>
      ) : (
        <div className="alerts-grid">
          {alertas.map((a) => (
            <div className="card alert-card" key={a.id}>
              <div className="alert-card-head">
                <div>
                  <span className="label">{a.tipo.replace("_", " ")}</span>
                  <h2>{a.producto?.nombre || `Producto ${a.productoId}`}</h2>
                </div>
                <button
                  className="btn btn--primary btn--xs"
                  type="button"
                  onClick={() => handleMarkAlertaLeida(a.id)}
                >
                  Marcar leída
                </button>
              </div>
              <div className="alert-delta-grid">
                <div className="delta-cell">
                  <span>Anterior</span>
                  <strong>{a.valor_anterior}</strong>
                </div>
                <div className="delta-cell">
                  <span>Nuevo</span>
                  <strong>{a.valor_nuevo}</strong>
                </div>
                <div className="delta-cell">
                  <span>Detectada</span>
                  <strong>{formatDate(a.timestamp)}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   HISTORIAL DRAWER
───────────────────────────────────────────── */
function HistorialDrawer({
  historialProducto,
  historial,
  historyLoading,
  setHistorialProducto,
  setHistorial,
}) {
  const open = !!historialProducto;
  return (
    <aside className={`drawer ${open ? "drawer--open" : ""}`}>
      <div className="drawer-header">
        <div>
          <span className="label">Historial</span>
          <h2>
            {historialProducto
              ? historialProducto.nombre ||
                historialProducto.asin ||
                `Producto ${historialProducto.id}`
              : "Historial"}
          </h2>
        </div>
        {open && (
          <button
            className="btn btn--ghost btn--xs"
            type="button"
            onClick={() => {
              setHistorialProducto(null);
              setHistorial(EMPTY_COLLECTION);
            }}
          >
            Cerrar
          </button>
        )}
      </div>

      {historyLoading ? (
        <div className="drawer-empty">
          <div className="drawer-empty-icon">⟳</div>
          <p>Cargando registros…</p>
        </div>
      ) : !historialProducto ? (
        <div className="drawer-empty">
          <div className="drawer-empty-icon">◈</div>
          <p>Sin producto seleccionado</p>
          <span className="drawer-empty-hint">
            Haz clic en "Historial" desde la tabla de productos para ver sus registros aquí.
          </span>
        </div>
      ) : historial.length === 0 ? (
        <div className="drawer-empty">
          <div className="drawer-empty-icon">○</div>
          <p>Sin registros aún para este producto.</p>
        </div>
      ) : (
        <div className="timeline">
          {historial.map((item) => (
            <div className="timeline-item" key={item.id}>
              <div className="timeline-head">
                <strong>{item.precio || "Sin precio"}</strong>
                <span className={`badge badge--${item.status}`}>{item.status}</span>
              </div>
              <span>Envío: {item.envio || "—"}</span>
              <span>Entrega: {item.tiempo_entrega || "—"}</span>
              <span>Destino: {inferDestino(item.destino_consultado, item.tiempo_entrega)}</span>
              <small>{formatDate(item.timestamp)}</small>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

/* ─────────────────────────────────────────────
   ROOT APP
───────────────────────────────────────────── */
export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function loadDashboard() {
    const [productosData, alertasData, estadoData] = await Promise.all([
      api("/api/productos"),
      api("/api/alertas"),
      api("/api/scraping/estado"),
    ]);
    startTransition(() => {
      setProductos(getItems(productosData));
      setAlertas(getItems(alertasData));
      setEstado(estadoData || EMPTY_STATUS);
    });
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        setLoading(true);
        setError("");
        await loadDashboard();
      } catch (err) {
        if (active) setError(err.message);
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

    setActiveView(targetView);
    return result;
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

  async function handleDeleteProducto(id) {
    try {
      setError("");
      await api(`/api/productos/${id}`, { method: "DELETE" });
      if (historialProducto?.id === id) {
        setHistorialProducto(null);
        setHistorial(EMPTY_COLLECTION);
      }
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLoadHistorial(producto) {
    try {
      setHistoryLoading(true);
      setError("");
      const result = await api(`/api/productos/${producto.id}/historial`);
      setHistorialProducto(producto);
      setHistorial(getItems(result));
      setActiveView("productos");
    } catch (err) {
      setError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleMarkAlertaLeida(id) {
    try {
      setError("");
      await api(`/api/alertas/${id}/leida`, { method: "PATCH" });
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="shell">
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <span className="brand-icon">◈</span>
          <div>
            <strong>IMX Scout</strong>
            <span>Price Intelligence</span>
          </div>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? "nav-item--active" : ""}`}
              onClick={() => {
                setActiveView(item.id);
                setSidebarOpen(false);
              }}
              type="button"
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.id === "alertas" && alertas.length > 0 && (
                <span className="nav-badge">{alertas.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className={`status-chip ${estado.activo ? "status-chip--live" : ""}`}>
            <span className="live-dot" />
            {estado.activo ? "Activo" : "Disponible"}
          </div>
        </div>
      </aside>

      <div className="body">
        <header className="topbar">
          <button
            className="menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            type="button"
            aria-label="Menú"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-left">
            <span className="label">Workspace</span>
            <h1>{NAV_ITEMS.find((i) => i.id === activeView)?.label}</h1>
          </div>
          <div className="topbar-right">
            <div className="chip">
              <strong>{productos.length}</strong>
              <span>productos</span>
            </div>
            <div className="chip">
              <strong>{alertas.length}</strong>
              <span>alertas</span>
            </div>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <main className="content">
          {activeView === "dashboard" && (
            <DashboardView
              estado={estado}
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
              goToProductos={() => setActiveView("productos")}
              goToAlertas={() => setActiveView("alertas")}
            />
          )}
          {activeView === "productos" && (
            <ProductosView
              loading={loading}
              productos={productos}
              handleLoadHistorial={handleLoadHistorial}
              handleRecheckProducto={handleRecheckProducto}
              recheckingProductId={recheckingProductId}
              handleDeleteProducto={handleDeleteProducto}
              goToDashboard={() => setActiveView("dashboard")}
            />
          )}
          {activeView === "alertas" && (
            <AlertasView
              loading={loading}
              alertas={alertas}
              handleMarkAlertaLeida={handleMarkAlertaLeida}
              goToDashboard={() => setActiveView("dashboard")}
            />
          )}
        </main>
      </div>

      {activeView === "productos" && (
        <HistorialDrawer
          historialProducto={historialProducto}
          historial={historial}
          historyLoading={historyLoading}
          setHistorialProducto={setHistorialProducto}
          setHistorial={setHistorial}
        />
      )}
    </div>
  );
}
