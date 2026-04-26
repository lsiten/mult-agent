import type { HistoricalEvent } from '../../types/types'

export function downloadHistoryExport(
  task: string,
  createdAt: number,
  history: HistoricalEvent[]
): void {
  const data = {
    task,
    createdAt: new Date(createdAt).toISOString(),
    exportedAt: new Date().toISOString(),
    history,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `page-agent-history-${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
