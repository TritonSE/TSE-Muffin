import { type HydratedDocument, model, Schema } from "mongoose";

interface Config {
  /**
   * How long does each round last? More specifically, this is the default
   * amount of time between consecutive rounds.
   *
   * Changing this option does not affect previously created rounds.
   */
  roundDurationDays: number;

  /**
   * After a round starts, send a reminder message to every group after
   * `roundDurationDays * reminderMessageDelayFactor`.
   *
   * For example, if `roundDurationDays = 14` and
   * `reminderMessageDelayFactor = 0.5`, then a reminder message will be sent
   * 7 days after the round starts.
   *
   * Changing this option does not affect previously created rounds.
   */
  reminderMessageDelayFactor: number;

  /**
   * After a round starts, send a final message to every group after
   * `roundDurationDays * finalMessageDelayFactor`.
   *
   * Changing this option does not affect previously created rounds.
   */
  finalMessageDelayFactor: number;

  /**
   * After a round starts, send a final message to the channel containing all
   * the matched users after `roundDurationDays * summaryMessageDelayFactor`.
   *
   * Changing this option does not affect previously created rounds.
   */
  summaryMessageDelayFactor: number;

  /**
   * Wait this long between running periodic jobs, e.g. checking for scheduled
   * rounds and scheduled messages.
   */
  periodicJobIntervalSec: number;
}

const ConfigSchema = new Schema<Config>({
  roundDurationDays: {
    type: Number,
    required: true,
  },
  reminderMessageDelayFactor: {
    type: Number,
    required: true,
  },
  finalMessageDelayFactor: {
    type: Number,
    required: true,
  },
  summaryMessageDelayFactor: {
    type: Number,
    required: true,
  },
  periodicJobIntervalSec: {
    type: Number,
    required: true,
  },
});

const ConfigModel = model("Config", ConfigSchema);
type ConfigDocument = HydratedDocument<Config>;

export { type Config, ConfigModel, type ConfigDocument };
