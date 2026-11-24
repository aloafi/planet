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

## Events, AI and sharing

- **Events** — link a day's schedule to what it works toward (an exam, a deadline). The
  countdown shows on the plan, the start screen, the overview and the summary.
- **Forecast** — on the Plan screen, one tap asks the AI what this plan will get done if
  you follow it, with one practical tip for the event.
- **Recap** — when the day ends, the AI writes a short story of the day from your task
  names, what you finished, skipped and how long each took, plus one suggestion for tomorrow.
- **Share image** — the summary becomes a 1080×1350 image (planet, stats, tasks, recap)
  to share, download or copy. Arabic task names are laid out right-to-left.

The AI runs through the `planet-ai` Supabase Edge Function
(`supabase/functions/planet-ai`) on Claude Haiku, using the Anthropic key already stored
in Supabase. Only task names, durations, statuses and event names are sent. AI can be
turned off in Settings.

## Behaviour

- Finishing and running out of time are different events. When a task's time is up
  you choose: extend, skip, keep going, or finish.
- Breaks end on their own and the next task starts (configurable).
- Timers are stored as timestamps, so they stay exact after a refresh, a closed tab or
  a sleeping phone.
- Works without an account (saved on the device). Sign in / Sign up (Supabase Auth)
  saves everything to your account — table `planet_state`, one JSON document per user,
  protected by row-level security — and keeps every signed-in device in sync. A copy
  stays on the device so it works offline; the most recently changed copy wins.

Keyboard: `Enter` finish · `Space` pause/resume · `E` +5 min · `S` skip.

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # engine unit tests
npm run build    # production build in dist/
```

Built with React, TypeScript, Vite and dnd-kit. Deploys to Vercel as a static site.
