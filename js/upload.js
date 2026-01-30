(() => {
  /* ============================
     Theme toggle (self-contained)
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
     DOM
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

  /** @type {{file: File, url: string, w: number, h: number, dateISO: string}[]} */
  let selected = [];

  const SIGN_ENDPOINT = "/.netlify/functions/r2-sign";

  function setStatus(msg) {
    if (elStatus) elStatus.textContent = msg || "";
  }

  function escapeForJson(str) {
    return String(str ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
  }

  function isoDateFromFile(file) {
    const d = new Date(file.lastModified);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function yearFromISO(dateISO) {
    const y = Number(String(dateISO || "").slice(0, 4));
    return Number.isFinite(y) ? y : new Date().getFullYear();
  }

  function stripExt(name) {
    return String(name || "").replace(/\.[^.]+$/, "");
  }

  function cleanTitleFromFilename(name) {
    const base = stripExt(name);
    const cleaned = base.replace(/[_-]+/g, " ").trim();
    return cleaned || "Untitled";
  }

  async function readDimensions(url) {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = url;
    });
  }

  function clearAll() {
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

    selected = list.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      w: 0,
      h: 0,
      dateISO: isoDateFromFile(file),
    }));

    // Preview
    const frag = document.createDocumentFragment();
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

    // Dimensions
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

  async function signUpload({ type, source, filename, contentType }) {
    const res = await fetch(SIGN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, source, filename, contentType }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Sign failed (${res.status}): ${text || res.statusText}`);
    }
    return await res.json(); // { key, uploadUrl, publicUrl, ... }
  }

  async function putToR2(uploadUrl, file) {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
    }
  }

  async function generateAndUpload() {
    if (!selected.length) {
      setStatus("No files selected.");
      return;
    }

    // Lock UI while running
    btnGenerate.disabled = true;
    btnClear.disabled = true;

    try {
      const type = elType?.value === "screenshot" ? "screenshot" : "photo";
      const source = (elSource?.value || "").trim() || (type === "screenshot" ? "Game" : "Phone Camera");

      // Stable order
      const items = [...selected].sort((a, b) => {
        if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
        return a.file.name.localeCompare(b.file.name);
      });

      setStatus(`Uploading ${items.length} item${items.length === 1 ? "" : "s"} to R2…`);

      const entries = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const file = it.file;

        setStatus(`(${i + 1}/${items.length}) Signing: ${file.name}`);

        const signed = await signUpload({
          type,
          source,
          filename: file.name,
          contentType: file.type || "image/jpeg",
        });

        setStatus(`(${i + 1}/${items.length}) Uploading: ${file.name}`);
        await putToR2(signed.uploadUrl, file);

        const dateISO = it.dateISO;
        const year = yearFromISO(dateISO);
        const resolution = it.w && it.h ? `${it.w}×${it.h}` : "";

        // IMPORTANT:
        // publicUrl comes from your Netlify Function (built using R2_PUBLIC_BASE_URL + key)
        const publicUrl = signed.publicUrl;

        // If you later add thumbnail generation, thumb can be a different URL.
        const entry = {
          id: `${type === "screenshot" ? "ss" : "ph"}-${dateISO}-${i + 1}`,

          type,
          title: cleanTitleFromFilename(file.name),
          date: dateISO,
          year,
          source,

          ...(resolution ? { resolution } : {}),

          thumb: publicUrl,
          src: publicUrl,
        };

        entries.push(entry);
      }

      // Output as JS object literals (matching your data.js style)
      const output = entries
        .map((e) => {
          const lines = [];
          lines.push("  {");
          lines.push(`    id: "${escapeForJson(e.id)}",`);
          lines.push(`    type: "${escapeForJson(e.type)}",`);
          lines.push(`    title: "${escapeForJson(e.title)}",`);
          lines.push(`    date: "${escapeForJson(e.date)}",`);
          lines.push(`    year: ${e.year},`);
          lines.push(`    source: "${escapeForJson(e.source)}",`);
          if (e.resolution) lines.push(`    resolution: "${escapeForJson(e.resolution)}",`);
          lines.push(`    thumb: "${escapeForJson(e.thumb)}",`);
          lines.push(`    src: "${escapeForJson(e.src)}"`);
          lines.push("  }");
          return lines.join("\n");
        })
        .join(",\n");

      if (elOutput) elOutput.value = output;

      setStatus(`Done. Uploaded ${entries.length} item${entries.length === 1 ? "" : "s"} to R2 and generated catalog entries.`);
    } catch (err) {
      console.error(err);
      setStatus(err?.message || "Upload failed.");
    } finally {
      btnGenerate.disabled = false;
      btnClear.disabled = false;
    }
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
      elOutput?.select();
      document.execCommand("copy");
      setStatus("Copied (fallback).");
    }
  }

  // Wire events
  elFiles?.addEventListener("change", (e) => handleFilePick(e.target.files));
  btnGenerate?.addEventListener("click", generateAndUpload);
  btnClear?.addEventListener("click", clearAll);
  btnCopy?.addEventListener("click", copyOutput);
})();
