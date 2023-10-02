import { App } from "@slack/bolt";
import { DateTime } from "luxon";

import { type Config } from "../models/ConfigModel.js";
import {
  type Round,
  type RoundDocument,
  RoundModel,
} from "../models/RoundModel.js";
import { Result } from "../util/result.js";

import { cacheProvider } from "./config-cache.js";

async function createRound(
  app: App,
  channel: string,
  startDate: DateTime,
): Promise<Result<RoundDocument, string>> {
  const config = (await cacheProvider.get(app)).config;

  // Calculate the scheduled date for a particular event.
  // This lambda is really ugly, but duplicating this three times was uglier.
  const calculateScheduled = <K extends keyof Config & `${string}Factor`>(
    factor: K,
  ) =>
    startDate
      .plus({ days: config.roundDurationDays * config[factor] })
      .toJSDate();

  const reminderMessageScheduledFor = calculateScheduled(
    "reminderMessageDelayFactor",
  );
  const finalMessageScheduledFor = calculateScheduled(
    "finalMessageDelayFactor",
  );
  const summaryMessageScheduledFor = calculateScheduled(
    "summaryMessageDelayFactor",
  );

  const rawRound: Round = {
    channel,
    matchingScheduledFor: startDate.toJSDate(),
    matchingCompleted: false,
    allInitialMessagesSent: false,
    reminderMessageScheduledFor,
    allReminderMessagesSent: false,
    finalMessageScheduledFor,
    allFinalMessagesSent: false,
    summaryMessageScheduledFor,
  };

  const round = await RoundModel.create(rawRound);
  return Result.Ok(round);
}

export { createRound };
