import { describe, expect, test } from "@jest/globals";
import { Duration } from "luxon";

import { formatDuration, parseDuration } from "../../src/util/formatting";
import { Result } from "../../src/util/result";

describe("parseDuration", () => {
  test("empty", () => {
    expect(parseDuration("")).toStrictEqual(
      Result.err("duration string cannot be empty"),
    );
  });

  test.each([
    ["5d", { days: 5 }],
    ["3h4m", { hours: 3, minutes: 4 }],
    ["1w5d12h9m6s", { weeks: 1, days: 5, hours: 12, minutes: 9, seconds: 6 }],
  ])("round-trip %s to %j", (str: string, obj: Record<string, number>) => {
    const parseResult = parseDuration(str);
    if (!parseResult.ok) {
      throw new Error("failed to parse");
    }
    expect(parseResult.value.toISO()).toStrictEqual(
      Duration.fromObject(obj).toISO(),
    );
    expect(formatDuration(parseResult.value)).toStrictEqual(str);
  });

  test("wrong formats", () => {
    for (const wrong of ["d", "3d1", "3q", "3d2d", "1h3d"]) {
      expect(parseDuration(wrong)).toStrictEqual(
        Result.err("duration string does not match expected format"),
      );
    }
  });
});
