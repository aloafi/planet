import { revive, uid } from './engine'
import type { AppState, Block } from './types'

const KEY = 'planet:v1'
const PREFIX = 'PLANET-BACKUP:'

/** the whole saved state of this browser, as text you can copy */
export function exportCode(state: AppState) {
  return PREFIX + JSON.stringify(state)
}

/** read whatever this browser has saved for this address */
export function readLocal(): unknown {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

/** a full Planet backup (from Copy or from the old address) */
export function parseBackup(text: string): AppState | null {
  let raw = text.trim()
  if (raw.startsWith(PREFIX)) raw = raw.slice(PREFIX.length)
  if (!raw.startsWith('{')) return null
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || !obj.plan) return null
    return revive(obj, Date.now())
  } catch {
    return null
  }
}

export function hasContent(s: AppState | null) {
  return !!s && (s.plan.blocks.length > 0 || s.templates.length > 0 || s.history.length > 0 || s.events.length > 0)
}

const BREAK = /^(break|rest|pause|استراحة|استراحه|راحة|راحه|بريك)(?=$|[\s:：\d(])/i
const SESSION = /^(session|جلسة|الجلسة|جلسه)(?=$|[\s:：\d])/i

/**
 * Turn a pasted list into timeline blocks. Understands lines like
 *   08:00 — Mathematics (45 min)      Physics 50      - Break 10 min
 *   الرياضيات 45 دقيقة                استراحة ١٠       Session 2 / الجلسة الثانية
 */
export function parseSchedule(text: string): Block[] {
  const out: Block[] = []
  const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  for (let line of text.split(/\r?\n/)) {
    line = toLatin(line).trim()
    if (!line) continue
    // bullets, numbering, checkboxes
    line = line.replace(/^([-*•·▪◦✓✔☐☑]|\[[ xX]?\]|\d+[.)])\s*/, '')
    // a leading clock time and its separator: "08:00 —", "8:30-"
    line = line.replace(/^\d{1,2}[:.]\d{2}(\s*[-–—:|]\s*\d{1,2}[:.]\d{2})?\s*(am|pm|ص|م)?\s*[-–—:|]?\s*/i, '')
    if (!line) continue

    if (SESSION.test(line) || /^#+\s*/.test(line)) {
      const name = line.replace(/^#+\s*/, '').replace(/[:：]\s*$/, '').trim()
      out.push({ id: uid(), type: 'session', name: /^(session|الجلسة|جلسة)\s*\d*$/i.test(name) ? '' : name, description: '', duration: 0, timed: true })
      continue
    }

    // duration: "1h 30m", "1:30h", "90 min", "45m", "45 دقيقة", "ساعة", "(45)"
    let minutes: number | null = null
    let rest = line
    const hm = rest.match(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hour|hours|س|ساعة|ساعات)(?=$|[\s)\].,:،؛])\s*(?:(\d+)\s*(m|min|mins|minutes|د|دقيقة|دقائق)?)?/i)
    if (hm) {
      minutes = Math.round(parseFloat(hm[1].replace(',', '.')) * 60 + (hm[3] ? parseInt(hm[3], 10) : 0))
      rest = rest.replace(hm[0], ' ')
    } else if (/(^|\s)(ساعة|ساعه)(\s|$)/.test(rest)) {
      minutes = 60
      rest = rest.replace(/(ساعة|ساعه)/, ' ')
    } else {
      const m = rest.match(/\(?\s*(\d{1,3})\s*(m|min|mins|minute|minutes|د|دقيقة|دقيقه|دقائق)?\s*\)?\s*$/i) ?? rest.match(/(\d{1,3})\s*(m|min|mins|minutes|د|دقيقة|دقيقه|دقائق)(?=$|[\s)\].,:،؛])/i)
      if (m) {
        minutes = parseInt(m[1], 10)
        rest = rest.replace(m[0], ' ')
      }
    }
    const name = rest.replace(/[()[\]]/g, ' ').replace(/\s*[-–—:|]\s*$/, '').replace(/^\s*[-–—:|]\s*/, '').replace(/\s{2,}/g, ' ').trim()
    const isBreak = BREAK.test(name) || (!name && minutes != null && minutes <= 20)
    if (!name && minutes == null) continue
    out.push({
      id: uid(),
      type: isBreak ? 'break' : 'task',
      name,
      description: '',
      duration: Math.max(1, Math.min(600, minutes ?? (isBreak ? 10 : 45))),
      timed: true,
    })
  }
  return out
}
