
import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import { createWorker } from 'tesseract.js'
import './styles.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey)
const supabase = supabaseReady ? createClient(supabaseUrl, supabaseAnonKey) : null

const fechaInicial = '2026-06-20'

function diasRestantes(fecha) {
  const hoy = new Date()
  hoy.setHours(0,0,0,0)
  const cad = new Date(fecha + 'T00:00:00')
  return Math.ceil((cad - hoy) / 86400000)
}

function fmt(fecha) {
  if (!fecha) return '-'
  const [y,m,d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

function textoDias(dias) {
  if (dias < 0) return `Caducado hace ${Math.abs(dias)} día(s)`
  if (dias === 0) return 'Caduca hoy'
  if (dias === 1) return '1 día'
  return `${dias} días`
}

function parseLinea(linea) {
  const clean = linea.trim()
  if (!clean) return null
  const sep = clean.split(/[;,]/)
  if (sep.length >= 2 && /^\d{4,}$/.test(sep[0].trim())) {
    return { codigo: sep[0].trim(), descripcion: sep.slice(1).join(' ').trim().toUpperCase() }
  }
  const match = clean.match(/^(\d{4,})\s+(.+)$/)
  if (match) return { codigo: match[1], descripcion: match[2].trim().toUpperCase() }
  return null
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [centros, setCentros] = useState([])
  const [productos, setProductos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [tab, setTab] = useState('productos')
  const [busca, setBusca] = useState('')
  const [centroFiltro, setCentroFiltro] = useState('todos')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ centro_id: '', modulo: '7', codigo: '', descripcion: '', fecha_caducidad: fechaInicial })
  const [importText, setImportText] = useState('')
  const [importCentro, setImportCentro] = useState('')
  const [importModulo, setImportModulo] = useState('7')
  const [importFecha, setImportFecha] = useState(fechaInicial)
  const [ocrStatus, setOcrStatus] = useState('')
  const [newCentro, setNewCentro] = useState('')
  const [newWorker, setNewWorker] = useState({ email: '', password: '', nombre: '', centro_id: '' })
  const isAdmin = profile?.role === 'superadmin'

  useEffect(() => {
    if (!supabaseReady) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    loadProfile()
  }, [session])

  useEffect(() => {
    if (profile) loadAll()
  }, [profile])

  async function loadProfile() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    if (error) alert('No existe perfil para este usuario. Revisa la tabla profiles.')
    setProfile(data)
  }

  async function loadAll() {
    const [c, p, u] = await Promise.all([
      supabase.from('centros').select('*').order('nombre'),
      supabase.from('productos').select('*, centros(nombre)').order('descripcion'),
      isAdmin ? supabase.from('profiles').select('*, centros(nombre)').order('email') : Promise.resolve({ data: [] })
    ])
    setCentros(c.data || [])
    setProductos(p.data || [])
    setUsuarios(u.data || [])
    const visible = c.data || []
    if (!importCentro && visible[0]) setImportCentro(visible[0].id)
    if (!form.centro_id && visible[0]) setForm(f => ({ ...f, centro_id: visible[0].id }))
    if (!newWorker.centro_id && visible[0]) setNewWorker(w => ({ ...w, centro_id: visible[0].id }))
  }

  async function login(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (error) alert('Acceso incorrecto.')
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const productosFiltrados = useMemo(() => {
    let arr = productos
    if (isAdmin && centroFiltro !== 'todos') arr = arr.filter(p => p.centro_id === centroFiltro)
    const q = busca.toLowerCase()
    if (q) arr = arr.filter(p => p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q))
    return arr
  }, [productos, busca, centroFiltro, isAdmin])

  const activos = productosFiltrados.filter(p => p.estado === 'activo')
  const alertas = activos.filter(p => diasRestantes(p.fecha_caducidad) <= 10).sort((a,b) => diasRestantes(a.fecha_caducidad)-diasRestantes(b.fecha_caducidad))
  const roturas = productosFiltrados.filter(p => p.estado === 'rotura')

  function openNew() {
    setEditing(null)
    setForm({ centro_id: centros[0]?.id || '', modulo: '7', codigo: '', descripcion: '', fecha_caducidad: fechaInicial })
  }

  function openEdit(p) {
    setEditing(p)
    setForm({ centro_id: p.centro_id, modulo: p.modulo, codigo: p.codigo, descripcion: p.descripcion, fecha_caducidad: p.fecha_caducidad })
  }

  async function saveProduct(e) {
    e.preventDefault()
    const payload = {
      ...form,
      descripcion: form.descripcion.toUpperCase(),
      estado: 'activo'
    }
    const res = editing
      ? await supabase.from('productos').update(payload).eq('id', editing.id)
      : await supabase.from('productos').insert(payload)
    if (res.error) return alert(res.error.message)
    setEditing(null)
    await loadAll()
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
    const lineas = importText.split(/\r?\n/)
    const rows = []
    for (const l of lineas) {
      const item = parseLinea(l)
      if (item) rows.push({
        centro_id: importCentro,
        modulo: importModulo || '7',
        codigo: item.codigo,
        descripcion: item.descripcion,
        fecha_caducidad: importFecha || fechaInicial,
        estado: 'activo'
      })
    }
    if (!rows.length) return alert('No he encontrado productos válidos.')
    const { error } = await supabase.from('productos').upsert(rows, { onConflict: 'centro_id,codigo' })
    if (error) return alert(error.message)
    setImportText('')
    alert(`Importados/actualizados ${rows.length} productos.`)
    await loadAll()
  }

  async function leerFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setOcrStatus('Leyendo foto temporalmente en tu navegador...')
    try {
      const worker = await createWorker('spa')
      const { data } = await worker.recognize(file)
      await worker.terminate()
      setImportText(prev => (prev ? prev + '\n' : '') + data.text)
      setOcrStatus('Lectura terminada. La foto no se ha guardado. Revisa el texto detectado antes de importar.')
      e.target.value = ''
    } catch (err) {
      setOcrStatus('No se pudo leer la imagen automáticamente. Puedes pegar el listado manualmente.')
    }
  }

  async function crearCentro() {
    if (!newCentro.trim()) return
    const { error } = await supabase.from('centros').insert({ nombre: newCentro.trim() })
    if (error) return alert(error.message)
    setNewCentro('')
    await loadAll()
  }

  async function crearTrabajador() {
    const accessToken = session?.access_token
    const res = await fetch('/api/create-worker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify(newWorker)
    })
    const data = await res.json()
    if (!res.ok) return alert(data.error || 'No se pudo crear el trabajador.')
    setNewWorker({ email: '', password: '', nombre: '', centro_id: centros[0]?.id || '' })
    alert('Trabajador creado correctamente.')
    await loadAll()
  }

  if (!supabaseReady) {
    return <div className="login"><div className="card"><h1>Faltan variables de Supabase</h1><p>En Vercel añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY, y después haz Redeploy.</p></div></div>
  }

  if (!session || !profile) {
    return <div className="login">
      <form className="card login-card" onSubmit={login}>
        <h1>Korvantis Fresh Product Control</h1>
        <p>Acceso privado</p>
        <label>Email / usuario<input value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Contraseña<input type="password" value={pass} onChange={e=>setPass(e.target.value)} autoComplete="current-password" /></label>
        <button>Entrar</button>
      </form>
    </div>
  }

  return <div>
    <header>
      <div>
        <h1>Korvantis Fresh Product Control</h1>
        <p>{isAdmin ? 'Superadmin · Vista global' : `Trabajador · ${profile.nombre || profile.email}`}</p>
      </div>
      <div className="row">
        <button onClick={openNew}>+ Nuevo producto</button>
        <button className="secondary" onClick={logout}>Salir</button>
      </div>
    </header>

    <main>
      <section className="stats">
        <div className="stat"><b>{activos.length}</b><span>Activos</span></div>
        <div className="stat red"><b>{alertas.length}</b><span>Alerta caducidad</span></div>
        <div className="stat purple"><b>{roturas.length}</b><span>Rotura</span></div>
        <div className="stat"><b>{centros.length}</b><span>Centros visibles</span></div>
      </section>

      <nav>
        {['productos','alertas','roturas','importar'].map(t => <button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}
        {isAdmin && <button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}>Usuarios / Centros</button>}
      </nav>

      {tab === 'productos' && <section className="panel">
        <div className="panel-head">
          <h2>Productos</h2>
          {isAdmin && <select value={centroFiltro} onChange={e=>setCentroFiltro(e.target.value)}><option value="todos">Todos los centros</option>{centros.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select>}
        </div>
        <input placeholder="Buscar código o descripción" value={busca} onChange={e=>setBusca(e.target.value)} />
        <Tabla productos={productosFiltrados} openEdit={openEdit} marcarRotura={marcarRotura} eliminarProducto={eliminarProducto} />
      </section>}

      {tab === 'alertas' && <section className="panel">
        <h2>Alerta Caducidad</h2>
        <p className="muted">Productos con 10 días o menos. El trabajador revisa, retira producto antiguo y actualiza fecha nueva.</p>
        <Tabla productos={alertas} openEdit={openEdit} marcarRotura={marcarRotura} eliminarProducto={eliminarProducto} alerta />
      </section>}

      {tab === 'roturas' && <section className="panel">
        <h2>Rotura</h2>
        <p className="muted">Productos sin reposición. Cuando lleguen, se mete la nueva fecha y vuelven a activo.</p>
        <Tabla productos={roturas} openEdit={openEdit} marcarRotura={marcarRotura} eliminarProducto={eliminarProducto} />
      </section>}

      {tab === 'importar' && <section className="panel">
        <h2>Cargar etiquetas</h2>
        <p className="muted">La foto se procesa temporalmente para OCR y no se archiva.</p>
        <div className="grid">
          <label>Centro<select value={importCentro} onChange={e=>setImportCentro(e.target.value)}>{centros.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          <label>Módulo<input value={importModulo} onChange={e=>setImportModulo(e.target.value)} /></label>
          <label>Fecha provisional<input type="date" value={importFecha} onChange={e=>setImportFecha(e.target.value)} /></label>
        </div>
        <label>Foto temporal OCR<input type="file" accept="image/*" onChange={leerFoto} /></label>
        {ocrStatus && <p className="ocr">{ocrStatus}</p>}
        <label>CSV/TXT<input type="file" accept=".csv,.txt" onChange={async e=>setImportText(await e.target.files[0].text())} /></label>
        <textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder="0313593 JAMON COCIDO NATURARTE CAMPOFRIO 120G" />
        <button onClick={importar}>Importar / actualizar productos</button>
      </section>}

      {tab === 'admin' && isAdmin && <section className="panel">
        <h2>Usuarios / Centros</h2>
        <div className="grid two">
          <div>
            <h3>Crear centro</h3>
            <input placeholder="Nombre del centro" value={newCentro} onChange={e=>setNewCentro(e.target.value)} />
            <button onClick={crearCentro}>Crear centro</button>
          </div>
          <div>
            <h3>Crear trabajador</h3>
            <input placeholder="Nombre" value={newWorker.nombre} onChange={e=>setNewWorker({...newWorker,nombre:e.target.value})} />
            <input placeholder="Email de acceso" value={newWorker.email} onChange={e=>setNewWorker({...newWorker,email:e.target.value})} />
            <input placeholder="Contraseña" type="password" value={newWorker.password} onChange={e=>setNewWorker({...newWorker,password:e.target.value})} />
            <select value={newWorker.centro_id} onChange={e=>setNewWorker({...newWorker,centro_id:e.target.value})}>{centros.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
            <button onClick={crearTrabajador}>Crear trabajador</button>
          </div>
        </div>
        <h3>Usuarios</h3>
        <table><thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Centro</th></tr></thead><tbody>{usuarios.map(u=><tr key={u.id}><td>{u.email}</td><td>{u.nombre}</td><td>{u.role}</td><td>{u.centros?.nombre || 'Todos'}</td></tr>)}</tbody></table>
      </section>}

      {(editing !== undefined) && <section className="panel">
        <h2>{editing ? 'Editar ficha' : 'Nuevo producto'}</h2>
        <form onSubmit={saveProduct} className="grid">
          <label>Centro<select value={form.centro_id} onChange={e=>setForm({...form,centro_id:e.target.value})} disabled={!isAdmin}>{centros.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
          <label>Módulo<input value={form.modulo} onChange={e=>setForm({...form,modulo:e.target.value})} /></label>
          <label>Código<input value={form.codigo} onChange={e=>setForm({...form,codigo:e.target.value})} /></label>
          <label>Descripción<input value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} /></label>
          <label>Fecha caducidad<input type="date" value={form.fecha_caducidad} onChange={e=>setForm({...form,fecha_caducidad:e.target.value})} /></label>
          <div className="row">
            <button>Guardar / Reactivar</button>
            {editing && <button type="button" className="secondary" onClick={()=>marcarRotura(editing)}>Rotura</button>}
            {editing && <button type="button" className="danger" onClick={()=>eliminarProducto(editing)}>Eliminar</button>}
            <button type="button" className="secondary" onClick={()=>setEditing(undefined)}>Cerrar</button>
          </div>
        </form>
      </section>}
    </main>
  </div>
}

function Tabla({ productos, openEdit, marcarRotura, eliminarProducto }) {
  return <div className="table-wrap"><table>
    <thead><tr><th>Centro</th><th>Módulo</th><th>Código</th><th>Descripción</th><th>Fecha</th><th>Días</th><th>Estado</th><th>Acción</th></tr></thead>
    <tbody>{productos.length ? productos.map(p => {
      const d = diasRestantes(p.fecha_caducidad)
      return <tr key={p.id}>
        <td>{p.centros?.nombre || '-'}</td>
        <td>{p.modulo}</td>
        <td>{p.codigo}</td>
        <td>{p.descripcion}</td>
        <td>{fmt(p.fecha_caducidad)}</td>
        <td>{p.estado === 'rotura' ? '-' : textoDias(d)}</td>
        <td><span className={`badge ${p.estado === 'rotura' ? 'rotura' : d <= 10 ? 'alerta' : 'ok'}`}>{p.estado === 'rotura' ? 'Rotura' : d <= 10 ? 'Alerta' : 'Activo'}</span></td>
        <td><div className="row"><button onClick={()=>openEdit(p)}>Editar</button>{p.estado !== 'rotura' && <button className="secondary" onClick={()=>marcarRotura(p)}>Rotura</button>}<button className="danger" onClick={()=>eliminarProducto(p)}>Eliminar</button></div></td>
      </tr>
    }) : <tr><td colSpan="8">Sin datos</td></tr>}</tbody>
  </table></div>
}

createRoot(document.getElementById('root')).render(<App />)
