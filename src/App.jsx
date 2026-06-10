
import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import './styles.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey)
const supabase = supabaseReady ? createClient(supabaseUrl, supabaseAnonKey) : null
const fechaInicial = '2026-06-20'
const workerDomain = 'korvantis.local'

const usuarioAEmail = (usuario) => {
  const limpio = usuario.trim().toLowerCase().replace(/\s+/g, '')
  return limpio.includes('@') ? limpio : `${limpio}@${workerDomain}`
}
const usuarioVisible = (email) => (email || '').replace(`@${workerDomain}`, '')
const diasRestantes = (fecha) => {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const cad = new Date(fecha + 'T00:00:00')
  return Math.ceil((cad - hoy) / 86400000)
}
const fmt = (fecha) => fecha ? fecha.split('-').reverse().join('/') : '-'
const textoDias = (dias) => dias < 0 ? `Caducado hace ${Math.abs(dias)} día(s)` : dias === 0 ? 'Caduca hoy' : dias === 1 ? '1 día' : `${dias} días`
const parseLinea = (linea) => {
  const clean = linea.trim()
  if (!clean) return null
  const sep = clean.split(/[;,]/)
  if (sep.length >= 2 && /^\d{4,}$/.test(sep[0].trim())) return { codigo: sep[0].trim(), descripcion: sep.slice(1).join(' ').trim().toUpperCase() }
  const match = clean.match(/^(\d{4,})\s+(.+)$/)
  return match ? { codigo: match[1], descripcion: match[2].trim().toUpperCase() } : null
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loginUser, setLoginUser] = useState('')
  const [pass, setPass] = useState('')
  const [centros, setCentros] = useState([])
  const [productos, setProductos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [tab, setTab] = useState('alertas')
  const [busca, setBusca] = useState('')
  const [centroFiltro, setCentroFiltro] = useState('todos')
  const [editing, setEditing] = useState(undefined)
  const [form, setForm] = useState({ centro_id: '', modulo: '7', codigo: '', descripcion: '', fecha_caducidad: fechaInicial })
  const [importText, setImportText] = useState('')
  const [importCentro, setImportCentro] = useState('')
  const [importModulo, setImportModulo] = useState('7')
  const [importFecha, setImportFecha] = useState(fechaInicial)
  const [newCentro, setNewCentro] = useState('')
  const [newWorker, setNewWorker] = useState({ nombre: '', usuario: '', password: '', centro_id: '' })

  const isAdmin = profile?.role === 'superadmin'

  useEffect(() => {
    if (!supabaseReady) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => { session ? loadProfile() : setProfile(null) }, [session])
  useEffect(() => { if (profile) loadAll() }, [profile])

  async function loadProfile() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    if (error) return alert('No existe perfil para este usuario.')
    setProfile(data); setTab('alertas')
  }

  async function loadAll() {
    const [c, p, u] = await Promise.all([
      supabase.from('centros').select('*').order('nombre'),
      supabase.from('productos').select('*, centros(nombre)').order('descripcion'),
      isAdmin ? supabase.from('profiles').select('*, centros(nombre)').order('email') : Promise.resolve({ data: [] })
    ])
    setCentros(c.data || []); setProductos(p.data || []); setUsuarios(u.data || [])
    const visible = c.data || []
    if (!importCentro && visible[0]) setImportCentro(visible[0].id)
    if (!form.centro_id && visible[0]) setForm(f => ({ ...f, centro_id: visible[0].id }))
    if (!newWorker.centro_id && visible[0]) setNewWorker(w => ({ ...w, centro_id: visible[0].id }))
  }

  async function login(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email: usuarioAEmail(loginUser), password: pass })
    if (error) alert(error.message || 'Acceso incorrecto.')
  }
  async function logout() { await supabase.auth.signOut() }
  function volverUrgentes() { setEditing(undefined); setTab('alertas'); window.scrollTo({top:0, behavior:'smooth'}) }

  const productosFiltrados = useMemo(() => {
    let arr = productos
    if (isAdmin && centroFiltro !== 'todos') arr = arr.filter(p => p.centro_id === centroFiltro)
    const q = busca.toLowerCase()
    return q ? arr.filter(p => p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)) : arr
  }, [productos, busca, centroFiltro, isAdmin])

  const activos = productosFiltrados.filter(p => p.estado === 'activo')
  const alertas = activos.filter(p => diasRestantes(p.fecha_caducidad) <= 10).sort((a,b) => diasRestantes(a.fecha_caducidad) - diasRestantes(b.fecha_caducidad))
  const roturas = productosFiltrados.filter(p => p.estado === 'rotura')

  function openNew() { setEditing(null); setForm({ centro_id: centros[0]?.id || '', modulo: '7', codigo: '', descripcion: '', fecha_caducidad: fechaInicial }) }
  function openEdit(p) { setEditing(p); setForm({ centro_id: p.centro_id, modulo: p.modulo, codigo: p.codigo, descripcion: p.descripcion, fecha_caducidad: p.fecha_caducidad }) }

  async function saveProduct(e) {
    e.preventDefault()
    const payload = { ...form, descripcion: form.descripcion.toUpperCase(), estado: 'activo' }
    const res = editing ? await supabase.from('productos').update(payload).eq('id', editing.id) : await supabase.from('productos').insert(payload)
    if (res.error) return alert(res.error.message)
    setEditing(undefined); await loadAll(); setTab('alertas')
  }

  async function marcarRotura(p) {
    const { error } = await supabase.from('productos').update({ estado: 'rotura' }).eq('id', p.id)
    if (error) return alert(error.message)
    await loadAll()
  }
  async function eliminarProducto(p) {
    if (!confirm('¿Eliminar ficha?')) return
    const { error } = await supabase.from('productos').delete().eq('id', p.id)
    if (error) return alert(error.message)
    await loadAll()
  }
  async function importar() {
    const rows = importText.split(/\r?\n/).map(parseLinea).filter(Boolean).map(item => ({
      centro_id: importCentro, modulo: importModulo || '7', codigo: item.codigo, descripcion: item.descripcion,
      fecha_caducidad: importFecha || fechaInicial, estado: 'activo'
    }))
    if (!rows.length) return alert('No he encontrado productos válidos.')
    const { error } = await supabase.from('productos').upsert(rows, { onConflict: 'centro_id,codigo' })
    if (error) return alert(error.message)
    setImportText(''); alert(`Importados/actualizados ${rows.length} productos.`); await loadAll(); setTab('alertas')
  }

  async function crearCentro() {
    if (!newCentro.trim()) return
    const { error } = await supabase.from('centros').insert({ nombre: newCentro.trim() })
    if (error) return alert(error.message)
    setNewCentro(''); await loadAll()
  }

  async function crearTrabajador() {
    const nombre = newWorker.nombre.trim()
    const usuario = newWorker.usuario.trim().toLowerCase().replace(/\s+/g, '')
    const password = newWorker.password
    const centro_id = newWorker.centro_id
    if (!nombre || !usuario || !password || !centro_id) return alert('Rellena nombre, usuario, contraseña y centro.')

    const { data: authData } = await supabase.auth.getSession()
    const accessToken = authData.session?.access_token
    if (!accessToken) return alert('Tu sesión ha caducado. Sal y vuelve a entrar.')

    const res = await fetch('/api/create-worker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ nombre, usuario, email: usuarioAEmail(usuario), password, centro_id })
    })
    const data = await res.json()
    if (!res.ok) return alert(data.error || 'No se pudo crear el trabajador.')

    setNewWorker({ nombre: '', usuario: '', password: '', centro_id: centros[0]?.id || '' })
    alert(`Trabajador creado correctamente.\nUsuario: ${usuario}`)
    await loadAll()
  }

  if (!supabaseReady) return <div className="login"><div className="card"><h1>Faltan variables de Supabase</h1><p>Añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.</p></div></div>

  if (!session || !profile) return <div className="login"><form className="card login-card" onSubmit={login}>
    <h1>Korvantis Fresh Product Control</h1><p>Acceso privado</p>
    <label>Usuario<input value={loginUser} onChange={e=>setLoginUser(e.target.value)} autoComplete="username" /></label>
    <label>Contraseña<input type="password" value={pass} onChange={e=>setPass(e.target.value)} autoComplete="current-password" /></label>
    <button>Entrar</button><p className="muted small">El superadmin entra con email. El trabajador entra con su usuario.</p>
  </form></div>

  return <div>
    <header><div><h1>Korvantis Fresh Product Control</h1><p>{isAdmin ? 'Superadmin · Vista global' : `Trabajador · ${profile.nombre || usuarioVisible(profile.email)}`}</p></div>
      <div className="row"><button onClick={volverUrgentes}>Urgentes</button><button onClick={openNew}>+ Nuevo producto</button><button className="secondary" onClick={logout}>Salir</button></div>
    </header>
    <main>
      <section className="stats"><div className="stat"><b>{activos.length}</b><span>Activos</span></div><div className="stat red"><b>{alertas.length}</b><span>Urgentes ≤ 10 días</span></div><div className="stat purple"><b>{roturas.length}</b><span>Rotura</span></div><div className="stat"><b>{centros.length}</b><span>Centros visibles</span></div></section>
      <nav><button className={tab==='alertas'?'active':''} onClick={()=>setTab('alertas')}>Urgentes</button><button className={tab==='productos'?'active':''} onClick={()=>setTab('productos')}>Productos</button><button className={tab==='roturas'?'active':''} onClick={()=>setTab('roturas')}>Roturas</button><button className={tab==='importar'?'active':''} onClick={()=>setTab('importar')}>Importar</button>{isAdmin && <button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}>Usuarios / Centros</button>}</nav>
      {tab !== 'alertas' && <button className="back" onClick={volverUrgentes}>← Regresar a Urgentes</button>}

      {tab === 'alertas' && <section className="panel urgent-panel"><h2>Urgentes · Caducidad en 10 días o menos</h2><p className="muted">Pantalla principal. El trabajador revisa, retira producto antiguo y actualiza la nueva fecha.</p><Tabla productos={alertas} openEdit={openEdit} marcarRotura={marcarRotura} eliminarProducto={eliminarProducto} /></section>}

      {tab === 'productos' && <section className="panel"><div className="panel-head"><h2>Productos</h2>{isAdmin && <select value={centroFiltro} onChange={e=>setCentroFiltro(e.target.value)}><option value="todos">Todos los centros</option>{centros.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select>}</div><input placeholder="Buscar código o descripción" value={busca} onChange={e=>setBusca(e.target.value)} /><Tabla productos={productosFiltrados} openEdit={openEdit} marcarRotura={marcarRotura} eliminarProducto={eliminarProducto} /></section>}

      {tab === 'roturas' && <section className="panel"><h2>Rotura</h2><p className="muted">Productos sin reposición. Cuando lleguen, se mete la nueva fecha y vuelven a activo.</p><Tabla productos={roturas} openEdit={openEdit} marcarRotura={marcarRotura} eliminarProducto={eliminarProducto} /></section>}

      {tab === 'importar' && <section className="panel"><h2>Cargar etiquetas</h2><div className="grid"><label>Centro<select value={importCentro} onChange={e=>setImportCentro(e.target.value)}>{centros.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>Módulo<input value={importModulo} onChange={e=>setImportModulo(e.target.value)} /></label><label>Fecha provisional<input type="date" value={importFecha} onChange={e=>setImportFecha(e.target.value)} /></label></div><label>CSV/TXT<input type="file" accept=".csv,.txt" onChange={async e=>setImportText(await e.target.files[0].text())} /></label><textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder="0313593 JAMON COCIDO NATURARTE CAMPOFRIO 120G" /><button onClick={importar}>Importar / actualizar productos</button></section>}

      {tab === 'admin' && isAdmin && <section className="panel"><h2>Usuarios / Centros</h2><div className="grid two"><div><h3>Crear centro</h3><input placeholder="Nombre del centro" value={newCentro} onChange={e=>setNewCentro(e.target.value)} /><button onClick={crearCentro}>Crear centro</button></div><div><h3>Crear trabajador</h3><p className="muted small">El superadmin decide nombre, usuario, contraseña y centro.</p><input placeholder="Nombre del trabajador" value={newWorker.nombre} onChange={e=>setNewWorker({...newWorker,nombre:e.target.value})} /><input placeholder="Usuario de acceso" value={newWorker.usuario} onChange={e=>setNewWorker({...newWorker,usuario:e.target.value})} /><input placeholder="Contraseña asignada" type="password" value={newWorker.password} onChange={e=>setNewWorker({...newWorker,password:e.target.value})} /><select value={newWorker.centro_id} onChange={e=>setNewWorker({...newWorker,centro_id:e.target.value})}>{centros.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select><button onClick={crearTrabajador}>Crear trabajador</button></div></div><h3>Usuarios</h3><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Centro</th></tr></thead><tbody>{usuarios.map(u=><tr key={u.id}><td>{u.nombre}</td><td>{usuarioVisible(u.email)}</td><td>{u.role}</td><td>{u.centros?.nombre || 'Todos'}</td></tr>)}</tbody></table></section>}

      {editing !== undefined && <section className="panel"><h2>{editing ? 'Editar ficha' : 'Nuevo producto'}</h2><form onSubmit={saveProduct} className="grid"><label>Centro<select value={form.centro_id} onChange={e=>setForm({...form,centro_id:e.target.value})} disabled={!isAdmin}>{centros.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>Módulo<input value={form.modulo} onChange={e=>setForm({...form,modulo:e.target.value})} /></label><label>Código<input value={form.codigo} onChange={e=>setForm({...form,codigo:e.target.value})} /></label><label>Descripción<input value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} /></label><label>Fecha caducidad<input type="date" value={form.fecha_caducidad} onChange={e=>setForm({...form,fecha_caducidad:e.target.value})} /></label><div className="row"><button>Guardar / Reactivar</button>{editing && <button type="button" className="secondary" onClick={()=>marcarRotura(editing)}>Rotura</button>}{editing && <button type="button" className="danger" onClick={()=>eliminarProducto(editing)}>Eliminar</button>}<button type="button" className="secondary" onClick={()=>setEditing(undefined)}>Cerrar</button></div></form></section>}
    </main>
  </div>
}

function Tabla({ productos, openEdit, marcarRotura, eliminarProducto }) {
  return <div className="table-wrap"><table><thead><tr><th>Centro</th><th>Módulo</th><th>Código</th><th>Descripción</th><th>Fecha</th><th>Días</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{productos.length ? productos.map(p => {
    const d = diasRestantes(p.fecha_caducidad)
    return <tr key={p.id}><td>{p.centros?.nombre || '-'}</td><td>{p.modulo}</td><td>{p.codigo}</td><td>{p.descripcion}</td><td>{fmt(p.fecha_caducidad)}</td><td>{p.estado === 'rotura' ? '-' : textoDias(d)}</td><td><span className={`badge ${p.estado === 'rotura' ? 'rotura' : d <= 10 ? 'alerta' : 'ok'}`}>{p.estado === 'rotura' ? 'Rotura' : d <= 10 ? 'Urgente' : 'Activo'}</span></td><td><div className="row"><button onClick={()=>openEdit(p)}>Editar</button>{p.estado !== 'rotura' && <button className="secondary" onClick={()=>marcarRotura(p)}>Rotura</button>}<button className="danger" onClick={()=>eliminarProducto(p)}>Eliminar</button></div></td></tr>
  }) : <tr><td colSpan="8">Sin datos urgentes</td></tr>}</tbody></table></div>
}

createRoot(document.getElementById('root')).render(<App />)
