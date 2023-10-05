import { DateTime, Duration } from "luxon";

import { Round, RoundDocument, RoundModel } from "../models/RoundModel";
import { Result } from "../util/result";

async function repeatRound(
  channel: string,
): Promise<Result<RoundDocument, string>> {
  let prevRound: RoundDocument | null;
  try {
    prevRound = await RoundModel.findOne({ channel }, null, {
      sort: { matchingScheduledFor: -1 },
    });
  } catch (e) {
    console.error(e);
    return Result.err(
      "unknown error occurred while querying most recent round for channel (check logs)",
    );
  }

  if (prevRound === null) {
    return Result.err(
      "cannot repeat round because no previous round exists in this channel",
    );
  }

  const shiftDuration = { seconds: prevRound.durationSec };
  const shiftDate = (date: Date) =>
    DateTime.fromJSDate(date).plus(shiftDuration).toJSDate();

  const matchingScheduledFor = shiftDate(prevRound.matchingScheduledFor);
  if (matchingScheduledFor.getTime() < Date.now()) {
    return Result.err(
      "cannot repeat round because the repeated round would have started already",
    );
  }

  const rawRound: Round = {
    channel,
    durationSec: prevRound.durationSec,
    matchingScheduledFor,
    matchingCompleted: false,
    allInitialMessagesSent: false,
    reminderMessageScheduledFor: shiftDate(
      prevRound.reminderMessageScheduledFor,
    ),
    allReminderMessagesSent: false,
    finalMessageScheduledFor: shiftDate(prevRound.finalMessageScheduledFor),
    allFinalMessagesSent: false,
    summaryMessageScheduledFor: shiftDate(prevRound.summaryMessageScheduledFor),
  };

  const round = await RoundModel.create(rawRound);
  return Result.ok(round);
}

async function createRound(
  channel: string,
  startDate: DateTime,
  duration: Duration,
  reminderMessageDelay: Duration,
  finalMessageDelay: Duration,
  summaryMessageDelay: Duration,
): Promise<Result<RoundDocument, string>> {
  const rawRound: Round = {
    channel,
    durationSec: duration.shiftTo("seconds").seconds,
    matchingScheduledFor: startDate.toJSDate(),
    matchingCompleted: false,
    allInitialMessagesSent: false,
    reminderMessageScheduledFor: startDate
      .plus(reminderMessageDelay)
      .toJSDate(),
    allReminderMessagesSent: false,
    finalMessageScheduledFor: startDate.plus(finalMessageDelay).toJSDate(),
    allFinalMessagesSent: false,
    summaryMessageScheduledFor: startDate.plus(summaryMessageDelay).toJSDate(),
  };

  const round = await RoundModel.create(rawRound);
  return Result.ok(round);
}

export { createRound, repeatRound };
