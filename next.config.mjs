import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPackageVersion() {
  try {
    const raw = readFileSync(join(__dirname, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "";
  } catch {
    return "";
  }
}

function readGitShortSha() {
  const fromEnv = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: __dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/** Committer date for HEAD, same style as git (e.g. 25-Mar-2026). */
function readGitCommitDateDisplay() {
  const fromEnv = process.env.NEXT_PUBLIC_GIT_COMMIT_DATE?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync(
      "git log -1 --format=%cd --date=format:%d-%b-%Y HEAD",
      {
        cwd: __dirname,
        encoding: "utf8",
      },
    ).trim();
  } catch {
    return "";
  }
}

const appVersion = readPackageVersion();
const gitShortSha = readGitShortSha();
const gitCommitDate = readGitCommitDateDisplay();

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_GIT_COMMIT_SHA: gitShortSha,
    NEXT_PUBLIC_GIT_COMMIT_DATE: gitCommitDate,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Ensure consistent port in development
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
