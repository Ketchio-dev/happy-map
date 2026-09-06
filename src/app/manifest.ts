import type { MetadataRoute } from "next";

// Installable from the browser's share sheet or menu; there is no offline mode because
// every route is computed on the server against the live outage feed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "happy map — exposure-aware routing",
    short_name: "happy map",
    description: "Walking and subway routes costed by exposure: time outdoors, direct sun, stairs, missing sidewalks, and elevators that are out right now.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#f6f4ef",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
