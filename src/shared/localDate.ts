import {
  addDays,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parse,
  startOfDay,
} from 'date-fns'

const LOCAL_DATE_FORMAT = 'yyyy-MM-dd'

export function toLocalDate(value: Date = new Date()): string {
  return format(value, LOCAL_DATE_FORMAT)
}

export function parseLocalDate(value: string): Date {
  const parsed = parse(value, LOCAL_DATE_FORMAT, new Date())
  return startOfDay(parsed)
}

export function todayLocalDate(): string {
  return toLocalDate(new Date())
}

export function shiftLocalDate(value: string, amount: number): string {
  return toLocalDate(addDays(parseLocalDate(value), amount))
}

export function isSameLocalDate(left: string, right: string): boolean {
  return isSameDay(parseLocalDate(left), parseLocalDate(right))
}

export function isBeforeLocalDate(left: string, right: string): boolean {
  return isBefore(parseLocalDate(left), parseLocalDate(right))
}

export function isAfterLocalDate(left: string, right: string): boolean {
  return isAfter(parseLocalDate(left), parseLocalDate(right))
}

export function localWeekday(value: string): number {
  return parseLocalDate(value).getDay()
}

export function combineLocalDateTime(date: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const result = parseLocalDate(date)
  result.setHours(hours, minutes, 0, 0)
  return result
}