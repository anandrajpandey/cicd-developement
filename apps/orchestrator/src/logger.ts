import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.printf(({ level, message, timestamp, stack, ...meta }) => {
      const serializedMeta = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      const serializedStack = stack ? `\n${stack}` : '';

      return `${timestamp} [${level}] ${message}${serializedMeta}${serializedStack}`;
    }),
  ),
  transports: [new transports.Console()],
});
