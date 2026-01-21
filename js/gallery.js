(() => {
  const CATALOG = Array.isArray(window.VA_CATALOG) ? window.VA_CATALOG : [];

  // --- DOM ---
  const grid = document.getElementById("grid");
  const q = document.getElementById("q");
  const typeFilter = document.getElementById("typeFilter");
  const sourceFilter = document.getElementById("sourceFilter");
  const yearFilter = document.getElementById("yearFilter");
  const btnReset = document.getElementById("btnReset");
  const resultCount = document.getElementById("resultCount");

  // Viewer
  const viewer = document.getElementById("viewer");
  const viewerBackdrop = document.getElementById("viewerBackdrop");
  const btnClose = document.getElementById("btnClose");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const viewerImg = document.getElementById("viewerImg");
  const metaTitle = document.getElementById("metaTitle");
  const metaSub = document.getElementById("metaSub");
  const metaDl = document.getElementById("metaDl");

  // --- State ---
  let filtered = [...CATALOG];
  let currentIndex = -1; // index inside filtered[]
  let lastFocusEl = null;

  // --- Helpers ---
  const esc = (s) => String(s ?? "");

  function normalize(str) {
    return esc(str).toLowerCase().trim();
  }

  function uniqSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })
    );
  }

  function buildOptions(selectEl, values, placeholderText) {
    // Keep first option (All...)
    const keepFirst = selectEl.querySelector("option");
    selectEl.innerHTML = "";
    if (keepFirst) selectEl.appendChild(keepFirst);

    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = String(v);
      selectEl.appendChild(opt);
    });

    if (placeholderText) {
      keepFirst.textContent = placeholderText;
    }
  }

  function formatMetaPairs(item) {
    // Order matters: keep it consistent and factual
    const pairs = [];

    pairs.push(["Type", item.type === "screenshot" ? "Screenshot" : "Photo"]);
    if (item.source) pairs.push(["Source", item.source]);
    if (item.location) pairs.push(["Location", item.location]);
    if (item.date) pairs.push(["Date", item.date]);
    if (item.resolution) pairs.push(["Resolution", item.resolution]);

    // Optional tags (keep minimal)
    if (Array.isArray(item.tags) && item.tags.length) {
      pairs.push(["Tags", item.tags.join(", ")]);
    }

    return pairs;
  }

  function renderGrid(items) {
    if (!grid) return;

    grid.innerHTML = "";
    const frag = document.createDocumentFragment();

    items.forEach((item, idx) => {
      const figure = document.createElement("div");
      figure.className = "figure";

      const a = document.createElement("a");
      a.href = "#";
      a.setAttribute("role", "button");
      a.setAttribute("aria-label", `Open: ${esc(item.title || "Image")}`);
      a.dataset.index = String(idx);

      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = esc(item.title || "");

      // Use thumb if present, else src
      img.src = item.thumb || item.src;

      a.appendChild(img);

      const cap = document.createElement("div");
      cap.className = "figure-caption";

      const title = document.createElement("p");
      title.className = "figure-title";
      title.textContent = item.title || "Untitled";

      const meta = document.createElement("p");
      meta.className = "figure-meta";
      // Editorial: short line, factual
      const left = item.type === "screenshot" ? "Screenshot" : "Photo";
      const mid = item.source ? ` · ${item.source}` : "";
      const right = item.year ? ` · ${item.year}` : "";
      meta.textContent = `${left}${mid}${right}`;

      cap.appendChild(title);
      cap.appendChild(meta);

      figure.appendChild(a);
      figure.appendChild(cap);

      frag.appendChild(figure);
    });

    grid.appendChild(frag);

    if (resultCount) {
      resultCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
    }
  }

  function applyFilters() {
    const query = normalize(q?.value);
    const typeVal = typeFilter?.value || "all";
    const sourceVal = sourceFilter?.value || "all";
    const yearVal = yearFilter?.value || "all";

    filtered = CATALOG.filter((item) => {
      if (typeVal !== "all" && item.type !== typeVal) return false;
      if (sourceVal !== "all" && esc(item.source) !== sourceVal) return false;
      if (yearVal !== "all" && String(item.year) !== String(yearVal)) return false;

      if (!query) return true;

      // Search across a few fields
      const hay = [
        item.title,
        item.source,
        item.location,
        item.date,
        item.year,
        Array.isArray(item.tags) ? item.tags.join(" ") : ""
      ].map(normalize).join(" | ");

      return hay.includes(query);
    });

    renderGrid(filtered);
  }

  // --- Viewer ---
  function openViewer(index) {
    if (!viewer || index < 0 || index >= filtered.length) return;

    currentIndex = index;
    const item = filtered[currentIndex];

    lastFocusEl = document.activeElement;

    // Image
    viewerImg.src = item.src;
    viewerImg.alt = esc(item.title || "");

    // Metadata header
    metaTitle.textContent = item.title || "Untitled";
    const subParts = [];
    subParts.push(item.type === "screenshot" ? "Screenshot" : "Photo");
    if (item.source) subParts.push(item.source);
    if (item.year) subParts.push(String(item.year));
    metaSub.textContent = subParts.join(" · ");

    // Metadata pairs
    metaDl.innerHTML = "";
    const pairs = formatMetaPairs(item);

    for (const [k, v] of pairs) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      metaDl.appendChild(dt);
      metaDl.appendChild(dd);
    }

    viewer.classList.remove("hidden");

    // Focus management: focus close for accessibility
    btnClose?.focus();

    // Update nav disabled states
    updateViewerNav();
  }

  function closeViewer() {
    if (!viewer) return;
    viewer.classList.add("hidden");

    // Clear image to stop large memory usage on some browsers
    viewerImg.src = "";
    viewerImg.alt = "";

    currentIndex = -1;

    if (lastFocusEl && typeof lastFocusEl.focus === "function") {
      lastFocusEl.focus();
    }
  }

  function updateViewerNav() {
    if (!btnPrev || !btnNext) return;

    btnPrev.disabled = currentIndex <= 0;
    btnNext.disabled = currentIndex >= filtered.length - 1;
  }

  function prevImage() {
    if (currentIndex > 0) openViewer(currentIndex - 1);
  }

  function nextImage() {
    if (currentIndex < filtered.length - 1) openViewer(currentIndex + 1);
  }

  // --- Init dropdown options ---
  function initFilters() {
    const sources = uniqSorted(CATALOG.map((x) => x.source));
    const years = uniqSorted(CATALOG.map((x) => x.year)).sort((a, b) => Number(b) - Number(a));

    if (sourceFilter) buildOptions(sourceFilter, sources, "All sources");
    if (yearFilter) buildOptions(yearFilter, years, "All years");
  }

  // --- Event wiring ---
  function onGridClick(e) {
    const a = e.target.closest("a[data-index]");
    if (!a) return;
    e.preventDefault();
    const idx = Number(a.dataset.index);
    if (!Number.isFinite(idx)) return;
    openViewer(idx);
  }

  function onKeyDown(e) {
    if (!viewer || viewer.classList.contains("hidden")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeViewer();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevImage();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextImage();
      return;
    }
  }

  // --- Boot ---
  if (!grid) return;

  initFilters();
  renderGrid(filtered);

  grid.addEventListener("click", onGridClick);

  q?.addEventListener("input", applyFilters);
  typeFilter?.addEventListener("change", applyFilters);
  sourceFilter?.addEventListener("change", applyFilters);
  yearFilter?.addEventListener("change", applyFilters);

  btnReset?.addEventListener("click", () => {
    if (q) q.value = "";
    if (typeFilter) typeFilter.value = "all";
    if (sourceFilter) sourceFilter.value = "all";
    if (yearFilter) yearFilter.value = "all";
    applyFilters();
  });

  // Viewer events
  viewerBackdrop?.addEventListener("click", closeViewer);
  btnClose?.addEventListener("click", closeViewer);
  btnPrev?.addEventListener("click", prevImage);
  btnNext?.addEventListener("click", nextImage);
  document.addEventListener("keydown", onKeyDown);

  // If filters change while viewer open, close it to avoid mismatch
  const closeOnFilterChange = () => {
    if (viewer && !viewer.classList.contains("hidden")) closeViewer();
  };
  q?.addEventListener("input", closeOnFilterChange);
  typeFilter?.addEventListener("change", closeOnFilterChange);
  sourceFilter?.addEventListener("change", closeOnFilterChange);
  yearFilter?.addEventListener("change", closeOnFilterChange);
})();
