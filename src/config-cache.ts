import { App } from "@slack/bolt";

import { Result } from "./result";
import { getBotUserId } from "./wrappers";

/**
 * Cache for config options and other global values that shouldn't change.
 */
class ConfigCache {
  botUserId = "BOT_USER_ID_NOT_INITIALIZED";

  async load(app: App): Promise<Result<undefined, string>> {
    const botUserIdResult = await getBotUserId(app);
    if (!botUserIdResult.ok) {
      return Result.Err(
        `could not determine bot user ID: ${botUserIdResult.error}`
      );
    }
    this.botUserId = botUserIdResult.value;

    return Result.Ok(undefined);
  }
}

/**
 * Manage cache loading and reloading.
 */
class ConfigCacheProvider {
  private cache = new ConfigCache();
  private loadingPromise: Promise<ConfigCache> | null = null;

  private async load(app: App): Promise<ConfigCache> {
    const result = await this.cache.load(app);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return this.cache;
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
