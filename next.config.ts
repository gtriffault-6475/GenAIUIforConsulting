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
  // "Ajouter un document" uploads files of up to 10 MB through a Server
  // Action (spec-upload-document-drive); the default body limit is 1 MB,
  // and multipart overhead needs a little room on top. Keep in step with
  // `MAX_UPLOAD_BYTES` (`domain/document.ts`).
  experimental: {
    serverActions: {
      bodySizeLimit: '11mb',
    },
  },
};

export default nextConfig;
