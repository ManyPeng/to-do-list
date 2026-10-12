import type { CalendarImportItem, ExternalCalendarEvent, Task } from '../domain'
import type { DataLayer } from '../repositories'
import { calendarImportKey, eventToTaskFields, parseIcs, tasksToIcs, type CalendarParseError } from '../infrastructure/calendar/icsAdapter'
import { TaskManagementService } from './taskManagementService'

export interface CalendarPreview {
  items: CalendarImportItem[]
  errors: CalendarParseError[]
}

export class CalendarTransferService {
  private readonly tasks: TaskManagementService
  private readonly data: DataLayer

  constructor(data: DataLayer) {
    this.data = data
    this.tasks = new TaskManagementService(data)
  }

  async exportTasks(taskIds?: string[]): Promise<{ content: string; count: number }> {
    const all = await this.data.tasks.find()
    const selected = taskIds ? all.filter((task) => taskIds.includes(task.id)) : all
    if (selected.length === 0) throw new Error('没有可导出的任务')
    return { content: tasksToIcs(selected), count: selected.length }
  }

  async preview(content: string, fileName?: string): Promise<CalendarPreview> {
    const parsed = parseIcs(content, fileName)
    const existing = await this.data.tasks.find({ includeArchived: true })
    const keys = new Set(existing.flatMap((task) => task.externalCalendarUid && task.externalCalendarStart
      ? [`${task.externalCalendarUid}\u0000${normalizeStoredStart(task)}`]
      : []))
    const items = parsed.events.map((event) => {
      const importKey = calendarImportKey(event)
      const duplicate = keys.has(importKey)
      return { event, importKey, duplicate, selected: !duplicate }
    })
    return { items, errors: parsed.errors }
  }

  async importSelected(items: CalendarImportItem[]): Promise<{ imported: number; skipped: number }> {
    const selected = items.filter((item) => item.selected && !item.duplicate && !item.error)
    let imported = 0
    for (const item of selected) {
      await this.tasks.createTask(eventToTaskFields(item.event))
      imported += 1
    }
    return { imported, skipped: items.length - imported }
  }
}

function normalizeStoredStart(task: Task) {
  if (!task.externalCalendarStart) return ''
  if (!task.startTime) return task.externalCalendarStart.slice(0, 10)
  const date = new Date(task.externalCalendarStart)
  if (Number.isNaN(date.getTime())) return task.externalCalendarStart
  return date.toISOString()
}

export function displayEventTime(event: ExternalCalendarEvent) {
  if (event.allDay) return `${event.start} 全天`
  return `${event.start.slice(0, 10)} ${event.start.slice(11, 16)}${event.end ? ` – ${event.end.slice(11, 16)}` : ''}`
}