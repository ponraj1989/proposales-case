import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProduction = process.env.NODE_ENV === 'production';
const minLevel: LogLevel = isProduction ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatMessage(level: LogLevel, context: string, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] ${level.toUpperCase()} [${context}] ${message}${metaStr}`;
}

function writeToFile(line: string) {
  try {
    const logDir = join(process.cwd(), 'logs');
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, 'app.log'), line + '\n');
  } catch {
    // Silently fail — don't break the app for logging
  }
}

function log(level: LogLevel, context: string, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const formatted = formatMessage(level, context, message, meta);

  // Always write to console (Vercel picks these up automatically)
  switch (level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }

  // In development, also write to file
  if (!isProduction) {
    writeToFile(formatted);
  }
}

export function createLogger(context: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => log('debug', context, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => log('info', context, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log('warn', context, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log('error', context, message, meta),
  };
}
