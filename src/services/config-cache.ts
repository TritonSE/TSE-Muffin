import { App } from "@slack/bolt";

import { type ConfigDocument, ConfigModel } from "../models/ConfigModel.js";
import { Result } from "../util/result.js";

import { getBotUserId } from "./slack.js";

class ConfigCache {
  constructor(
    public readonly botUserId: string,
    public readonly config: ConfigDocument,
  ) {}

  static async load(app: App): Promise<Result<ConfigCache, string>> {
    const botUserIdResult = await getBotUserId(app);
    if (!botUserIdResult.ok) {
      return Result.Err(
        `could not determine bot user ID: ${botUserIdResult.error}`,
      );
    }
    const botUserId = botUserIdResult.value;

    let config = await ConfigModel.findOne();
    if (config === null) {
      console.log("config does not exist: creating default config");
      config = await ConfigModel.create({
        // Rounds last two weeks.
        roundDurationDays: 14,
        // The first reminder is sent after one week.
        reminderMessageDelayFactor: 0.5,
        // The final reminder is sent after two weeks.
        finalMessageDelayFactor: 1.0,
        // The summary message is sent after 16 days.
        summaryMessageDelayFactor: 16 / 14,
        // Run periodic jobs hourly.
        periodicJobIntervalSec: 3600,
      });
    }

    console.log(`bot user ID: ${botUserId}`);
    console.log(`loaded config: ${JSON.stringify(config.toJSON())}`);

    return Result.Ok(new ConfigCache(botUserId, config));
  }
}

interface ConfigCacheObserver {
  onConfigCacheReload(): void;
}

/**
 * Manage cache loading and reloading.
 */
class ConfigCacheProvider {
  private loadingPromise: Promise<ConfigCache> | null = null;
  private observers: ConfigCacheObserver[] = [];

  private async load(app: App): Promise<ConfigCache> {
    const result = await ConfigCache.load(app);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.value;
  }

  get(app: App): Promise<ConfigCache> {
    if (this.loadingPromise === null) {
      this.loadingPromise = this.load(app);
    }
    return this.loadingPromise;
  }

  addObserver(listener: ConfigCacheObserver) {
    this.observers.push(listener);
  }

  async reload(app: App): Promise<ConfigCache> {
    this.loadingPromise = null;
    for (const listener of this.observers) {
      listener.onConfigCacheReload();
    }
    return this.get(app);
  }
}

const cacheProvider = new ConfigCacheProvider();

export { cacheProvider };
