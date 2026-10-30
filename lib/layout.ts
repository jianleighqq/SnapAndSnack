import type { PrintLayout } from "./types";

export interface ComposeLayoutOptions {
  shots: string[];
  layout?: PrintLayout;
  eventName?: string;
  eventCode?: string;
  dateStr?: string;
}

/**
 * Generates an SVG 4x6 print canvas data URL.
 * Standard 4x6 format (width 1200, height 1800, 2:3 aspect ratio).
 *
 * For "STRIP":
 * Stacks photos vertically on a plain light paper background with the event name at the bottom,
 * and places two identical strips side by side with a central dashed cut line.
 */
export function composePrintLayout({
  shots,
  layout = "STRIP",
  eventName = "Snap & Snack Event",
  eventCode = "SNAP",
  dateStr,
}: ComposeLayoutOptions): string {
  const width = 1200;
  const height = 1800;

  const displayDate = dateStr
    ? new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const safeEventName = eventName.toUpperCase();

  // Helper to render an individual photo cell at (x, y, w, h)
  const renderPhotoCell = (shotUrl: string | undefined, index: number, x: number, y: number, w: number, h: number) => {
    if (shotUrl && shotUrl.startsWith("data:image")) {
      return `
        <g>
          <clipPath id="clip-${x}-${y}">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" />
          </clipPath>
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#1e1c1a" />
          <image href="${shotUrl}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${x}-${y})" />
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="#161513" stroke-width="2" stroke-opacity="0.2" />
        </g>
      `;
    }

    // Clean placeholder frame if no image data
    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#1e1c1a" stroke="#e8541e" stroke-width="1.5" />
        <circle cx="${x + w / 2}" cy="${y + h / 2 - 12}" r="${Math.min(w, h) * 0.18}" fill="#2a2724" stroke="#e8541e" stroke-width="2" />
        <text x="${x + w / 2}" y="${y + h / 2 + 32}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="18" fill="#f6f4f1" letter-spacing="2">SHOT ${index + 1}</text>
      </g>
    `;
  };

  if (layout === "STRIP") {
    const stripWidth = 600;
    const paddingX = 48;
    const photoWidth = stripWidth - paddingX * 2; // 504px wide
    const photoCount = Math.max(1, Math.min(4, shots.length));

    // Calculate vertical dimensions based on photo count (adapts dynamically)
    let photoHeight = 380;
    let gap = 24;
    let topMargin = 50;

    if (photoCount === 1) {
      photoHeight = 1100;
      topMargin = 120;
    } else if (photoCount === 2) {
      photoHeight = 650;
      gap = 40;
      topMargin = 80;
    } else if (photoCount === 3) {
      photoHeight = 440;
      gap = 24;
      topMargin = 55;
    } else if (photoCount === 4) {
      photoHeight = 340;
      gap = 18;
      topMargin = 45;
    }

    // Function to render one complete vertical strip
    const renderStrip = (offsetX: number) => {
      let photosMarkup = "";
      for (let i = 0; i < photoCount; i++) {
        const py = topMargin + i * (photoHeight + gap);
        photosMarkup += renderPhotoCell(shots[i], i, offsetX + paddingX, py, photoWidth, photoHeight);
      }

      const brandingY = height - 110;

      return `
        <g>
          ${photosMarkup}
          {/* Strip Branding Footer */}
          <text x="${offsetX + stripWidth / 2}" y="${brandingY}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="28" fill="#161513" letter-spacing="2">${safeEventName}</text>
          <text x="${offsetX + stripWidth / 2}" y="${brandingY + 36}" text-anchor="middle" font-family="monospace" font-size="14" font-weight="600" fill="#e8541e" letter-spacing="4">SNAP &amp; SNACK · ${displayDate.toUpperCase()}</text>
        </g>
      `;
    };

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <!-- Plain light paper background -->
        <rect width="${width}" height="${height}" fill="#f6f4f1" />

        <!-- Left Strip (Strip 1) -->
        ${renderStrip(0)}

        <!-- Central Cut Line -->
        <line x1="600" y1="30" x2="600" y2="${height - 30}" stroke="#161513" stroke-width="1.5" stroke-dasharray="16,12" stroke-opacity="0.3" />
        <text x="600" y="24" text-anchor="middle" font-family="monospace" font-size="11" fill="#73706b" letter-spacing="2">✂ CUT HERE</text>

        <!-- Right Strip (Strip 2 - Identical) -->
        ${renderStrip(600)}
      </svg>
    `;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
  }

  if (layout === "GRID") {
    // 2x2 Grid Layout on 4x6
    const cellW = 510;
    const cellH = 680;
    const startX = 60;
    const startY = 70;
    const gapX = 60;
    const gapY = 40;

    let cells = "";
    const positions = [
      { x: startX, y: startY },
      { x: startX + cellW + gapX, y: startY },
      { x: startX, y: startY + cellH + gapY },
      { x: startX + cellW + gapX, y: startY + cellH + gapY },
    ];

    for (let i = 0; i < 4; i++) {
      const pos = positions[i];
      cells += renderPhotoCell(shots[i] || shots[0], i, pos.x, pos.y, cellW, cellH);
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#f6f4f1" />
        ${cells}
        <text x="${width / 2}" y="${height - 70}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="32" fill="#161513" letter-spacing="2">${safeEventName}</text>
        <text x="${width / 2}" y="${height - 30}" text-anchor="middle" font-family="monospace" font-size="15" fill="#e8541e" letter-spacing="4">SNAP &amp; SNACK · 2×2 GRID · ${displayDate.toUpperCase()}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
  }

  // "SINGLE" Layout
  const singleW = 1040;
  const singleH = 1480;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#f6f4f1" />
      ${renderPhotoCell(shots[0], 0, 80, 80, singleW, singleH)}
      <text x="${width / 2}" y="${height - 90}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="36" fill="#161513" letter-spacing="2">${safeEventName}</text>
      <text x="${width / 2}" y="${height - 45}" text-anchor="middle" font-family="monospace" font-size="16" fill="#e8541e" letter-spacing="4">SNAP &amp; SNACK · PORTRAIT · ${displayDate.toUpperCase()}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

