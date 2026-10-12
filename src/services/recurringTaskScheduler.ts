import {
  createTaskFromTemplate,
  templateOccursOn,
  type EntityMetadataFactory,
  type Task,
} from '../domain'
import {
  DuplicateTaskInstanceError,
  type DataLayer,
} from '../repositories'

export interface ScheduleResult {
  scheduledDate: string
  created: Task[]
}

export class RecurringTaskScheduler {
  private readonly dataLayer: DataLayer
  private readonly metadata?: EntityMetadataFactory

  constructor(dataLayer: DataLayer, metadata?: EntityMetadataFactory) {
    this.dataLayer = dataLayer
    this.metadata = metadata
  }

  async ensureInstancesForDate(scheduledDate: string): Promise<ScheduleResult> {
    const templates = await this.dataLayer.templates.find({ status: 'active' })
    const applicable = templates.filter((template) =>
      templateOccursOn(template, scheduledDate),
    )
    const created: Task[] = []

    for (const template of applicable) {
      const existing = await this.dataLayer.tasks.findByTemplateAndDate(
        template.id,
        scheduledDate,
      )
      if (existing) continue

      const task = createTaskFromTemplate(template, scheduledDate, this.metadata)
      try {
        await this.dataLayer.tasks.save(task)
        created.push(task)
      } catch (error) {
        if (!(error instanceof DuplicateTaskInstanceError)) throw error
      }
    }

    return { scheduledDate, created }
  }
}