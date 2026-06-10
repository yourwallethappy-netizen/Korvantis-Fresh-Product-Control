import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(supabaseUrl, serviceRoleKey)

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Faltan variables de entorno en Vercel.' })
    }

    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: 'No se recibió sesión del superadmin.' })

    const { data: authUser, error: userError } = await admin.auth.getUser(token)
    if (userError || !authUser?.user?.id) return res.status(401).json({ error: 'Sesión no válida.' })

    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', authUser.user.id)
      .single()

    if (!profile || profile.role !== 'superadmin') {
      return res.status(403).json({ error: 'Solo superadmin puede crear trabajadores.' })
    }

    const { username, email, password, nombre, centro_id } = req.body || {}
    if (!username || !email || !password || !centro_id) {
      return res.status(400).json({ error: 'Faltan usuario, contraseña o centro.' })
    }

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username }
    })

    if (authError) return res.status(400).json({ error: authError.message })

    const { error: profileInsertError } = await admin.from('profiles').insert({
      id: created.user.id,
      email,
      nombre: nombre || username,
      role: 'trabajador',
      centro_id
    })

    if (profileInsertError) return res.status(400).json({ error: profileInsertError.message })

    return res.status(200).json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error interno creando trabajador.' })
  }
}
