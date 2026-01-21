(() => {
  /* ============================
     Theme toggle (self-contained)
     (upload.html doesn't include main.js)
     ============================ */
  const root = document.documentElement;
  const THEME_KEY = "va_theme";

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function applyTheme(theme) {
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, theme);

    const btn = document.getElementById("btnTheme");
    if (btn) btn.textContent = theme === "dark" ? "Light" : "Dark";
  }

  function toggleTheme() {
    const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  applyTheme(getPreferredTheme());
  document.getElementById("btnTheme")?.addEventListener("click", toggleTheme);

  /* ============================
     Upload importer + JSON generator
     ============================ */
  const elType = document.getElementById("type");
  const elSource = document.getElementById("source");
  const elFiles = document.getElementById("files");
  const elPreview = document.getElementById("preview");
  const elOutput = document.getElementById("output");
  const elStatus = document.getElementById("status");

  const btnGenerate = document.getElementById("btnGenerate");
  const btnClear = document.getElementById("btnClear");
  const btnCopy = document.getElementById("btnCopy");

  /** @type {{file: File, url: string, w: number, h: number, date: string}[]} */
  let selected = [];

  function setStatus(msg) {
    if (!elStatus) return;
    elStatus.textContent = msg || "";
  }

  function slugify(input) {
    const s = String(input || "").trim().toLowerCase();
    if (!s) return "";
    return s
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function isoDateFromFile(file) {
    // Use file's lastModified as best effort (works well for phone photos/screenshots)
    const d = new Date(file.lastModified);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function extFromName(name) {
    const m = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
    return m ? m[0] : ".jpg";
  }

  function escapeForJson(str) {
    return String(str ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
  }

  function folderForType(type) {
    return type === "screenshot" ? "images/screenshots" : "images/photos";
  }

  function makeId(type, dateISO, source, seq) {
    const prefix = type === "screenshot" ? "ss" : "ph";
    const date = dateISO || "unknown-date";
    const s = slugify(source);
    const n = String(seq).padStart(3, "0");
    return s ? `${prefix}-${date}-${s}-${n}` : `${prefix}-${date}-${n}`;
  }

  async function readDimensions(url) {
    // Use Image for broad browser support
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = url;
    });
  }

  function clearAll() {
    // Revoke object URLs
    for (const item of selected) {
      try { URL.revokeObjectURL(item.url); } catch {}
    }
    selected = [];
    if (elPreview) elPreview.innerHTML = "";
    if (elOutput) elOutput.value = "";
    if (elFiles) elFiles.value = "";
    setStatus("Cleared.");
  }

  async function handleFilePick(files) {
    clearAll();
    setStatus("");

    const list = Array.from(files || []);
    if (!list.length) return;

    // Preview containers
    const frag = document.createDocumentFragment();

    // Build selected[] with urls
    selected = list.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      w: 0,
      h: 0,
      date: isoDateFromFile(file),
    }));

    // Render preview immediately
    selected.forEach((item) => {
      const box = document.createElement("div");
      box.className = "thumb";
      const img = document.createElement("img");
      img.alt = item.file.name;
      img.src = item.url;
      box.appendChild(img);
      frag.appendChild(box);
    });

    if (elPreview) elPreview.appendChild(frag);

    // Read dimensions
    try {
      await Promise.all(
        selected.map(async (item) => {
          const dim = await readDimensions(item.url);
          item.w = dim.w;
          item.h = dim.h;
        })
      );
      setStatus(`Loaded ${selected.length} image${selected.length === 1 ? "" : "s"}.`);
    } catch {
      setStatus("Some images failed to load dimensions (still usable).");
    }
  }

  function generateJson() {
    if (!selected.length) {
      setStatus("No files selected.");
      return;
    }

    const type = elType?.value === "screenshot" ? "screenshot" : "photo";
    const source = (elSource?.value || "").trim() || (type === "screenshot" ? "Game" : "Phone Camera");

    // Sort by date then name for stable output
    const items = [...selected].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.file.name.localeCompare(b.file.name);
    });

    // Build entries
    const folder = folderForType(type);

    const objects = items.map((item, i) => {
      const date = item.date;
      const year = Number(date.slice(0, 4)) || new Date().getFullYear();

      // Use ORIGINAL filename by default (you manually place the file into folder)
      // You will copy file into: /images/photos or /images/screenshots
      const ext = extFromName(item.file.name);
      const id = makeId(type, date, source, i + 1);

      const filename = item.file.name; // keep original
      const srcPath = `${folder}/${filename}`;
      // Thumb optional: set to src for now so site works immediately
      const thumbPath = srcPath;

      const resolution = item.w && item.h ? `${item.w}×${item.h}` : "";

      const titleFallback = (() => {
        // base title from filename (without extension), lightly cleaned
        const base = item.file.name.replace(/\.[^.]+$/, "");
        return base.replace(/[_-]+/g, " ").trim() || "Untitled";
      })();

      const lines = [
        "  {",
        `    id: "${escapeForJson(id)}",`,
        `    type: "${type}",`,
        `    title: "${escapeForJson(titleFallback)}",`,
        `    date: "${escapeForJson(date)}",`,
        `    year: ${year},`,
        `    source: "${escapeForJson(source)}",`,
      ];

      // Keep location/tags out by default (you can add later)
      if (resolution) lines.push(`    resolution: "${escapeForJson(resolution)}",`);

      lines.push(`    thumb: "${escapeForJson(thumbPath)}",`);
      lines.push(`    src: "${escapeForJson(srcPath)}"`);
      lines.push("  }");

      return lines.join("\n");
    });

    const output = objects.join(",\n");
    if (elOutput) elOutput.value = output;

    setStatus(`Generated ${objects.length} catalog entr${objects.length === 1 ? "y" : "ies"}.`);
  }

  async function copyOutput() {
    const text = elOutput?.value || "";
    if (!text.trim()) {
      setStatus("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.");
    } catch {
      // Fallback
      elOutput?.select();
      document.execCommand("copy");
      setStatus("Copied (fallback).");
    }
  }

  // Wire events
  elFiles?.addEventListener("change", (e) => handleFilePick(e.target.files));
  btnGenerate?.addEventListener("click", generateJson);
  btnClear?.addEventListener("click", clearAll);
  btnCopy?.addEventListener("click", copyOutput);
})();
