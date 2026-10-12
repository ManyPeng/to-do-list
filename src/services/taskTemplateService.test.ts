import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { TaskTemplateInput } from '../domain'
import { AppDatabase } from '../infrastructure/db/appDatabase'
import { DexieDataLayer } from '../infrastructure/db/repositories'
import { TaskTemplateService } from './taskTemplateService'

const input: TaskTemplateInput = {
  title: '学习英语',
  repeatRule: { type: 'daily' },
  estimatedMinutes: 20,
  defaultPriority: 'medium',
}

describe('TaskTemplateService', () => {
  let database: AppDatabase | undefined

  afterEach(async () => {
    if (database) {
      database.close()
      await database.delete()
    }
  })

  function setup(name: string) {
    database = new AppDatabase(`${name}-${crypto.randomUUID()}`)
    const data = new DexieDataLayer(database)
    return { data, service: new TaskTemplateService(data) }
  }

  it('创建每日模板并为当天生成独立实例', async () => {
    const { data, service } = setup('create')
    const template = await service.create(input, '2026-09-11')
    const task = await data.tasks.findByTemplateAndDate(template.id, '2026-09-11')

    expect(template.status).toBe('active')
    expect(task).toEqual(expect.objectContaining({
      source: 'recurring',
      title: input.title,
      templateId: template.id,
    }))
  })

  it('按星期模板仅在选定日期生成实例', async () => {
    const { data, service } = setup('weekly')
    const template = await service.create({
      ...input,
      repeatRule: { type: 'weekly', weekdays: [1, 5] },
    }, '2026-09-11')

    expect(await data.tasks.findByTemplateAndDate(template.id, '2026-09-11')).toBeTruthy()
    await service.update(template.id, {
      ...input,
      repeatRule: { type: 'weekly', weekdays: [1] },
    }, '2026-09-12')
    expect(await data.tasks.findByTemplateAndDate(template.id, '2026-09-12')).toBeUndefined()
  })

  it('编辑模板不修改已生成的历史实例', async () => {
    const { data, service } = setup('snapshot')
    const template = await service.create(input, '2026-09-11')
    await service.update(template.id, { ...input, title: '新版英语学习' })

    const history = await data.tasks.findByTemplateAndDate(template.id, '2026-09-11')
    expect(history?.title).toBe('学习英语')
    expect((await service.list())[0].title).toBe('新版英语学习')
  })

  it('暂停和归档模板后不再生成实例', async () => {
    const { data, service } = setup('status')
    const template = await service.create(input)
    await service.setStatus(template.id, 'paused')
    expect((await service.list())[0].status).toBe('paused')

    await service.setStatus(template.id, 'active', '2026-09-11')
    expect(await data.tasks.findByTemplateAndDate(template.id, '2026-09-11')).toBeTruthy()

    await service.setStatus(template.id, 'archived')
    await expect(service.setStatus(template.id, 'active')).rejects.toThrow('已归档模板不能恢复')
  })

  it('拒绝没有星期或预计时长无效的模板', async () => {
    const { service } = setup('validation')
    await expect(service.create({ ...input, estimatedMinutes: 0 })).rejects.toBeTruthy()
    await expect(service.create({ ...input, repeatRule: { type: 'weekly', weekdays: [] } })).rejects.toBeTruthy()
  })
})