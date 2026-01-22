type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel;
  private jsonOutput: boolean;

  constructor(level: LogLevel = 'info', jsonOutput: boolean = true) {
    this.level = level;
    this.jsonOutput = jsonOutput;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, messageOrData: string | object, extra?: object): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof messageOrData === 'string' ? messageOrData : '',
      ...(typeof messageOrData === 'object' ? messageOrData : {}),
      ...extra
    };

    if (this.jsonOutput) {
      return JSON.stringify(entry);
    }

    return `[${entry.timestamp}] [${level.toUpperCase()}] ${entry.message}`;
  }

  debug(messageOrData: string | object, extra?: object): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', messageOrData, extra));
    }
  }

  info(messageOrData: string | object, extra?: object): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', messageOrData, extra));
    }
  }

  warn(messageOrData: string | object, extra?: object): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', messageOrData, extra));
    }
  }

  error(messageOrData: string | object, extra?: object): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', messageOrData, extra));
    }
  }
}

export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || 'info',
  process.env.LOG_FORMAT !== 'text'
);
