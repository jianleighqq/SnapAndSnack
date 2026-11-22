import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Snap & Snack",
    short_name: "Snap & Snack",
    description: "Photo booth queue and event management",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F1ED",
    theme_color: "#F3F1ED",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
