
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const admin = createClient(supabaseUrl, serviceRoleKey)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')

  const userClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: me } = await userClient.from('profiles').select('role').single()
  if (!me || me.role !== 'superadmin') return res.status(403).json({ error: 'Solo superadmin puede crear trabajadores.' })

  const { email, password, nombre, centro_id } = req.body || {}
  if (!email || !password || !centro_id) return res.status(400).json({ error: 'Faltan email, contraseña o centro.' })

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
  if (authError) return res.status(400).json({ error: authError.message })

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    email,
    nombre: nombre || email,
    role: 'trabajador',
    centro_id
  })
  if (profileError) return res.status(400).json({ error: profileError.message })

  return res.status(200).json({ ok: true })
}
