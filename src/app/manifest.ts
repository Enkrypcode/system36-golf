import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EnkrypScore — Golf Scoring System",
    short_name: "EnkrypScore",
    display: "standalone",
    background_color: "#123B5D",
    theme_color: "#123B5D",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
