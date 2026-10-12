import type { Task } from './models'
import { isBeforeLocalDate } from '../shared/localDate'

export class WipLimitExceededError extends Error {
  constructor(limit: number) {
    super(`进行中任务数量不能超过 ${limit} 个`)
    this.name = 'WipLimitExceededError'
  }
}

export class FocusLimitExceededError extends Error {
  constructor(limit: number) {
    super(`今日重点数量不能超过 ${limit} 个`)
    this.name = 'FocusLimitExceededError'
  }
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`任务 ${taskId} 不存在`)
    this.name = 'TaskNotFoundError'
  }
}

export function isOverdueTask(task: Task, targetDate: string): boolean {
  return task.status !== 'completed' && isBeforeLocalDate(task.scheduledDate, targetDate)
}

export function transitionTask(
  task: Task,
  status: Task['status'],
  changedAt: string,
): Task {
  return {
    ...task,
    status,
    completedAt: status === 'completed' ? changedAt : undefined,
    updatedAt: changedAt,
    syncState: 'local',
  }
}

export function tasksForDate(tasks: Task[], targetDate: string): Task[] {
  return tasks.filter(
    (task) =>
      !task.isArchived &&
      (task.scheduledDate === targetDate || isOverdueTask(task, targetDate)),
  )
}

export function isCarriedOver(task: Task, targetDate: string): boolean {
  return task.status !== 'completed' && isBeforeLocalDate(task.scheduledDate, targetDate)
}