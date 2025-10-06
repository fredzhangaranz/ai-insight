import * as fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTemplates,
  resetTemplateCatalogCache,
} from "./query-template.service";

describe("query template catalog feature flag gating", () => {
  beforeEach(() => {
    resetTemplateCatalogCache();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetTemplateCatalogCache();
    vi.restoreAllMocks();
    delete process.env.AI_TEMPLATES_ENABLED;
  });

  it("loads JSON catalog when feature flag is disabled", async () => {
    process.env.AI_TEMPLATES_ENABLED = "false";
    const readFileSpy = vi.spyOn(fs.promises, "readFile");

    const catalog = await getTemplates({ forceReload: true });

    expect(readFileSpy).toHaveBeenCalledOnce();
    expect(Array.isArray(catalog.templates)).toBe(true);
    expect(catalog.templates.length).toBeGreaterThan(0);
  });

  it("reloads catalog when toggling feature flag without restart", async () => {
    process.env.AI_TEMPLATES_ENABLED = "false";
    const readFileSpy = vi.spyOn(fs.promises, "readFile");

    await getTemplates({ forceReload: true });
    expect(readFileSpy).toHaveBeenCalledTimes(1);

    process.env.AI_TEMPLATES_ENABLED = "true";
    await getTemplates();
    expect(readFileSpy).toHaveBeenCalledTimes(2);

    await getTemplates();
    expect(readFileSpy).toHaveBeenCalledTimes(2);
  });
});
