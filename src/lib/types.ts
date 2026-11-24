export type BlockType = 'task' | 'break'

export interface Block {
  id: string
  type: BlockType
  name: string
  description: string
  /** minutes */
  duration: number
  /** untimed tasks count up instead of down and never expire */
  timed: boolean
}

export interface Plan {
  /** HH:MM, used to show clock times on the timeline */
  startTime: string
  blocks: Block[]
}

export interface Template {
  id: string
  name: string
  startTime: string
  blocks: Block[]
  createdAt: number
}

export type BlockStatus = 'pending' | 'completed' | 'skipped'

export interface BlockRecord {
  status: BlockStatus
  /** total time actually spent on this block (ms) */
  spentMs: number
  doneAt?: number
}

export type TimerStatus = 'ready' | 'running' | 'paused'

export interface Timer {
  status: TimerStatus
  /** epoch ms of the moment the current running stretch began */
  startedAt: number | null
  /** elapsed ms accumulated before startedAt */
  elapsedMs: number
  /** extra ms added with Extend */
  extendMs: number
  /** the time-up alert (sound/notification) has fired for this stretch */
  alerted: boolean
  /** user chose "keep going" after time ran out */
  overtimeAck: boolean
}

export type Phase = 'idle' | 'active' | 'done'

export interface Run {
  date: string
  phase: Phase
  currentId: string | null
  records: Record<string, BlockRecord>
  timer: Timer
  startedAt: number | null
  endedAt: number | null
  /** true when the day was ended manually before every block was handled */
  endedEarly: boolean
}

export interface Settings {
  /** start the next block's timer right after Finish / Skip */
  autoStartNext: boolean
  /** what happens when a break's countdown reaches zero */
  breakEnd: 'auto' | 'wait'
  /** what happens when a task's countdown reaches zero */
  taskEnd: 'ask' | 'overtime'
  sound: boolean
  notify: boolean
  wakeLock: boolean
  theme: 'dark' | 'light'
}

export interface AppState {
  version: 1
  plan: Plan
  templates: Template[]
  run: Run
  settings: Settings
}
