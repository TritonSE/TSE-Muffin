import { App } from "@slack/bolt";
import { Duration } from "luxon";

import { ConfigDocument, ConfigModel } from "../models/ConfigModel";
import { Result } from "../util/result";

import { getBotUserId } from "./slack";

class ConfigCache {
  constructor(
    public readonly botUserId: string,
    public readonly config: ConfigDocument
  ) {}

  static async load(app: App): Promise<Result<ConfigCache, string>> {
    const botUserIdResult = await getBotUserId(app);
    if (!botUserIdResult.ok) {
      return Result.Err(
        `could not determine bot user ID: ${botUserIdResult.error}`
      );
    }
    const botUserId = botUserIdResult.value;

    let config;
    try {
      config = await ConfigModel.findOne();
      if (config === null) {
        console.log("config does not exist: creating default config");
        config = await ConfigModel.create({
          roundDurationDays: 14,
          reminderMessageDelayFactor: 0.5,
          finalMessageDelayFactor: 1.0,
          summaryMessageDelayFactor: 16 / 14,
          periodicJobIntervalSec: Duration.fromObject({ hours: 1 }).as(
            "seconds"
          ),
        });
      }
    } catch (e) {
      console.error(e);
      return Result.Err(
        "unknown error occurred while loading config from MongoDB"
      );
    }

    return Result.Ok(new ConfigCache(botUserId, config));
  }
}

/**
 * Manage cache loading and reloading.
 */
class ConfigCacheProvider {
  private loadingPromise: Promise<ConfigCache> | null = null;

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

  async reload(app: App): Promise<ConfigCache> {
    this.loadingPromise = null;
    return this.get(app);
  }
}

const cacheProvider = new ConfigCacheProvider();

export { cacheProvider };
