// src/renderer/src/lib/constants.js
//
// Mirrors LEAD_STATUSES from src/main/constants.js. Duplicated (rather than
// imported across the main/renderer boundary) since the renderer bundle is
// built separately by Vite and has no access to Node/Electron main-process
// modules — this keeps the two tiny lists in sync by convention.
export const LEAD_STATUSES = ['new', 'contacted', 'replied', 'won', 'dead']

// Display metadata for the pipeline board — one entry per LEAD_STATUSES
// value, in the order columns should render. Kept as a single source of
// truth so adding a stage later is a one-line change here rather than a
// hunt through every component that renders a status.
export const PIPELINE_STAGES = [
  { status: 'new', label: 'New', accent: 'var(--text-3)' },
  { status: 'contacted', label: 'Contacted', accent: 'var(--yellow)' },
  { status: 'replied', label: 'Replied', accent: 'var(--brand)' },
  { status: 'won', label: 'Won', accent: 'var(--green)' },
  { status: 'dead', label: 'Dead', accent: 'var(--red)' }
]

// How many cards a pipeline column fetches per "page" — kept small so a
// column with thousands of leads in one stage still renders instantly;
// "Load more" fetches another page rather than the whole stage at once.
export const PIPELINE_PAGE_SIZE = 30

// Row page size for the flat table view, for the same reason.
export const TABLE_PAGE_SIZE = 100
