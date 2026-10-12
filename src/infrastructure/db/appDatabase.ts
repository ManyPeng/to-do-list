import Dexie, { type EntityTable } from 'dexie'
import type {
  ScheduleChange,
  Settings,
  Snapshot,
  Subtask,
  Task,
  TaskTemplate,
} from '../../domain'

export const DATABASE_NAME = 'daily-flow-manager'
export const DATABASE_VERSION = 2

export interface TaskRecord extends Task {
  instanceKey?: string
}

export function taskInstanceKey(task: Pick<Task, 'templateId' | 'scheduledDate'>) {
  return task.templateId ? `${task.templateId}:${task.scheduledDate}` : undefined
}

export class AppDatabase extends Dexie {
  tasks!: EntityTable<TaskRecord, 'id'>
  templates!: EntityTable<TaskTemplate, 'id'>
  subtasks!: EntityTable<Subtask, 'id'>
  scheduleChanges!: EntityTable<ScheduleChange, 'id'>
  settings!: EntityTable<Settings, 'id'>
  snapshots!: EntityTable<Snapshot, 'id'>

  constructor(name = DATABASE_NAME) {
    super(name)

    this.version(1).stores({
      tasks: '&id, scheduledDate, status, templateId, completedAt, updatedAt, syncState',
      templates: '&id, status, updatedAt, syncState',
      subtasks: '&id, taskId, [taskId+sortOrder], updatedAt, syncState',
      scheduleChanges: '&id, taskId, changedAt, updatedAt, syncState',
      settings: '&id, updatedAt, syncState',
      snapshots: '&id, snapshotDate, createdAt, source',
    })

    this.version(DATABASE_VERSION)
      .stores({
        tasks:
          '&id, [scheduledDate+status], scheduledDate, status, templateId, &instanceKey, completedAt, updatedAt, syncState',
        templates: '&id, status, updatedAt, syncState',
        subtasks: '&id, taskId, [taskId+sortOrder], updatedAt, syncState',
        scheduleChanges: '&id, taskId, changedAt, updatedAt, syncState',
        settings: '&id, updatedAt, syncState',
        snapshots: '&id, snapshotDate, createdAt, source',
      })
      .upgrade(async (transaction) => {
        const tasks = transaction.table<TaskRecord, string>('tasks')
        await tasks.toCollection().modify((task) => {
          task.instanceKey = taskInstanceKey(task)
        })
      })
  }
}

export const appDatabase = new AppDatabase()