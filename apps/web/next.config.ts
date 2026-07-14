import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: trace files from the workspace root so workspace packages are included
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
