import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVertical } from '../lib/dnd'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../lib/store'
import { parseHM, scheduleOf, sessionBlocks, sessionNumber, statusOf, uid } from '../lib/engine'
import { hm, human, minutesLabel } from '../lib/format'
import { go } from '../lib/route'
import { planetFx } from '../lib/fx'
import { EventField } from './Events'
import { ForecastCard } from './Insights'
import { fmtDate, nBreaks, nTasks, t as tx } from '../lib/i18n'
import type { Block, BlockType } from '../lib/types'

export function Plan() {
  const { state, act, undoable } = useStore()
  const { plan, run } = state
  const [editing, setEditing] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const sched = scheduleOf(plan)
  const totalMin = plan.blocks.reduce((a, b) => a + b.duration, 0)
  const tasks = plan.blocks.filter((b) => b.type === 'task').length
  const breaks = plan.blocks.filter((b) => b.type === 'break').length
  const start = parseHM(plan.startTime)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = plan.blocks.findIndex((b) => b.id === active.id)
    const to = plan.blocks.findIndex((b) => b.id === over.id)
    if (from < 0 || to < 0) return
    act({ type: 'MOVE_BLOCK', from, to })
  }

  const insert = (type: BlockType, index: number) => {
    const block = newBlock(type)
    act({ type: 'ADD_BLOCK', block, index })
    setEditing(block.id)
    setFresh(block.id)
  }

  return (
    <main className="page plan">
      <header className="page-head">
        <span className="eyebrow">{tx('timeline')}</span>
        <h1 className="page-title">{tx('plan')}</h1>
        <div className="plan-event">
          <EventField />
        </div>
        <p className="page-sub plan-sub">
          <label className="start-field">
            {tx('starts')}
            <input
              type="time"
              value={plan.startTime}
              onChange={(e) => e.target.value && act({ type: 'SET_START_TIME', value: e.target.value })}
              aria-label={tx('dayStart')}
            />
          </label>
          {plan.blocks.length > 0 && (
            <span>
              {nTasks(tasks)} · {nBreaks(breaks)} · {human(totalMin * 60_000)} · {tx('ends', { t: hm(start + totalMin) })}
            </span>
          )}
        </p>
      </header>

      {plan.blocks.length === 0 ? (
        <div className="plan-empty">
          <p>{tx('planEmpty')}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVertical]}>
          <SortableContext items={plan.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <ol className="plan-list">
              {sched.map(({ block, start }, i) => (
                <Row
                  key={block.id}
                  block={block}
                  start={start}
                  status={run.phase === 'active' && run.currentId === block.id ? 'current' : statusOf(run, block.id)}
                  editing={editing === block.id}
                  autoFocus={fresh === block.id}
                  onToggle={() => {
                    setEditing(editing === block.id ? null : block.id)
                    setFresh(null)
                  }}
                  onClose={() => {
                    setEditing(null)
                    setFresh(null)
                  }}
                  onInsert={(type) => insert(type, i + 1)}
                  onDelete={() => undoable({ type: 'DELETE_BLOCK', id: block.id }, tx('deletedToast', { name: block.name || (block.type === 'break' ? tx('break') : block.type === 'session' ? tx('session') : tx('untitled')) }))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <QuickAdd />

      <ForecastCard />

      {plan.blocks.length > 0 && run.phase !== 'active' && (
        <div className="page-actions">
          <button className="primary compact" onClick={(e) => {
            if (run.phase === 'idle') {
              planetFx('launch', e.currentTarget, plan.blocks.find((b) => statusOf(run, b.id) === 'pending')?.type === 'break' ? 'break' : 'task')
              act({ type: 'START_DAY' })
            }
            go('now')
          }}>
            {run.phase === 'idle' ? (Object.keys(run.records).length ? tx('continue') : tx('startDay')) : tx('viewSummary')}
          </button>
        </div>
      )}
      {run.phase === 'active' && (
        <div className="page-actions">
          <button className="primary compact" onClick={() => go('now')}>{tx('backToCurrent')}</button>
        </div>
      )}

      <Templates />
      <Danger />
    </main>
  )
}

function newBlock(type: BlockType, name = '', duration?: number): Block {
  return {
    id: uid(),
    type,
    name: type === 'break' && !name ? tx('break') : name,
    description: '',
    duration: type === 'session' ? 0 : duration ?? (type === 'break' ? 10 : 45),
    timed: true,
  }
}

/* ---------- a single timeline block ---------- */

function Row(props: {
  block: Block
  start: number
  status: 'pending' | 'completed' | 'skipped' | 'current'
  editing: boolean
  autoFocus: boolean
  onToggle: () => void
  onClose: () => void
  onInsert: (t: BlockType) => void
  onDelete: () => void
}) {
  const { block: b, start, status, editing } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } = useSortable({ id: b.id })
  const style = { transform: CSS.Translate.toString(transform), transition }
  const { state } = useStore()

  if (b.type === 'session') {
    const members = sessionBlocks(state.plan, b.id)
    const mins = members.reduce((a, x) => a + x.duration, 0)
    const label = b.name.trim() || tx('sessionN', { n: sessionNumber(state.plan, b.id) })
    return (
      <li ref={setNodeRef} style={style} className={`pl-row pl-session ${editing ? 'is-editing' : ''} ${isDragging ? 'is-dragging' : ''}`}>
        <div className="pl-line">
          <button ref={setActivatorNodeRef} className="handle" aria-label={tx('reorder', { name: label })} {...attributes} {...listeners}>
            <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
              {[3, 8, 13].map((y) => (
                <g key={y}>
                  <circle cx="2.5" cy={y} r="1.3" />
                  <circle cx="7.5" cy={y} r="1.3" />
                </g>
              ))}
            </svg>
          </button>
          <span className="pl-time" dir="ltr">{hm(start)}</span>
          <button className="pl-name" onClick={props.onToggle} aria-expanded={editing}>
            <span className="pl-title">{label}</span>
          </button>
          <span className="pl-dur">{tx('sessionMeta', { tasks: nTasks(members.filter((x) => x.type === 'task').length), time: human(mins * 60_000) })}</span>
          <span className="pl-status" />
        </div>
        {editing && <SessionEditor block={b} placeholder={tx('sessionN', { n: sessionNumber(state.plan, b.id) })} onClose={props.onClose} />}
        {!editing && (
          <div className="pl-insert">
            <button onClick={() => props.onInsert('task')}>{tx('addTaskHere')}</button>
            <button onClick={() => props.onInsert('break')}>{tx('addBreakHere')}</button>
            <button className="pl-del" onClick={props.onDelete}>{tx('delete')}</button>
          </div>
        )}
      </li>
    )
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`pl-row pl-${b.type} st-${status} ${editing ? 'is-editing' : ''} ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="pl-line">
        <button ref={setActivatorNodeRef} className="handle" aria-label={tx('reorder', { name: b.name || b.type })} {...attributes} {...listeners}>
          <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
            {[3, 8, 13].map((y) => (
              <g key={y}>
                <circle cx="2.5" cy={y} r="1.3" />
                <circle cx="7.5" cy={y} r="1.3" />
              </g>
            ))}
          </svg>
        </button>
        <span className="pl-time" dir="ltr">{hm(start)}</span>
        <button className="pl-name" onClick={props.onToggle} aria-expanded={editing}>
          <span className="pl-title">{b.type === 'break' ? b.name || tx('break') : b.name || <em>{tx('untitled')}</em>}</span>
          {b.description && !editing && <span className="pl-desc">{b.description}</span>}
        </button>
        <span className="pl-dur">{b.type === 'task' && !b.timed ? tx('untimed') : minutesLabel(b.duration)}</span>
        <span className={`pl-status st-${status}`} title={status === 'pending' ? '' : status}>
          {status === 'completed' ? tx('done') : status === 'skipped' ? tx('skipped') : status === 'current' ? tx('nowState') : ''}
        </span>
      </div>
      {editing && <Editor block={b} autoFocus={props.autoFocus} onClose={props.onClose} onInsert={props.onInsert} />}
      {!editing && (
        <div className="pl-insert">
          <button onClick={() => props.onInsert('task')}>{tx('addTaskHere')}</button>
          <button onClick={() => props.onInsert('break')}>{tx('addBreakHere')}</button>
          <button onClick={() => props.onInsert('session')}>{tx('addSessionHere')}</button>
          <button className="pl-del" onClick={props.onDelete}>{tx('delete')}</button>
        </div>
      )}
    </li>
  )
}

function SessionEditor({ block: b, placeholder, onClose }: { block: Block; placeholder: string; onClose: () => void }) {
  const { act } = useStore()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div className="editor" onKeyDown={(e) => (e.key === 'Escape' || e.key === 'Enter') && onClose()}>
      <label className="field">
        <span>{tx('sessionName')}</span>
        <input ref={ref} value={b.name} placeholder={placeholder} dir="auto" maxLength={40} onChange={(e) => act({ type: 'UPDATE_BLOCK', id: b.id, patch: { name: e.target.value } })} />
      </label>
      <div className="editor-actions">
        <button className="link danger" onClick={() => act({ type: 'DELETE_BLOCK', id: b.id })}>{tx('delete')}</button>
        <button className="chip solid" onClick={onClose}>{tx('done')}</button>
      </div>
    </div>
  )
}

function Editor({ block: b, autoFocus, onClose, onInsert }: { block: Block; autoFocus: boolean; onClose: () => void; onInsert: (t: BlockType) => void }) {
  const { act } = useStore()
  const [confirmDel, setConfirmDel] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const update = (patch: Partial<Block>) => act({ type: 'UPDATE_BLOCK', id: b.id, patch })
  const [dur, setDur] = useState(String(b.duration))
  useEffect(() => setDur(String(b.duration)), [b.duration])
  useEffect(() => {
    if (autoFocus) nameRef.current?.focus()
  }, [autoFocus])

  const commitDur = (v: string) => {
    const n = Math.round(Number(v))
    if (Number.isFinite(n) && n > 0) update({ duration: n })
    else setDur(String(b.duration))
  }
  const bump = (d: number) => update({ duration: Math.max(1, b.duration + d) })

  return (
    <div
      className="editor"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') onClose()
      }}
    >
      <div className="field-row">
        <Segment
          value={b.type}
          options={[
            ['task', tx('task')],
            ['break', tx('break')],
          ]}
          onChange={(v) => update({ type: v as BlockType, ...(v === 'break' && !b.name ? { name: tx('break') } : {}), ...(v === 'task' && (b.name === 'Break' || b.name === 'استراحة') ? { name: '' } : {}) })}
          label={tx('blockType')}
        />
        {b.type === 'task' && (
          <Segment
            value={b.timed ? 'timed' : 'untimed'}
            options={[
              ['timed', tx('timed')],
              ['untimed', tx('untimed')],
            ]}
            onChange={(v) => update({ timed: v === 'timed' })}
            label={tx('timing')}
          />
        )}
      </div>

      <label className="field">
        <span>{tx('name')}</span>
        <input ref={nameRef} value={b.name} placeholder={b.type === 'break' ? tx('break') : tx('whatWillYouDo')} dir="auto" onChange={(e) => update({ name: e.target.value })} maxLength={80} />
      </label>

      <label className="field">
        <span>{tx('description')} <i>{tx('optional')}</i></span>
        <textarea rows={2} value={b.description} placeholder={tx('shortNote')} dir="auto" onChange={(e) => update({ description: e.target.value })} maxLength={200} />
      </label>

      <div className="field">
        <span>{b.type === 'task' && !b.timed ? tx('estimate') : tx('duration')}</span>
        <div className="stepper">
          <button onClick={() => bump(-5)} aria-label={tx('lessMin')}>−</button>
          <input
            inputMode="numeric"
            value={dur}
            onChange={(e) => setDur(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={(e) => commitDur(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitDur((e.target as HTMLInputElement).value)}
            aria-label={tx('durationMin')}
          />
          <span className="unit">{tx('min')}</span>
          <button onClick={() => bump(5)} aria-label={tx('moreMin')}>+</button>
        </div>
      </div>

      <div className="editor-actions">
        <button className="link" onClick={() => onInsert('break')}>{tx('insertBreakAfter')}</button>
        {confirmDel ? (
          <span className="confirm">
            <button className="link danger" onClick={() => act({ type: 'DELETE_BLOCK', id: b.id })}>{tx('delete')}</button>
            <button className="link quiet" onClick={() => setConfirmDel(false)}>{tx('keep')}</button>
          </span>
        ) : (
          <button className="link danger" onClick={() => setConfirmDel(true)}>{tx('delete')}</button>
        )}
        <button className="chip solid" onClick={onClose}>{tx('done')}</button>
      </div>
    </div>
  )
}

function Segment({ value, options, onChange, label }: { value: string; options: [string, string][]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="segment" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/* ---------- fast entry ---------- */

function QuickAdd() {
  const { act } = useStore()
  const [name, setName] = useState('')
  const [dur, setDur] = useState('45')
  const inputRef = useRef<HTMLInputElement>(null)

  const add = () => {
    const n = name.trim()
    if (!n) {
      inputRef.current?.focus()
      return
    }
    const d = Math.max(1, Math.round(Number(dur) || 45))
    act({ type: 'ADD_BLOCK', block: newBlock('task', n, d) })
    setName('')
    inputRef.current?.focus()
  }

  return (
    <div className="quickadd">
      <input
        ref={inputRef}
        className="qa-name"
        value={name}
        placeholder={tx('addATask')}
        dir="auto"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
        maxLength={80}
        aria-label={tx('newTaskName')}
      />
      <label className="qa-dur">
        <input inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label={tx('newTaskDur')} />
        <span>{tx('min')}</span>
      </label>
      <button className="chip solid" onClick={add}>{tx('addTask')}</button>
      <button className="chip" onClick={() => act({ type: 'ADD_BLOCK', block: newBlock('break') })}>{tx('addBreak')}</button>
      <button className="chip" onClick={() => act({ type: 'ADD_BLOCK', block: newBlock('session') })}>{tx('addSession')}</button>
    </div>
  )
}

/* ---------- templates ---------- */

function Templates() {
  const { state, act } = useStore()
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const inProgress = state.run.phase === 'active' || Object.keys(state.run.records).length > 0
  const exists = state.templates.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())

  const save = () => {
    if (!state.plan.blocks.length) return
    const n = name.trim() || defaultName()
    act({ type: 'SAVE_TEMPLATE', name: n })
    setName('')
    setSaved(n)
    window.setTimeout(() => setSaved(null), 2500)
  }

  const load = (id: string) => {
    act({ type: 'LOAD_TEMPLATE', id })
    setConfirm(null)
  }

  return (
    <section className="templates">
      <h2 className="section-title">{tx('templates')}</h2>
      <p className="section-note">{tx('templatesNote')}</p>
      <div className="tpl-save">
        <input value={name} placeholder={defaultName()} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} maxLength={40} aria-label={tx('templateName')} dir="auto" />
        <button className="chip" onClick={save} disabled={!state.plan.blocks.length}>
          {exists ? tx('updateTemplate') : tx('saveTemplate')}
        </button>
        {saved && <span className="saved">{tx('savedX', { name: saved })}</span>}
      </div>

      {state.templates.length > 0 && (
        <ul className="tpl-list">
          {state.templates.map((t) => {
            const mins = t.blocks.reduce((a, b) => a + b.duration, 0)
            const n = t.blocks.filter((b) => b.type === 'task').length
            return (
              <li key={t.id}>
                <div className="tpl-info">
                  <span className="tpl-name">{t.name}</span>
                  <span className="tpl-meta">
                    {nTasks(n)} · {human(mins * 60_000)} · {tx('fromTime', { t: t.startTime })}
                  </span>
                </div>
                {confirm === t.id ? (
                  <span className="confirm">
                    {inProgress ? tx('replacesProgress') : tx('replacesPlan')}
                    <button className="link" onClick={() => load(t.id)}>{tx('load')}</button>
                    <button className="link quiet" onClick={() => setConfirm(null)}>{tx('cancel')}</button>
                  </span>
                ) : confirm === `del-${t.id}` ? (
                  <span className="confirm">
                    <button className="link danger" onClick={() => act({ type: 'DELETE_TEMPLATE', id: t.id })}>{tx('deleteTemplate')}</button>
                    <button className="link quiet" onClick={() => setConfirm(null)}>{tx('cancel')}</button>
                  </span>
                ) : (
                  <span className="tpl-actions">
                    <button className="link" onClick={() => (state.plan.blocks.length ? setConfirm(t.id) : load(t.id))}>{tx('load')}</button>
                    <button className="link quiet" onClick={() => setConfirm(`del-${t.id}`)}>{tx('delete')}</button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function defaultName() {
  return fmtDate(Date.now(), { weekday: 'long' })
}

function Danger() {
  const { state, act } = useStore()
  const [c, setC] = useState<'reset' | 'clear' | null>(null)
  if (!state.plan.blocks.length) return null
  const hasProgress = state.run.phase !== 'idle' || Object.keys(state.run.records).length > 0
  return (
    <div className="danger-zone">
      {c ? (
        <span className="confirm">
          {c === 'clear' ? tx('clearQ') : tx('resetQ')}
          <button className="link danger" onClick={() => {
            act(c === 'clear' ? { type: 'SET_BLOCKS', blocks: [] } : { type: 'RESET_DAY' })
            setC(null)
          }}>
            {c === 'clear' ? tx('clearTimeline') : tx('resetBtn')}
          </button>
          <button className="link quiet" onClick={() => setC(null)}>{tx('cancel')}</button>
        </span>
      ) : (
        <>
          {hasProgress && <button className="link quiet" onClick={() => setC('reset')}>{tx('resetProgress')}</button>}
          <button className="link quiet" onClick={() => setC('clear')}>{tx('clearTimeline')}</button>
        </>
      )}
    </div>
  )
}

