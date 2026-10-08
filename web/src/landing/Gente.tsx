// La gente detrás de cada tanda: fotos en círculo con una órbita alrededor (el aro y el punto del logo).
// Las fotos son ilustrativas, hechas con IA (Figma); viven en src/assets/fotos en WebP.
import fotoFamilia from '../assets/fotos/familia.webp'
import fotoOficina from '../assets/fotos/oficina.webp'
import fotoBarrio from '../assets/fotos/barrio.webp'
import fotoArtesano from '../assets/fotos/artesano.webp'
import fotoFinca from '../assets/fotos/finca.webp'
import type { Tema } from '../lib/tema'

const GRUPOS = [
  {
    t: 'La de la familia',
    d: 'La abuela, los tíos, los primos. Ya nadie tiene que andar cobrando en el almuerzo del domingo.',
    foto: fotoFamilia,
    alt: 'Una abuela y su nieta miran un celular en la mesa de la cocina.',
  },
  {
    t: 'La de la oficina',
    d: 'La cuota sale cada quincena, el día de pago. El contrato cobra y reparte solo.',
    foto: fotoOficina,
    alt: 'Compañeros de trabajo se ríen mientras almuerzan en una soda.',
  },
  {
    t: 'La del barrio',
    d: 'Vecinos de toda la vida, con cada pago a la vista de todos.',
    foto: fotoBarrio,
    alt: 'Dos vecinos conversan en el corredor de una casa con un celular en la mano.',
  },
]

// La foto del cierre cuenta de dónde viene cada opción: el taller de Sarchí o la montaña.
const FOTO_MARCA: Record<Tema, { foto: string; alt: string; lado: number }> = {
  sarchi: { foto: fotoArtesano, alt: 'Un artesano de Sarchí pinta los colores de una rueda de carreta.', lado: 880 },
  montana: { foto: fotoFinca, alt: 'Una joven revisa su celular en un cafetal, con las montañas detrás.', lado: 880 },
}

/** Foto en círculo con su órbita: al entrar en pantalla, el círculo se abre y la órbita se dibuja. */
export function FotoOrbita({ foto, alt, lado = 640, className = '' }: { foto: string; alt: string; lado?: number; className?: string }) {
  return (
    <div className={`ln-foto ${className}`}>
      <div className="ln-foto-marco">
        <img src={foto} alt={alt} width={lado} height={lado} loading="lazy" decoding="async" />
      </div>
      <svg className="ln-orbita" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ln-orbita-arco" cx="50" cy="50" r="49" pathLength="100" />
        <g className="ln-orbita-punto">
          <circle cx="99" cy="50" r="2.6" />
        </g>
      </svg>
    </div>
  )
}

export function Gente() {
  return (
    <section id="gente" className="ln-seccion ln-gente">
      <div className="ln-encabezado" data-revelar="subir">
        <h2 className="ln-titulo-seccion">Para la tanda de la familia, la oficina o el barrio.</h2>
        <p className="ln-texto-grande">Cada grupo pone sus reglas: la cuota, cuántas personas y cada cuánto se paga.</p>
      </div>
      <div className="ln-gente-lista">
        {GRUPOS.map((g, i) => (
          <figure key={g.t} className="ln-gente-item" data-revelar="foto" data-retraso={i * 120}>
            <FotoOrbita foto={g.foto} alt={g.alt} />
            <figcaption>
              <h3>{g.t}</h3>
              <p>{g.d}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

export function FotoCierre({ tema }: { tema: Tema }) {
  const f = FOTO_MARCA[tema]
  return <FotoOrbita foto={f.foto} alt={f.alt} lado={f.lado} className="ln-foto-cierre" />
}
