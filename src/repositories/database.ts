import type {
  ScheduleChange,
  Settings,
  Snapshot,
  Subtask,
  Task,
  TaskTemplate,
} from '../domain'

export interface SubtaskRepository {
  findByTaskId(taskId: string): Promise<Subtask[]>
  save(subtask: Subtask): Promise<void>
  saveMany(subtasks: Subtask[]): Promise<void>
  delete(id: string): Promise<void>
}

export interface ScheduleChangeRepository {
  findByTaskId(taskId: string): Promise<ScheduleChange[]>
  save(change: ScheduleChange): Promise<void>
}

export interface SnapshotRepository {
  getById(id: string): Promise<Snapshot | undefined>
  findLatest(): Promise<Snapshot | undefined>
  findAll(): Promise<Snapshot[]>
  findBySourceAndDate(source: Snapshot['source'], date: string): Promise<Snapshot | undefined>
  save(snapshot: Snapshot): Promise<void>
  delete(id: string): Promise<void>
}

export interface BackupDataStore {
  readSnapshotPayload(): Promise<import('../domain').SnapshotPayload>
  replaceBusinessData(payload: import('../domain').SnapshotPayload): Promise<void>
}

export interface DatabaseRepositories {
  tasks: {
    getById(id: string): Promise<Task | undefined>
    save(task: Task): Promise<void>
  }
  templates: {
    getById(id: string): Promise<TaskTemplate | undefined>
    save(template: TaskTemplate): Promise<void>
  }
  subtasks: SubtaskRepository
  scheduleChanges: ScheduleChangeRepository
  settings: {
    get(): Promise<Settings | undefined>
    save(settings: Settings): Promise<void>
  }
  snapshots: SnapshotRepository
}

export interface DatabaseTransactionHost extends DatabaseRepositories {
  transaction<T>(
    operation: (repositories: DatabaseRepositories) => Promise<T>,
  ): Promise<T>
}