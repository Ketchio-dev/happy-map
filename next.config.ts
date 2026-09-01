import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/route": ["./data/graph.json", "./data/subway.json"], "/api/alerts": ["./data/subway.json"], "/evidence": ["./research/*.json"] },
};

export default nextConfig;
