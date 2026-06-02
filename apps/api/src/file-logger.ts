import { ConsoleLogger, LogLevel } from '@nestjs/common'
import { appendFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const LOG_FILE = join(__dirname, '..', 'logs', 'app.log')

function write(line: string) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    appendFileSync(LOG_FILE, line + '\n')
  } catch {}
}

function fmt(level: string, message: unknown, context?: string): string {
  const ts = new Date().toISOString()
  const ctx = context ? ` [${context}]` : ''
  return `${ts} ${level.toUpperCase().padEnd(5)}${ctx} ${message}`
}

export class FileLogger extends ConsoleLogger {
  log(message: unknown, context?: string) {
    super.log(message, context)
    write(fmt('log', message, context))
  }

  error(message: unknown, stack?: string, context?: string) {
    super.error(message, stack, context)
    write(fmt('error', message, context))
    if (stack) write(stack)
  }

  warn(message: unknown, context?: string) {
    super.warn(message, context)
    write(fmt('warn', message, context))
  }

  debug(message: unknown, context?: string) {
    super.debug(message, context)
    write(fmt('debug', message, context))
  }

  verbose(message: unknown, context?: string) {
    super.verbose(message, context)
    write(fmt('verbose', message, context))
  }
}
