export const TASK_STATUSES = ['todo', 'in_progress', 'completed'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_SOURCES = ['recurring', 'flexible', 'calendar'] as const
export type TaskSource = (typeof TASK_SOURCES)[number]

export const TASK_CATEGORIES = ['personal', 'family'] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]

export const PRIORITIES = ['low', 'medium', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TEMPLATE_STATUSES = ['active', 'paused', 'archived'] as const
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number]

export const SYNC_STATES = ['local', 'pending', 'synced', 'conflict'] as const
export type SyncState = (typeof SYNC_STATES)[number]

export const SNAPSHOT_SOURCES = ['auto', 'manual'] as const
export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number]

export const REPEAT_RULE_TYPES = ['daily', 'weekly'] as const
export type RepeatRuleType = (typeof REPEAT_RULE_TYPES)[number]

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const
export type Weekday = (typeof WEEKDAYS)[number]

export interface SyncableEntity {
  id: string
  createdAt: string
  updatedAt: string
  syncState: SyncState
}

export type RepeatRule =
  | { type: 'daily' }
  | { type: 'weekly'; weekdays: Weekday[] }

export interface TaskTemplate extends SyncableEntity {
  title: string
  description?: string
  category?: TaskCategory
  repeatRule: RepeatRule
  status: TemplateStatus
  estimatedMinutes: number
  defaultPriority: Priority
  startTime?: string
  dueDate?: string
}

export interface Task extends SyncableEntity {
  templateId?: string
  source: TaskSource
  status: TaskStatus
  title: string
  description?: string
  category?: TaskCategory
  scheduledDate: string
  originalScheduledDate: string
  priority: Priority
  estimatedMinutes?: number
  dueDate?: string
  startTime?: string
  completedAt?: string
  isFocused: boolean
  isArchived: boolean
  externalCalendarUid?: string
  externalCalendarStart?: string
}

export interface Subtask extends SyncableEntity {
  taskId: string
  title: string
  completed: boolean
  sortOrder: number
}

export interface ScheduleChange extends SyncableEntity {
  taskId: string
  fromDate: string
  toDate: string
  changedAt: string
}

export interface Settings extends SyncableEntity {
  wipLimit: number
  focusLimit: number
  snapshotRetentionCount: number
  externalBackupReminderDays: number
  lastSnapshotAt?: string
  lastExternalBackupAt?: string
  remindAfter?: string
}

export interface SnapshotPayload {
  templates: TaskTemplate[]
  tasks: Task[]
  subtasks: Subtask[]
  scheduleChanges: ScheduleChange[]
  settings: Settings
}

export interface Snapshot extends SyncableEntity {
  snapshotDate: string
  schemaVersion: number
  source: SnapshotSource
  payload: SnapshotPayload
}

export interface BackupFile {
  schemaVersion: number
  exportedAt: string
  payload: SnapshotPayload
}

export interface ExternalCalendarEvent {
  uid: string
  title: string
  description?: string
  start: string
  end?: string
  allDay: boolean
  sourceFileName?: string
}

export interface CalendarImportItem {
  event: ExternalCalendarEvent
  importKey: string
  selected: boolean
  duplicate: boolean
  error?: string
}

export interface TaskInput {
  title: string
  description?: string
  category?: TaskCategory
  scheduledDate: string
  priority?: Priority
  estimatedMinutes?: number
  dueDate?: string
  startTime?: string
  isFocused?: boolean
  externalCalendarUid?: string
  externalCalendarStart?: string
}

export interface TaskTemplateInput {
  title: string
  description?: string
  category?: TaskCategory
  repeatRule: RepeatRule
  estimatedMinutes: number
  defaultPriority?: Priority
  startTime?: string
  dueDate?: string
}
