// "Agregar a mis amigos" junto a una persona (lista de quiénes participan y perfil público). Si ya es amigo, dice
// "Amigo". Solo con sesión y nunca con uno mismo. Pedido 6 del plan v5.
import { useState } from 'react'
import { useAmigos } from '../hooks/useAmigos'
import { esCuenta } from '../lib/amigos'
import { nombreConocido } from '../lib/nombres'
import { FormAmigo } from './FormAmigo'
import './amigos.css'

export function BotonAmigo({ dir, yo }: { dir: string; yo: string | null }) {
  const { amigos, agregar, apodoDe } = useAmigos(yo)
  const [abierto, setAbierto] = useState(false)
  if (!yo || dir === yo || !esCuenta(dir)) return null
  const apodo = apodoDe(dir)
  if (apodo) return <span className="marca-amigo">Amigo: {apodo}</span>
  if (!abierto) {
    return (
      <button type="button" className="boton-amigo" onClick={() => setAbierto(true)}>
        Agregar a mis amigos
      </button>
    )
  }
  return (
    <FormAmigo
      yo={yo}
      amigos={amigos}
      agregar={agregar}
      dir={dir}
      sugerido={nombreConocido(dir)}
      autoFoco
      alTerminar={() => setAbierto(false)}
    />
  )
}
