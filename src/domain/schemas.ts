import { z } from 'zod'
import {
  PRIORITIES,
  SNAPSHOT_SOURCES,
  SYNC_STATES,
  TASK_CATEGORIES,
  TASK_SOURCES,
  TASK_STATUSES,
  TEMPLATE_STATUSES,
  WEEKDAYS,
} from './models'

const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 5_000

export const uuidSchema = z.uuid()
export const isoDateTimeSchema = z.iso.datetime({ offset: true })
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须使用 YYYY-MM-DD 格式')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    )
  }, '日期无效')
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间必须使用 HH:mm 格式')

const titleSchema = z.string().trim().min(1, '标题不能为空').max(MAX_TITLE_LENGTH)
const descriptionSchema = z.string().trim().max(MAX_DESCRIPTION_LENGTH)
const positiveMinutesSchema = z.number().int().positive('预计时长必须大于 0')
const syncStateSchema = z.enum(SYNC_STATES)

const syncableEntitySchema = z.object({
  id: uuidSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  syncState: syncStateSchema,
})

export const repeatRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({
    type: z.literal('weekly'),
    weekdays: z
      .array(z.union(WEEKDAYS.map((day) => z.literal(day))))
      .min(1, '每周重复至少选择一天')
      .refine((days) => new Set(days).size === days.length, '星期不可重复'),
  }),
])

export const taskTemplateInputSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
  category: z.enum(TASK_CATEGORIES).default('personal'),
  repeatRule: repeatRuleSchema,
  estimatedMinutes: positiveMinutesSchema,
  defaultPriority: z.enum(PRIORITIES).default('medium'),
  startTime: localTimeSchema.optional(),
  dueDate: localDateSchema.optional(),
})

export const taskInputSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
    category: z.enum(TASK_CATEGORIES).default('personal'),
    scheduledDate: localDateSchema,
    priority: z.enum(PRIORITIES).default('medium'),
    estimatedMinutes: positiveMinutesSchema.optional(),
    dueDate: localDateSchema.optional(),
    startTime: localTimeSchema.optional(),
    isFocused: z.boolean().default(false),
    externalCalendarUid: z.string().trim().min(1).max(512).optional(),
    externalCalendarStart: isoDateTimeSchema.optional(),
  })
  .refine(
    (value) => !value.dueDate || value.dueDate >= value.scheduledDate,
    { message: '截止日期不能早于计划日期', path: ['dueDate'] },
  )

export const taskTemplateSchema = syncableEntitySchema.extend({
  ...taskTemplateInputSchema.shape,
  status: z.enum(TEMPLATE_STATUSES),
})

export const taskSchema = syncableEntitySchema.extend({
  templateId: uuidSchema.optional(),
  source: z.enum(TASK_SOURCES),
  status: z.enum(TASK_STATUSES),
  ...taskInputSchema.shape,
  originalScheduledDate: localDateSchema,
  completedAt: isoDateTimeSchema.optional(),
  isArchived: z.boolean(),
})

export const subtaskSchema = syncableEntitySchema.extend({
  taskId: uuidSchema,
  title: titleSchema,
  completed: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
})

export const scheduleChangeSchema = syncableEntitySchema.extend({
  taskId: uuidSchema,
  fromDate: localDateSchema,
  toDate: localDateSchema,
  changedAt: isoDateTimeSchema,
})

export const settingsSchema = syncableEntitySchema.extend({
  wipLimit: z.number().int().positive(),
  focusLimit: z.number().int().positive(),
  snapshotRetentionCount: z.number().int().min(1).max(365),
  externalBackupReminderDays: z.number().int().min(1).max(365),
  lastSnapshotAt: isoDateTimeSchema.optional(),
  lastExternalBackupAt: isoDateTimeSchema.optional(),
  remindAfter: isoDateTimeSchema.optional(),
})

export const snapshotPayloadSchema = z.object({
  templates: z.array(taskTemplateSchema),
  tasks: z.array(taskSchema),
  subtasks: z.array(subtaskSchema),
  scheduleChanges: z.array(scheduleChangeSchema),
  settings: settingsSchema,
})

export const snapshotSchema = syncableEntitySchema.extend({
  snapshotDate: localDateSchema,
  schemaVersion: z.number().int().positive(),
  source: z.enum(SNAPSHOT_SOURCES),
  payload: snapshotPayloadSchema,
})

export const backupFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: isoDateTimeSchema,
  payload: snapshotPayloadSchema,
})

export const externalCalendarEventSchema = z
  .object({
    uid: z.string().trim().min(1).max(512),
    title: titleSchema,
    description: descriptionSchema.optional(),
    start: z.string().trim().min(1),
    end: z.string().trim().min(1).optional(),
    allDay: z.boolean(),
    sourceFileName: z.string().trim().max(255).optional(),
  })
  .refine((event) => !event.end || event.end >= event.start, {
    message: '日历事件结束时间不能早于开始时间',
    path: ['end'],
  })

export const calendarImportItemSchema = z.object({
  event: externalCalendarEventSchema,
  importKey: z.string().trim().min(1),
  selected: z.boolean(),
  duplicate: z.boolean(),
  error: z.string().trim().max(500).optional(),
})

export type TaskInputData = z.infer<typeof taskInputSchema>
export type TaskTemplateInputData = z.infer<typeof taskTemplateInputSchema>
export type BackupFileData = z.infer<typeof backupFileSchema>
