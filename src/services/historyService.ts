import {
  shiftLocalDate,
  templateOccursOn,
  todayLocalDate,
  type Task,
  type TaskTemplate,
} from '../domain'
import type { DataLayer } from '../repositories'

export interface DailyCompletion {
  date: string
  tasks: Task[]
  count: number
}

export interface TemplateStreak {
  template: TaskTemplate
  current: number
  longest: number
}

function completionDate(task: Task): string | undefined {
  return task.completedAt?.slice(0, 10)
}

function scheduled(template: TaskTemplate, date: string): boolean {
  return templateOccursOn({ ...template, status: 'active' }, date)
}

export function calculateTemplateStreak(
  template: TaskTemplate,
  tasks: Task[],
  throughDate = todayLocalDate(),
): Pick<TemplateStreak, 'current' | 'longest'> {
  const instances = tasks.filter((task) => task.templateId === template.id)
  if (!instances.length) return { current: 0, longest: 0 }

  const completedDates = new Set(
    instances
      .filter((task) => task.status === 'completed' && task.completedAt)
      .map((task) => task.scheduledDate),
  )
  const instanceDates = new Set(instances.map((task) => task.scheduledDate))
  const firstDate = instances.reduce(
    (earliest, task) => task.scheduledDate < earliest ? task.scheduledDate : earliest,
    instances[0].scheduledDate,
  )

  let cursor = firstDate
  let running = 0
  let longest = 0
  let lastExpected: string | undefined
  let currentAtLastExpected = 0

  while (cursor <= throughDate) {
    if (scheduled(template, cursor) && instanceDates.has(cursor)) {
      lastExpected = cursor
      if (completedDates.has(cursor)) {
        running += 1
        longest = Math.max(longest, running)
      } else {
        running = 0
      }
      currentAtLastExpected = running
    }
    cursor = shiftLocalDate(cursor, 1)
  }

  return {
    current: lastExpected ? currentAtLastExpected : 0,
    longest,
  }
}

export class HistoryService {
  private readonly data: DataLayer

  constructor(data: DataLayer) {
    this.data = data
  }

  async listDailyCompletions(): Promise<DailyCompletion[]> {
    const completed = (await this.data.tasks.find({ status: 'completed', includeArchived: true }))
      .filter((task) => task.completedAt)
    const grouped = new Map<string, Task[]>()

    for (const task of completed) {
      const date = completionDate(task)!
      grouped.set(date, [...(grouped.get(date) ?? []), task])
    }

    return [...grouped.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([date, tasks]) => ({
        date,
        count: tasks.length,
        tasks: tasks.sort((left, right) =>
          (right.completedAt ?? '').localeCompare(left.completedAt ?? ''),
        ),
      }))
  }

  async listTemplateStreaks(throughDate = todayLocalDate()): Promise<TemplateStreak[]> {
    const [templates, tasks] = await Promise.all([
      this.data.templates.find(),
      this.data.tasks.find({ includeArchived: true }),
    ])

    return templates
      .map((template) => ({
        template,
        ...calculateTemplateStreak(template, tasks, throughDate),
      }))
      .filter((item) => tasks.some((task) => task.templateId === item.template.id))
      .sort((left, right) => right.current - left.current || right.longest - left.longest)
  }
}