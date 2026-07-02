'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface ImportJob {
  id: string
  kind: string
  status: string
  rows_processed: number
  rows_failed: number
  errors?: unknown
  created_at: string
}

interface ParsedRow {
  full_name?: string
  email?: string
  level?: string
  hire_date?: string
  salary?: string | number
  performance_rating?: string | number
  department?: string
  location?: string
  role?: string
  status?: string
  [k: string]: unknown
}

const SAMPLE_CSV = `full_name,email,level,hire_date,salary,performance_rating,department,location,role,status
Ada Lovelace,ada@example.com,Senior,2021-03-15,165000,4.6,Engineering,London,Staff Engineer,active
Grace Hopper,grace@example.com,Principal,2019-08-01,210000,4.9,Engineering,Remote,Principal Engineer,active
Alan Turing,alan@example.com,Mid,2022-11-20,128000,3.8,Data Science,Manchester,Data Scientist,active`

function statusTone(status: string) {
  const s = status.toLowerCase()
  if (s === 'completed' || s === 'success' || s === 'done') return 'green'
  if (s === 'failed' || s === 'error') return 'rose'
  if (s === 'running' || s === 'processing' || s === 'pending') return 'amber'
  return 'neutral'
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

// Minimal CSV parser supporting quoted fields and commas inside quotes.
function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const splitLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          cur += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    out.push(cur)
    return out.map((c) => c.trim())
  }

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase())
  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    const row: ParsedRow = {}
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

function normalizeRows(rows: ParsedRow[]): ParsedRow[] {
  return rows.map((r) => {
    const out: ParsedRow = { ...r }
    if (out.salary !== undefined && out.salary !== '') out.salary = Number(out.salary)
    if (out.performance_rating !== undefined && out.performance_rating !== '') {
      out.performance_rating = Number(out.performance_rating)
    }
    return out
  })
}

export default function ImportsPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // CSV import state
  const [csvText, setCsvText] = useState('')
  const [parsed, setParsed] = useState<{ headers: string[]; rows: ParsedRow[] } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Manual add modal
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState({
    full_name: '',
    email: '',
    level: '',
    hire_date: '',
    salary: '',
    performance_rating: '',
    status: 'active',
  })
  const [manualError, setManualError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listImportJobs()
      setJobs(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load import jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 4000)
  }

  const stats = useMemo(() => {
    const total = jobs.length
    const processed = jobs.reduce((a, j) => a + (j.rows_processed || 0), 0)
    const failed = jobs.reduce((a, j) => a + (j.rows_failed || 0), 0)
    const completed = jobs.filter((j) => statusTone(j.status) === 'green').length
    return { total, processed, failed, completed }
  }, [jobs])

  const handleParse = (text: string) => {
    setCsvText(text)
    setParseError(null)
    if (!text.trim()) {
      setParsed(null)
      return
    }
    try {
      const result = parseCsv(text)
      if (!result.headers.includes('full_name')) {
        setParseError('CSV must include a "full_name" column header.')
        setParsed(null)
        return
      }
      setParsed(result)
    } catch {
      setParseError('Could not parse CSV. Check the format.')
      setParsed(null)
    }
  }

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => handleParse(String(reader.result ?? ''))
    reader.onerror = () => setParseError('Could not read file.')
    reader.readAsText(file)
  }

  const runImport = async () => {
    if (!parsed || parsed.rows.length === 0) return
    setBusy('import')
    setError(null)
    try {
      const rows = normalizeRows(parsed.rows)
      await api.importEmployees({ rows })
      flash(`Imported ${rows.length} row(s). Job queued.`)
      setCsvText('')
      setParsed(null)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(null)
    }
  }

  const runSeed = async () => {
    setBusy('seed')
    setError(null)
    try {
      await api.seedSample()
      flash('Sample org seeded (200-person dataset). Risk + costs can now be computed.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seeding failed')
    } finally {
      setBusy(null)
    }
  }

  const submitManual = async () => {
    setManualError(null)
    if (!manual.full_name.trim()) {
      setManualError('Full name is required.')
      return
    }
    setBusy('manual')
    try {
      const body: Record<string, unknown> = {
        full_name: manual.full_name.trim(),
        status: manual.status,
      }
      if (manual.email.trim()) body.email = manual.email.trim()
      if (manual.level.trim()) body.level = manual.level.trim()
      if (manual.hire_date) body.hire_date = manual.hire_date
      if (manual.salary) body.salary = Number(manual.salary)
      if (manual.performance_rating) body.performance_rating = Number(manual.performance_rating)
      await api.addEmployeeManual(body)
      flash(`Added ${manual.full_name.trim()}.`)
      setManualOpen(false)
      setManual({ full_name: '', email: '', level: '', hire_date: '', salary: '', performance_rating: '', status: 'active' })
      await load()
    } catch (e) {
      setManualError(e instanceof Error ? e.message : 'Could not add employee')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <PageSpinner label="Loading imports..." />

  const previewCols = parsed ? parsed.headers.slice(0, 8) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Imports &amp; Data</h1>
          <p className="mt-1 text-sm text-stone-500">
            Load your workforce: bulk CSV import, a one-click sample org, or add people manually.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setManualOpen(true)}>
            + Add employee
          </Button>
          <Button onClick={runSeed} disabled={busy !== null}>
            {busy === 'seed' ? 'Seeding…' : 'Seed sample org'}
          </Button>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Import jobs" value={stats.total} />
        <Stat label="Completed" value={stats.completed} tone="green" />
        <Stat label="Rows processed" value={stats.processed.toLocaleString()} tone="amber" />
        <Stat label="Rows failed" value={stats.failed.toLocaleString()} tone={stats.failed > 0 ? 'rose' : 'default'} />
      </div>

      {/* CSV import */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">CSV import</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Headers: full_name (required), email, level, hire_date, salary, performance_rating, department, location, role, status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleParse(SAMPLE_CSV)}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            Use example
          </button>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
              }}
              className="block text-sm text-stone-400 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-200 hover:file:bg-stone-700"
            />
            <span className="text-xs text-stone-600">or paste below</span>
          </div>
          <textarea
            value={csvText}
            onChange={(e) => handleParse(e.target.value)}
            rows={6}
            placeholder={SAMPLE_CSV}
            className="w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 font-mono text-xs text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/50 focus:outline-none"
          />

          {parseError && <p className="text-sm text-rose-400">{parseError}</p>}

          {parsed && parsed.rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-stone-400">
                <Badge tone="moderate">{parsed.rows.length} rows parsed</Badge>
                <span className="text-xs text-stone-600">Preview (first 5)</span>
              </div>
              <Table>
                <THead>
                  <TR>
                    {previewCols.map((c) => (
                      <TH key={c}>{c}</TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {parsed.rows.slice(0, 5).map((r, i) => (
                    <TR key={i}>
                      {previewCols.map((c) => (
                        <TD key={c} className="whitespace-nowrap text-xs">
                          {String(r[c] ?? '')}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="flex justify-end">
                <Button onClick={runImport} disabled={busy !== null}>
                  {busy === 'import' ? 'Importing…' : `Import ${parsed.rows.length} employees`}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Job history */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Import history</h2>
          <Button variant="ghost" onClick={load}>
            Refresh
          </Button>
        </CardHeader>
        <CardBody>
          {jobs.length === 0 ? (
            <EmptyState
              title="No imports yet"
              description="Import a CSV or seed the sample org to populate your dataset."
              action={
                <Button onClick={runSeed} disabled={busy !== null}>
                  Seed sample org
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Kind</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Processed</TH>
                  <TH className="text-right">Failed</TH>
                  <TH>Errors</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {jobs.map((j) => {
                  const errs = Array.isArray(j.errors) ? j.errors : j.errors ? [j.errors] : []
                  return (
                    <TR key={j.id}>
                      <TD className="font-medium">{j.kind}</TD>
                      <TD>
                        <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums">{j.rows_processed ?? 0}</TD>
                      <TD className={`text-right tabular-nums ${j.rows_failed ? 'text-rose-400' : ''}`}>
                        {j.rows_failed ?? 0}
                      </TD>
                      <TD className="max-w-xs">
                        {errs.length === 0 ? (
                          <span className="text-stone-600">—</span>
                        ) : (
                          <span className="text-xs text-rose-400" title={JSON.stringify(errs)}>
                            {errs.length} issue(s)
                          </span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-stone-500">{fmtDate(j.created_at)}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Manual add */}
      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Add employee"
        footer={
          <>
            <Button variant="secondary" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitManual} disabled={busy === 'manual'}>
              {busy === 'manual' ? 'Adding…' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {manualError && <p className="text-sm text-rose-400">{manualError}</p>}
          <Field label="Full name *">
            <input
              value={manual.full_name}
              onChange={(e) => setManual({ ...manual, full_name: e.target.value })}
              className={inputCls}
              placeholder="Jane Doe"
            />
          </Field>
          <Field label="Email">
            <input
              value={manual.email}
              onChange={(e) => setManual({ ...manual, email: e.target.value })}
              className={inputCls}
              placeholder="jane@example.com"
              type="email"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Level">
              <input
                value={manual.level}
                onChange={(e) => setManual({ ...manual, level: e.target.value })}
                className={inputCls}
                placeholder="Senior"
              />
            </Field>
            <Field label="Hire date">
              <input
                value={manual.hire_date}
                onChange={(e) => setManual({ ...manual, hire_date: e.target.value })}
                className={inputCls}
                type="date"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary">
              <input
                value={manual.salary}
                onChange={(e) => setManual({ ...manual, salary: e.target.value })}
                className={inputCls}
                type="number"
                placeholder="120000"
              />
            </Field>
            <Field label="Performance rating">
              <input
                value={manual.performance_rating}
                onChange={(e) => setManual({ ...manual, performance_rating: e.target.value })}
                className={inputCls}
                type="number"
                step="0.1"
                placeholder="4.2"
              />
            </Field>
          </div>
          <Field label="Status">
            <select
              value={manual.status}
              onChange={(e) => setManual({ ...manual, status: e.target.value })}
              className={inputCls}
            >
              <option value="active">active</option>
              <option value="on_leave">on_leave</option>
              <option value="exited">exited</option>
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-indigo-500/50 focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-400">{label}</span>
      {children}
    </label>
  )
}
