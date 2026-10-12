import type {
  ScheduleChange,
  Settings,
  Subtask,
  Task,
  TaskStatus,
  TaskTemplate,
  TemplateStatus,
} from '../domain'

export interface TaskQuery {
  scheduledDate?: string
  status?: TaskStatus
  includeArchived?: boolean
}

export interface TaskRepository {
  getById(id: string): Promise<Task | undefined>
  find(query?: TaskQuery): Promise<Task[]>
  findByTemplateAndDate(
    templateId: string,
    scheduledDate: string,
  ): Promise<Task | undefined>
  save(task: Task): Promise<void>
  saveMany(tasks: Task[]): Promise<void>
  delete(id: string): Promise<void>
}

export interface TaskTemplateQuery {
  status?: TemplateStatus
}

export interface TaskTemplateRepository {
  getById(id: string): Promise<TaskTemplate | undefined>
  find(query?: TaskTemplateQuery): Promise<TaskTemplate[]>
  save(template: TaskTemplate): Promise<void>
  delete(id: string): Promise<void>
}

export interface SettingsRepository {
  get(): Promise<Settings | undefined>
  save(settings: Settings): Promise<void>
}

export interface ScheduleChangeRepository {
  findByTaskId(taskId: string): Promise<ScheduleChange[]>
  save(change: ScheduleChange): Promise<void>
}

export interface SubtaskRepository {
  findByTaskId(taskId: string): Promise<Subtask[]>
  save(subtask: Subtask): Promise<void>
  saveMany(subtasks: Subtask[]): Promise<void>
  delete(id: string): Promise<void>
}

export interface DataRepositories {
  tasks: TaskRepository
  templates: TaskTemplateRepository
  subtasks: SubtaskRepository
  settings: SettingsRepository
  scheduleChanges: ScheduleChangeRepository
}

export interface DataLayer extends DataRepositories {
  transaction<T>(operation: (repositories: DataRepositories) => Promise<T>): Promise<T>
}

export class DuplicateTaskInstanceError extends Error {
  constructor(templateId: string, scheduledDate: string) {
    super(`模板 ${templateId} 在 ${scheduledDate} 已存在任务实例`)
    this.name = 'DuplicateTaskInstanceError'
  }
}