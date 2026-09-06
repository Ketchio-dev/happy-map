import type { Metadata, Viewport } from "next";
import "./globals.css";

// Every page reads live state (search params, the outage log), so render per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "happy map — exposure-aware routing in Toronto",
  description: "Walking and subway routes across Toronto costed by exposure: time outdoors, direct sun, stairs, blocks with no sidewalk, and TTC elevators that are out right now.",
  applicationName: "happy map",
  appleWebApp: { capable: true, title: "happy map", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f6f4ef" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
