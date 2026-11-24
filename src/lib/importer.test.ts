import { describe, expect, it } from 'vitest'
import { parseSchedule, parseBackup, exportCode } from './importer'
import { initialState } from './engine'

describe('paste a schedule', () => {
  it('reads the spec format and plain lines', () => {
    const b = parseSchedule(`08:00 — Mathematics (45 min)
08:45 — Break (10 min)
08:55 — Physics (50 min)
- English 40
Reading 1h 30m`)
    expect(b.map((x) => [x.type, x.name, x.duration])).toEqual([
      ['task', 'Mathematics', 45],
      ['break', 'Break', 10],
      ['task', 'Physics', 50],
      ['task', 'English', 40],
      ['task', 'Reading', 90],
    ])
  })
  it('reads Arabic, Arabic digits and sessions', () => {
    const b = parseSchedule(`الجلسة الأولى
١. الرياضيات ٤٥ دقيقة
استراحة 10 د
الفيزياء ساعة
الجلسة 2
الإنجليزي`)
    expect(b.map((x) => [x.type, x.name, x.duration])).toEqual([
      ['session', 'الجلسة الأولى', 0],
      ['task', 'الرياضيات', 45],
      ['break', 'استراحة', 10],
      ['task', 'الفيزياء', 60],
      ['session', '', 0],
      ['task', 'الإنجليزي', 45],
    ])
  })
  it('round-trips a backup code', () => {
    const s = { ...initialState(Date.now()), plan: { startTime: '07:30', blocks: parseSchedule('Math 45') } }
    const back = parseBackup(exportCode(s))!
    expect(back.plan.startTime).toBe('07:30')
    expect(back.plan.blocks[0].name).toBe('Math')
  })
})
