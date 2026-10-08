// Formas de las ruedas (SVG), comunes a los dibujos de cada diseño.

/** Un segmento de anillo apuntando hacia arriba, de ancho 360/n grados menos una ranura (en grados). */
export function segmentoAnular(n: number, adentro: number, afuera: number, ranura = 1.4): string {
  const medio = ((180 / n - ranura / 2) * Math.PI) / 180
  const p = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`
  const grande = 360 / n - ranura > 180 ? 1 : 0
  return `M ${p(afuera, -medio)} A ${afuera} ${afuera} 0 ${grande} 1 ${p(afuera, medio)} L ${p(adentro, medio)} A ${adentro} ${adentro} 0 ${grande} 0 ${p(adentro, -medio)} Z`
}

/** Lleva algo en órbita al ángulo dado, sin girarlo: así queda derecho mientras la rueda gira. */
export function orbita(angulo: number, radio: number) {
  return { transform: `rotate(${angulo}deg) translate(0px, ${-radio}px) rotate(${-angulo}deg)` }
}

/** Un arco (sin relleno) centrado arriba, de ancho 360/n grados menos un margen a cada lado (en grados). */
export function arcoCentrado(n: number, radio: number, margen = 6): string {
  const medio = ((180 / n - margen) * Math.PI) / 180
  const p = (a: number) => `${(radio * Math.sin(a)).toFixed(2)} ${(-radio * Math.cos(a)).toFixed(2)}`
  return `M ${p(-medio)} A ${radio} ${radio} 0 0 1 ${p(medio)}`
}
