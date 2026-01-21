/* ============================================
   Visual Archive Catalog
   - Only photos + game screenshots
   - Keep metadata factual, minimal
   ============================================ */

/**
 * Schema (recommended fields)
 * id            string   unique
 * type          "photo" | "screenshot"
 * title         string   short neutral title
 * date          string   ISO "YYYY-MM-DD" (or "YYYY-MM" if unknown)
 * year          number   derived (helps filtering)
 * source        string   game name or device/camera (keep simple)
 * location      string   optional (real place or in-game map/route)
 * resolution    string   e.g. "2560×1440"
 * tags          string[] optional (keep small + controlled)
 *
 * thumb         string   path to thumbnail (optional but recommended)
 * src           string   path to full image
 */

window.VA_CATALOG = [
  {
    id: "ss-2025-10-14-tsw3-001",
    type: "screenshot",
    title: "Morning Service",
    date: "2025-10-14",
    year: 2025,
    source: "Train Sim World 3",
    location: "London Commuter",
    resolution: "2560×1440",
    tags: ["train", "commuter"],
    thumb: "images/thumbs/ss-2025-10-14-tsw3-001.jpg",
    src: "images/screenshots/ss-2025-10-14-tsw3-001.jpg"
  },
  {
    id: "ss-2025-11-03-arma3-001",
    type: "screenshot",
    title: "Fog Over Altis",
    date: "2025-11-03",
    year: 2025,
    source: "Arma 3",
    location: "Altis",
    resolution: "2560×1440",
    tags: ["fog", "landscape"],
    thumb: "images/thumbs/ss-2025-11-03-arma3-001.jpg",
    src: "images/screenshots/ss-2025-11-03-arma3-001.jpg"
  },
  {
    id: "ph-2025-09-03-001",
    type: "photo",
    title: "Station Platform",
    date: "2025-09-03",
    year: 2025,
    source: "Phone Camera",
    location: "Melbourne",
    resolution: "4032×3024",
    tags: ["urban"],
    thumb: "images/thumbs/ph-2025-09-03-001.jpg",
    src: "images/photos/ph-2025-09-03-001.jpg"
  }
];
