import {
  taskInputSchema,
  type ScheduleChange,
  type Subtask,
  type Task,
  type TaskInput,
} from '../domain'
import type { DataLayer } from '../repositories'

export type TaskDetails = { task: Task; subtasks: Subtask[] }

export class IncompleteSubtasksError extends Error {
  constructor() {
    super('仍有未完成的子任务，请确认后再完成父任务')
    this.name = 'IncompleteSubtasksError'
  }
}

export class TaskManagementService {
  private readonly data: DataLayer

  constructor(data: DataLayer) {
    this.data = data
  }

  async createTask(input: TaskInput): Promise<Task> {
    const value = taskInputSchema.parse(input)
    const now = new Date().toISOString()
    const task: Task = {
      ...value,
      id: crypto.randomUUID(),
      source: 'flexible',
      status: 'todo',
      originalScheduledDate: value.scheduledDate,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      syncState: 'local',
    }
    await this.data.tasks.save(task)
    return task
  }

  async updateTask(id: string, input: TaskInput): Promise<Task> {
    const value = taskInputSchema.parse(input)
    return this.data.transaction(async (repositories) => {
      const current = await repositories.tasks.getById(id)
      if (!current) throw new Error('未找到任务')
      const changedAt = new Date().toISOString()
      const updated: Task = {
        ...current,
        ...value,
        updatedAt: changedAt,
        syncState: 'local',
      }
      await repositories.tasks.save(updated)
      if (current.scheduledDate !== value.scheduledDate) {
        const change: ScheduleChange = {
          id: crypto.randomUUID(),
          taskId: id,
          fromDate: current.scheduledDate,
          toDate: value.scheduledDate,
          changedAt,
          createdAt: changedAt,
          updatedAt: changedAt,
          syncState: 'local',
        }
        await repositories.scheduleChanges.save(change)
      }
      return updated
    })
  }

  async archiveTask(id: string): Promise<void> {
    const task = await this.requireTask(id)
    await this.data.tasks.save({
      ...task,
      isArchived: true,
      updatedAt: new Date().toISOString(),
      syncState: 'local',
    })
  }

  async deleteTask(id: string): Promise<void> {
    await this.data.transaction(async (repositories) => {
      for (const subtask of await repositories.subtasks.findByTaskId(id)) {
        await repositories.subtasks.delete(subtask.id)
      }
      await repositories.tasks.delete(id)
    })
  }

  async getDetails(id: string): Promise<TaskDetails> {
    return {
      task: await this.requireTask(id),
      subtasks: await this.data.subtasks.findByTaskId(id),
    }
  }

  async addSubtask(taskId: string, title: string): Promise<Subtask> {
    await this.requireTask(taskId)
    const trimmed = title.trim()
    if (!trimmed) throw new Error('子任务标题不能为空')
    const subtasks = await this.data.subtasks.findByTaskId(taskId)
    const now = new Date().toISOString()
    const subtask: Subtask = {
      id: crypto.randomUUID(),
      taskId,
      title: trimmed,
      completed: false,
      sortOrder: subtasks.length,
      createdAt: now,
      updatedAt: now,
      syncState: 'local',
    }
    await this.data.subtasks.save(subtask)
    return subtask
  }

  async updateSubtask(id: string, taskId: string, title: string, completed: boolean): Promise<void> {
    const current = (await this.data.subtasks.findByTaskId(taskId)).find((item) => item.id === id)
    if (!current) throw new Error('未找到子任务')
    const trimmed = title.trim()
    if (!trimmed) throw new Error('子任务标题不能为空')
    await this.data.subtasks.save({
      ...current,
      title: trimmed,
      completed,
      updatedAt: new Date().toISOString(),
      syncState: 'local',
    })
  }

  async deleteSubtask(taskId: string, id: string): Promise<void> {
    const subtasks = await this.data.subtasks.findByTaskId(taskId)
    if (!subtasks.some((item) => item.id === id)) throw new Error('未找到子任务')
    await this.data.transaction(async (repositories) => {
      await repositories.subtasks.delete(id)
      await repositories.subtasks.saveMany(
        subtasks
          .filter((item) => item.id !== id)
          .map((item, sortOrder) => ({ ...item, sortOrder })),
      )
    })
  }

  async moveSubtask(taskId: string, id: string, direction: -1 | 1): Promise<void> {
    const subtasks = await this.data.subtasks.findByTaskId(taskId)
    const index = subtasks.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= subtasks.length) return
    const now = new Date().toISOString()
    const current = { ...subtasks[index], sortOrder: subtasks[target].sortOrder, updatedAt: now, syncState: 'local' as const }
    const neighbor = { ...subtasks[target], sortOrder: subtasks[index].sortOrder, updatedAt: now, syncState: 'local' as const }
    await this.data.subtasks.saveMany([current, neighbor])
  }

  async completeTask(id: string, confirmed = false): Promise<Task> {
    const subtasks = await this.data.subtasks.findByTaskId(id)
    if (!confirmed && subtasks.some((item) => !item.completed)) {
      throw new IncompleteSubtasksError()
    }
    const task = await this.requireTask(id)
    const now = new Date().toISOString()
    const updated: Task = {
      ...task,
      status: 'completed',
      completedAt: now,
      updatedAt: now,
      syncState: 'local',
    }
    await this.data.tasks.save(updated)
    return updated
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await this.data.tasks.getById(id)
    if (!task) throw new Error('未找到任务')
    return task
  }
}
