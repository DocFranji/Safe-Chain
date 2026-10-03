// Pantalla de inicio: todas las tandas, con filtros, y el acceso a crear una nueva.
import { useState } from 'react'
import { useTandas } from '../hooks/useTandas'
import type { Billetera } from '../hooks/useBilletera'
import type { Cuenta } from '../hooks/useCuenta'
import type { ResumenTanda } from '../lib/lectura'
import { TarjetaTanda } from '../components/TarjetaTanda'
import { ComoProbar } from '../components/ComoProbar'
import { RUTA_CREAR } from '../lib/rutas'

type Filtro = 'todas' | 'abiertas' | 'en-curso' | 'terminadas' | 'mias'

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: 'todas', texto: 'Todas' },
  { id: 'abiertas', texto: 'Abiertas' },
  { id: 'en-curso', texto: 'En curso' },
  { id: 'terminadas', texto: 'Terminadas' },
  { id: 'mias', texto: 'Mis tandas' },
]

function coincide(r: ResumenTanda, filtro: Filtro, yo: string | null): boolean {
  const estado = r.tanda.estado.tag
  switch (filtro) {
    case 'todas':
      return true
    case 'abiertas':
      return estado === 'Abierta'
    case 'en-curso':
      return estado === 'Activa' || estado === 'PorLiquidar'
    case 'terminadas':
      return estado === 'Finalizada' || estado === 'Cancelada'
    case 'mias':
      return yo !== null && (r.tanda.creador === yo || r.miembros.some((m) => m.direccion === yo))
  }
}

export function Lobby({ billetera, cuenta }: { billetera: Billetera; cuenta: Cuenta }) {
  const { total, lista, error, listo, hayMas, verMas } = useTandas()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const yo = billetera.direccion

  const visibles = lista.filter((r) => coincide(r, filtro, yo))

  return (
    <section className="lobby" aria-labelledby="lobby-titulo">
      <div className="selector">
        <h1 id="lobby-titulo">Tandas</h1>
        <a className="boton principal" href={RUTA_CREAR}>
          Crear una tanda
        </a>
      </div>
      <p className="explica lobby-intro">
        Ahorra en grupo sin confiar en nadie: el contrato guarda el dinero, y si alguien no paga, su garantía cubre su cuota.
        Elige una tanda abierta para unirte o crea la tuya.
      </p>
      <ComoProbar billetera={billetera} cuenta={cuenta} />

      {error && !lista.length && (
        <p className="aviso error" role="alert">
          {error}
        </p>
      )}
      {!listo && <p className="cargando">Leyendo las tandas desde la red de Stellar…</p>}

      {listo && total === 0 && (
        <div className="vacio">
          <h2>Todavía no hay tandas</h2>
          <p>Sé la primera persona: crea una tanda, comparte el link y empieza cuando se unan todos.</p>
          <a className="boton principal" href={RUTA_CREAR}>
            Crear la primera tanda
          </a>
        </div>
      )}

      {listo && total !== null && total > 0 && (
        <>
          <div className="filtros" role="group" aria-label="Filtrar tandas">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={filtro === f.id ? 'filtro activo' : 'filtro'}
                aria-pressed={filtro === f.id}
                onClick={() => setFiltro(f.id)}
              >
                {f.texto}
              </button>
            ))}
          </div>

          {filtro === 'mias' && !yo && (
            <p className="explica">Entra o conecta tu billetera (arriba a la derecha) para ver las tandas en las que participas.</p>
          )}

          {visibles.length === 0 ? (
            <p className="explica sin-resultados">No hay tandas en esta categoría por ahora.</p>
          ) : (
            <ul className="tarjetas">
              {visibles.map((r) => (
                <TarjetaTanda key={r.id} resumen={r} yo={yo} />
              ))}
            </ul>
          )}

          {hayMas && (
            <button type="button" className="boton chico ver-mas" onClick={verMas}>
              Ver tandas más antiguas
            </button>
          )}
        </>
      )}
    </section>
  )
}
