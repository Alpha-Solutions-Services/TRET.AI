import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

const appVersion = readFileSync(join(__dirname, "VERSION"), "utf8").trim();

const nextConfig: NextConfig = {
  env: {
    // Bake VERSION into the server/client bundle so serverless does not need the file at runtime.
    TRET_AI_VERSION: appVersion,
  },
  outputFileTracingIncludes: {
    "/*": ["./VERSION"],
  },
};

export default nextConfig;
