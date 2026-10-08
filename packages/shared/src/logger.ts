import winston from 'winston';

const { combine, timestamp, printf, colorize, json, errors, splat } = winston.format;
const sensitiveKey = /(authorization|cookie|password|secret|token|init.?data|telegram.?id|email|phone)/i;

const redactSensitive = winston.format((info) => {
  const visit = (value: unknown, seen = new WeakSet<object>()): unknown => {
    if (Array.isArray(value)) return value.map((item) => visit(item, seen));
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = sensitiveKey.test(key) ? "[REDACTED]" : visit(item, seen);
    }
    return result;
  };
  for (const [key, value] of Object.entries(info)) {
    if (sensitiveKey.test(key)) info[key] = "[REDACTED]";
    else if (value && typeof value === "object") info[key] = visit(value);
  }
  return info;
});

const consoleFormat = printf(({ level, message, timestamp, service, stack, ...metadata }) => {
  const servicePrefix = service ? `[${service}] ` : '';
  const metadataText = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
  const stackText = stack ? `\n${stack}` : '';

  return `${timestamp} ${servicePrefix}[${level}]: ${message}${metadataText}${stackText}`;
});

export const createLogger = (serviceName: string) =>
  winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    defaultMeta: { service: serviceName },
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      splat(),
      redactSensitive(),
      process.env.NODE_ENV === 'production'
        ? json()
        : combine(colorize({ all: true }), consoleFormat)
    ),
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
  });

export const logger = createLogger('app');