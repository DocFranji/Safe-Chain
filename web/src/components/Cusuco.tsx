// El cusuco (armadillo de nueve bandas), mascota del diseño "cusuco" (src/lib/tema.ts).
// Se enrolla como una bola para protegerse: redondo como el nombre Rounda y protector como la garantía.
// Dibujo geométrico propio, con los colores en variables (--cusuco-*) para que sirva en claro y oscuro.
// Poses: "saluda" (de pie, con una pata arriba), "bola" (enrollado) y la cabeza sola (CabezaCusuco), que asoma
// sobre la rueda para señalar a quien cobra.
import { useId } from 'react'

type Pose = 'saluda' | 'bola'

export function Cusuco({ pose = 'saluda', className, titulo }: { pose?: Pose; className?: string; titulo?: string }) {
  const clase = ['cusuco', `cusuco-${pose}`, className].filter(Boolean).join(' ')
  const etiqueta = titulo ? { role: 'img', 'aria-label': titulo } : { 'aria-hidden': true as const }
  return pose === 'bola' ? (
    <svg className={clase} viewBox="0 0 140 140" {...etiqueta}>
      <Bola />
    </svg>
  ) : (
    <svg className={clase} viewBox="0 0 220 150" {...etiqueta}>
      <DePie />
    </svg>
  )
}

const TRAZO = { stroke: 'var(--cusuco-tinta)', strokeWidth: 4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

function DePie() {
  // El caparazón: una cúpula con cinco bandas, encima del cuerpo. Mira a la derecha.
  const cupula = 'M 44 104 C 44 54 78 30 104 30 C 136 30 160 56 160 104 Z'
  const recorte = useId() // puede haber varios cusucos en la misma página: cada uno con su recorte
  return (
    <g>
      <defs>
        <clipPath id={recorte}>
          <path d={cupula} />
        </clipPath>
      </defs>
      {/* La cola, por detrás. */}
      <path d="M 50 92 C 34 96 22 106 8 120 C 24 116 38 110 52 104 Z" fill="var(--cusuco-cuerpo)" {...TRAZO} />
      {/* Patas de atrás y de adelante; la de adelante saluda. */}
      <rect x="58" y="96" width="20" height="30" rx="9" fill="var(--cusuco-cuerpo)" {...TRAZO} />
      <rect x="124" y="96" width="20" height="30" rx="9" fill="var(--cusuco-cuerpo)" {...TRAZO} />
      <g className="cusuco-pata-saludo">
        <rect x="150" y="62" width="18" height="34" rx="9" fill="var(--cusuco-cuerpo)" {...TRAZO} transform="rotate(-38 159 92)" />
      </g>
      {/* La cabeza: un hocico redondeado con la oreja grande. */}
      <path
        d="M 150 66 C 166 52 190 60 206 82 C 212 90 207 99 198 99 L 152 102 Z"
        fill="var(--cusuco-cuerpo)"
        {...TRAZO}
      />
      <ellipse cx="160" cy="54" rx="9" ry="16" transform="rotate(-18 160 54)" fill="var(--cusuco-cuerpo)" {...TRAZO} />
      <ellipse cx="160" cy="56" rx="3.6" ry="9" transform="rotate(-18 160 56)" fill="var(--cusuco-mejilla)" />
      <circle cx="176" cy="76" r="4.2" fill="var(--cusuco-tinta)" />
      <circle cx="177.6" cy="74.6" r="1.3" fill="#ffffff" />
      <circle cx="182" cy="88" r="5" fill="var(--cusuco-mejilla)" opacity="0.8" />
      <circle cx="205" cy="89" r="3.6" fill="var(--cusuco-tinta)" />
      <path d="M 186 94 Q 191 98 196 95" fill="none" {...TRAZO} strokeWidth={3} />
      {/* El caparazón con sus bandas. */}
      <path d={cupula} fill="var(--cusuco-caparazon)" />
      <g clipPath={`url(#${recorte})`} stroke="var(--cusuco-banda)" strokeWidth="5" fill="none">
        {[78, 94, 110, 126, 142].map((x) => (
          <path key={x} d={`M ${x} 20 Q ${x + 6} 64 ${x} 110`} />
        ))}
      </g>
      <path d={cupula} fill="none" {...TRAZO} />
      <rect x="38" y="96" width="128" height="14" rx="7" fill="var(--cusuco-banda)" {...TRAZO} />
    </g>
  )
}

function Bola() {
  // Enrollado: el caparazón hace un círculo; solo asoman la oreja, el hocico y la punta de la cola.
  const recorte = useId()
  return (
    <g>
      <defs>
        <clipPath id={recorte}>
          <circle cx="70" cy="72" r="54" />
        </clipPath>
      </defs>
      <ellipse cx="96" cy="22" rx="8" ry="14" transform="rotate(28 96 22)" fill="var(--cusuco-cuerpo)" {...TRAZO} />
      <path d="M 112 40 C 124 40 130 50 126 58 C 120 56 112 52 106 48 Z" fill="var(--cusuco-cuerpo)" {...TRAZO} />
      <circle cx="70" cy="72" r="54" fill="var(--cusuco-caparazon)" />
      <g clipPath={`url(#${recorte})`} stroke="var(--cusuco-banda)" strokeWidth="5" fill="none">
        {[-36, -18, 0, 18, 36].map((d) => (
          <path key={d} d={`M ${70 + d} 14 Q ${70 + d * 1.5} 72 ${70 + d} 130`} />
        ))}
      </g>
      <circle cx="70" cy="72" r="54" fill="none" {...TRAZO} />
      <path d="M 24 102 C 16 112 14 120 18 128" fill="none" {...TRAZO} strokeWidth={5} />
    </g>
  )
}

/** La cabeza sola, mirando hacia abajo: va arriba de la rueda y señala el segmento de quien cobra. */
export function CabezaCusuco({ y }: { y: number }) {
  return (
    <g transform={`translate(0 ${y})`} aria-hidden="true">
      <g className="cusuco-cabeza">
      <ellipse cx="-17" cy="-14" rx="7" ry="13" transform="rotate(-24 -17 -14)" fill="var(--cusuco-cuerpo)" {...TRAZO} strokeWidth={3} />
      <ellipse cx="17" cy="-14" rx="7" ry="13" transform="rotate(24 17 -14)" fill="var(--cusuco-cuerpo)" {...TRAZO} strokeWidth={3} />
      <path d="M -20 -6 C -20 -20 20 -20 20 -6 C 20 6 8 20 0 24 C -8 20 -20 6 -20 -6 Z" fill="var(--cusuco-cuerpo)" {...TRAZO} strokeWidth={3} />
      <circle cx="-8" cy="-4" r="3" fill="var(--cusuco-tinta)" />
      <circle cx="8" cy="-4" r="3" fill="var(--cusuco-tinta)" />
      <circle cx="-12" cy="5" r="3.6" fill="var(--cusuco-mejilla)" opacity="0.8" />
      <circle cx="12" cy="5" r="3.6" fill="var(--cusuco-mejilla)" opacity="0.8" />
      <circle cx="0" cy="20" r="3.4" fill="var(--cusuco-tinta)" />
      </g>
    </g>
  )
}
