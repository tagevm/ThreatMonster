import { api } from './api'
import { download, suggestedName } from './files'
import { useModel } from './store/modelStore'

export async function openHtmlReport() {
  // Open the tab synchronously, while we still have the user gesture, so pop-up blockers allow it.
  const tab = window.open('', '_blank')
  tab?.document.write('<p style="font-family:system-ui;padding:2rem">Generating report…</p>')
  try {
    const html = await api.htmlReport(useModel.getState().model)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    if (tab) tab.location.href = url
    else download(html, reportName('html'), 'text/html')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    tab?.close()
    throw e
  }
}

export async function downloadMarkdownReport() {
  const md = await api.markdownReport(useModel.getState().model)
  download(md, reportName('md'), 'text/markdown')
}

function reportName(ext: string) {
  return suggestedName(useModel.getState().model).replace(/\.tm\.json$/, `-report.${ext}`)
}
