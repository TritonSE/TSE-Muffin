import { DateTime } from "luxon";

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

function parseDate(date: string): Result<DateTime, string> {
  const dt = DateTime.fromISO(date, { zone: "utc" });
  if (!dt.isValid) {
    // These fields should be defined if it's not valid.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return Result.Err(`${dt.invalidReason}: ${dt.invalidExplanation}`);
  }
  return Result.Ok(dt);
}

export {
  formatChannel,
  parseChannel,
  formatEmoji,
  parseEmoji,
  formatUser,
  parseDate,
};
