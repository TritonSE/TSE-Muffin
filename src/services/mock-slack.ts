import { App } from "@slack/bolt";

import { Result } from "../util/result";

import { sendDirectMessage, sendMessage } from "./slack";

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

const mockSendMessage: typeof sendMessage = async (
  _app: App,
  channel: string,
  text: string
) => {
  console.log(`mock message to ${channel}: ${text}`);
  return Result.Ok(fakeTimestampGenerator.get());
};

const mockSendDirectMessage: typeof sendDirectMessage = async (
  _app: App,
  userIds: string[],
  text: string
) => {
  console.log(`mock direct message to ${userIds.join(",")}: ${text}`);
  return Result.Ok(fakeTimestampGenerator.get());
};

export { mockSendMessage, mockSendDirectMessage };
