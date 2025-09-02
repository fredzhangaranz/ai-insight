import { aiConfigService } from "./ai-config.service";

/**
 * Production-only background health monitor for AI providers.
 * - Periodically validates all enabled providers and updates their status in DB.
 * - Safe to call start() multiple times; runs only one interval per process.
 * - No-op in development environments.
 */
class HealthMonitorService {
  private static instance: HealthMonitorService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  private constructor() {}

  static getInstance(): HealthMonitorService {
    if (!HealthMonitorService.instance) {
      HealthMonitorService.instance = new HealthMonitorService();
    }
    return HealthMonitorService.instance;
  }

  /**
   * Start periodic health checks. No-op if already running or not production.
   * @param intervalMs Default 180000 ms (3 minutes)
   */
  start(intervalMs = 180_000): void {
    if (process.env.NODE_ENV !== "production") return; // dev: off
    if (this.isRunning) return; // already running

    this.isRunning = true;

    const tick = async () => {
      try {
        const configs = await aiConfigService.getEnabledConfigurations();
        for (const cfg of configs) {
          try {
            await aiConfigService.validateConfigurationByName(
              cfg.providerType,
              cfg.providerName
            );
          } catch (err) {
            // Validation errors are handled in the service; continue
            console.warn(
              `Provider validation error for ${cfg.providerType}:${cfg.providerName}:`,
              err
            );
          }
        }
      } catch (err) {
        console.error("Health monitor tick failed:", err);
      }
    };

    // Run first tick immediately, then schedule
    tick();
    this.intervalId = setInterval(tick, intervalMs);
  }

  /** Stop the monitor if running */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
  }
}

export const healthMonitorService = HealthMonitorService.getInstance();

