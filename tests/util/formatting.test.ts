import { describe, expect, test } from "@jest/globals";
import { Duration } from "luxon";

import { parseDuration } from "../../src/util/formatting";
import { Result } from "../../src/util/result";

describe("parseDuration", () => {
  test("empty", () => {
    expect(parseDuration("")).toStrictEqual(
      Result.err("duration string cannot be empty"),
    );
  });

  test("days only", () => {
    const result = parseDuration("53d");
    expect(result.ok ? result.value.toISO() : null).toStrictEqual(
      Duration.fromObject({ days: 53 }).toISO(),
    );
  });

  test("hours and minutes only", () => {
    const result = parseDuration("3h4m");
    expect(result.ok ? result.value.toISO() : null).toStrictEqual(
      Duration.fromObject({ hours: 3, minutes: 4 }).toISO(),
    );
  });

  test("all fields", () => {
    const result = parseDuration("1w15d12h9m6s");
    expect(result.ok ? result.value.toISO() : null).toStrictEqual(
      Duration.fromObject({
        weeks: 1,
        days: 15,
        hours: 12,
        minutes: 9,
        seconds: 6,
      }).toISO(),
    );
  });

  test("wrong formats", () => {
    for (const wrong of ["d", "3d1", "3q", "3d2d", "1h3d"]) {
      expect(parseDuration(wrong)).toStrictEqual(
        Result.err("duration string does not match expected format"),
      );
    }
  });
});
