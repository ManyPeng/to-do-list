import { externalCalendarEventSchema, type ExternalCalendarEvent, type Task } from '../../domain'

export interface CalendarParseError {
  index: number
  reason: string
}

export interface CalendarParseResult {
  events: ExternalCalendarEvent[]
  errors: CalendarParseError[]
}

const pad = (value: number) => String(value).padStart(2, '0')

function escapeText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function unescapeText(value: string) {
  return value.replace(/\\([nN,;\\])/g, (_, character: string) => character.toLowerCase() === 'n' ? '\n' : character)
}

function foldLine(line: string) {
  const parts: string[] = []
  let remaining = line
  while (new TextEncoder().encode(remaining).length > 75) {
    let index = Math.min(73, remaining.length)
    while (index > 1 && new TextEncoder().encode(remaining.slice(0, index)).length > 73) index -= 1
    parts.push(remaining.slice(0, index))
    remaining = remaining.slice(index)
  }
  parts.push(remaining)
  return parts.join('\r\n ')
}

function compactDate(date: string) {
  return date.replaceAll('-', '')
}

function localDateTime(date: string, time: string) {
  return `${compactDate(date)}T${time.replace(':', '')}00`
}

function addMinutes(date: string, time: string, minutes: number) {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minute] = time.split(':').map(Number)
  const value = new Date(year, month - 1, day, hours, minute + minutes)
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}T${pad(value.getHours())}${pad(value.getMinutes())}00`
}

function stamp(date = new Date()) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

export function tasksToIcs(tasks: Task[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Daily Flow Manager//Calendar Export//ZH-CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const task of tasks) {
    lines.push('BEGIN:VEVENT', `UID:${escapeText(`task-${task.id}@daily-flow-manager`)}`, `DTSTAMP:${stamp(now)}`)
    if (task.startTime) {
      lines.push(`DTSTART:${localDateTime(task.scheduledDate, task.startTime)}`)
      lines.push(`DTEND:${addMinutes(task.scheduledDate, task.startTime, task.estimatedMinutes ?? 30)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(task.scheduledDate)}`)
      const next = new Date(`${task.scheduledDate}T12:00:00`)
      next.setDate(next.getDate() + 1)
      lines.push(`DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`)
    }
    lines.push(`SUMMARY:${escapeText(task.title)}`)
    if (task.description) lines.push(`DESCRIPTION:${escapeText(task.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

function parseProperty(line: string) {
  const separator = line.indexOf(':')
  if (separator < 1) return undefined
  const descriptor = line.slice(0, separator)
  const [name, ...parameters] = descriptor.split(';')
  return {
    name: name.toUpperCase(),
    parameters: Object.fromEntries(parameters.map((item) => {
      const [key, ...value] = item.split('=')
      return [key.toUpperCase(), value.join('=').replace(/^"|"$/g, '')]
    })),
    value: line.slice(separator + 1),
  }
}

function validDateParts(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match
  const result = `${year}-${month}-${day}`
  const date = new Date(`${result}T12:00:00`)
  return date.getFullYear() === Number(year) && date.getMonth() + 1 === Number(month) && date.getDate() === Number(day) ? result : undefined
}

function parseDateValue(value: string, allDay: boolean): string | undefined {
  if (allDay) return validDateParts(value)
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second, utc] = match
  const datePart = validDateParts(`${year}${month}${day}`)
  if (!datePart || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return undefined
  if (utc) return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString()
  return `${datePart}T${hour}:${minute}:${second}`
}

function canonicalTimedStart(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function calendarImportKey(event: Pick<ExternalCalendarEvent, 'uid' | 'start' | 'allDay'>) {
  return `${event.uid}\u0000${event.allDay ? event.start : canonicalTimedStart(event.start)}`
}

export function parseIcs(content: string, sourceFileName?: string): CalendarParseResult {
  if (new TextEncoder().encode(content).length > 5 * 1024 * 1024) throw new Error('ICS 文件不能超过 5 MB')
  const unfolded = content.replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)
  const blocks: string[][] = []
  let current: string[] | undefined
  for (const line of lines) {
    if (line.toUpperCase() === 'BEGIN:VEVENT') current = []
    else if (line.toUpperCase() === 'END:VEVENT' && current) {
      blocks.push(current)
      current = undefined
    } else if (current) current.push(line)
  }
  if (!/BEGIN:VCALENDAR/i.test(content)) throw new Error('不是有效的 iCalendar 文件')

  const events: ExternalCalendarEvent[] = []
  const errors: CalendarParseError[] = []
  blocks.forEach((block, index) => {
    try {
      const properties = block.map(parseProperty).filter((item): item is NonNullable<typeof item> => Boolean(item))
      const find = (name: string) => properties.find((item) => item.name === name)
      const uid = find('UID')?.value.trim()
      const summary = find('SUMMARY')?.value
      const startProperty = find('DTSTART')
      if (!uid) throw new Error('缺少 UID')
      if (!summary?.trim()) throw new Error('缺少标题')
      if (!startProperty) throw new Error('缺少开始时间')
      const allDay = startProperty.parameters.VALUE?.toUpperCase() === 'DATE' || /^\d{8}$/.test(startProperty.value)
      const start = parseDateValue(startProperty.value.trim(), allDay)
      if (!start) throw new Error('开始时间格式无效')
      const endProperty = find('DTEND')
      const end = endProperty ? parseDateValue(endProperty.value.trim(), allDay) : undefined
      if (endProperty && !end) throw new Error('结束时间格式无效')
      const event = externalCalendarEventSchema.parse({
        uid,
        title: unescapeText(summary),
        description: find('DESCRIPTION')?.value ? unescapeText(find('DESCRIPTION')!.value) : undefined,
        start,
        end,
        allDay,
        sourceFileName,
      })
      events.push(event)
    } catch (error) {
      errors.push({ index: index + 1, reason: error instanceof Error ? error.message : '无法解析事件' })
    }
  })
  if (blocks.length === 0) errors.push({ index: 0, reason: '文件中没有日历事件' })
  return { events, errors }
}

export function eventToTaskFields(event: ExternalCalendarEvent) {
  const scheduledDate = event.allDay ? event.start : event.start.slice(0, 10)
  let estimatedMinutes: number | undefined
  let startTime: string | undefined
  if (!event.allDay) {
    startTime = event.start.slice(11, 16)
    if (event.end) {
      const start = new Date(event.start)
      const end = new Date(event.end)
      const duration = Math.round((end.getTime() - start.getTime()) / 60_000)
      if (Number.isFinite(duration) && duration > 0) estimatedMinutes = duration
    }
  }
  return { title: event.title, description: event.description, scheduledDate, startTime, estimatedMinutes, externalCalendarUid: event.uid, externalCalendarStart: event.allDay ? `${event.start}T00:00:00.000Z` : canonicalTimedStart(event.start) }
}