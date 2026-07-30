// src/renderer/src/lib/constants.js
//
// Mirrors LEAD_STATUSES from src/main/constants.js. Duplicated (rather than
// imported across the main/renderer boundary) since the renderer bundle is
// built separately by Vite and has no access to Node/Electron main-process
// modules — this keeps the two tiny lists in sync by convention.
export const LEAD_STATUSES = ['new', 'contacted', 'replied', 'won', 'dead']
