import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exposure-aware routing · downtown Toronto",
  description: "Walking and transit routes that avoid cold, sun, stairs, and out-of-service TTC elevators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
