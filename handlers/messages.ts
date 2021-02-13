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

interface Channel {
  messages: Message[];
  lastMsgId: string;
  pendingFetch: boolean;
  rateLimit: ReturnType<typeof getRateLimit>;
  lastFetch?: string;
}

let channels: Record<string, Channel> = {};

// Initialize rate-limit state values
// let rateLimit = getRateLimit();

export const getQueryString = (channelId: string) => {
  const {lastMsgId} = channels[channelId];
  return lastMsgId ? `?after=${lastMsgId}` : "";
};

const purgeStaleMessages = (channelId: string, logger: Logger) => {
  const now = new Date();
  const allMessages = [...channels[channelId].messages];
  channels[channelId].messages = allMessages.filter((msg, index, arr) => {
    const messageTimestamp = msg.timestamp;
    const limit = 5;
    const isOldMessageIndex = index < arr.length - limit;
    if (isOldMessageIndex) {
      // logger.debug(
      //   `Is #${index} NOT one of the last ${limit} messages of ${arr.length}? %s`,
      //   isOldMessageIndex
      // );
      return false;
    } else {
      if (isDate(new Date(messageTimestamp))) {
        const isFresh = isBefore(
          now,
          addSeconds(new Date(messageTimestamp), 10)
        );
        // logger.debug(
        //   `Msg #${index}: timestamp is a date, is it newer than 10 seconds ago? ${isFresh}`
        // );
        return isFresh;
      }
    }
    logger.debug("Purge fell through");
    return true;
  });
};

export const updateMessages = (
  channelId: string,
  newMessages: Message[],
  logger: Logger
) => {
  logger.debug("*** Updating messages for channel: %s", channelId);
  let combinedMessages: Message[] = channels[channelId].messages;
  if (Array.isArray(newMessages) && newMessages.length > 0) {
    // logger.debug("Received messages count: %s", newMessages.length);
    channels[channelId].lastMsgId = newMessages[0].id;
    // logger.debug("Last message received: %s", channels[channelId].lastMsgId);
    combinedMessages = [...channels[channelId].messages, ...newMessages.reverse()];
  }
  return combinedMessages;
};

export const fetchNewMessages = async (channelId: string) => {
  channels[channelId].pendingFetch = true;
  return fetch(
    `https://discord.com/api/v7/channels/${channelId}/messages${getQueryString(channelId)}`,
    {
      headers: {
        authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      },
      method: "GET",
    }
  );
};

export const messagesHandler = async (ctx: RouterContext, next: Koa.Next) => {
  const { channel: channelId } = ctx.request.query;
  if (!channels[channelId]) {
    channels[channelId] = {
      messages: [],
      lastMsgId: '',
      rateLimit: getRateLimit(),
      pendingFetch: false,
      lastFetch: undefined,
    };
  }
  if (!Array.isArray(channels[channelId].messages)) {
    channels[channelId].messages = [];
  }
  if (!channels[channelId].rateLimit.canFetch(ctx.logger)) {
    ctx.logger.warn("Rate limit exceeded");
  } else {
    // ctx.logger.debug("Pending fetch? %s", channels[channelId].pendingFetch);
    if (!channels[channelId].pendingFetch) {
      // ctx.logger.debug("Fetching messages");
      const result = await fetchNewMessages(channelId);
      channels[channelId].rateLimit.update(result, ctx.logger);
      setTimeout(() => {
        channels[channelId].pendingFetch = false;
      }, 1000);
      const newMessages = await result.json();

      // ctx.logger.debug("New messages count: %s", newMessages.length);
      channels[channelId].messages = updateMessages(channelId, newMessages, ctx.logger);
      purgeStaleMessages(channelId, ctx.logger);
      channels[channelId].lastFetch = new Date().toISOString();
    } else {
      ctx.logger.warn("Prior fetch request pending");
    }
  }
  ctx.response.body = channels[channelId].messages;
  ctx.response.status = 200;

  ctx.logger.debug(`**** Channels: %o`, channels);
  return next();
};
