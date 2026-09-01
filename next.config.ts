import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the routing graph and subway data are read at request time, so they must be
  // traced into each serverless function that loads them
  outputFileTracingIncludes: {
    "/api/routes": ["./data/graph.json", "./data/subway.json"],
    "/api/route": ["./data/graph.json", "./data/subway.json"],
    "/api/alerts": ["./data/subway.json"],
    "/evidence": ["./research/eval-*.json", "./research/outages-summary.json"],
  },
};

export default nextConfig;
