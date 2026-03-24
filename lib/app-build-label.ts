/**
 * Build-time labels from next.config.mjs (version, commit sha, optional commit date).
 */
export function getAppBuildLabel(): string {
  const version = process.env.NEXT_PUBLIC_APP_VERSION?.trim() ?? "";
  const sha = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA?.trim() ?? "";
  const commitDate = process.env.NEXT_PUBLIC_GIT_COMMIT_DATE?.trim() ?? "";
  const vPart = version
    ? version.startsWith("v")
      ? version
      : `v${version}`
    : "";

  const meta = [sha, commitDate].filter(Boolean).join(", ");

  if (vPart && meta) return `${vPart} (${meta})`;
  if (vPart) return vPart;
  if (meta) return meta;
  return "";
}
