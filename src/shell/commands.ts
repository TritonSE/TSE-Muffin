import { App, SlackEventMiddlewareArgs } from "@slack/bolt";
import { DateTime, Duration } from "luxon";

import { onReactionAddedToMessage } from "../handlers/reaction";
import { createRound, repeatRound } from "../services/round";
import {
  addReactions,
  editMessage,
  getConversationMembers,
  sendDirectMessage,
  sendMessage,
} from "../services/slack";
import {
  formatChannel,
  parseChannel,
  parseDate,
  parseDuration,
  parseEmoji,
  parseUser,
} from "../util/formatting";
import { Result } from "../util/result";

type CommandContext = SlackEventMiddlewareArgs<"app_mention" | "message">;

abstract class Command {
  constructor(
    protected readonly app: App,
    protected readonly args: readonly string[],
    protected readonly context: CommandContext | null,
  ) {}

  abstract run(): Promise<Result<string | undefined, string>>;
}

class EchoCommand extends Command {
  static readonly privileged = false;
  static readonly id = "echo";
  static readonly help = ["[ARG]...", "display each ARG"];

  async run() {
    return Result.ok(`${this.args.join(" ")}`);
  }
}

class EditMessageCommand extends Command {
  static readonly privileged = true;
  static readonly id = "edit";
  static readonly help = [
    `CHANNEL MESSAGE TEXT`,
    "edit the message specified by CHANNEL and TIMESTAMP to contain TEXT",
  ];

  async run() {
    if (this.args.length < 3) {
      return usageErr(EditMessageCommand);
    }

    const [rawChannel, message, ...textParts] = this.args;
    const channel = parseChannel(rawChannel);
    const text = textParts.join(" ");

    return editMessage(this.app, channel, message, text);
  }
}

class HelpCommand extends Command {
  static readonly privileged = false;
  static readonly id = "help";
  static readonly help = [
    `[COMMAND]...`,
    "display help for each COMMAND, defaulting to all commands",
  ];

  async run() {
    let commands = this.args;
    if (commands.length === 0) {
      commands = Object.keys(commandClassesById).sort();
    }

    let errored = false;
    const lines: string[] = [];
    for (const command of commands) {
      const cls = commandClassesById[command];
      if (cls === undefined) {
        lines.push(`help: command not found: ${command}`);
        errored = true;
        continue;
      }

      lines.push(helpText(cls));
    }

    const joined = lines.join("\n");
    return errored ? Result.err(joined) : Result.ok(joined);
  }
}

class LsCommand extends Command {
  static readonly privileged = false;
  static readonly id = "ls";
  static readonly help = [
    "[CHANNEL]...",
    "list the members in each CHANNEL, defaulting to the current channel",
  ];

  async run() {
    let channels: string[];
    // If no channels were specified...
    if (this.args.length === 0) {
      if (this.context === null) {
        return Result.err(
          `ls: no channel(s) specified and command was not invoked from a channel`,
        );
      }
      // ...use the current channel.
      channels = [this.context.event.channel];
    } else {
      // Parse the arguments as channels.
      channels = this.args.map(parseChannel);
    }

    const printChannelNames = channels.length > 1;

    const lines: string[] = [];
    let errored = false;
    for (const channel of channels) {
      const membersResult = await getConversationMembers(this.app, channel);

      if (!membersResult.ok) {
        lines.push(
          `ls: could not retrieve members of ${formatChannel(channel)}: ${
            membersResult.error
          }`,
        );
        errored = true;
        continue;
      }

      if (printChannelNames) {
        lines.push(`${formatChannel(channel)}:`);
      }
      lines.push(...membersResult.value.map((m) => `<@${m}>`));
    }

    const joined = lines.join("\n");
    return errored ? Result.err(joined) : Result.ok(joined);
  }
}

class ReactCommand extends Command {
  static readonly privileged = true;
  static readonly id = "react";
  static readonly help = [
    "CHANNEL TIMESTAMP REACTION [REACTION]...",
    "add each REACTION to the message specified by CHANNEL and TIMESTAMP",
  ];

  async run() {
    if (this.args.length < 3) {
      return usageErr(ReactCommand);
    }

    const [channel, timestamp, ...unparsedReactions] = this.args;
    const reactions = unparsedReactions.map(parseEmoji);

    const result = await addReactions(this.app, channel, timestamp, reactions);

    return result.ok
      ? result
      : Result.err(result.error.map((line) => `react: ${line}`).join("\n"));
  }
}

class ReactSimulateCommand extends Command {
  static readonly privileged = true;
  static readonly id = "react_simulate";
  static readonly help = [
    `USER CHANNEL TIMESTAMP REACTION`,
    "simulate USER adding REACTION to the message specified by CHANNEL and TIMESTAMP (developer use only)",
  ];

  async run() {
    if (this.args.length !== 4) {
      return usageErr(ReactSimulateCommand);
    }
    const [user, rawChannel, timestamp, rawReaction] = this.args;
    const channel = parseChannel(rawChannel);
    const reaction = parseEmoji(rawReaction);

    await onReactionAddedToMessage(
      this.app,
      user,
      channel,
      timestamp,
      reaction,
    );

    return Result.ok(undefined);
  }
}

class RoundRepeatCommand extends Command {
  static readonly privileged = true;
  static readonly id = "round_repeat";
  static readonly help = [
    "CHANNEL",
    "schedule a new round by repeating the last round in CHANNEL",
  ];

  async run() {
    if (this.args.length !== 1) {
      return usageErr(RoundRepeatCommand);
    }

    const channel = parseChannel(this.args[0]);
    const repeatRoundResult = await repeatRound(channel);
    if (!repeatRoundResult.ok) {
      return repeatRoundResult;
    }

    return Result.ok(repeatRoundResult.value._id.toString());
  }
}

class RoundScheduleCommand extends Command {
  static readonly privileged = true;
  static readonly id = "round_schedule";
  static readonly help = [
    "CHANNEL DATE DURATION [REMINDER_DELAY FINAL_DELAY SUMMARY_DELAY]",
    "schedule a new round of matches for the users in CHANNEL, which will start on DATE and last for DURATION",
  ];

  /**
   * @returns Ok with the start date to use, or Err with an error message.
   */
  async determineStartDate(
    startDateArg: string,
  ): Promise<Result<DateTime, string>> {
    const parseResult = parseDate(startDateArg);
    if (!parseResult.ok) {
      return Result.err(`failed to parse start date: ${parseResult.error}`);
    }

    if (parseResult.value.toMillis() < Date.now()) {
      return Result.err("start date is in the past");
    }

    return parseResult;
  }

  async run() {
    if (this.args.length < 3 || this.args.length > 6) {
      return usageErr(RoundScheduleCommand);
    }

    const [
      rawChannel,
      startDateArg,
      durationArg,
      reminderMessageDelayArg,
      finalMessageDelayArg,
      summaryMessageDelayArg,
    ] = this.args;
    const channel = parseChannel(rawChannel);

    const startDateResult = await this.determineStartDate(startDateArg);
    if (!startDateResult.ok) {
      return startDateResult;
    }

    const durationResult = parseDuration(durationArg);
    if (!durationResult.ok) {
      return durationResult;
    }
    const duration = durationResult.value;

    const getDelayResult = (
      input: string | undefined,
      defaultDelayFactor: number,
    ) =>
      input
        ? parseDuration(input)
        : Result.ok(
            Duration.fromObject({
              seconds: defaultDelayFactor * duration.shiftTo("seconds").seconds,
            }),
          );

    const reminderMessageDelayResult = getDelayResult(
      reminderMessageDelayArg,
      0.5,
    );
    if (!reminderMessageDelayResult.ok) {
      return reminderMessageDelayResult;
    }

    const finalMessageDelayResult = getDelayResult(finalMessageDelayArg, 1.0);
    if (!finalMessageDelayResult.ok) {
      return finalMessageDelayResult;
    }

    const summaryMessageDelayResult = getDelayResult(
      summaryMessageDelayArg,
      16 / 14,
    );
    if (!summaryMessageDelayResult.ok) {
      return summaryMessageDelayResult;
    }

    const createRoundResult = await createRound(
      channel,
      startDateResult.value,
      duration,
      reminderMessageDelayResult.value,
      finalMessageDelayResult.value,
      summaryMessageDelayResult.value,
    );
    if (!createRoundResult.ok) {
      return createRoundResult;
    }

    return Result.ok(createRoundResult.value._id.toString());
  }
}

class SendDirectMessageCommand extends Command {
  static readonly privileged = true;
  static readonly id = "send_dm";
  static readonly help = [
    "USER[,USER[,...]] TEXT",
    "send TEXT to a direct message chat that contains each USER",
  ];

  async run() {
    if (this.args.length < 2) {
      return usageErr(SendDirectMessageCommand);
    }

    const [usersJoined, ...textParts] = this.args;
    const users = usersJoined.split(",").map(parseUser);
    const text = textParts.join(" ");

    const result = await sendDirectMessage(this.app, users, text);
    if (!result.ok) {
      return result;
    }
    return Result.ok(result.value.join(" "));
  }
}

class SendMessageCommand extends Command {
  static readonly privileged = true;
  static readonly id = "send";
  static readonly help = [`CHANNEL TEXT`, "send TEXT to CHANNEL"];

  async run() {
    if (this.args.length < 2) {
      return usageErr(SendMessageCommand);
    }

    const [rawChannel, ...textParts] = this.args;
    const channel = parseChannel(rawChannel);
    const text = textParts.join(" ");

    return sendMessage(this.app, channel, text);
  }
}

interface CommandClass {
  readonly privileged: boolean;
  readonly id: string;
  readonly help: string[];
}

// All commands must be added here.
const commandClasses = [
  EchoCommand,
  EditMessageCommand,
  HelpCommand,
  LsCommand,
  ReactCommand,
  ReactSimulateCommand,
  RoundRepeatCommand,
  RoundScheduleCommand,
  SendDirectMessageCommand,
  SendMessageCommand,
] satisfies CommandClass[];

function helpText(cls: CommandClass) {
  // Indent every line of the help message except the first.
  const lines = cls.help.map((line, i) => (i == 0 ? "" : "\t") + line);

  // Prepend the command name and join the lines.
  return `${cls.id} ${lines.join("\n")}`;
}

function usageErr(cls: CommandClass) {
  return Result.err(`usage: ${helpText(cls)}`);
}

// Map command IDs to classes.
const commandClassesById = commandClasses.reduce<
  Record<string, (typeof commandClasses)[number] | undefined>
>((obj, cls) => {
  if (obj[cls.id] !== undefined) {
    throw new Error(`shell: duplicate command id: ${cls.id}`);
  }
  obj[cls.id] = cls;
  return obj;
}, {});

async function runCommand(
  line: string,
  app: App,
  context: CommandContext | null,
  privileged: boolean,
): Promise<Result<string | undefined, string>> {
  const tryHelp = "(try `help`)";

  const tokens = line.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 1) {
    return Result.err(`shell: no command specified ${tryHelp}`);
  }

  const id = tokens[0];
  const args = tokens.slice(1);

  const cls = commandClassesById[id];
  if (cls === undefined) {
    return Result.err(`shell: command not found: ${id} ${tryHelp}`);
  }

  if (cls.privileged && !privileged) {
    return Result.err(
      `shell: you must be a Workspace Admin to use this command: ${id}`,
    );
  }

  return new cls(app, args, context).run();
}

export { Command, CommandContext, runCommand };
