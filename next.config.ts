import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the dev overlay badge sits on top of the panel and lands in every screenshot
  devIndicators: false,
  // the routing graph and subway data are read at request time, so they must be
  // traced into each serverless function that loads them
  outputFileTracingIncludes: {
    "/api/routes": ["./data/graph.bin", "./data/subway.json"],
    "/api/route": ["./data/graph.bin", "./data/subway.json"],
    "/api/alerts": ["./data/subway.json"],
    "/evidence": ["./research/eval-core.json", "./research/eval-wide.json", "./research/outages-summary.json"],
  },
};

export default nextConfig;
