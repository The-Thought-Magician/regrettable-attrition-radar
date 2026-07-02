'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { RightRail } from '@/components/RightRail'

interface Department {
  id: string
  name: string
}
interface Location {
  id: string
  name: string
}
interface Role {
  id: string
  title: string
  level?: string
}
interface Employee {
  id: string
  full_name: string
  email?: string | null
  department_id?: string | null
  location_id?: string | null
  role_id?: string | null
  manager_id?: string | null
  level?: string | null
  salary?: number | null
  status: string
  hire_date?: string | null
}

const STATUSES = ['active', 'on_leave', 'exited']

const inputCls =
  'w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white placeholder:text-stone-500 focus:border-indigo-500 focus:outline-none'
const labelCls = 'mb-1 block text-xs font-medium text-stone-400'

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // filters
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [locFilter, setLocFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // create modal
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    department_id: '',
    location_id: '',
    role_id: '',
    manager_id: '',
    level: '',
    salary: '',
    status: 'active',
    hire_date: '',
  })

  // delete state
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [emps, depts, locs, rls] = await Promise.all([
        api.listEmployees(),
        api.listDepartments(),
        api.listLocations(),
        api.listRoles(),
      ])
      setEmployees(Array.isArray(emps) ? emps : [])
      setDepartments(Array.isArray(depts) ? depts : [])
      setLocations(Array.isArray(locs) ? locs : [])
      setRoles(Array.isArray(rls) ? rls : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const deptName = (id?: string | null) => departments.find((d) => d.id === id)?.name ?? '—'
  const locName = (id?: string | null) => locations.find((l) => l.id === id)?.name ?? '—'
  const roleName = (id?: string | null) => roles.find((r) => r.id === id)?.title ?? '—'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (deptFilter && e.department_id !== deptFilter) return false
      if (locFilter && e.location_id !== locFilter) return false
      if (statusFilter && e.status !== statusFilter) return false
      if (q) {
        const hay = `${e.full_name} ${e.email ?? ''} ${e.level ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [employees, search, deptFilter, locFilter, statusFilter])

  function resetForm() {
    setForm({
      full_name: '',
      email: '',
      department_id: '',
      location_id: '',
      role_id: '',
      manager_id: '',
      level: '',
      salary: '',
      status: 'active',
      hire_date: '',
    })
    setFormError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.full_name.trim()) {
      setFormError('Full name is required')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        status: form.status,
      }
      if (form.email.trim()) body.email = form.email.trim()
      if (form.department_id) body.department_id = form.department_id
      if (form.location_id) body.location_id = form.location_id
      if (form.role_id) body.role_id = form.role_id
      if (form.manager_id.trim()) body.manager_id = form.manager_id.trim()
      if (form.level.trim()) body.level = form.level.trim()
      if (form.salary.trim()) body.salary = Number(form.salary)
      if (form.hire_date) body.hire_date = form.hire_date
      await api.createEmployee(body)
      setShowAdd(false)
      resetForm()
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create employee')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this employee? This cannot be undone.')) return
    setDeleting(id)
    try {
      await api.deleteEmployee(id)
      setEmployees((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete employee')
    } finally {
      setDeleting(null)
    }
  }

  function statusTone(status: string) {
    if (status === 'active') return 'green' as const
    if (status === 'exited') return 'rose' as const
    return 'amber' as const
  }

  if (loading) return <PageSpinner label="Loading roster..." />

  return (
    <div className="flex items-start gap-6">
    <div className="min-w-0 flex-1 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="mt-1 text-sm text-stone-400">
            {filtered.length} of {employees.length} employees
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowAdd(true) }}>Add Employee</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-4 text-sm text-rose-300">
          {error}{' '}
          <button onClick={load} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, level..."
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={inputCls}>
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)} className={inputCls}>
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          {(search || deptFilter || locFilter || statusFilter) && (
            <div className="mt-3">
              <button
                onClick={() => { setSearch(''); setDeptFilter(''); setLocFilter(''); setStatusFilter('') }}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Clear filters
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Roster */}
      {employees.length === 0 ? (
        <EmptyState
          title="No employees yet"
          description="Add an employee manually or seed a sample organization from Imports & Data."
          icon="👥"
          action={
            <div className="flex gap-2">
              <Button onClick={() => { resetForm(); setShowAdd(true) }}>Add Employee</Button>
              <Link href="/dashboard/imports"><Button variant="secondary">Import data</Button></Link>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="No employees match the current filters." icon="🔍" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Department</TH>
              <TH>Role</TH>
              <TH>Location</TH>
              <TH>Level</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((e) => (
              <TR key={e.id}>
                <TD>
                  <Link href={`/dashboard/employees/${e.id}`} className="font-medium text-indigo-400 hover:text-indigo-300">
                    {e.full_name}
                  </Link>
                  {e.email && <div className="text-xs text-stone-500">{e.email}</div>}
                </TD>
                <TD className="text-stone-400">{deptName(e.department_id)}</TD>
                <TD className="text-stone-400">{roleName(e.role_id)}</TD>
                <TD className="text-stone-400">{locName(e.location_id)}</TD>
                <TD className="text-stone-400">{e.level ?? '—'}</TD>
                <TD>
                  <Badge tone={statusTone(e.status)}>{e.status.replace('_', ' ')}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/employees/${e.id}`}>
                      <Button variant="ghost" className="px-2 py-1 text-xs">View</Button>
                    </Link>
                    <Button
                      variant="danger"
                      className="px-2 py-1 text-xs"
                      onClick={() => handleDelete(e.id)}
                      disabled={deleting === e.id}
                    >
                      {deleting === e.id ? '...' : 'Delete'}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Add modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Employee"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="add-employee-form" disabled={saving}>
              {saving ? 'Saving...' : 'Create'}
            </Button>
          </>
        }
      >
        <form id="add-employee-form" onSubmit={handleCreate} className="space-y-3">
          {formError && (
            <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-2 text-sm text-rose-300">{formError}</div>
          )}
          <div>
            <label className={labelCls}>Full name *</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className={inputCls}
              placeholder="Jane Doe"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="jane@co.com"
              />
            </div>
            <div>
              <label className={labelCls}>Level</label>
              <input
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                className={inputCls}
                placeholder="L4 / Senior"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Department</label>
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className={inputCls}
              >
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <select
                value={form.location_id}
                onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                className={inputCls}
              >
                <option value="">None</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Role</label>
              <select
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className={inputCls}
              >
                <option value="">None</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={inputCls}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Manager ID</label>
              <input
                value={form.manager_id}
                onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
                className={inputCls}
                placeholder="optional"
              />
            </div>
            <div>
              <label className={labelCls}>Salary</label>
              <input
                type="number"
                value={form.salary}
                onChange={(e) => setForm({ ...form, salary: e.target.value })}
                className={inputCls}
                placeholder="120000"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Hire date</label>
            <input
              type="date"
              value={form.hire_date}
              onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
              className={inputCls}
            />
          </div>
        </form>
      </Modal>
    </div>
    <RightRail />
    </div>
  )
}
