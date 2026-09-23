// Browser smoke check — paste this whole file as the `text` of one Claude Browser
// `javascript_tool` call (action "javascript_exec"). It replaces the ~20-step manual walk.
//
// Setup first: open http://localhost:5173/?demo=1 (dev server) — that loads the demo year and
// skips onboarding. Then run this. It clicks every tab by JS (works while the pane is hidden),
// and returns JSON: each tab's title, whether the crash screen appeared, the Service tab's card
// order, the Report submit card, and any "Refused to" CSP messages captured while it ran.
//
// Healthy result: every tab has a title, crashed:false everywhere, serviceOrder starts with
// log-time-cta / timer-card / minute-bank-row / card highlight, and cspRefusals is empty.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const refusals = []
  const origError = console.error
  console.error = (...a) => { const s = a.join(' '); if (/Refused to/.test(s)) refusals.push(s.slice(0, 160)); origError(...a) }
  const crashed = () => /Something went wrong/.test(document.body.innerText)
  const out = { tabs: {} }

  for (const key of ['contacts', 'schedule', 'map', 'reports', 'misc']) {
    const btn = document.querySelector(`[data-tutorial="tab-${key}"]`)
    if (!btn) { out.tabs[key] = { missing: true }; continue }
    btn.click()
    await wait(1600)
    window.scrollTo(0, 0)
    out.tabs[key] = {
      title: document.querySelector('.applet-title')?.textContent?.trim() ?? null,
      crashed: crashed(),
      listItems: document.querySelectorAll('.list-item').length,
    }
    if (key === 'schedule') {
      out.serviceOrder = [...document.querySelectorAll('.view > *')].map((el) => String(el.className || el.tagName).split(' ').slice(0, 2).join(' '))
      out.paceLine = document.querySelector('.pace-line')?.textContent ?? null
    }
    if (key === 'reports') {
      out.submitCard = document.querySelector('.report-submit')?.innerText.replace(/\n+/g, ' | ').slice(0, 200) ?? null
    }
  }

  console.error = origError
  out.cspRefusals = refusals
  out.ok = Object.values(out.tabs).every((t) => !t.missing && !t.crashed && t.title) && refusals.length === 0
  return out
})()
