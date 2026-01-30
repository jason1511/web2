(() => {
  // Theme toggle (self-contained)
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

  // DOM
  const elType = document.getElementById("type");
  const elSource = document.getElementById("source");
  const elFiles = document.getElementById("files");
  const elPreview = document.getElementById("preview");
  const elOutput = document.getElementById("output");
  const elStatus = document.getElementById("status");

  const btnGenerate = document.getElementById("btnGenerate");
  const btnClear = document.getElementById("btnClear");
  const btnCopy = document.getElementById("btnCopy");

  let selected = [];

const ORIGIN = window.location.origin;
const SIGN_ENDPOINT = `${ORIGIN}/.netlify/functions/r2-sign`;
const CATALOG_ADD_ENDPOINT = `${ORIGIN}/.netlify/functions/catalog-add`;


  function setStatus(msg) { if (elStatus) elStatus.textContent = msg || ""; }

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

  function stripExt(name) { return String(name || "").replace(/\.[^.]+$/, ""); }

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
    return await res.json(); // { key, uploadUrl, publicUrl }
  }

  async function putToR2(uploadUrl, file) {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
    }
  }

  async function addToCatalog(entry) {
    const res = await fetch(CATALOG_ADD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`catalog-add failed (${res.status}): ${text || res.statusText}`);
    }
    return await res.json(); // expected: { ok:true, item:..., count:... }
  }

  function toLiteral(entry) {
    const lines = [];
    lines.push("  {");
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === "number") lines.push(`    ${k}: ${v},`);
      else if (Array.isArray(v)) lines.push(`    ${k}: ${JSON.stringify(v)},`);
      else lines.push(`    ${k}: ${JSON.stringify(v)},`);
    }
    // remove trailing comma on last line
    lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, "");
    lines.push("  }");
    return lines.join("\n");
  }

  async function generateAndUpload() {
    if (!selected.length) { setStatus("No files selected."); return; }

    btnGenerate.disabled = true;
    btnClear.disabled = true;

    try {
      const type = elType?.value === "screenshot" ? "screenshot" : "photo";
      const source = (elSource?.value || "").trim() || (type === "screenshot" ? "Game" : "Phone Camera");

      const items = [...selected].sort((a, b) => {
        if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
        return a.file.name.localeCompare(b.file.name);
      });

      setStatus(`Uploading ${items.length} to R2…`);

      const added = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const file = it.file;

        setStatus(`(${i + 1}/${items.length}) Signing… ${file.name}`);
        const signed = await signUpload({
          type,
          source,
          filename: file.name,
          contentType: file.type || "image/jpeg",
        });

        setStatus(`(${i + 1}/${items.length}) Uploading… ${file.name}`);
        await putToR2(signed.uploadUrl, file);

        const dateISO = it.dateISO;
        const entry = {
          id: `${type === "screenshot" ? "ss" : "ph"}-${dateISO}-${Date.now()}-${i + 1}`,
          type,
          title: cleanTitleFromFilename(file.name),
          date: dateISO,
          year: yearFromISO(dateISO),
          source,
          resolution: it.w && it.h ? `${it.w}×${it.h}` : undefined,
          // Use the public R2 URL
          src: signed.publicUrl,
          thumb: signed.publicUrl
        };

        // Remove undefined fields
        Object.keys(entry).forEach((k) => entry[k] === undefined && delete entry[k]);

        setStatus(`(${i + 1}/${items.length}) Writing catalog…`);
        await addToCatalog(entry);

        added.push(entry);
      }

      // Output what was added (for your records)
      if (elOutput) {
        elOutput.value = added.map(toLiteral).join(",\n");
      }

      setStatus(`Done. Uploaded + published ${added.length} item${added.length === 1 ? "" : "s"}. Refresh gallery.`);
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
    if (!text.trim()) { setStatus("Nothing to copy."); return; }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied.");
    } catch {
      elOutput?.select();
      document.execCommand("copy");
      setStatus("Copied (fallback).");
    }
  }

  elFiles?.addEventListener("change", (e) => handleFilePick(e.target.files));
  btnGenerate?.addEventListener("click", generateAndUpload);
  btnClear?.addEventListener("click", clearAll);
  btnCopy?.addEventListener("click", copyOutput);
})();
