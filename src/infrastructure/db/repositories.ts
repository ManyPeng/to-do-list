import Dexie from 'dexie'
import type { ScheduleChange, Settings, Snapshot, Subtask, Task, TaskTemplate } from '../../domain'
import {
  DuplicateTaskInstanceError,
  type DataLayer,
  type DataRepositories,
  type ScheduleChangeRepository,
  type SettingsRepository,
  type SubtaskRepository,
  type TaskQuery,
  type TaskRepository,
  type TaskTemplateQuery,
  type TaskTemplateRepository,
} from '../../repositories'
import type { SnapshotRepository } from '../../repositories/database'
import { AppDatabase, appDatabase, taskInstanceKey, type TaskRecord } from './appDatabase'

function toTask(record: TaskRecord | undefined): Task | undefined {
  if (!record) return undefined
  const task = { ...record }
  delete task.instanceKey
  return task
}

class DexieTaskRepository implements TaskRepository {
  private readonly database: AppDatabase
  constructor(database: AppDatabase) { this.database = database }

  async getById(id: string) { return toTask(await this.database.tasks.get(id)) }

  async find(query: TaskQuery = {}) {
    let records: TaskRecord[]
    if (query.scheduledDate && query.status) {
      records = await this.database.tasks.where('[scheduledDate+status]').equals([query.scheduledDate, query.status]).toArray()
    } else if (query.scheduledDate) {
      records = await this.database.tasks.where('scheduledDate').equals(query.scheduledDate).toArray()
    } else if (query.status) {
      records = await this.database.tasks.where('status').equals(query.status).toArray()
    } else {
      records = await this.database.tasks.toArray()
    }
    return records.filter((task) => query.includeArchived || !task.isArchived).map((task) => toTask(task)!)
  }

  async findByTemplateAndDate(templateId: string, scheduledDate: string) {
    return toTask(await this.database.tasks.where('instanceKey').equals(`${templateId}:${scheduledDate}`).first())
  }

  async save(task: Task) {
    try {
      await this.database.tasks.put({ ...task, instanceKey: taskInstanceKey(task) })
    } catch (error) {
      if (error instanceof Dexie.ConstraintError && task.templateId) {
        throw new DuplicateTaskInstanceError(task.templateId, task.scheduledDate)
      }
      throw error
    }
  }

  async saveMany(tasks: Task[]) {
    try {
      await this.database.tasks.bulkPut(tasks.map((task) => ({ ...task, instanceKey: taskInstanceKey(task) })))
    } catch (error) {
      if (error instanceof Dexie.BulkError || error instanceof Dexie.ConstraintError) {
        const recurring = tasks.find((task) => task.templateId)
   if (recurring?.templateId) throw new DuplicateTaskInstanceError(recurring.templateId, recurring.scheduledDate)
      }
      throw error
    }
  }

  async delete(id: string) { await this.database.tasks.delete(id) }
}

class DexieTaskTemplateRepository implements TaskTemplateRepository {
  private readonly database: AppDatabase
  constructor(database: AppDatabase) { this.database = database }
  getById(id: string) { return this.database.templates.get(id) }
  find(query: TaskTemplateQuery = {}) {
    return query.status ? this.database.templates.where('status').equals(query.status).toArray() : this.database.templates.toArray()
  }
  async save(template: TaskTemplate) { await this.database.templates.put(template) }
  async delete(id: string) { await this.database.templates.delete(id) }
}

class DexieSettingsRepository implements SettingsRepository {
  private readonly database: AppDatabase
  constructor(database: AppDatabase) { this.database = database }
  get() { return this.database.settings.toCollection().first() }
  async save(settings: Settings) {
    await this.database.transaction('rw', this.database.settings, async () => {
      await this.database.settings.clear()
      await this.database.settings.put(settings)
    })
  }
}

class DexieSubtaskRepository implements SubtaskRepository {
  private readonly database: AppDatabase
  constructor(database: AppDatabase) { this.database = database }
  findByTaskId(taskId: string) { return this.database.subtasks.where('taskId').equals(taskId).sortBy('sortOrder') }
  async save(subtask: Subtask) { await this.database.subtasks.put(subtask) }
  async saveMany(subtasks: Subtask[]) { await this.database.subtasks.bulkPut(subtasks) }
  async delete(id: string) { await this.database.subtasks.delete(id) }
}

class DexieScheduleChangeRepository implements ScheduleChangeRepository {
  private readonly database: AppDatabase
  constructor(database: AppDatabase) { this.database = database }
  findByTaskId(taskId: string) { return this.database.scheduleChanges.where('taskId').equals(taskId).sortBy('changedAt') }
  async save(change: ScheduleChange) { await this.database.scheduleChanges.put(change) }
}

class DexieSnapshotRepository implements SnapshotRepository {
  private readonly database: AppDatabase
  constructor(database: AppDatabase) { this.database = database }
  getById(id: string) { return this.database.snapshots.get(id) }
  findLatest() { return this.database.snapshots.orderBy('createdAt').last() }
  findAll() { return this.database.snapshots.orderBy('createdAt').reverse().toArray() }
  findBySourceAndDate(source: Snapshot['source'], date: string) {
    return this.database.snapshots.where('snapshotDate').equals(date).filter((item) => item.source === source).first()
  }
  async save(snapshot: Snapshot) { await this.database.snapshots.put(snapshot) }
  async delete(id: string) { await this.database.snapshots.delete(id) }
}

export class DexieDataLayer implements DataLayer {
  readonly database: AppDatabase
  readonly tasks: DexieTaskRepository
  readonly templates: DexieTaskTemplateRepository
  readonly settings: DexieSettingsRepository
  readonly subtasks: DexieSubtaskRepository
  readonly scheduleChanges: DexieScheduleChangeRepository
  readonly snapshots: DexieSnapshotRepository

  constructor(database: AppDatabase = appDatabase) {
    this.database = database
    this.tasks = new DexieTaskRepository(database)
    this.templates = new DexieTaskTemplateRepository(database)
    this.settings = new DexieSettingsRepository(database)
    this.subtasks = new DexieSubtaskRepository(database)
    this.scheduleChanges = new DexieScheduleChangeRepository(database)
    this.snapshots = new DexieSnapshotRepository(database)
  }

  async readSnapshotPayload() {
    const [templates, records, subtasks, scheduleChanges, settings] = await Promise.all([
      this.database.templates.toArray(),
      this.database.tasks.toArray(),
      this.database.subtasks.toArray(),
      this.database.scheduleChanges.toArray(),
      this.database.settings.toCollection().first(),
    ])
    if (!settings) throw new Error('设置数据尚未初始化')
    return { templates, tasks: records.map((record) => toTask(record)!), subtasks, scheduleChanges, settings }
  }

  async replaceBusinessData(payload: import('../../domain').SnapshotPayload) {
    await this.database.transaction(
      'rw',
      [this.database.tasks, this.database.templates, this.database.subtasks, this.database.scheduleChanges, this.database.settings],
      async () => {
        await Promise.all([
          this.database.tasks.clear(), this.database.templates.clear(), this.database.subtasks.clear(),
          this.database.scheduleChanges.clear(), this.database.settings.clear(),
        ])
        await this.database.templates.bulkAdd(payload.templates)
        await this.database.tasks.bulkAdd(payload.tasks.map((task) => ({ ...task, instanceKey: taskInstanceKey(task) })))
        await this.database.subtasks.bulkAdd(payload.subtasks)
        await this.database.scheduleChanges.bulkAdd(payload.scheduleChanges)
        await this.database.settings.add(payload.settings)
      },
    )
  }

  async transaction<T>(operation: (repositories: DataRepositories) => Promise<T>): Promise<T> {
    return this.database.transaction(
      'rw',
      [this.database.tasks, this.database.templates, this.database.subtasks, this.database.scheduleChanges, this.database.settings, this.database.snapshots],
      () => operation(this),
    )
  }
}

export const dataLayer = new DexieDataLayer()