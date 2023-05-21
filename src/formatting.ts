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

export { formatChannel, parseChannel, formatEmoji, parseEmoji, formatUser };
