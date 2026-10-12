import type { Task, TaskTemplate, Weekday } from './models'
import { localWeekday } from '../shared/localDate'

export interface EntityMetadataFactory {
  id(): string
  now(): string
}

const defaultMetadataFactory: EntityMetadataFactory = {
  id: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

export function templateOccursOn(
  template: Pick<TaskTemplate, 'repeatRule' | 'status'>,
  scheduledDate: string,
): boolean {
  if (template.status !== 'active') return false
  if (template.repeatRule.type === 'daily') return true
  return template.repeatRule.weekdays.includes(
    localWeekday(scheduledDate) as Weekday,
  )
}

export function createTaskFromTemplate(
  template: TaskTemplate,
  scheduledDate: string,
  metadata: EntityMetadataFactory = defaultMetadataFactory,
): Task {
  const timestamp = metadata.now()
  return {
    id: metadata.id(),
    templateId: template.id,
    source: 'recurring',
    status: 'todo',
    title: template.title,
    description: template.description,
    category: template.category ?? 'personal',
    scheduledDate,
    originalScheduledDate: scheduledDate,
    priority: template.defaultPriority,
    estimatedMinutes: template.estimatedMinutes,
    dueDate: template.dueDate,
    startTime: template.startTime,
    isFocused: false,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'local',
  }
}
