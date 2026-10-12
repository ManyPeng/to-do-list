import { todayLocalDate } from '../domain'
import { dataLayer } from '../infrastructure/db/repositories'
import { RecurringTaskScheduler } from './recurringTaskScheduler'

export const recurringTaskScheduler = new RecurringTaskScheduler(dataLayer)

export function scheduleToday() {
  return recurringTaskScheduler.ensureInstancesForDate(todayLocalDate())
}

export function scheduleDate(scheduledDate: string) {
  return recurringTaskScheduler.ensureInstancesForDate(scheduledDate)
}