import { App, SlackEventMiddlewareArgs } from "@slack/bolt";

import { formatChannel, parseChannel, parseEmoji } from "./formatting";
import { Result } from "./result";
import {
  addReaction,
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
  static readonly help = ["echo [ARG]...", "display each ARG"];

  async run() {
    return Result.Ok(`${this.args.join(" ")}`);
  }
}

class HelpCommand extends Command {
  static readonly privileged = false;
  static readonly id = "help";
  static readonly help = [
    `help [COMMAND]...`,
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

      // Indent every line of the help message except the first.
      const helpLines = cls.help.map((line, i) => (i == 0 ? "" : "\t") + line);
      lines.push(...helpLines);
    }

    const joined = lines.join("\n");
    return errored ? Result.Err(joined) : Result.Ok(joined);
  }
}

class LsCommand extends Command {
  static readonly privileged = false;
  static readonly id = "ls";
  static readonly help = [
    "ls [CHANNEL]...",
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
    `react CHANNEL TIMESTAMP REACTION [REACTION]...`,
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
      return Result.Err(`usage: ${ReactCommand.help.join("\n")}`);
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

class SendDirectMessageCommand extends Command {
  static readonly privileged = true;
  static readonly id = "send_dm";
  static readonly help = [
    `send_dm USER[,USER[,...]] MESSAGE`,
    "send MESSAGE to each USER",
  ];

  async run() {
    if (this.args.length < 2) {
      return Result.Err(`usage: ${SendDirectMessageCommand.help.join("\n")}`);
    }

    const [usersJoined, ...messageParts] = this.args;
    const users = usersJoined.split(",");
    const message = messageParts.join(" ");

    return sendDirectMessage(this.app, users, message);
  }
}

class SendMessageCommand extends Command {
  static readonly privileged = true;
  static readonly id = "send";
  static readonly help = [`send CHANNEL MESSAGE`, "send MESSAGE to CHANNEL"];

  async run() {
    if (this.args.length < 2) {
      return Result.Err(`usage: ${SendMessageCommand.help.join("\n")}`);
    }

    const [channel, ...messageParts] = this.args;
    const message = messageParts.join(" ");

    return sendMessage(this.app, channel, message);
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
  HelpCommand,
  LsCommand,
  ReactCommand,
  SendDirectMessageCommand,
  SendMessageCommand,
] satisfies CommandClass[];

// Map command IDs to classes.
const commandClassesById: Record<
  string,
  (typeof commandClasses)[number] | undefined
> = Object.fromEntries(commandClasses.map((c) => [c.id, c]));

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
    return Result.Err(`shell: command requires elevated privileges: ${id}`);
  }

  return new cls(app, args, context).run();
}

export { Command, CommandContext, runCommand };
