import Koa from "koa";
import bodyParser from "koa-bodyparser";
import dotenv from "dotenv";

import helmet from "koa-helmet";
import cors from "@koa/cors";
import router from "./router";
import pino, { stdTimeFunctions } from "pino";

dotenv.config();

type LogFn = (...args: any[]) => void;

export interface Logger {
  info: LogFn;
  debug: LogFn;
  error: LogFn;
  warn: LogFn;
  fatal: LogFn;
}

export interface WithLogger {
  logger: Logger;
}

const pinoLogger = (level = "trace") => {
  return pino({
    prettyPrint: true,
    timestamp: stdTimeFunctions.isoTime,
    level,
  });
};

const log = pinoLogger();

const app = new Koa();

app
  .use(helmet())
  .use((ctx: Koa.Context, next: Koa.Next) => {
    ctx.logger = log;
    return next();
  }) // debug /info logger
  .use(bodyParser())
  .use(cors())
  .use(router.routes());

app.on("start", () => {
  log.warn("API server is starting...");
});

if (!module.parent) {
  app.listen(4000);
  app.emit("start", log);
}
export default app;
