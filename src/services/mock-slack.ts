import { App } from "@slack/bolt";

import { Result } from "../util/result.js";

import { addReactions, sendDirectMessage, sendMessage } from "./slack.js";

class FakeTimestampGenerator {
  private lastEpochMs = 0;
  private counter = 0;

  get(): string {
    const epochMs = Date.now();

    let counter;
    if (this.lastEpochMs === epochMs) {
      counter = this.counter;
      this.counter++;
    } else {
      this.lastEpochMs = epochMs;
      counter = 0;
      this.counter = 0;
    }

    const sec = Math.floor(epochMs / 1000);
    const ms = epochMs % 1000;

    return [
      "fake",
      sec,
      ".",
      ms.toString().padStart(3, "0"),
      counter.toString().padStart(3, "0"),
    ].join("");
  }
}

const fakeTimestampGenerator = new FakeTimestampGenerator();

class FakeChannelGenerator {
  get(userIds: string[]): string {
    // Make a deterministic channel ID for the same user IDs in any order.
    const chars = [];
    const minLength = Math.min(...userIds.map((id) => id.length));
    for (let i = 0; i < minLength; i++) {
      const charsAtPos = userIds.map((id) => id[id.length - 1 - i]);
      charsAtPos.sort();
      chars.push(...charsAtPos);
    }
    const channelIdSuffix = chars.slice(0, 10).join("").padEnd(10, "0");

    return `fakeC${channelIdSuffix}`;
  }
}

const fakeChannelGenerator = new FakeChannelGenerator();

const mockAddReactions: typeof addReactions = async (
  _app: App,
  channel: string,
  timestamp: string,
  reactions: string[],
) => {
  console.log(
    `mock reactions to ${channel} ${timestamp}: ${reactions.join(", ")}`,
  );
  return Result.Ok(undefined);
};

const mockSendMessage: typeof sendMessage = async (
  _app: App,
  channel: string,
  text: string,
) => {
  console.log(`mock message to ${channel}: ${text}`);
  return Result.Ok(fakeTimestampGenerator.get());
};

const mockSendDirectMessage: typeof sendDirectMessage = async (
  _app: App,
  userIds: string[],
  text: string,
) => {
  console.log(`mock direct message to ${userIds.join(",")}: ${text}`);
  return Result.Ok([
    fakeChannelGenerator.get(userIds),
    fakeTimestampGenerator.get(),
  ]);
};

export { mockAddReactions, mockSendMessage, mockSendDirectMessage };
