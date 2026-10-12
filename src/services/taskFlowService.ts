import {
  FocusLimitExceededError,
  TaskNotFoundError,
  WipLimitExceededError,
  isCarriedOver,
  isOverdueTask,
  tasksForDate,
  transitionTask,
  type ScheduleChange,
  type Subtask,
  type Task,
  type TaskStatus,
} from '../domain'
import type { DataLayer } from '../repositories'

export interface TaskFlowMetadataFactory {
  id(): string
  now(): string
}

export interface BoardTask {
  task: Task
  subtasks: Subtask[]
  overdue: boolean
  carriedOver: boolean
}

const defaultMetadata: TaskFlowMetadataFactory = {
  id: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

export class TaskFlowService {
  private readonly dataLayer: DataLayer
  private readonly metadata: TaskFlowMetadataFactory

  constructor(dataLayer: DataLayer, metadata: TaskFlowMetadataFactory = defaultMetadata) {
    this.dataLayer = dataLayer
    this.metadata = metadata
  }

  async changeStatus(taskId: string, status: TaskStatus): Promise<Task> {
    return this.dataLayer.transaction(async (repositories) => {
      const task = await repositories.tasks.getById(taskId)
      if (!task) throw new TaskNotFoundError(taskId)
      if (task.status === status) return task

      if (status === 'in_progress') {
        const settings = await repositories.settings.get()
        const limit = settings?.wipLimit ?? 3
        const activeTasks = await repositories.tasks.find({ status: 'in_progress' })
        if (activeTasks.length >= limit) throw new WipLimitExceededError(limit)
      }

      const updated = transitionTask(task, status, this.metadata.now())
      await repositories.tasks.save(updated)
      return updated
    })
  }

  complete(taskId: string) {
    return this.changeStatus(taskId, 'completed')
  }

  reopen(taskId: string, status: Exclude<TaskStatus, 'completed'> = 'todo') {
    return this.changeStatus(taskId, status)
  }

  async setFocused(taskId: string, focused: boolean, targetDate?: string): Promise<Task> {
    return this.dataLayer.transaction(async (repositories) => {
      const task = await repositories.tasks.getById(taskId)
      if (!task) throw new TaskNotFoundError(taskId)
      if (task.isFocused === focused) return task

      if (focused) {
        const settings = await repositories.settings.get()
        const limit = settings?.focusLimit ?? 3
        const boardDate = targetDate ?? task.scheduledDate
        const focusedTasks = tasksForDate(
          await repositories.tasks.find(),
          boardDate,
        ).filter((item) => item.isFocused)
        if (focusedTasks.length >= limit) throw new FocusLimitExceededError(limit)
      }

      const updated: Task = {
        ...task,
        isFocused: focused,
        updatedAt: this.metadata.now(),
        syncState: 'local',
      }
      await repositories.tasks.save(updated)
      return updated
    })
  }

  async reschedule(taskId: string, toDate: string): Promise<Task> {
    return this.dataLayer.transaction(async (repositories) => {
      const task = await repositories.tasks.getById(taskId)
      if (!task) throw new TaskNotFoundError(taskId)
      if (task.scheduledDate === toDate) return task

      const changedAt = this.metadata.now()
      const change: ScheduleChange = {
        id: this.metadata.id(),
        taskId,
        fromDate: task.scheduledDate,
        toDate,
        changedAt,
        createdAt: changedAt,
        updatedAt: changedAt,
        syncState: 'local',
      }
      const updated: Task = {
        ...task,
        scheduledDate: toDate,
        updatedAt: changedAt,
        syncState: 'local',
      }

      await repositories.tasks.save(updated)
      await repositories.scheduleChanges.save(change)
      return updated
    })
  }

  async getTasksForDate(targetDate: string): Promise<BoardTask[]> {
    const tasks = tasksForDate(await this.dataLayer.tasks.find(), targetDate)
    return Promise.all(tasks.map(async (task) => ({
      task,
      subtasks: await this.dataLayer.subtasks.findByTaskId(task.id),
      overdue: isOverdueTask(task, targetDate),
      carriedOver: isCarriedOver(task, targetDate),
    })))
  }
}