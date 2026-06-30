import { Hono } from 'hono'
import { db } from '../db/index.js'
import { activity_log } from '../db/schema.js'
import { and, desc, eq } from 'drizzle-orm'
import { getUserId } from '../lib/auth.js'

const router = new Hono()

// Public read: list the activity/audit trail for the current user, optionally
// filtered by entity_type and/or entity_id. Most-recent first.
router.get('/', async (c) => {
  const userId = getUserId(c)
  const entityType = c.req.query('entity_type')
  const entityId = c.req.query('entity_id')

  const conditions = [eq(activity_log.user_id, userId)]
  if (entityType) conditions.push(eq(activity_log.entity_type, entityType))
  if (entityId) conditions.push(eq(activity_log.entity_id, entityId))

  const rows = await db
    .select()
    .from(activity_log)
    .where(and(...conditions))
    .orderBy(desc(activity_log.created_at))

  return c.json(rows)
})

export default router
