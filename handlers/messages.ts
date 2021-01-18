import Koa from "koa";
import fetch from "node-fetch";
import { RouterContext } from "../router";
import { getRateLimit } from "./_rateLimit";
import { Logger } from "../server";
import { isBefore, isDate, addSeconds } from "date-fns";

export interface Message {
  id: string;
  type: number;
  content: string;
  channel_id: string;
  author: {
    id: string;
    username: string;
    avatar: string | null;
    discriminator: string;
    public_flags: number;
  };
  attachments: any[];
  embeds: any[];
  mentions: any[];
  mention_roles: any[];
  pinned: boolean;
  mention_everyone: boolean;
  tts: boolean;
  timestamp: string;
  edited_timestamp?: any | null;
  flags: number;
  message_reference?: {
    channel_id: string;
    guild_id: string;
    message_id: string;
  };
  referenced_message?: Message;
}

let pendingFetch: boolean = false;
let lastReceivedMessageId: string;
let messages: Record<string, Message[]> = {};

// Initialize rate-limit state values
let rateLimit = getRateLimit();

export const getQueryString = () =>
  lastReceivedMessageId ? `?after=${lastReceivedMessageId}` : "";

const purgeStaleMessages = (channel: string, logger: Logger) => {
  const now = new Date();
  const allMessages = [...messages[channel]];
  messages[channel] = allMessages.filter((msg, index, arr) => {
    const messageTimestamp = msg.timestamp;
    const limit = 5;
    const isOldMessageIndex = index < arr.length - limit;
    if (isOldMessageIndex) {
      logger.debug(
        `Is #${index} NOT one of the last ${limit} messages of ${arr.length}? %s`,
        isOldMessageIndex
      );
      return false;
    } else {
      if (isDate(new Date(messageTimestamp))) {
        const isFresh = isBefore(
          now,
          addSeconds(new Date(messageTimestamp), 10)
        );
        logger.debug(
          `Msg #${index}: timestamp is a date, is it newer than 10 seconds ago? ${isFresh}`
        );
        return isFresh;
      }
    }
    logger.debug("Purge fell through");
    return true;
  });
};

export const updateMessages = (
  channel: string,
  newMessages: Message[],
  logger: Logger
) => {
  logger.debug("Updating messages for channel: %s", channel);
  let combinedMessages: Message[] = messages[channel];
  if (Array.isArray(newMessages) && newMessages.length > 0) {
    logger.debug("Received messages count: %s", newMessages.length);
    lastReceivedMessageId = newMessages[0].id;
    logger.debug("Last message received: %s", lastReceivedMessageId);
    combinedMessages = [...messages[channel], ...newMessages.reverse()];
  }
  return combinedMessages;
};

export const fetchNewMessages = async (channel: string) => {
  pendingFetch = true;
  return fetch(
    `https://discord.com/api/v7/channels/${channel}/messages${getQueryString()}`,
    {
      headers: {
        authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
      method: "GET",
    }
  );
};

export const messagesHandler = async (ctx: RouterContext, next: Koa.Next) => {
  const { channel } = ctx.request.query;
  if (!Array.isArray(messages[channel])) {
    messages[channel] = [];
  }
  if (!rateLimit.canFetch(ctx.logger)) {
    ctx.logger.warn("Rate limit exceeded");
  } else {
    ctx.logger.debug("Pending fetch? %s", pendingFetch);
    if (!pendingFetch) {
      ctx.logger.debug("Fetching messages");
      const result = await fetchNewMessages(channel);
      rateLimit.update(result, ctx.logger);
      setTimeout(() => {
        pendingFetch = false;
      }, 1000);
      const newMessages = await result.json();

      ctx.logger.debug("New messages count: %s", newMessages.length);
      messages[channel] = updateMessages(channel, newMessages, ctx.logger);
      purgeStaleMessages(channel, ctx.logger);
    } else {
      ctx.logger.warn("Prior fetch request pending");
    }
  }
  ctx.response.body = messages[channel];
  ctx.response.status = 200;
  return next();
};
