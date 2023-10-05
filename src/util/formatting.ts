import { DateTime, Duration } from "luxon";

import { Result } from "./result";

function formatChannel(channel: string): string {
  return `<#${channel}>`;
}

function parseChannel(channel: string): string {
  const match = /<#([0-9A-Z]+)([|][^>]*)?>/.exec(channel);
  return match !== null ? match[1] : channel;
}

function formatEmoji(emoji: string): string {
  return `:${emoji}:`;
}

function parseEmoji(emoji: string): string {
  const match = /:((?:[:][:]|[^:\s])+):/.exec(emoji);
  return match !== null ? match[1] : emoji;
}

function formatUser(user: string): string {
  return `<@${user}>`;
}

function parseUser(user: string): string {
  const match = /<@([0-9A-Z]+)([|][^>]*)?>/.exec(user);
  return match !== null ? match[1] : user;
}

function parseDate(date: string): Result<DateTime, string> {
  const dt = DateTime.fromISO(date, { zone: "utc" });
  if (!dt.isValid) {
    return Result.err(`${dt.invalidReason}: ${dt.invalidExplanation}`);
  }
  return Result.ok(dt);
}

function parseInteger(value: string): Result<number, string> {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return Result.err("value cannot be parsed as integer");
  }
  return Result.ok(parsed);
}

function parseDuration(duration: string): Result<Duration, string> {
  if (duration.length === 0) {
    return Result.err("duration string cannot be empty");
  }

  const match =
    /^((?<weeks>\d+)w)?((?<days>\d+)d)?((?<hours>\d+)h)?((?<minutes>\d+)m)?((?<seconds>\d+)s)?$/.exec(
      duration,
    );
  if (match === null) {
    return Result.err("duration string does not match expected format");
  }

  // Need to disable this because properties on groups are actually undefined
  // when the group does not match.
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  const results = {
    weeks: parseInteger(match.groups!.weeks ?? "0"),
    days: parseInteger(match.groups!.days ?? "0"),
    hours: parseInteger(match.groups!.hours ?? "0"),
    minutes: parseInteger(match.groups!.minutes ?? "0"),
    seconds: parseInteger(match.groups!.seconds ?? "0"),
  };
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  if (
    !(
      results.weeks.ok &&
      results.days.ok &&
      results.hours.ok &&
      results.minutes.ok &&
      results.seconds.ok
    )
  ) {
    return Result.err("failed to parse one or more integer values");
  }

  const durationObject = {
    weeks: results.weeks.value,
    days: results.days.value,
    hours: results.hours.value,
    minutes: results.minutes.value,
    seconds: results.seconds.value,
  };

  return Result.ok(Duration.fromObject(durationObject));
}

export {
  formatChannel,
  parseChannel,
  formatEmoji,
  parseEmoji,
  formatUser,
  parseUser,
  parseDate,
  parseDuration,
};
