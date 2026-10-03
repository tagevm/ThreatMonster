import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Finding } from '../model/types'
import { useModel } from '../store/modelStore'

/** Completeness findings from the server, refreshed shortly after the model stops changing. */
export function useFindings(): Finding[] | undefined {
  const model = useModel((s) => s.model)
  const [findings, setFindings] = useState<Finding[]>()

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      api
        .analysis(model)
        .then((f) => !cancelled && setFindings(f))
        .catch(() => !cancelled && setFindings(undefined))
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [model])

  return findings
}
