import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly: a stray package-lock.json can exist
  // in a parent directory outside this repo (e.g. another project on the
  // same machine) and Turbopack would otherwise guess the wrong root from
  // it, which produces a startup warning.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
