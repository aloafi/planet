# planet

One task. One screen. One action.

Planet turns your day into a timeline of tasks and breaks, then shows you only the
current one — with a countdown and a big **Finish** button. The system handles the
sequence; you handle the execution.

## Screens

- **Now** — the current task in large type, its timer, and Finish. Pause, Extend and
  Skip sit underneath. Breaks get their own screen with a preview of the next task.
- **Plan** — build the timeline: add, edit, reorder (drag the handle), insert breaks,
  timed or untimed tasks, and reusable templates.
- **Day** — the whole day at a glance: completed, current, upcoming, skipped.
- **Summary** — tasks completed, focused time, break time, completion, and what was left.

## Behaviour

- Finishing and running out of time are different events. When a task's time is up
  you choose: extend, skip, keep going, or finish.
- Breaks end on their own and the next task starts (configurable).
- Timers are stored as timestamps, so they stay exact after a refresh, a closed tab or
  a sleeping phone.
- Everything is saved in the browser (localStorage). No account needed.

Keyboard: `Enter` finish · `Space` pause/resume · `E` +5 min · `S` skip.

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # engine unit tests
npm run build    # production build in dist/
```

Built with React, TypeScript, Vite and dnd-kit. Deploys to Vercel as a static site.
