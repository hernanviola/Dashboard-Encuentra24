const DATA = window.E24_REAL_ESTATE_DATA;

const state = {
  operation: [],
  category: [],
  province: [],
  canton: [],
  zone: [],
  rooms: [],
  priceMin: "",
  priceMax: "",
  m2Min: "",
  m2Max: "",
};

const scatterState = {
  m2Min: "",
  m2Max: "",
  priceMin: "",
  priceMax: "",
  plotted: [],
};

const highlightState = {
  type: "todos",
};

const outlierState = {
  search: "",
  visible: 40,
  filter: "todos",
};

let lastOpenedOutlierUrl = "";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const number = (v) => Number.isFinite(v) ? fmt.format(v) : "—";
const money = (v) => Number.isFinite(v) ? moneyFmt.format(v) : "—";
const pct = (v) => Number.isFinite(v) ? `${fmt.format(v)}%` : "—";
const labelZone = (z) => (z || "Sin zona").replaceAll(" | ", " · ");
const cleanGeoLabel = (value, fallback) => {
  const text = value || fallback;
  return text === "Sin canton" ? "Sin cantón" : text;
};
const geoProvince = (d) => cleanGeoLabel(d.provinceGeo || d.province, "Sin provincia");
const geoCanton = (d) => cleanGeoLabel(d.cantonGeo || d.canton, "Sin cantón");
const geoZone = (d) => cleanGeoLabel(d.zoneGeo || d.zone, "Sin zona");
const cleanCategory = (item) => item.categoryLabel || item.category || "Sin categoría";
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const selectedValues = (key) => state[key] || [];
const hasSelection = (key) => selectedValues(key).length > 0;
const matchesSelection = (key, value) => !hasSelection(key) || selectedValues(key).includes(value || "Sin dato");
const scopeLabel = (key, singular) => hasSelection(key) && selectedValues(key).length === 1 ? selectedValues(key)[0] : singular;

const PRICE_BINS = {
  venta: [0, 50000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000, 1500000, 2000000, 3000000, Infinity],
  alquiler: [0, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, Infinity],
};

const PPM2_BINS = {
  venta: [0, 500, 1000, 1500, 2000, 2500, 3000, 4000, 6000, 10000, Infinity],
  alquiler: [0, 5, 10, 15, 20, 25, 30, 40, 60, 100, Infinity],
};

const HIGHLIGHT_ORDER = ["platino", "otros_resaltadores", "sin_resaltador", "desconocido"];
const HIGHLIGHT_LABELS = {
  platino: "Platino",
  otros_resaltadores: "Otros resaltadores",
  sin_resaltador: "Sin resaltador",
  desconocido: "Desconocido",
};
const HIGHLIGHT_PRICE_BINS = {
  venta: [0, 100000, 250000, 500000, 1000000, Infinity],
  alquiler: [0, 500, 1000, 1500, 2500, 5000, Infinity],
  mixto: [0, 100000, 250000, 500000, 1000000, Infinity],
};
const QUALITY_FILTERS = [
  ["todos", "Todos"],
  ["outliers", "Outliers"],
  ["invalid_price", "Precios inválidos"],
  ["missing_m2", "Sin m²"],
  ["missing_rooms", "Sin dormitorios"],
];

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function avg(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
}

function groupBy(rows, keyFn) {
  return rows.reduce((acc, item) => {
    const key = keyFn(item) || "Sin dato";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function metrics(rows) {
  const prices = rows.map((d) => d.price).filter(Number.isFinite);
  const cleanPrices = rows.map((d) => d.priceClean).filter(Number.isFinite);
  const ppm2 = rows
    .filter((d) => !d.isOutlier)
    .map((d) => d.pricePerM2)
    .filter((value) => Number.isFinite(value) && value > 0);
  return {
    count: rows.length,
    avg: avg(prices),
    median: median(prices),
    avgClean: avg(cleanPrices),
    medianClean: median(cleanPrices),
    avgM2: avg(rows.map((d) => d.m2)),
    avgPpm2: avg(ppm2),
    medianPpm2: median(ppm2),
    outliers: rows.filter((d) => d.isOutlier).length,
  };
}

function filteredListings() {
  const minPrice = Number(state.priceMin);
  const maxPrice = Number(state.priceMax);
  const minM2 = Number(state.m2Min);
  const maxM2 = Number(state.m2Max);
  return DATA.listings.filter((d) => {
    if (!matchesSelection("operation", d.operation)) return false;
    if (!matchesSelection("category", d.category)) return false;
    if (!matchesSelection("province", geoProvince(d))) return false;
    if (!matchesSelection("canton", geoCanton(d))) return false;
    if (!matchesSelection("zone", geoZone(d))) return false;
    if (!matchesSelection("rooms", d.roomBucket)) return false;
    if (state.priceMin && (!Number.isFinite(d.price) || d.price < minPrice)) return false;
    if (state.priceMax && (!Number.isFinite(d.price) || d.price > maxPrice)) return false;
    if (state.m2Min && (!Number.isFinite(d.m2) || d.m2 < minM2)) return false;
    if (state.m2Max && (!Number.isFinite(d.m2) || d.m2 > maxM2)) return false;
    return true;
  });
}

function renderMultiSelect(id, key, options, labelFn = (x) => x) {
  const el = document.querySelector(id);
  const selected = selectedValues(key);
  const selectedSet = new Set(selected);
  const label = selected.length ? `${selected.length} seleccionadas` : "Todas";
  const chips = selected.map((value) => `
    <button class="filter-chip" type="button" data-filter="${key}" data-value="${escapeHtml(value)}">${escapeHtml(labelFn(value))}<span>×</span></button>
  `).join("");
  el.innerHTML = `
    <button class="multi-trigger" type="button">${escapeHtml(label)}</button>
    <div class="multi-menu">
      <input class="multi-search" type="search" placeholder="Buscar..." />
      <div class="multi-actions">
        <button type="button" data-action="select-visible">Seleccionar todo visible</button>
        <button type="button" data-action="clear">Limpiar selección</button>
      </div>
      <label class="multi-option all-option"><input type="checkbox" data-value="__all__" ${selected.length ? "" : "checked"} /> Todas</label>
      ${options.map((value) => `
        <label class="multi-option">
          <input type="checkbox" data-value="${escapeHtml(value)}" ${selectedSet.has(value) ? "checked" : ""} />
          ${escapeHtml(labelFn(value))}
        </label>
      `).join("")}
    </div>
    <div class="selected-chips">${chips}</div>
  `;

  el.querySelector(".multi-trigger").addEventListener("click", () => {
    document.querySelectorAll(".multi-select.open").forEach((node) => {
      if (node !== el) node.classList.remove("open");
    });
    el.classList.toggle("open");
  });

  const search = el.querySelector(".multi-search");
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    el.querySelectorAll(".multi-option:not(.all-option)").forEach((option) => {
      option.hidden = query && !option.textContent.toLowerCase().includes(query);
    });
  });

  el.querySelector("[data-action='select-visible']").addEventListener("click", () => {
    const visible = [...el.querySelectorAll(".multi-option:not(.all-option):not([hidden]) input")]
      .map((input) => input.dataset.value);
    state[key] = [...new Set([...selectedValues(key), ...visible])];
    if (["operation", "category", "province", "canton"].includes(key)) updateGeoOptions();
    renderFilterControls();
    renderAll();
  });

  el.querySelector("[data-action='clear']").addEventListener("click", () => {
    state[key] = [];
    if (["operation", "category", "province", "canton"].includes(key)) updateGeoOptions();
    renderFilterControls();
    renderAll();
  });

  el.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.dataset.value;
      if (value === "__all__") {
        state[key] = [];
      } else if (input.checked) {
        state[key] = [...new Set([...selectedValues(key), value])];
      } else {
        state[key] = selectedValues(key).filter((item) => item !== value);
      }
      if (["operation", "category", "province", "canton"].includes(key)) updateGeoOptions();
      renderFilterControls();
      renderAll();
    });
  });

  el.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state[key] = selectedValues(key).filter((item) => item !== chip.dataset.value);
      if (["operation", "category", "province", "canton"].includes(key)) updateGeoOptions();
      renderFilterControls();
      renderAll();
    });
  });
}

function baseRowsForGeoOptions(level) {
  return DATA.listings.filter((d) => {
    if (!matchesSelection("operation", d.operation)) return false;
    if (!matchesSelection("category", d.category)) return false;
    if (level !== "province" && !matchesSelection("province", geoProvince(d))) return false;
    if (level === "zone" && !matchesSelection("canton", geoCanton(d))) return false;
    return true;
  });
}

function renderFilterControls() {
  const listings = DATA.listings;
  const categories = [...new Map(listings.map((d) => [d.category, d.categoryLabel])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const categoryLabels = Object.fromEntries(categories);
  const provinces = [...new Set(baseRowsForGeoOptions("province").map(geoProvince).filter(Boolean))].sort();
  const cantons = [...new Set(baseRowsForGeoOptions("canton").map(geoCanton).filter(Boolean))].sort();
  const zones = [...new Set(baseRowsForGeoOptions("zone").map(geoZone).filter(Boolean))].sort();
  state.canton = selectedValues("canton").filter((canton) => cantons.includes(canton));
  state.zone = selectedValues("zone").filter((zone) => zones.includes(zone));

  renderMultiSelect("#operationFilter", "operation", [...new Set(listings.map((d) => d.operation).filter(Boolean).sort())]);
  renderMultiSelect("#categoryFilter", "category", categories.map(([value]) => value), (value) => categoryLabels[value] || value);
  renderMultiSelect("#provinceFilter", "province", provinces);
  renderMultiSelect("#cantonFilter", "canton", cantons);
  renderMultiSelect("#zoneFilter", "zone", zones);
  renderMultiSelect("#roomFilter", "rooms", ["1 dormitorio", "2 dormitorios", "3 dormitorios", "4+ dormitorios", "Sin dato"]);
}

function setupFilters() {
  renderFilterControls();

  [
    ["#priceMin", "priceMin"],
    ["#priceMax", "priceMax"],
    ["#m2Min", "m2Min"],
    ["#m2Max", "m2Max"],
  ].forEach(([id, key]) => {
    document.querySelector(id).addEventListener("input", (event) => {
      state[key] = event.target.value;
      renderAll();
    });
  });

  document.querySelector("#resetFilters").addEventListener("click", () => {
    Object.assign(state, { operation: [], category: [], province: [], canton: [], zone: [], rooms: [], priceMin: "", priceMax: "", m2Min: "", m2Max: "" });
    document.querySelectorAll(".filters > label input").forEach((el) => { el.value = ""; });
    renderFilterControls();
    renderAll();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".multi-select")) {
      document.querySelectorAll(".multi-select.open").forEach((node) => node.classList.remove("open"));
    }
  });
}

function setupScatterControls() {
  [
    ["#scatterM2Min", "m2Min"],
    ["#scatterM2Max", "m2Max"],
    ["#scatterPriceMin", "priceMin"],
    ["#scatterPriceMax", "priceMax"],
  ].forEach(([id, key]) => {
    document.querySelector(id).addEventListener("input", (event) => {
      scatterState[key] = event.target.value;
      renderScatter(filteredListings());
    });
  });

  document.querySelector("#resetScatterFilters").addEventListener("click", () => {
    Object.assign(scatterState, { m2Min: "", m2Max: "", priceMin: "", priceMax: "", plotted: [] });
    ["#scatterM2Min", "#scatterM2Max", "#scatterPriceMin", "#scatterPriceMax"].forEach((id) => { document.querySelector(id).value = ""; });
    hideScatterTooltip();
    renderScatter(filteredListings());
  });

  const canvas = document.querySelector("#scatterCanvas");
  canvas.addEventListener("mousemove", handleScatterHover);
  canvas.addEventListener("mouseleave", hideScatterTooltip);
  canvas.addEventListener("click", () => {
    const active = scatterState.activePoint;
    if (active?.url) window.open(active.url, "_blank", "noopener");
  });
}

function setupHighlightControls() {
  const select = document.querySelector("#highlightTypeFilter");
  if (!select) return;
  select.addEventListener("change", (event) => {
    highlightState.type = event.target.value;
    renderHighlights(filteredListings());
  });
}

function setupOutlierControls() {
  const search = document.querySelector("#outlierSearch");
  const loadMore = document.querySelector("#loadMoreOutliers");
  if (search) {
    search.addEventListener("input", (event) => {
      outlierState.search = event.target.value;
      outlierState.visible = 40;
      renderQuality(filteredListings());
    });
  }
  if (loadMore) {
    loadMore.addEventListener("click", () => {
      outlierState.visible += 40;
      renderQuality(filteredListings());
    });
  }
}

function updateGeoOptions() {
  const cantons = new Set(baseRowsForGeoOptions("canton").map(geoCanton).filter(Boolean));
  state.canton = selectedValues("canton").filter((canton) => cantons.has(canton));
  const zones = new Set(baseRowsForGeoOptions("zone").map(geoZone).filter(Boolean));
  state.zone = selectedValues("zone").filter((zone) => zones.has(zone));
}

function renderKpis(rows) {
  const m = metrics(rows);
  const ops = groupBy(rows, (d) => d.operation);
  const saleMetrics = metrics(ops.venta || []);
  const rentMetrics = metrics(ops.alquiler || []);
  const selectedOps = selectedValues("operation");
  const singleOperation = selectedOps.length === 1 ? selectedOps[0] : "";
  const priceCards = !singleOperation
    ? [
        ["Mediana venta", money(saleMetrics.median), "Solo anuncios de venta"],
        ["Mediana alquiler", money(rentMetrics.median), "Solo anuncios de alquiler"],
        ["Prom. venta sin outliers", money(saleMetrics.avgClean), "Venta depurada"],
        ["Prom. alquiler sin outliers", money(rentMetrics.avgClean), "Alquiler depurado"],
        ["Mediana USD/m² venta", money(saleMetrics.medianPpm2), "Venta sin outliers con m²"],
        ["Mediana USD/m² alquiler", money(rentMetrics.medianPpm2), "Alquiler sin outliers con m²"],
      ]
    : [
        [`Precio mediano ${singleOperation}`, money(m.median), `Solo ${singleOperation}`],
        [`Prom. sin outliers ${singleOperation}`, money(m.avgClean), `Solo ${singleOperation}`],
        [`Mediana USD/m² ${singleOperation}`, money(m.medianPpm2), `${singleOperation} sin outliers con m²`],
      ];
  const cards = [
    ["Total anuncios", number(rows.length), `${number(new Set(rows.map((d) => d.url).filter(Boolean)).size)} únicos`],
    ["Total venta", number((ops.venta || []).length), "Inventario de venta"],
    ["Total alquiler", number((ops.alquiler || []).length), "Inventario de alquiler"],
    ["Categorías", number(new Set(rows.map((d) => d.category).filter(Boolean)).size), "Según CSV"],
    ["Provincias", number(new Set(rows.map((d) => d.province).filter(Boolean)).size), "Cobertura geográfica"],
    ["Zonas", number(new Set(rows.map((d) => d.zoneFull).filter(Boolean)).size), "Normalizadas"],
    ...priceCards,
  ];
  document.querySelector("#kpiGrid").innerHTML = cards.map(([label, value, note]) => `
    <article class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></article>
  `).join("");
}

function rowsForBars(groups, label = (k) => k) {
  return Object.entries(groups).map(([key, rows]) => ({ label: label(key, rows), value: rows.length, rows })).sort((a, b) => b.value - a.value);
}

function barChart(id, data, formatter = number, limit = 12) {
  const el = document.querySelector(id);
  const rows = data.slice(0, limit);
  if (!rows.length) {
    el.innerHTML = `<p class="empty">No hay datos con los filtros actuales.</p>`;
    return;
  }
  const max = Math.max(...rows.map((d) => d.value), 1);
  el.innerHTML = rows.map((d) => `
    <div class="bar-row">
      <span title="${d.label}">${d.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.value / max) * 100}%"></div></div>
      <strong>${formatter(d.value)}</strong>
    </div>
  `).join("");
}

function metricBars(id, rows, valueKey, formatter = money, limit = 10) {
  const data = rows.filter((d) => Number.isFinite(d[valueKey])).sort((a, b) => b[valueKey] - a[valueKey]).slice(0, limit);
  barChart(id, data.map((d) => ({ label: d.label, value: d[valueKey] })), formatter, limit);
}

function histogram(id, values, bins = 10, formatter = money) {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const el = document.querySelector(id);
  if (!clean.length) {
    el.innerHTML = `<p class="empty">No hay datos suficientes.</p>`;
    return;
  }
  const cap = clean[Math.floor(clean.length * 0.98)] || clean.at(-1);
  const capped = clean.filter((v) => v <= cap);
  const min = Math.min(...capped);
  const max = Math.max(...capped);
  const step = (max - min) / bins || 1;
  const counts = Array.from({ length: bins }, () => 0);
  capped.forEach((v) => counts[Math.min(bins - 1, Math.floor((v - min) / step))] += 1);
  const peak = Math.max(...counts, 1);
  el.innerHTML = counts.map((count, i) => {
    const from = min + step * i;
    const to = i === bins - 1 ? max : min + step * (i + 1);
    return `<div class="bar-row"><span>${formatter(from)} - ${formatter(to)}</span><div class="bar-track"><div class="bar-fill" style="width:${(count / peak) * 100}%"></div></div><strong>${number(count)}</strong></div>`;
  }).join("");
}

function rangeLabel(from, to, formatter) {
  if (to === Infinity) return `${formatter(from)}+`;
  return `${formatter(from)} - ${formatter(to)}`;
}

function binnedRows(values, bounds, formatter) {
  const clean = values.filter((v) => Number.isFinite(v) && v >= 0);
  return bounds.slice(0, -1).map((from, index) => {
    const to = bounds[index + 1];
    const count = clean.filter((value) => value >= from && (to === Infinity ? true : value < to)).length;
    return { label: rangeLabel(from, to, formatter), value: count };
  });
}

function renderBinnedSection(title, values, bounds, formatter) {
  const rows = binnedRows(values, bounds, formatter).filter((row) => row.value > 0);
  if (!rows.length) return `<p class="empty">No hay datos suficientes para ${title.toLowerCase()}.</p>`;
  const peak = Math.max(...rows.map((row) => row.value), 1);
  return `
    <div class="histogram-group">
      <div class="histogram-title">${title}</div>
      ${rows.map((row) => `
        <div class="bar-row">
          <span>${row.label}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(row.value / peak) * 100}%"></div></div>
          <strong>${number(row.value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function operationHistogram(id, rows, valueFn, binsByOperation, formatter, titles) {
  const el = document.querySelector(id);
  const ops = selectedValues("operation");
  const visibleOperations = !ops.length
    ? ["venta", "alquiler"].filter((operation) => rows.some((row) => row.operation === operation))
    : ops.filter((operation) => rows.some((row) => row.operation === operation));
  if (!visibleOperations.length) {
    el.innerHTML = `<p class="empty">No hay datos suficientes.</p>`;
    return;
  }
  el.innerHTML = visibleOperations.map((operation) => {
    const values = rows.filter((row) => row.operation === operation).map(valueFn);
    return renderBinnedSection(titles[operation], values, binsByOperation[operation], formatter);
  }).join("");
}

function categoryMetrics(rows) {
  return Object.entries(groupBy(rows, cleanCategory)).map(([label, items]) => ({ label, ...metrics(items) }))
    .sort((a, b) => b.count - a.count);
}

function zoneMetrics(rows) {
  return Object.entries(groupBy(rows, (d) => d.zoneFull)).map(([zone, items]) => ({ label: labelZone(zone), zone, ...metrics(items) }))
    .sort((a, b) => b.count - a.count);
}

function renderTables(rows) {
  const ops = selectedValues("operation");
  const scopeText = ops.length !== 1
    ? "Vista mixta: filtrar venta o alquiler para lectura de precios"
    : `Solo ${ops[0]}`;
  document.querySelector("#categoryTableScope").textContent = scopeText;
  const cat = categoryMetrics(rows);
  document.querySelector("#categoryPriceTable tbody").innerHTML = cat.map((r) => `
    <tr><td>${r.label}</td><td class="numeric">${number(r.count)}</td><td class="numeric">${money(r.avg)}</td><td class="numeric">${money(r.median)}</td><td class="numeric">${money(r.avgClean)}</td><td class="numeric">${money(r.medianPpm2)}</td></tr>
  `).join("");

  const zones = zoneMetrics(rows).slice(0, 120);
  document.querySelector("#zoneTableCount").textContent = `${number(zones.length)} zonas`;
  document.querySelector("#zoneTable tbody").innerHTML = zones.map((r) => `
    <tr><td>${r.label}</td><td class="numeric">${number(r.count)}</td><td class="numeric">${money(r.median)}</td><td class="numeric">${money(r.avgClean)}</td><td class="numeric">${money(r.medianPpm2)}</td><td class="numeric">${number(r.outliers)}</td></tr>
  `).join("");
}

function scatterFilteredRows(rows) {
  const minM2 = Number(scatterState.m2Min);
  const maxM2 = Number(scatterState.m2Max);
  const minPrice = Number(scatterState.priceMin);
  const maxPrice = Number(scatterState.priceMax);
  return rows.filter((d) => {
    if (!Number.isFinite(d.price) || !Number.isFinite(d.m2) || d.price <= 0 || d.m2 <= 0) return false;
    if (scatterState.m2Min && d.m2 < minM2) return false;
    if (scatterState.m2Max && d.m2 > maxM2) return false;
    if (scatterState.priceMin && d.price < minPrice) return false;
    if (scatterState.priceMax && d.price > maxPrice) return false;
    return true;
  });
}

function percentileValue(values, ratio) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 1;
  return clean[Math.min(clean.length - 1, Math.floor(clean.length * ratio))];
}

function renderScatter(rows) {
  const canvas = document.querySelector("#scatterCanvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * dpr;
  const height = canvas.clientHeight * dpr;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0d1715";
  ctx.fillRect(0, 0, width, height);
  const points = scatterFilteredRows(rows);
  scatterState.activePoint = null;
  scatterState.plotted = [];
  document.querySelector("#scatterSummary").textContent = `${number(points.length)} anuncios visibles con precio y m²`;
  document.querySelector("#scatterVisibleCount").textContent = `${number(points.length)} anuncios visibles`;
  if (!points.length) return;
  const minX = scatterState.m2Min ? Number(scatterState.m2Min) : 0;
  const minY = scatterState.priceMin ? Number(scatterState.priceMin) : 0;
  const maxX = Math.max(minX + 1, scatterState.m2Max ? Number(scatterState.m2Max) : percentileValue(points.map((p) => p.m2), 0.98));
  const maxY = Math.max(minY + 1, scatterState.priceMax ? Number(scatterState.priceMax) : percentileValue(points.map((p) => p.price), 0.98));
  const clean = points.filter((p) => p.m2 >= minX && p.m2 <= maxX && p.price >= minY && p.price <= maxY);
  document.querySelector("#scatterSummary").textContent = `${number(clean.length)} de ${number(points.length)} anuncios visibles`;
  document.querySelector("#scatterVisibleCount").textContent = `${number(clean.length)} puntos dibujados`;
  const padL = 96 * dpr, padR = 30 * dpr, padT = 34 * dpr, padB = 56 * dpr;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  ctx.strokeStyle = "rgba(205,225,217,.12)";
  ctx.fillStyle = "#9fb4ad";
  ctx.font = `${11 * dpr}px system-ui`;
  ctx.textAlign = "right";
  for (let i = 0; i <= 5; i++) {
    const yv = minY + ((maxY - minY) / 5) * i;
    const y = height - padB - ((yv - minY) / (maxY - minY)) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(width - padR, y); ctx.stroke();
    ctx.fillText(money(yv), padL - 12 * dpr, y + 4 * dpr);
  }
  ctx.textAlign = "center";
  for (let i = 0; i <= 6; i++) {
    const xv = minX + ((maxX - minX) / 6) * i;
    const x = padL + ((xv - minX) / (maxX - minX)) * plotW;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, height - padB); ctx.stroke();
    ctx.fillText(`${Math.round(xv)} m²`, x, height - padB + 18 * dpr);
  }
  clean.forEach((p) => {
    const x = padL + ((p.m2 - minX) / (maxX - minX)) * plotW;
    const y = height - padB - ((p.price - minY) / (maxY - minY)) * plotH;
    const radius = p.isOutlier ? 4.2 : 3.2;
    ctx.fillStyle = p.isOutlier ? "rgba(213,107,122,.82)" : "rgba(104,211,191,.46)";
    ctx.beginPath(); ctx.arc(x, y, radius * dpr, 0, Math.PI * 2); ctx.fill();
    scatterState.plotted.push({ x: x / dpr, y: y / dpr, radius, data: p });
  });
}

function scatterTooltipHtml(point) {
  const rows = [
    ["Operación", point.operation],
    ["Categoría", point.categoryLabel],
    ["Precio", money(point.price)],
    ["m²", number(point.m2)],
    ["USD/m²", money(point.pricePerM2)],
    ["Provincia", point.province],
    ["Zona", labelZone(point.zoneFull)],
    ["Dormitorios", Number.isFinite(point.rooms) ? number(point.rooms) : ""],
    ["Baños", Number.isFinite(point.baths) ? number(point.baths) : ""],
    ["Parking", Number.isFinite(point.parking) ? number(point.parking) : ""],
    ["Anunciante", point.advertiser || point.advertiserType],
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined);
  return `
    <h4>${escapeHtml(point.title || "Anuncio sin título")}</h4>
    <dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>
    ${point.url ? `<a href="${escapeHtml(point.url)}" target="_blank" rel="noopener">Abrir anuncio</a>` : ""}
  `;
}

function positionScatterTooltip(tooltip, x, y) {
  const wrap = document.querySelector(".scatter-wrap");
  const wrapRect = wrap.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  let left = x + 16;
  let top = y + 16;
  if (left + tipRect.width > wrapRect.width - 8) left = x - tipRect.width - 16;
  if (top + tipRect.height > wrapRect.height - 8) top = y - tipRect.height - 16;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function handleScatterHover(event) {
  const canvas = document.querySelector("#scatterCanvas");
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const point of scatterState.plotted) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  if (!nearest || nearestDistance > 10) {
    hideScatterTooltip();
    return;
  }
  scatterState.activePoint = nearest.data;
  const tooltip = document.querySelector("#scatterTooltip");
  tooltip.hidden = false;
  tooltip.innerHTML = scatterTooltipHtml(nearest.data);
  positionScatterTooltip(tooltip, nearest.x, nearest.y);
}

function hideScatterTooltip() {
  scatterState.activePoint = null;
  const tooltip = document.querySelector("#scatterTooltip");
  if (tooltip) tooltip.hidden = true;
}

function renderQuality(rows) {
  const counts = qualityCounts(rows);
  const activeCount = counts[outlierState.filter] || 0;
  if (outlierState.filter !== "todos" && activeCount === 0) {
    outlierState.filter = "todos";
  }
  document.querySelector("#qualityList").innerHTML = QUALITY_FILTERS.map(([key, label]) => {
    const value = counts[key] || 0;
    const disabled = key !== "todos" && value === 0;
    return `
      <button class="quality-filter ${outlierState.filter === key ? "active" : ""}" type="button" data-quality-filter="${key}" ${disabled ? "disabled" : ""}>
        <span>${escapeHtml(label)}</span>
        <strong>${number(value)}</strong>
      </button>
    `;
  }).join("");
  document.querySelectorAll("[data-quality-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      outlierState.filter = button.dataset.qualityFilter;
      outlierState.visible = 40;
      renderQuality(filteredListings());
    });
  });
  const query = outlierState.search.trim().toLowerCase();
  const qualityRows = qualityIssueRows(rows, outlierState.filter);
  const allIssues = qualityRows
    .filter((o) => {
      if (!query) return true;
      return [o.title, o.zoneFull, o.province, o.categoryLabel, o.operation, o.issueLabel]
        .some((value) => String(value || "").toLowerCase().includes(query));
    })
    .sort((a, b) => (Number.isFinite(b.price) ? b.price : -Infinity) - (Number.isFinite(a.price) ? a.price : -Infinity));
  const visibleIssues = allIssues.slice(0, outlierState.visible);
  document.querySelector("#outlierCountLabel").textContent = `Mostrando ${number(visibleIssues.length)} de ${number(allIssues.length)}`;
  const loadMore = document.querySelector("#loadMoreOutliers");
  if (loadMore) {
    loadMore.hidden = visibleIssues.length >= allIssues.length;
    loadMore.textContent = `Ver más (${number(Math.max(0, allIssues.length - visibleIssues.length))})`;
  }
  document.querySelector("#outlierList").innerHTML = visibleIssues.map((o) => `
    <article class="outlier-item compact ${o.url && o.url === lastOpenedOutlierUrl ? "opened" : ""}" data-url="${escapeHtml(o.url || "")}">
      <div>
        <strong>${escapeHtml(o.title || "Sin título")}</strong>
        <span>${escapeHtml(o.operation || "")} · ${escapeHtml(o.categoryLabel)} · ${escapeHtml(o.province || "Sin provincia")} · ${escapeHtml(labelZone(o.zoneFull))}</span>
        <span>${escapeHtml(money(o.price))} · ${Number.isFinite(o.m2) ? `${escapeHtml(number(o.m2))} m²` : "Sin m²"} · ${Number.isFinite(o.pricePerM2) ? `${escapeHtml(money(o.pricePerM2))}/m²` : "Sin USD/m²"} · ${escapeHtml(o.issueLabel)}</span>
      </div>
      ${o.url ? `<button type="button" class="outlier-open">Ver anuncio</button>` : `<em>URL no disponible</em>`}
    </article>
  `).join("") || `<p class="empty">No hay registros para este filtro de calidad.</p>`;
  document.querySelectorAll(".outlier-item").forEach((card) => {
    const url = card.dataset.url;
    if (!url) return;
    card.addEventListener("click", () => openOutlier(url));
  });
  document.querySelectorAll(".outlier-open").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openOutlier(event.currentTarget.closest(".outlier-item").dataset.url);
    });
  });
}

function qualityIssues(row) {
  const issues = [];
  if (row.isOutlier) issues.push(["outliers", row.outlierMethod ? `Outlier · ${row.outlierMethod}` : "Outlier"]);
  if (row.priceFlag === "invalid_price" || !Number.isFinite(row.price)) issues.push(["invalid_price", "Precio inválido"]);
  if (!Number.isFinite(row.m2)) issues.push(["missing_m2", "Sin m²"]);
  if (!Number.isFinite(row.rooms)) issues.push(["missing_rooms", "Sin dormitorios"]);
  return issues;
}

function qualityCounts(rows) {
  const counts = Object.fromEntries(QUALITY_FILTERS.map(([key]) => [key, 0]));
  rows.forEach((row) => {
    const issues = qualityIssues(row);
    if (issues.length) counts.todos += 1;
    issues.forEach(([key]) => { counts[key] += 1; });
  });
  return counts;
}

function qualityIssueRows(rows, activeFilter) {
  return rows
    .map((row) => {
      const issues = qualityIssues(row);
      const visibleIssues = activeFilter === "todos" ? issues : issues.filter(([key]) => key === activeFilter);
      if (!visibleIssues.length) return null;
      return {
        ...row,
        issueLabel: visibleIssues.map(([, label]) => label).join(" · "),
      };
    })
    .filter(Boolean);
}

function openOutlier(url) {
  if (!url) return;
  lastOpenedOutlierUrl = url;
  window.open(url, "_blank", "noopener");
  document.querySelectorAll(".outlier-item").forEach((card) => {
    card.classList.toggle("opened", card.dataset.url === url);
  });
}

function sampleZones(zones) {
  return zones.filter((z) => z.count >= 5 && Number.isFinite(z.median));
}

function marketPriceMetric(rows) {
  const ops = selectedValues("operation");
  const grouped = groupBy(rows, (d) => d.operation);
  if (ops.length === 1) {
    const label = ops[0] === "alquiler" ? "mediana mensual" : "mediana de venta";
    return `${label}: ${money(metrics(rows).median)}`;
  }
  const saleMedian = metrics(grouped.venta || []).median;
  const rentMedian = metrics(grouped.alquiler || []).median;
  return `venta ${money(saleMedian)} (${number((grouped.venta || []).length)}) · alquiler ${money(rentMedian)} (${number((grouped.alquiler || []).length)})`;
}

function percentileOfRows(rows, field, ratio) {
  return percentileValue(rows.map((row) => row[field]).filter(Number.isFinite), ratio);
}

function iqrMetric(rows) {
  const prices = rows.map((row) => row.price).filter(Number.isFinite);
  if (prices.length < 8) return "";
  return ` · Rango típico: ${money(percentileValue(prices, 0.25))} - ${money(percentileValue(prices, 0.75))}`;
}

function priceReferenceMetric(rows) {
  const ops = selectedValues("operation");
  if (ops.length === 1) {
    return `${marketPriceMetric(rows)} · promedio depurado ${money(metrics(rows).avgClean)}${iqrMetric(rows)}`;
  }
  return marketPriceMetric(rows);
}

function insight(title, metric, interpretation, recommendation) {
  return { title, metric, interpretation, recommendation };
}

function buildCommercialInsights(rows) {
  if (!rows.length) {
    return [
      insight("Sin muestra filtrada", "0 anuncios", "La combinación actual no tiene anuncios en el CSV.", "Ampliar filtros o revisar si la zona/categoría existe con otra normalización."),
    ];
  }

  const zones = zoneMetrics(rows);
  const selectedOps = selectedValues("operation");
  const selectedCategories = selectedValues("category");
  const selectedProvinces = selectedValues("province");
  const priceZoneOperation = selectedOps.length === 1
    ? selectedOps[0]
    : (rows.some((d) => d.operation === "venta") ? "venta" : "alquiler");
  const priceZoneRows = rows.filter((d) => d.operation === priceZoneOperation);
  const priceZoneLabel = selectedOps.length === 1 ? "" : ` (${priceZoneOperation})`;
  const priceZones = zoneMetrics(priceZoneRows);
  const zonesWithPrices = sampleZones(priceZones);
  const total = rows.length;
  const topZone = zones[0];
  const premium = [...zonesWithPrices].sort((a, b) => b.median - a.median)[0];
  const maxZoneCount = Math.max(...zones.map((z) => z.count), 1);
  const medianPrice = metrics(rows).median;
  const cleanAvg = metrics(rows).avgClean;
  const segmentPpm2 = metrics(rows).medianPpm2;
  const selectedZones = selectedValues("zone");
  const singleZone = selectedZones.length === 1;
  const highCompetition = topZone && (topZone.count >= 100 || topZone.count / total >= 0.18);
  const smallSample = total < 30;
  const opportunityCandidates = [...zonesWithPrices]
    .filter((z) => z.count >= Math.min(10, Math.max(5, Math.floor(total * 0.03))))
    .map((z) => {
      const concentration = z.count / maxZoneCount;
      const relativePrice = Number.isFinite(medianPrice) && medianPrice > 0 ? z.median / medianPrice : 1;
      const ppm2Score = Number.isFinite(z.medianPpm2) && Number.isFinite(segmentPpm2) && segmentPpm2 > 0 ? z.medianPpm2 / segmentPpm2 : 1;
      return { ...z, opportunityScore: (relativePrice * 0.52) + (concentration * 0.33) + (ppm2Score * 0.15) };
    })
    .filter((z) => !singleZone || z.zone === selectedZones[0])
    .filter((z) => !topZone || z.zone !== topZone.zone || singleZone);
  const opportunity = opportunityCandidates.sort((a, b) => a.opportunityScore - b.opportunityScore)[0] || zonesWithPrices[0];

  const cards = [];

  if (topZone) {
    cards.push(insight(
      singleZone ? "Competencia relativa en la zona" : "Zona más competida",
      `${labelZone(topZone.zone)} concentra ${number(topZone.count)} anuncios, ${pct((topZone.count / total) * 100)} del segmento filtrado.${smallSample ? " Muestra reducida." : ""}`,
      highCompetition
        ? "Segmento competido: los anuncios pelean visibilidad desde el primer día y el ordenamiento orgánico puede diluir publicaciones comparables."
        : "La oferta está distribuida entre varias zonas; conviene enfocar la estrategia en ubicaciones con mejor referencia de precio o mejor USD/m².",
      highCompetition
        ? "Para competir mejor, se recomienda combinar resaltadores, reposicionadores y optimización de fotos/títulos en esta zona."
        : "Se recomienda reforzar las publicaciones ubicadas en zonas de mayor valor antes de aplicar ajustes agresivos de precio."
    ));
  }

  cards.push(insight(
    "Referencia de precio",
    `${priceReferenceMetric(rows)}${smallSample ? " · muestra reducida" : ""}`,
    selectedOps.length !== 1
      ? "La vista combina venta y alquiler; leer cada mediana por separado evita comparar ticket de compra contra renta mensual."
      : "La mediana y el rango típico ayudan a comparar publicaciones similares sin dejarse llevar por precios extremos.",
    "Si una publicación está por encima de esta referencia, conviene reforzar diferenciadores: fotos, amenidades, ubicación, descripción y visibilidad destacada."
  ));

  if (premium) {
    cards.push(insight(
      singleZone ? "Valor de la zona seleccionada" : "Zona de mayor valor",
      `${premium.label}${priceZoneLabel} · mediana ${money(premium.median)}`,
      singleZone
        ? "La conversación debe enfocarse en cómo justificar el valor frente a comparables dentro de la misma zona."
        : "Esta zona permite posicionar inventario de mayor valor y justificar mensajes de exclusividad, ubicación y calidad.",
      "Se recomienda orientar la comunicación a confianza, calidad, ubicación y mayor exposición; no solo a precio."
    ));
  }

  if (opportunity) {
    cards.push(insight(
      singleZone ? "Oportunidad de crecimiento en la zona" : "Zona con oportunidad de crecimiento",
      `${opportunity.label}${priceZoneLabel} · ${number(opportunity.count)} anuncios · mediana ${money(opportunity.median)}`,
      singleZone
        ? "La oportunidad está en mejorar desempeño de publicaciones activas: presentación, reposicionamiento y claridad del precio frente a comparables."
        : "Combina inventario relevante con menor saturación relativa que las zonas líderes y precio mediano competitivo.",
      "Una estrategia recomendada es mejorar presentación, visibilidad destacada y reposicionamiento para ganar tracción frente a comparables."
    ));
  }

  const categoryBundle = selectedCategories.length !== 1 && categoryMetrics(rows)[0]?.count >= 500;
  const highTicket = Number.isFinite(medianPrice) && medianPrice >= (selectedOps[0] === "alquiler" ? 1800 : 300000);
  const premiumTarget = highCompetition && topZone ? topZone.label : (premium?.label || topZone?.label || "zonas con mayor inventario");
  const productMetric = highCompetition
    ? "Segmento con alta competencia"
    : highTicket
      ? `Ticket medio relevante: ${money(medianPrice)}`
      : categoryBundle
        ? `Volumen alto: ${number(total)} publicaciones`
        : `Inventario filtrado: ${number(total)} publicaciones`;
  cards.push(insight(
    "Estrategia recomendada",
    `${productMetric} · foco ${premiumTarget}`,
    highCompetition
      ? "La visibilidad orgánica puede diluirse en zonas con mucha oferta comparable."
      : highTicket
        ? "El valor del inventario permite construir una estrategia de confianza, marca y exposición, no solo volumen."
        : categoryBundle
          ? "El volumen permite sostener presencia constante con una estrategia combinada de visibilidad y reposicionamiento."
          : "Con menor inventario, conviene priorizar publicaciones de alta calidad y con buena relación precio/m².",
    highCompetition
      ? "Para competir en este segmento, puede ser conveniente combinar Platino con reposicionadores y optimización de fotos/títulos."
      : highTicket
        ? "Se recomienda usar visibilidad destacada y reforzar los activos visuales de la publicación."
        : categoryBundle
          ? "Conviene mantener exposición frecuente por categoría y zona para sostener presencia frente al inventario comparable."
          : "Se recomienda aplicar destacados puntuales en propiedades con mejor relación precio/m²."
  ));

  return smallSample ? cards.slice(0, 3) : cards.slice(0, 5);
}

function renderInsights(rows) {
  const insights = buildCommercialInsights(rows);
  document.querySelector("#insightsGrid").innerHTML = insights.map((item) => `
    <article class="insight-card">
      <h3>${escapeHtml(item.title)}</h3>
      <div class="insight-metric">${escapeHtml(item.metric)}</div>
      <p>${escapeHtml(item.interpretation)}</p>
      <strong>${escapeHtml(item.recommendation)}</strong>
    </article>
  `).join("");
}

function normalizedHighlightType(row) {
  const value = row.highlightGroup || row.highlightType;
  if (["platino", "otros_resaltadores", "sin_resaltador"].includes(value)) return value;
  const signal = [row.highlightSvg, row.highlightRaw, row.highlightType].filter(Boolean).join(" ").toLowerCase();
  const hasHighlight = String(row.hasHighlight ?? "").toLowerCase();
  const method = String(row.highlightMethod ?? "").toLowerCase();
  if (signal.includes("highlight_3.svg")) return "platino";
  if (signal.includes("highlight_1.svg") || signal.includes("highlight_2.svg")) return "otros_resaltadores";
  if (hasHighlight === "true") return "otros_resaltadores";
  if (
    hasHighlight === "false"
    && (
      signal.includes("sin marker")
      || signal.includes("no visible highlight marker")
      || ["no_visible_highlight_marker", "css_class", "badge_text", "label_text", "visual_marker"].includes(method)
    )
  ) return "sin_resaltador";
  return "desconocido";
}

function hasKnownHighlight(row) {
  return ["platino", "otros_resaltadores"].includes(normalizedHighlightType(row));
}

function highlightRows(rows) {
  if (highlightState.type === "todos") return rows;
  return rows.filter((row) => normalizedHighlightType(row) === highlightState.type);
}

function highlightCountMap(rows) {
  return HIGHLIGHT_ORDER.reduce((acc, type) => {
    acc[type] = rows.filter((row) => normalizedHighlightType(row) === type).length;
    return acc;
  }, {});
}

function highlightAdoption(rows) {
  const knownRows = rows.filter((row) => normalizedHighlightType(row) !== "desconocido");
  const highlighted = knownRows.filter(hasKnownHighlight).length;
  const noHighlight = knownRows.filter((row) => normalizedHighlightType(row) === "sin_resaltador").length;
  return {
    knownTotal: knownRows.length,
    highlighted,
    noHighlight,
    adoption: knownRows.length ? (highlighted / knownRows.length) * 100 : null,
    noHighlightPct: knownRows.length ? (noHighlight / knownRows.length) * 100 : null,
  };
}

function visibleHighlightTypes(rows) {
  const counts = highlightCountMap(rows);
  return HIGHLIGHT_ORDER.filter((type) => type !== "desconocido" || counts.desconocido > 0);
}

function renderHighlightTypeFilter(rows) {
  const select = document.querySelector("#highlightTypeFilter");
  if (!select) return;
  const visibleTypes = visibleHighlightTypes(rows);
  if (highlightState.type !== "todos" && !visibleTypes.includes(highlightState.type)) {
    highlightState.type = "todos";
  }
  select.innerHTML = [
    `<option value="todos">Todos</option>`,
    ...visibleTypes.map((type) => `<option value="${type}">${escapeHtml(HIGHLIGHT_LABELS[type])}</option>`),
  ].join("");
  select.value = highlightState.type;
}

function productSuggestion(row) {
  const medianPrice = row.median;
  const premiumTicket = Number.isFinite(medianPrice) && medianPrice >= (selectedValues("operation")[0] === "alquiler" ? 1800 : 500000);
  if ((row.outliers >= Math.max(3, row.count * 0.12)) || row.missingDataPct >= 35) return "Auditar precio/calidad";
  if (premiumTicket || row.platinumPct >= 8) return "Platino";
  if (row.count >= 100 || (row.noHighlightPct >= 55 && row.count >= 25)) return "Resaltador + reposicionadores";
  if (row.highlightedPct >= 15 || row.noHighlightPct >= 65) return "Otros resaltadores";
  return "Resaltador inicial";
}

function highlightZoneOpportunity(rows) {
  const zones = Object.entries(groupBy(rows, (d) => d.zoneFull))
    .map(([zone, items]) => {
      const countMap = highlightCountMap(items);
      const known = highlightAdoption(items);
      const zoneMetricsValue = metrics(items);
      const noHighlightPct = known.noHighlightPct ?? 0;
      const highlightedPct = known.adoption ?? 0;
      const platinumPct = items.length ? ((countMap.platino || 0) / items.length) * 100 : 0;
      const outliers = items.filter((item) => item.isOutlier).length;
      const missingDataPct = items.length ? (items.filter((item) => !Number.isFinite(item.price) || !Number.isFinite(item.m2)).length / items.length) * 100 : 0;
      const score = (items.length * 0.42) + (noHighlightPct * 1.6) + ((Number.isFinite(zoneMetricsValue.median) ? Math.log10(Math.max(zoneMetricsValue.median, 1)) : 0) * 10);
      const row = {
        zone,
        label: labelZone(zone),
        count: items.length,
        noHighlight: countMap.sin_resaltador || 0,
        highlighted: known.highlighted,
        noHighlightPct,
        highlightedPct,
        platinumPct,
        outliers,
        missingDataPct,
        median: zoneMetricsValue.median,
        medianPpm2: zoneMetricsValue.medianPpm2,
        score,
      };
      return { ...row, product: productSuggestion(row) };
    })
    .filter((row) => row.count >= 3)
    .sort((a, b) => b.score - a.score);
  return zones;
}

function renderHighlightKpis(rows, sectionRows) {
  const counts = highlightCountMap(sectionRows);
  const adoption = highlightAdoption(sectionRows);
  const cards = [
    ["Total anuncios filtrados", number(sectionRows.length), highlightState.type === "todos" ? "Filtro local: todos" : HIGHLIGHT_LABELS[highlightState.type]],
    ["Platino", number(counts.platino), "Resaltador premium"],
    ["Otros resaltadores", number(counts.otros_resaltadores), "Visibilidad pagada"],
    ["Sin resaltador", number(counts.sin_resaltador), "Mayor visibilidad disponible"],
    ["% con resaltador", pct(adoption.adoption), "Sobre anuncios clasificados"],
    ["% sin resaltador", pct(adoption.noHighlightPct), "Sobre anuncios clasificados"],
  ];
  if (counts.desconocido > 0) {
    cards.splice(4, 0, ["Desconocido", number(counts.desconocido), "Sin señal confiable"]);
  }
  const allUnknown = sectionRows.length > 0 && counts.desconocido === sectionRows.length;
  document.querySelector("#highlightScope").textContent = allUnknown
    ? `${number(rows.length)} anuncios con filtros globales · Resaltadores no evaluados para este segmento. Ejecutar scraping actualizado.`
    : `${number(rows.length)} anuncios con filtros globales · ${number(sectionRows.length)} visibles en esta sección`;
  document.querySelector("#highlightKpis").innerHTML = cards.map(([label, value, note]) => `
    <article class="mini-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><em>${escapeHtml(note)}</em></article>
  `).join("");
}

function renderHighlightDistribution(rows) {
  const counts = highlightCountMap(rows);
  const visibleTypes = visibleHighlightTypes(rows);
  const data = visibleTypes.map((type) => ({ label: HIGHLIGHT_LABELS[type], value: counts[type] || 0 }));
  barChart("#highlightDistribution", data, number, visibleTypes.length);
}

function renderHighlightPriceRanges(rows) {
  const el = document.querySelector("#highlightPriceRanges");
  const cleanRows = rows.filter((row) => Number.isFinite(row.price) && row.price >= 0);
  if (!cleanRows.length) {
    el.innerHTML = `<p class="empty">No hay precios suficientes para cruzar resaltadores.</p>`;
    return;
  }
  const selectedOps = selectedValues("operation");
  const binKey = selectedOps.length === 1 ? selectedOps[0] : "mixto";
  const bins = HIGHLIGHT_PRICE_BINS[binKey] || HIGHLIGHT_PRICE_BINS.mixto;
  const ranges = bins.slice(0, -1).map((from, index) => {
    const to = bins[index + 1];
    const items = cleanRows.filter((row) => row.price >= from && (to === Infinity ? true : row.price < to));
    return { label: rangeLabel(from, to, money), items, counts: highlightCountMap(items) };
  }).filter((range) => range.items.length);
  const peak = Math.max(...ranges.map((range) => range.items.length), 1);
  el.innerHTML = ranges.map((range) => `
    <div class="stack-row">
      <div class="stack-label"><strong>${range.label}</strong><span>${number(range.items.length)} anuncios</span></div>
      <div class="stack-track" style="max-width:${Math.max(12, (range.items.length / peak) * 100)}%">
        ${visibleHighlightTypes(range.items).map((type) => {
          const value = range.counts[type] || 0;
          const width = range.items.length ? (value / range.items.length) * 100 : 0;
          return value ? `<span class="stack-segment highlight-${type}" style="width:${width}%" title="${HIGHLIGHT_LABELS[type]}: ${number(value)}"></span>` : "";
        }).join("")}
      </div>
      <div class="stack-legend-inline">${visibleHighlightTypes(range.items).map((type) => `${HIGHLIGHT_LABELS[type]} ${number(range.counts[type] || 0)}`).join(" · ")}</div>
    </div>
  `).join("");
}

function renderHighlightPriceTable(rows) {
  const grouped = groupBy(rows, normalizedHighlightType);
  document.querySelector("#highlightPriceTable tbody").innerHTML = visibleHighlightTypes(rows).map((type) => {
    const items = grouped[type] || [];
    const m = metrics(items);
    return `<tr><td>${HIGHLIGHT_LABELS[type]}</td><td class="numeric">${number(items.length)}</td><td class="numeric">${money(m.median)}</td><td class="numeric">${money(m.avgClean)}</td><td class="numeric">${money(m.medianPpm2)}</td></tr>`;
  }).join("");
}

function renderHighlightCategoryTable(rows) {
  const data = Object.entries(groupBy(rows, cleanCategory))
    .map(([label, items]) => {
      const adoption = highlightAdoption(items);
      return { label, total: items.length, highlighted: adoption.highlighted, noHighlight: adoption.noHighlight, pct: adoption.adoption };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 14);
  document.querySelector("#highlightCategoryTable tbody").innerHTML = data.map((row) => `
    <tr><td>${escapeHtml(row.label)}</td><td class="numeric">${number(row.total)}</td><td class="numeric">${number(row.highlighted)}</td><td class="numeric">${number(row.noHighlight)}</td><td class="numeric">${pct(row.pct)}</td></tr>
  `).join("") || `<tr><td colspan="5">No hay datos.</td></tr>`;
}

function renderHighlightZoneTable(rows) {
  const data = highlightZoneOpportunity(rows).slice(0, 40);
  document.querySelector("#highlightZoneTable tbody").innerHTML = data.map((row) => `
    <tr>
      <td>${escapeHtml(row.label)}</td>
      <td class="numeric">${number(row.count)}</td>
      <td class="numeric">${number(row.noHighlight)}</td>
      <td class="numeric">${pct(row.noHighlightPct)}</td>
      <td class="numeric">${number(row.highlighted)}</td>
      <td class="numeric">${pct(row.highlightedPct)}</td>
      <td class="numeric">${money(row.median)}</td>
      <td class="numeric">${money(row.medianPpm2)}</td>
      <td class="numeric">${number(row.score)}</td>
      <td>${escapeHtml(row.product)}</td>
    </tr>
  `).join("") || `<tr><td colspan="10">No hay zonas suficientes para calcular oportunidades.</td></tr>`;
}

function renderHighlightInsights(rows) {
  const sectionRows = highlightRows(rows);
  const adoption = highlightAdoption(sectionRows);
  const zones = highlightZoneOpportunity(sectionRows);
  const generalMetrics = metrics(sectionRows);
  const topZone = zones[0];
  const highlightedRows = sectionRows.filter(hasKnownHighlight);
  const platinumRows = sectionRows.filter((row) => normalizedHighlightType(row) === "platino");
  const selectedOps = selectedValues("operation");
  const binKey = selectedOps.length === 1 ? selectedOps[0] : "mixto";
  const bins = HIGHLIGHT_PRICE_BINS[binKey] || HIGHLIGHT_PRICE_BINS.mixto;
  const priceRanges = bins.slice(0, -1).map((from, index) => {
    const to = bins[index + 1];
    const items = sectionRows.filter((row) => Number.isFinite(row.price) && row.price >= from && (to === Infinity ? true : row.price < to));
    const rangeAdoption = highlightAdoption(items);
    return { label: rangeLabel(from, to, money), count: items.length, adoption: rangeAdoption.adoption ?? 0, noHighlightPct: rangeAdoption.noHighlightPct ?? 0 };
  }).filter((range) => range.count);
  const opportunityRange = priceRanges.sort((a, b) => (b.count * (b.noHighlightPct / 100)) - (a.count * (a.noHighlightPct / 100)))[0];
  const cards = [];
  const sampleNote = sectionRows.length < 30 ? " Muestra reducida: usar como referencia direccional." : "";

  cards.push(insight(
    "Adopción de resaltadores",
    `${pct(adoption.adoption)} con resaltador · ${pct(adoption.noHighlightPct)} sin resaltador`,
    adoption.knownTotal
      ? `El segmento tiene ${number(adoption.highlighted)} anuncios con visibilidad pagada y ${number(adoption.noHighlight)} sin resaltador.${sampleNote}`
      : `No hay señal suficiente para medir adopción de resaltadores en este segmento.${sampleNote}`,
    adoption.noHighlightPct >= 60
      ? "Se recomienda aplicar resaltadores en publicaciones sin visibilidad destacada para mejorar exposición dentro de este segmento."
      : "Para competir en un segmento donde varias publicaciones ya destacan, puede ser conveniente usar Platino y reposicionadores."
  ));

  cards.push(insight(
    "Ticket resaltado",
    `Platino mediana ${money(metrics(platinumRows).median)} · segmento ${money(generalMetrics.median)}`,
    platinumRows.length
      ? "Los anuncios con mayor visibilidad permiten entender qué ticket está más dispuesto a invertir en exposición."
      : "Todavía no hay suficientes anuncios Platino en el filtro para comparar ticket destacado.",
    Number.isFinite(generalMetrics.median) && generalMetrics.median >= (selectedValues("operation")[0] === "alquiler" ? 1800 : 300000)
      ? "En propiedades de ticket alto, se recomienda Platino para maximizar exposición y reforzar percepción de calidad."
      : "Puede ser conveniente iniciar con resaltadores de entrada y mejorar fotos, título y descripción."
  ));

  if (opportunityRange) {
    cards.push(insight(
      "Oportunidad por rango de precio",
      `${opportunityRange.label} · ${number(opportunityRange.count)} anuncios · ${pct(opportunityRange.noHighlightPct)} sin resaltador`,
      "Este rango combina inventario relevante con espacio para mejorar visibilidad destacada.",
      "Se recomienda aplicar resaltadores como punto de partida y sumar reposicionadores en zonas competidas."
    ));
  }

  if (topZone) {
    cards.push(insight(
      "Zona con oportunidad de mayor visibilidad",
      `${topZone.label} · ${number(topZone.noHighlight)} sin resaltador · score ${number(topZone.score)}`,
      topZone.noHighlightPct >= 60
        ? "Hay volumen activo y baja adopción relativa de resaltadores: existe espacio claro para ganar exposición."
        : "La zona ya muestra competencia por visibilidad; quien no destaca puede perder exposición frente a comparables.",
      `Estrategia recomendada: aplicar ${topZone.product} en publicaciones ubicadas en esta zona.`
    ));
  }

  cards.push(insight(
    "Segmento competido",
    `${number(sectionRows.length)} anuncios · ${number(highlightedRows.length)} con resaltador`,
    adoption.adoption >= 35
      ? "La adopción de resaltadores indica competencia visible; destacar deja de ser diferencial y pasa a ser defensa de exposición."
      : "La adopción aún es baja; hay oportunidad de aprovechar visibilidad destacada antes de que el segmento se sature.",
    adoption.adoption >= 35
      ? "Se recomienda combinar Platino con reposicionadores para sostener presencia."
      : "Se recomienda combinar resaltador inicial con mejora de fotos y título para acelerar resultados."
  ));

  document.querySelector("#highlightInsights").innerHTML = cards.slice(0, sectionRows.length < 30 ? 3 : 5).map((item) => `
    <article class="insight-card">
      <h3>${escapeHtml(item.title)}</h3>
      <div class="insight-metric">${escapeHtml(item.metric)}</div>
      <p>${escapeHtml(item.interpretation)}</p>
      <strong>${escapeHtml(item.recommendation)}</strong>
    </article>
  `).join("");
}

function renderHighlights(rows) {
  if (!document.querySelector("#highlightKpis")) return;
  renderHighlightTypeFilter(rows);
  const sectionRows = highlightRows(rows);
  renderHighlightKpis(rows, sectionRows);
  renderHighlightDistribution(sectionRows);
  renderHighlightPriceRanges(sectionRows);
  renderHighlightPriceTable(sectionRows);
  renderHighlightCategoryTable(sectionRows);
  renderHighlightZoneTable(sectionRows);
  renderHighlightInsights(rows);
}

function renderAll() {
  const rows = filteredListings();
  const zones = zoneMetrics(rows);
  const cats = categoryMetrics(rows);
  renderKpis(rows);
  document.querySelector("#operationCount").textContent = `${number(rows.length)} anuncios`;
  document.querySelector("#priceCount").textContent = `${number(rows.filter((d) => Number.isFinite(d.price)).length)} con precio`;
  barChart("#operationBars", rowsForBars(groupBy(rows, (d) => d.operation)), number, 3);
  barChart("#categoryBars", rowsForBars(groupBy(rows, cleanCategory)), number, 14);
  barChart("#provinceBars", rowsForBars(groupBy(rows, (d) => d.province)), number, 10);
  barChart("#zoneInventoryBars", zones.map((z) => ({ label: z.label, value: z.count })), number, 15);
  operationHistogram(
    "#priceHistogram",
    rows.filter((d) => Number.isFinite(d.price)),
    (d) => d.price,
    PRICE_BINS,
    money,
    { venta: "Venta", alquiler: "Alquiler mensual" },
  );
  operationHistogram(
    "#ppm2Histogram",
    rows.filter((d) => !d.isOutlier && Number.isFinite(d.pricePerM2)),
    (d) => d.pricePerM2,
    PPM2_BINS,
    money,
    { venta: "Venta USD/m²", alquiler: "Alquiler USD/m² mensual" },
  );
  const catPriceRows = cats.filter((c) => c.count >= 5);
  const ops = selectedValues("operation");
  const categoryScope = ops.length !== 1 ? "Mixto: usar filtro operación" : `Solo ${ops[0]}`;
  document.querySelector("#categoryMedianScope").textContent = categoryScope;
  document.querySelector("#categoryCleanAvgScope").textContent = categoryScope;
  metricBars("#categoryMedianBars", catPriceRows.map((c) => ({ label: c.label, value: c.median })), "value", money, 10);
  metricBars("#categoryCleanAvgBars", catPriceRows.map((c) => ({ label: c.label, value: c.avgClean })), "value", money, 10);
  metricBars("#premiumZones", zones.filter((z) => z.count >= 5).map((z) => ({ label: z.label, value: z.median })), "value", money, 10);
  const accessible = zones.filter((z) => z.count >= 5 && Number.isFinite(z.median)).sort((a, b) => a.median - b.median).slice(0, 10);
  barChart("#accessibleZones", accessible.map((z) => ({ label: z.label, value: z.median })), money, 10);
  metricBars("#ppm2Zones", zones.filter((z) => z.count >= 5).map((z) => ({ label: z.label, value: z.medianPpm2 })), "value", money, 10);
  const typologyRows = rows.filter((d) => ["casas", "apartamentos", "apartamentos_amueblados"].includes(d.category));
  barChart("#roomBars", rowsForBars(groupBy(typologyRows, (d) => d.roomBucket)), number, 8);
  renderTables(rows);
  renderScatter(rows);
  renderHighlights(rows);
  renderQuality(rows);
  renderInsights(rows);
}

function init() {
  document.querySelector("#updatedLabel").textContent = DATA.meta.updatedLabel || "Según CSV";
  setupFilters();
  setupScatterControls();
  setupHighlightControls();
  setupOutlierControls();
  renderAll();
  window.addEventListener("resize", () => renderScatter(filteredListings()));
}

init();
