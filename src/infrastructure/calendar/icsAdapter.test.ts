import { describe, expect, it } from 'vitest'
import type { Task } from '../../domain'
import { eventToTaskFields, parseIcs, tasksToIcs } from './icsAdapter'

function task(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    source: 'flexible',
    status: 'todo',
    title: '整理周报',
    scheduledDate: '2026-09-21',
    originalScheduledDate: '2026-09-21',
    priority: 'medium',
    isFocused: false,
    isArchived: false,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    syncState: 'local',
    ...overrides,
  }
}

describe('ICS 适配器', () => {
  it('将无开始时间任务导出为全天事件，并转义文本', () => {
    const result = tasksToIcs([task({ title: '周报,总结', description: '第一行\n第二行' })], new Date('2026-09-20T01:02:03Z'))
    expect(result).toContain('DTSTART;VALUE=DATE:20260921')
    expect(result).toContain('DTEND;VALUE=DATE:20260922')
    expect(result).toContain('SUMMARY:周报\\,总结')
    expect(result).toContain('DESCRIPTION:第一行\\n第二行')
  })

  it('将定时任务按预计时长导出，缺省时长使用 30 分钟', () => {
    const result = tasksToIcs([
      task({ startTime: '09:15', estimatedMinutes: 45 }),
      task({ id: crypto.randomUUID(), startTime: '23:50', estimatedMinutes: undefined }),
    ])
    expect(result).toContain('DTSTART:20260921T091500')
    expect(result).toContain('DTEND:20260921T100000')
    expect(result).toContain('DTEND:20260922T002000')
  })

  it('解析 Apple/Google 常见全天、UTC 和折行格式', () => {
    const result = parseIcs([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:apple-1',
      'DTSTART;VALUE=DATE:20260922',
      'SUMMARY:全天安排',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:google-1',
      'DTSTART:20260922T010000Z',
      'DTEND:20260922T020000Z',
      'SUMMARY:线上会议',
      'DESCRIPTION:第一段',
      ' 第二段',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'), 'calendar.ics')
    expect(result.errors).toEqual([])
    expect(result.events[0]).toMatchObject({ allDay: true, start: '2026-09-22' })
    expect(result.events[1].start).toBe('2026-09-22T01:00:00.000Z')
    expect(result.events[1].description).toBe('第一段第二段')
  })

  it('报告缺少标题的错误项而不导入', () => {
    const result = parseIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:bad\nDTSTART;VALUE=DATE:20260922\nEND:VEVENT\nEND:VCALENDAR')
    expect(result.events).toHaveLength(0)
    expect(result.errors[0].reason).toBe('缺少标题')
  })

  it('把定时事件映射为带外部 UID 的灵活任务字段', () => {
    const fields = eventToTaskFields({ uid: 'event-1', title: '会议', start: '2026-09-22T01:00:00.000Z', end: '2026-09-22T02:30:00.000Z', allDay: false })
    expect(fields).toMatchObject({
      title: '会议', scheduledDate: '2026-09-22', startTime: '01:00',
      estimatedMinutes: 90, externalCalendarUid: 'event-1',
      externalCalendarStart: '2026-09-22T01:00:00.000Z',
    })
  })
})