const DATA = window.E24_REAL_ESTATE_DATA;

const state = {
  operation: [],
  category: [],
  province: [],
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

let lastOpenedOutlierUrl = "";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const number = (v) => Number.isFinite(v) ? fmt.format(v) : "—";
const money = (v) => Number.isFinite(v) ? moneyFmt.format(v) : "—";
const pct = (v) => Number.isFinite(v) ? `${fmt.format(v)}%` : "—";
const labelZone = (z) => (z || "Sin zona").replaceAll(" | ", " · ");
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
    if (!matchesSelection("province", d.province)) return false;
    if (!matchesSelection("zone", d.zoneFull)) return false;
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
      if (["operation", "category", "province"].includes(key)) updateZoneOptions();
      renderFilterControls();
      renderAll();
    });
  });

  el.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state[key] = selectedValues(key).filter((item) => item !== chip.dataset.value);
      if (["operation", "category", "province"].includes(key)) updateZoneOptions();
      renderFilterControls();
      renderAll();
    });
  });
}

function baseRowsForZoneOptions() {
  return DATA.listings.filter((d) => {
    if (!matchesSelection("operation", d.operation)) return false;
    if (!matchesSelection("category", d.category)) return false;
    if (!matchesSelection("province", d.province)) return false;
    return true;
  });
}

function renderFilterControls() {
  const listings = DATA.listings;
  const categories = [...new Map(listings.map((d) => [d.category, d.categoryLabel])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const categoryLabels = Object.fromEntries(categories);
  const zones = [...new Set(baseRowsForZoneOptions().map((d) => d.zoneFull).filter(Boolean))].sort();
  state.zone = selectedValues("zone").filter((zone) => zones.includes(zone));

  renderMultiSelect("#operationFilter", "operation", [...new Set(listings.map((d) => d.operation).filter(Boolean).sort())]);
  renderMultiSelect("#categoryFilter", "category", categories.map(([value]) => value), (value) => categoryLabels[value] || value);
  renderMultiSelect("#provinceFilter", "province", [...new Set(listings.map((d) => d.province).filter(Boolean).sort())]);
  renderMultiSelect("#zoneFilter", "zone", zones, labelZone);
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
      if (["operation", "category", "province"].includes(key)) updateZoneOptions();
      renderAll();
    });
  });

  document.querySelector("#resetFilters").addEventListener("click", () => {
    Object.assign(state, { operation: [], category: [], province: [], zone: [], rooms: [], priceMin: "", priceMax: "", m2Min: "", m2Max: "" });
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

function updateZoneOptions() {
  const zones = new Set(baseRowsForZoneOptions().map((d) => d.zoneFull).filter(Boolean));
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
  const q = [
    ["Outliers", rows.filter((d) => d.isOutlier).length],
    ["Precios inválidos", rows.filter((d) => d.priceFlag === "invalid_price" || !Number.isFinite(d.price)).length],
    ["Sin m²", rows.filter((d) => !Number.isFinite(d.m2)).length],
    ["Sin dormitorios", rows.filter((d) => !Number.isFinite(d.rooms)).length],
    ["Duplicados marcados", rows.filter((d) => d.isDuplicate).length],
  ];
  document.querySelector("#qualityList").innerHTML = q.map(([label, value]) => `<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join("");
  const urls = new Set(rows.map((d) => d.url));
  const filteredOutliers = DATA.outliers.filter((o) => urls.has(o.url)).slice(0, 12);
  document.querySelector("#outlierList").innerHTML = filteredOutliers.map((o) => `
    <article class="outlier-item ${o.url && o.url === lastOpenedOutlierUrl ? "opened" : ""}" data-url="${escapeHtml(o.url || "")}">
      <strong>${escapeHtml(o.title || "Sin título")}</strong>
      <span>${escapeHtml(o.categoryLabel)} · ${escapeHtml(labelZone(o.zoneFull))} · ${escapeHtml(money(o.price))} · ${escapeHtml(o.reason)}</span>
      ${o.url ? `<button type="button" class="outlier-open">Ver anuncio</button>` : `<em>URL no disponible</em>`}
    </article>
  `).join("") || `<p class="empty">No hay outliers para este filtro.</p>`;
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
        : "La oferta está distribuida entre varias zonas; la oportunidad comercial está en priorizar clientes de zonas con mayor mediana o mejor USD/m².",
      highCompetition
        ? "Recomendación KAM: ofrecer resaltadores, reposicionadores y mejora de fotos/títulos para clientes activos en esta zona."
        : "Recomendación KAM: priorizar cuentas con inventario en zonas de mayor valor antes de empujar descuentos."
    ));
  }

  cards.push(insight(
    "Referencia de precio",
    `${priceReferenceMetric(rows)}${smallSample ? " · muestra reducida" : ""}`,
    selectedOps.length !== 1
      ? "La vista combina venta y alquiler; leer cada mediana por separado evita comparar ticket de compra contra renta mensual."
      : "La mediana y el rango típico ayudan a comparar publicaciones similares sin dejarse llevar por precios extremos.",
    "Recomendación KAM: si un cliente publica por encima de esta referencia, reforzar diferenciadores: fotos, amenidades, ubicación, descripción y visibilidad premium."
  ));

  if (premium) {
    cards.push(insight(
      singleZone ? "Valor de la zona seleccionada" : "Zona de mayor valor",
      `${premium.label}${priceZoneLabel} · mediana ${money(premium.median)}`,
      singleZone
        ? "La conversación debe enfocarse en cómo justificar el valor frente a comparables dentro de la misma zona."
        : "Esta zona permite posicionar inventario de mayor valor y justificar mensajes de exclusividad, ubicación y calidad.",
      "Recomendación KAM: orientar la propuesta a branding, confianza y exposición premium; no llevar la conversación solo a precio."
    ));
  }

  if (opportunity) {
    cards.push(insight(
      singleZone ? "Oportunidad comercial en la zona" : "Zona para prospectar",
      `${opportunity.label}${priceZoneLabel} · ${number(opportunity.count)} anuncios · mediana ${money(opportunity.median)}`,
      singleZone
        ? "La oportunidad está en mejorar desempeño de publicaciones activas: presentación, reposicionamiento y claridad del precio frente a comparables."
        : "Combina inventario prospectable con menor saturación relativa que las zonas líderes y precio mediano competitivo.",
      "Recomendación KAM: priorizar brokers o propietarios con varias publicaciones en esta zona y ofrecer paquetes de exposición para ganar tracción."
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
    "Producto sugerido",
    `${productMetric} · foco ${premiumTarget}`,
    highCompetition
      ? "La visibilidad orgánica puede diluirse en zonas con mucha oferta comparable."
      : highTicket
        ? "El valor del inventario permite vender una propuesta de confianza, marca y exposición, no solo volumen."
        : categoryBundle
          ? "El volumen habilita una conversación de paquete/bundle para sostener presencia constante."
          : "Con menor inventario, la mejor jugada es captación selectiva y posicionamiento de publicaciones de alta calidad.",
    highCompetition
      ? "Recomendación KAM: ofrecer Oro/Platino + reposicionadores como paquete de exposición."
      : highTicket
        ? "Recomendación KAM: proponer productos premium/branding y reforzar activos visuales del cliente."
        : categoryBundle
          ? "Recomendación KAM: vender bundle por categoría/zona para clientes con varias publicaciones activas."
          : "Recomendación KAM: captar clientes de nicho y usar destacados puntuales en propiedades con mejor USD/m²."
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
  renderQuality(rows);
  renderInsights(rows);
}

function init() {
  document.querySelector("#updatedLabel").textContent = DATA.meta.updatedLabel || "Según CSV";
  setupFilters();
  setupScatterControls();
  renderAll();
  window.addEventListener("resize", () => renderScatter(filteredListings()));
}

init();
