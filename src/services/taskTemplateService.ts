import {
  taskTemplateInputSchema,
  type TaskTemplate,
  type TaskTemplateInput,
  type TemplateStatus,
} from '../domain'
import type { DataLayer } from '../repositories'
import { RecurringTaskScheduler } from './recurringTaskScheduler'

export class TaskTemplateService {
  private readonly data: DataLayer
  private readonly scheduler: RecurringTaskScheduler

  constructor(data: DataLayer) {
    this.data = data
    this.scheduler = new RecurringTaskScheduler(data)
  }

  async list(): Promise<TaskTemplate[]> {
    const templates = await this.data.templates.find()
    return templates.sort((left, right) => {
      const statusOrder = { active: 0, paused: 1, archived: 2 }
      return statusOrder[left.status] - statusOrder[right.status]
        || left.title.localeCompare(right.title, 'zh-CN')
    })
  }

  async create(input: TaskTemplateInput, scheduledDate?: string): Promise<TaskTemplate> {
    const value = taskTemplateInputSchema.parse(input)
    const now = new Date().toISOString()
    const template: TaskTemplate = {
      ...value,
      id: crypto.randomUUID(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      syncState: 'local',
    }
    await this.data.templates.save(template)
    if (scheduledDate) await this.scheduler.ensureInstancesForDate(scheduledDate)
    return template
  }

  async update(id: string, input: TaskTemplateInput, scheduledDate?: string): Promise<TaskTemplate> {
    const current = await this.requireTemplate(id)
    const value = taskTemplateInputSchema.parse(input)
    const updated: TaskTemplate = {
      ...current,
      ...value,
      updatedAt: new Date().toISOString(),
      syncState: 'local',
    }
    await this.data.templates.save(updated)
    if (scheduledDate && updated.status === 'active') {
      await this.scheduler.ensureInstancesForDate(scheduledDate)
    }
    return updated
  }

  async setStatus(id: string, status: TemplateStatus, scheduledDate?: string): Promise<TaskTemplate> {
    const current = await this.requireTemplate(id)
    if (current.status === 'archived' && status !== 'archived') {
      throw new Error('已归档模板不能恢复，请新建模板')
    }
    const updated: TaskTemplate = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      syncState: 'local',
    }
    await this.data.templates.save(updated)
    if (scheduledDate && status === 'active') {
      await this.scheduler.ensureInstancesForDate(scheduledDate)
    }
    return updated
  }

  private async requireTemplate(id: string): Promise<TaskTemplate> {
    const template = await this.data.templates.getById(id)
    if (!template) throw new Error('未找到固定任务模板')
    return template
  }
}