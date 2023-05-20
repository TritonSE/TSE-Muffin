import { App, SlackEventMiddlewareArgs } from "@slack/bolt";

import { Result } from "./result";
import { addReaction, getConversationMembers } from "./wrappers";
import { formatChannel, parseChannel } from "./formatting";

type CommandContext = SlackEventMiddlewareArgs<"app_mention" | "message">;

abstract class Command {
  constructor(
    protected readonly app: App,
    protected readonly args: readonly string[],
    protected readonly context: CommandContext | null
  ) {}

  abstract run(): Promise<Result<string | null, string>>;
}

class EchoCommand extends Command {
  static readonly id = "echo";
  static readonly help = ["echo [ARG]...", "display each ARG"];

  async run() {
    return Result.Ok(`${this.args.join(" ")}`);
  }
}

class HelpCommand extends Command {
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
    let lines = [];
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
    const [channel, timestamp, ...reactions] = this.args;

    const lines = [];
    for (const reaction of reactions) {
      const result = await addReaction(this.app, channel, timestamp, reaction);

      if (!result.ok) {
        lines.push(`react: ${result.error}`);
        if (ReactCommand.EXIT_EARLY_ERRORS.has(result.error)) {
          break;
        }
      }
    }

    return lines.length === 0 ? Result.Ok(null) : Result.Err(lines.join("\n"));
  }
}

// All commands must be added here.
const commandClasses = [EchoCommand, HelpCommand, LsCommand, ReactCommand];

// Map command IDs to classes.
const commandClassesById: Record<
  string,
  (typeof commandClasses)[number] | undefined
> = Object.fromEntries(commandClasses.map((c) => [c.id, c]));

async function runCommand(
  line: string,
  app: App,
  context: CommandContext | null
): Promise<Result<string | null, string>> {
  const tokens = line.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 1) {
    return Result.Err("shell: no command specified (try `help`)");
  }

  const id = tokens[0];
  const args = tokens.slice(1);

  const cls = commandClassesById[id];
  if (cls === undefined) {
    return Result.Err(`shell: command not found: ${id}`);
  }
  return new cls(app, args, context).run();
}

export { Command, CommandContext, runCommand };
