import { Response as FetchResponse } from "node-fetch";
import { Logger } from "../server";

const rateLimitHeaders = {
  limit: "X-RateLimit-Limit",
  remaining: "X-RateLimit-Remaining",
  resetTimeInSeconds: "X-RateLimit-Reset",
  identifier: "X-RateLimit-Bucket",
};

export const getHeader = (response: FetchResponse, header: string) =>
  response.headers.get(header);

class RateLimit {
  private limit: number;
  private remaining: number;
  private secondsUntilReset: number;

  constructor() {
    this.limit = 1;
    this.remaining = 1;
    this.secondsUntilReset = 1;
  }

  public canFetch(logger: Logger): boolean {
    logger.debug("Have remaining fetches in window? %s", this.remaining > 0);
    return this.remaining > 0 || this.hasExpired(logger);
  }

  private hasExpired(logger: Logger): boolean {
    logger.debug(
      "Has window expired? %s",
      Math.floor(Date.now() / 1000) > this.secondsUntilReset
    );
    return Math.floor(Date.now() / 1000) > this.secondsUntilReset;
  }

  public update(response: FetchResponse, logger: Logger) {
    const responseHeaders = {
      limit: getHeader(response, rateLimitHeaders.limit),
      remaining: getHeader(response, rateLimitHeaders.remaining),
      resetTimeInSeconds: getHeader(
        response,
        rateLimitHeaders.resetTimeInSeconds
      ),
      identifier: getHeader(response, rateLimitHeaders.identifier),
    };

    this.limit = responseHeaders.limit ? parseInt(responseHeaders.limit) : -1;
    this.remaining = responseHeaders.remaining
      ? parseInt(responseHeaders.remaining)
      : -1;
    this.secondsUntilReset = responseHeaders.resetTimeInSeconds
      ? parseInt(responseHeaders.resetTimeInSeconds)
      : Math.floor(Date.now() / 1000) + 1;

    if (logger) {
      logger.debug("Limit: %s", this.limit);
      logger.debug("Remaining: %s", this.remaining);
      logger.debug("Seconds until reset: %s", this.secondsUntilReset);
    }
  }
}

export const getRateLimit = () => new RateLimit();
