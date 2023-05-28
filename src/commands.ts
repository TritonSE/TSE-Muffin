import { App, SlackEventMiddlewareArgs } from "@slack/bolt";
import { DateTime } from "luxon";

import { cacheProvider } from "./config-cache";
import {
  formatChannel,
  parseChannel,
  parseDate,
  parseEmoji,
} from "./formatting";
import { ConfigDocument } from "./models/ConfigModel";
import { Round, RoundDocument, RoundModel } from "./models/RoundModel";
import { Result } from "./result";
import {
  addReaction,
  editMessage,
  getConversationMembers,
  sendDirectMessage,
  sendMessage,
} from "./wrappers";

type CommandContext = SlackEventMiddlewareArgs<"app_mention" | "message">;

abstract class Command {
  constructor(
    protected readonly app: App,
    protected readonly args: readonly string[],
    protected readonly context: CommandContext | null
  ) {}

  abstract run(): Promise<Result<string | undefined, string>>;
}

class EchoCommand extends Command {
  static readonly privileged = false;
  static readonly id = "echo";
  static readonly help = ["[ARG]...", "display each ARG"];

  async run() {
    return Result.Ok(`${this.args.join(" ")}`);
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

    const [channel, message, ...textParts] = this.args;
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
    return errored ? Result.Err(joined) : Result.Ok(joined);
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
        return Result.Err(
          `ls: no channel(s) specified and command was not invoked from a channel`
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
          }`
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
    return errored ? Result.Err(joined) : Result.Ok(joined);
  }
}

class ReactCommand extends Command {
  static readonly privileged = true;
  static readonly id = "react";
  static readonly help = [
    `CHANNEL TIMESTAMP REACTION [REACTION]...`,
    `add each REACTION to the message specified by CHANNEL and TIMESTAMP`,
  ];

  // If any of these errors are encountered when adding a reaction, don't
  // attempt to add any more reactions.
  // https://api.slack.com/methods/reactions.add#errors
  static readonly EXIT_EARLY_ERRORS = new Set([
    "bad_timestamp",
    "channel_not_found",
    "is_archived",
    "message_not_found",
    "not_reactable",
    "thread_locked",
    "too_many_reactions",
  ]);

  async run() {
    if (this.args.length < 3) {
      return usageErr(ReactCommand);
    }

    const [channel, timestamp, ...unparsedReactions] = this.args;
    const reactions = unparsedReactions.map(parseEmoji);

    const lines: string[] = [];
    for (const reaction of reactions) {
      const result = await addReaction(this.app, channel, timestamp, reaction);

      if (!result.ok) {
        lines.push(`react: ${result.error}`);
        if (ReactCommand.EXIT_EARLY_ERRORS.has(result.error)) {
          break;
        }
      }
    }

    return lines.length === 0
      ? Result.Ok(undefined)
      : Result.Err(lines.join("\n"));
  }
}

class RoundScheduleCommand extends Command {
  static readonly privileged = true;
  static readonly id = "round_schedule";
  static readonly help = [
    "CHANNEL [DATE]",
    "schedule a new round of matches for the users in CHANNEL, which will start on DATE",
  ];

  /**
   * @returns Ok with the start date to use, or Err with an error message.
   */
  async determineStartDate(
    channel: string,
    startDateArg: string | undefined,
    config: ConfigDocument
  ): Promise<Result<DateTime, string>> {
    if (startDateArg === undefined) {
      // Get the most recent round in this channel.
      let round: RoundDocument | null;
      try {
        round = await RoundModel.findOne({ channel }, null, {
          sort: { matchingScheduledFor: -1 },
        });
      } catch (e) {
        console.error(e);
        return Result.Err(
          "unknown error occurred while querying most recent round for channel (check logs)"
        );
      }

      if (round === null) {
        return Result.Err(
          "start date not provided, and there are no previous rounds for this channel"
        );
      }

      // The new round starts when the previous round ends.
      const startDate = DateTime.fromJSDate(round.matchingScheduledFor).plus({
        days: config.roundDurationDays,
      });
      return Result.Ok(startDate);
    }

    const parseResult = parseDate(startDateArg);
    if (!parseResult.ok) {
      return Result.Err(`failed to parse start date: ${parseResult.error}`);
    }

    if (parseResult.value.toMillis() < Date.now()) {
      return Result.Err("start date is in the past");
    }

    return parseResult;
  }

  /**
   * Calculate the scheduled date for a particular event.
   */
  calculateScheduled<
    K extends
      | "reminderMessageDelayFactor"
      | "finalMessageDelayFactor"
      | "summaryMessageDelayFactor"
  >(config: ConfigDocument, startDate: DateTime, factorName: K) {
    return startDate
      .plus({
        days: config.roundDurationDays * config[factorName],
      })
      .toJSDate();
  }

  async run() {
    if (this.args.length !== 1 && this.args.length !== 2) {
      return usageErr(RoundScheduleCommand);
    }

    const [channel, startDateArg] = this.args;

    const config = (await cacheProvider.get(this.app)).config;

    const startDateResult = await this.determineStartDate(
      channel,
      startDateArg,
      config
    );
    if (!startDateResult.ok) {
      return startDateResult;
    }
    const startDate = startDateResult.value;

    const reminderMessageScheduledFor = this.calculateScheduled(
      config,
      startDate,
      "reminderMessageDelayFactor"
    );
    const finalMessageScheduledFor = this.calculateScheduled(
      config,
      startDate,
      "finalMessageDelayFactor"
    );
    const summaryMessageScheduledFor = this.calculateScheduled(
      config,
      startDate,
      "summaryMessageDelayFactor"
    );

    const rawRound: Round = {
      channel,
      matchingScheduledFor: startDate.toJSDate(),
      reminderMessageScheduledFor,
      finalMessageScheduledFor,
      summaryMessageScheduledFor,
    };

    try {
      const round = await RoundModel.create(rawRound);
      return Result.Ok(round._id.toString());
    } catch (e) {
      console.error(e);
      return Result.Err(
        "unknown error while creating round in MongoDB (check logs)"
      );
    }
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
    const users = usersJoined.split(",");
    const text = textParts.join(" ");

    return sendDirectMessage(this.app, users, text);
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

    const [channel, ...textParts] = this.args;
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
  return Result.Err(`usage: ${helpText(cls)}`);
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
  privileged: boolean
): Promise<Result<string | undefined, string>> {
  const tryHelp = "(try `help`)";

  const tokens = line.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 1) {
    return Result.Err(`shell: no command specified ${tryHelp}`);
  }

  const id = tokens[0];
  const args = tokens.slice(1);

  const cls = commandClassesById[id];
  if (cls === undefined) {
    return Result.Err(`shell: command not found: ${id} ${tryHelp}`);
  }

  if (cls.privileged && !privileged) {
    return Result.Err(
      `shell: you must be a Workspace Admin to use this command: ${id}`
    );
  }

  return new cls(app, args, context).run();
}

export { Command, CommandContext, runCommand };
