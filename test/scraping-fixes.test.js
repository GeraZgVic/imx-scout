const assert = require("node:assert/strict");
const test = require("node:test");

const playwright = require("playwright");
const prisma = require("../src/lib/prisma");
const logger = require("../src/utils/logger");
const { MAX_PRODUCT_URL_LENGTH } = require("../src/processors/urlProcessor");
const { scrapeAmazon, stripInlineScriptTail } = require("../src/scrapers/amazonScraper");
const { scrapeEbay } = require("../src/scrapers/ebayScraper");
const { buildSuccess } = require("../src/parsers/dataParser");
const { ejecutarScraping, getEstado } = require("../src/services/scraperService");
const { detectarYCrearAlertas } = require("../src/services/alertaService");
const basicAuth = require("../src/middleware/basicAuth");

test("production Basic Auth challenges missing credentials and accepts valid credentials", () => {
  const middleware = basicAuth("scout", "long-secret");

  function invoke(authorization) {
    const res = {
      headers: {},
      statusCode: 200,
      body: null,
      setHeader(name, value) { this.headers[name] = value; },
      end(body) { this.body = body; },
    };
    let nextCalls = 0;
    middleware({ headers: authorization ? { authorization } : {} }, res, () => nextCalls++);
    return { res, nextCalls };
  }

  const denied = invoke();
  assert.equal(denied.res.statusCode, 401);
  assert.equal(denied.res.headers["WWW-Authenticate"], 'Basic realm="IMX Scout", charset="UTF-8"');
  assert.equal(denied.nextCalls, 0);

  const wrongPassword = invoke(`Basic ${Buffer.from("scout:wrong").toString("base64")}`);
  assert.equal(wrongPassword.res.statusCode, 401);
  assert.equal(wrongPassword.nextCalls, 0);

  const accepted = invoke(`Basic ${Buffer.from("scout:long-secret").toString("base64")}`);
  assert.equal(accepted.nextCalls, 1);
  assert.equal(accepted.res.statusCode, 200);
  assert.throws(() => basicAuth("", "secret"), /requires a username and password/);
});

test("does not classify an empty extraction as a successful product result", () => {
  assert.throws(
    () => buildSuccess("https://www.amazon.com/dp/B000000000", "amazon", {
      nombre: null,
      precio: null,
      envio: "  ",
      tiempo_entrega: null,
    }),
    /No se extrajo información útil/
  );

  assert.equal(
    buildSuccess("https://www.amazon.com/dp/B000000000", "amazon", {
      nombre: "Producto",
      precio: null,
      envio: null,
      tiempo_entrega: null,
    }).status,
    "ok"
  );
});

test("reports Amazon HTTP errors before trying to extract product fields", async () => {
  let selectorReads = 0;
  const page = {
    goto: async () => ({ status: () => 404 }),
    $: async () => { selectorReads++; return null; },
  };

  await assert.rejects(
    scrapeAmazon(page, "https://www.amazon.com/dp/B08N5WRWNW"),
    /Amazon respondió HTTP 404/
  );
  assert.equal(selectorReads, 0);
});

test("does not keep Amazon delivery details when the destination ZIP is unconfirmed", async () => {
  const values = {
    "#productTitle": "Echo Dot",
    "#corePrice_feature_div .a-price .a-offscreen": "$49.99",
    "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE": "Free delivery",
    "#mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE_LARGE": "Tomorrow",
  };
  const page = {
    goto: async () => {},
    waitForSelector: async () => {},
    click: async () => { throw new Error("delivery location control unavailable"); },
    $: async (selector) => values[selector]
      ? { innerText: async () => values[selector] }
      : null,
  };

  const result = await scrapeAmazon(page, "https://www.amazon.com/dp/B000000000");

  assert.equal(result.nombre, "Echo Dot");
  assert.equal(result.precio, "$49.99");
  assert.equal(result.envio, null);
  assert.equal(result.tiempo_entrega, null);
  assert.equal(result.destino_consultado, null);
});

test("keeps Amazon delivery details after the destination ZIP is confirmed", async () => {
  const values = {
    "#productTitle": "Echo Dot",
    "#corePrice_feature_div .a-price .a-offscreen": "$49.99",
    "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE": "Free delivery",
    "#mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE_LARGE": "Tomorrow",
    "#glow-ingress-line2": "Laredo, TX 78041",
  };
  const page = {
    goto: async () => {},
    waitForSelector: async () => {},
    click: async () => {},
    fill: async () => {},
    type: async () => {},
    press: async () => {},
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    locator: () => ({ first: () => ({ count: async () => 0 }) }),
    $: async (selector) => values[selector]
      ? { innerText: async () => values[selector] }
      : null,
  };

  const result = await scrapeAmazon(page, "https://www.amazon.com/dp/B000000000");

  assert.equal(result.envio, "Free delivery");
  assert.equal(result.tiempo_entrega, "Tomorrow");
  assert.equal(result.destino_consultado, "Laredo, TX 78041");
});

test("does not treat a partial Amazon ZIP match as destination confirmation", async () => {
  const values = {
    "#productTitle": "Echo Dot",
    "#corePrice_feature_div .a-price .a-offscreen": "$49.99",
    "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE": "Free delivery",
    "#mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE_LARGE": "Tomorrow",
    "#glow-ingress-line2": "Laredo, TX 1780410",
  };
  const page = {
    goto: async () => {},
    waitForSelector: async () => {},
    click: async () => {},
    fill: async () => {},
    type: async () => {},
    press: async () => {},
    waitForTimeout: async () => {},
    waitForLoadState: async () => {},
    reload: async () => {},
    locator: () => ({ first: () => ({ count: async () => 0 }) }),
    $: async (selector) => values[selector]
      ? { innerText: async () => values[selector] }
      : null,
  };

  const result = await scrapeAmazon(page, "https://www.amazon.com/dp/B000000000");

  assert.equal(result.envio, null);
  assert.equal(result.tiempo_entrega, null);
  assert.equal(result.destino_consultado, null);
});

test("does not claim eBay delivery destination when the shipping flow is unavailable", async () => {
  const result = await scrapeEbay({
    goto: async () => {},
    waitForSelector: async () => { throw new Error("title unavailable"); },
    $: async () => null,
  }, "https://www.ebay.com/itm/123456789");

  assert.equal(result.destino_consultado, null);
});

test("only reports the eBay ZIP when the delivery response confirms it", async () => {
  let evaluateCalls = 0;
  const page = {
    goto: async () => {},
    waitForSelector: async (selector) => {
      if (selector === "h1.x-item-title__mainTitle span") throw new Error("title unavailable");
    },
    $: async () => ({ click: async () => {} }),
    selectOption: async () => {},
    waitForTimeout: async () => {},
    fill: async () => {},
    evaluate: async () => (++evaluateCalls === 1 ? undefined : ["Free delivery", "Standard Shipping", "Expected Friday at 78041"]),
    waitForFunction: async () => {},
  };

  const result = await scrapeEbay(page, "https://www.ebay.com/itm/123456789");
  assert.equal(result.destino_consultado, "ZIP 78041");
});

test("does not treat a partial ZIP match as destination confirmation", async () => {
  let evaluateCalls = 0;
  const page = {
    goto: async () => {},
    waitForSelector: async (selector) => {
      if (selector === "h1.x-item-title__mainTitle span") throw new Error("title unavailable");
    },
    $: async () => ({ click: async () => {} }),
    selectOption: async () => {},
    waitForTimeout: async () => {},
    fill: async () => {},
    evaluate: async () => (++evaluateCalls === 1 ? undefined : ["Free delivery", "Standard Shipping", "Expected Friday at 1780410"]),
    waitForFunction: async () => {},
  };

  const result = await scrapeEbay(page, "https://www.ebay.com/itm/123456789");
  assert.equal(result.destino_consultado, null);
});

test("does not keep eBay delivery details when the response has no confirmed ZIP", async () => {
  let evaluateCalls = 0;
  const page = {
    goto: async () => {},
    waitForSelector: async () => {},
    $: async (selector) => {
      if (selector === ".ux-labels-values--shipping button.ux-action") {
        return { click: async () => {} };
      }
      if (selector.startsWith("h1")) return { innerText: async () => "Test product" };
      if (selector.startsWith(".x-price-primary")) return { innerText: async () => "$10.00" };
      return null;
    },
    selectOption: async () => {},
    waitForTimeout: async () => {},
    fill: async () => {},
    evaluate: async () => (++evaluateCalls === 1 ? true : [
      "Free delivery",
      "Standard Shipping",
      "Expected Friday at a different destination",
    ]),
    waitForFunction: async () => {},
  };

  const result = await scrapeEbay(page, "https://www.ebay.com/itm/123456789");

  assert.equal(result.nombre, "Test product");
  assert.equal(result.precio, "$10.00");
  assert.equal(result.envio, null);
  assert.equal(result.tiempo_entrega, null);
  assert.equal(result.destino_consultado, null);
});

test("removes Amazon inline script content from delivery text", () => {
  const contaminated = "Or Prime members get FREE delivery Friday. Join Prime (function(f) {var injected = true;})();";

  assert.equal(
    stripInlineScriptTail(contaminated),
    "Or Prime members get FREE delivery Friday. Join Prime"
  );
});

test("clears the active state when Chromium fails to launch", async () => {
  const originalLaunch = playwright.chromium.launch;
  playwright.chromium.launch = async () => {
    throw new Error("simulated launch failure");
  };

  try {
    await assert.rejects(
      ejecutarScraping(["B0DSVVJXK5"]),
      /simulated launch failure/
    );
    assert.deepEqual(getEstado(), {
      activo: false,
      inicio: null,
      total: 0,
      procesados: 0,
      errores: 0,
    });
  } finally {
    playwright.chromium.launch = originalLaunch;
  }
});

test("rejects a URL longer than the persisted column before launching Chromium", async () => {
  const originalLaunch = playwright.chromium.launch;
  let launchCalls = 0;
  playwright.chromium.launch = async () => {
    launchCalls++;
    throw new Error("Chromium should not launch for an invalid URL");
  };

  try {
    const url = `https://www.ebay.com/itm/${"1".repeat(MAX_PRODUCT_URL_LENGTH)}`;
    await assert.rejects(
      ejecutarScraping([url]),
      new RegExp(`Máximo ${MAX_PRODUCT_URL_LENGTH} caracteres por URL`)
    );
    assert.equal(launchCalls, 0);
  } finally {
    playwright.chromium.launch = originalLaunch;
  }
});

test("prioritized batches process every URL and count page-allocation failures", async () => {
  const originalLaunch = playwright.chromium.launch;
  const originalUpsert = prisma.producto.upsert;
  const originalCreate = prisma.registroPrecio.create;
  const originalLogInfo = logger.info;
  const originalLogError = logger.error;
  const configuredLimit = Number(process.env.MAX_URLS_PER_REQUEST || 100);
  const batchLimit = Number.isFinite(configuredLimit) ? Math.max(1, configuredLimit) : 100;
  const entries = Array.from(
    { length: batchLimit + 1 },
    (_, index) => `https://www.ebay.com/itm/${String(index).padStart(9, "0")}`
  );
  let pageCalls = 0;

  playwright.chromium.launch = async () => ({
    newContext: async () => ({
      addInitScript: async () => {},
      newPage: async () => {
        pageCalls++;
        throw new Error("simulated page allocation failure");
      },
      close: async () => {},
    }),
    close: async () => {},
  });
  prisma.producto.upsert = async () => ({ id: 99 });
  prisma.registroPrecio.create = async () => ({ id: 100 });
  logger.info = () => {};
  logger.error = () => {};

  try {
    await assert.rejects(ejecutarScraping(entries), /Máximo/);

    const result = await ejecutarScraping(entries, { allowBatching: true });

    assert.equal(result.total, entries.length);
    assert.equal(result.errores, entries.length);
    assert.equal(pageCalls, entries.length);
    assert.deepEqual(getEstado(), {
      activo: false,
      inicio: null,
      total: entries.length,
      procesados: entries.length,
      errores: entries.length,
    });
  } finally {
    playwright.chromium.launch = originalLaunch;
    prisma.producto.upsert = originalUpsert;
    prisma.registroPrecio.create = originalCreate;
    logger.info = originalLogInfo;
    logger.error = originalLogError;
  }
});

test("checks each product once when duplicate IDs reach alert detection", async () => {
  const originalFindMany = prisma.registroPrecio.findMany;
  const originalCreate = prisma.alerta.create;
  let comparisons = 0;
  const createdAlerts = [];

  prisma.registroPrecio.findMany = async () => {
    comparisons++;
    return [
      { precio: "$11.00", tiempo_entrega: "Friday", destino_consultado: "ZIP 78041" },
      { precio: "$10.00", tiempo_entrega: "Monday", destino_consultado: "ZIP 78041" },
    ];
  };
  prisma.alerta.create = async ({ data }) => {
    createdAlerts.push(data);
  };

  try {
    await detectarYCrearAlertas([7, 7]);
    assert.equal(comparisons, 1);
    assert.deepEqual(createdAlerts.map((alerta) => alerta.tipo), [
      "precio_cambio",
      "tiempo_entrega_cambio",
    ]);
  } finally {
    prisma.registroPrecio.findMany = originalFindMany;
    prisma.alerta.create = originalCreate;
  }
});

test("does not create a delivery alert when either record lacks a confirmed destination", async () => {
  const originalFindMany = prisma.registroPrecio.findMany;
  const originalCreate = prisma.alerta.create;
  const createdAlerts = [];
  const scenarios = [
    [
      { precio: "$11.00", tiempo_entrega: "Monday", destino_consultado: null },
      { precio: "$10.00", tiempo_entrega: "Friday", destino_consultado: "ZIP 78041" },
    ],
    [
      { precio: "$11.00", tiempo_entrega: "Monday", destino_consultado: "ZIP 78701" },
      { precio: "$10.00", tiempo_entrega: "Friday", destino_consultado: "ZIP 78041" },
    ],
  ];
  let currentScenario = scenarios[0];

  prisma.registroPrecio.findMany = async () => currentScenario;
  prisma.alerta.create = async ({ data }) => createdAlerts.push(data);

  try {
    for (const scenario of scenarios) {
      currentScenario = scenario;
      createdAlerts.length = 0;
      await detectarYCrearAlertas([8]);
      assert.deepEqual(createdAlerts.map((alerta) => alerta.tipo), ["precio_cambio"]);
    }
  } finally {
    prisma.registroPrecio.findMany = originalFindMany;
    prisma.alerta.create = originalCreate;
  }
});
