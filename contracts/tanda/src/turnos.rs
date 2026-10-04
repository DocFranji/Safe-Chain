//! Turnos: quién cobra en cada ronda y cuánto colateral deja cada turno (misión M3).
//!
//! Hay dos caminos y nunca se mezclan:
//! - Tandas SIN opciones (creadas con `crear_tanda`): el turno es el ORDEN DE LLEGADA, exactamente
//!   como siempre. No se escribe ninguna clave de este archivo.
//! - Tandas CON opciones (`crear_tanda_avanzada`): el turno vive en el mapa `Turnos(id)`
//!   (turno → miembro) y lo decide el modo: llegada, elección, precio por turno, sorteo o subasta.
//!
//! Reglas que cumple todo lo de aquí (ver docs/turnos.md):
//! - La garantía de cada turno es la de siempre (`colateral_para`). En sorteo y subasta se deja una
//!   cuota al unirse y el resto se aparta de la bolsa al cobrar (`completar_garantia`).
//! - El azar nunca decide a quién se le paga en la misma transacción: Stellar fija de antemano qué
//!   datos toca cada transacción y la simulación usa otra semilla. Por eso el sorteo se hace al
//!   llenarse la tanda y la subasta sin ofertas usa un orden de respaldo sorteado entonces.
use soroban_sdk::{contracttype, token, Address, Env, IntoVal, Map, TryFromVal, Val, Vec};

use crate::almacenamiento::*;
use crate::{
    ganchos, BovedaClient, Error, EvGarantia, EvPrima, EvPropuestaRetirada, EvSorteo, EvSubasta,
    Miembro, ModoTurnos, Oferta, OpcionesTanda, Propuesta, Tanda, BPS, SIN_TURNO,
};

/// Prima máxima del primer turno en "precio por turno" (20 % de la bolsa).
pub(crate) const MAX_PRIMA_BPS: u32 = 2_000;
/// Descuento máximo que un creador puede permitir en la subasta (50 % de la bolsa).
pub(crate) const MAX_DESCUENTO_BPS: u32 = 5_000;

/// Claves propias de M3 (no tocan `DataKey`). Todas son por tanda.
#[contracttype]
#[derive(Clone)]
pub enum ClaveM3 {
    /// Opciones de la tanda. Si no existe, la tanda es "como siempre".
    Opciones(u32),
    /// Turno → miembro (turnos ya asignados).
    Turnos(u32),
    /// Subasta: mejor oferta de la ronda en curso.
    Oferta(u32),
    /// Subasta: orden sorteado al llenarse, para las rondas sin ofertas.
    Respaldo(u32),
    /// Intercambios pendientes (máximo uno por proponente).
    Propuestas(u32),
    /// Precio por turno: primas cobradas que esperan a los últimos turnos.
    FondoPrimas(u32),
}

// ---------------------------------------------------------------------------
// Leer y guardar (con la misma vida que los datos de la tanda)
// ---------------------------------------------------------------------------

// Misma política que `almacenamiento.rs`. Cuando M1 esté en `integracion`, `renovar` pasa a
// `almacenamiento::renovar_para_tanda(env, t, clave)` (ACORDADO en el tablero).
const TTL_UMBRAL: u32 = 17_280;
const TTL_EXTENDER: u32 = 518_400;

fn renovar(env: &Env, _t: &Tanda, clave: &ClaveM3) {
    env.storage()
        .persistent()
        .extend_ttl(clave, TTL_UMBRAL, TTL_EXTENDER);
}

fn leer<V: TryFromVal<Env, Val>>(env: &Env, t: &Tanda, clave: &ClaveM3) -> Option<V> {
    let v = env.storage().persistent().get(clave);
    if v.is_some() {
        renovar(env, t, clave);
    }
    v
}

fn guardar<V: IntoVal<Env, Val>>(env: &Env, t: &Tanda, clave: &ClaveM3, v: &V) {
    env.storage().persistent().set(clave, v);
    renovar(env, t, clave);
}

/// Opciones de la tanda, o `None` si se creó con `crear_tanda` (comportamiento de siempre).
pub(crate) fn opciones(env: &Env, t: &Tanda, id: u32) -> Option<OpcionesTanda> {
    leer(env, t, &ClaveM3::Opciones(id))
}

pub(crate) fn opciones_por_defecto() -> OpcionesTanda {
    OpcionesTanda {
        modo: ModoTurnos::Llegada,
        permitir_intercambio: false,
        prima_max_bps: 0,
        descuento_max_bps: 0,
    }
}

pub(crate) fn guardar_opciones(env: &Env, t: &Tanda, id: u32, o: &OpcionesTanda) {
    guardar(env, t, &ClaveM3::Opciones(id), o);
    guardar(env, t, &ClaveM3::Turnos(id), &Map::<u32, Address>::new(env));
}

pub(crate) fn turnos_de(env: &Env, t: &Tanda, id: u32) -> Map<u32, Address> {
    leer(env, t, &ClaveM3::Turnos(id)).unwrap_or(Map::new(env))
}

pub(crate) fn guardar_turnos(env: &Env, t: &Tanda, id: u32, turnos: &Map<u32, Address>) {
    guardar(env, t, &ClaveM3::Turnos(id), turnos);
}

/// Mejor oferta de la ronda `ronda` (una oferta de otra ronda ya no vale).
pub(crate) fn oferta_vigente(env: &Env, t: &Tanda, id: u32, ronda: u32) -> Option<Oferta> {
    leer::<Oferta>(env, t, &ClaveM3::Oferta(id)).filter(|o| o.ronda == ronda)
}

pub(crate) fn guardar_oferta(env: &Env, t: &Tanda, id: u32, o: &Oferta) {
    guardar(env, t, &ClaveM3::Oferta(id), o);
}

pub(crate) fn respaldo(env: &Env, t: &Tanda, id: u32) -> Vec<Address> {
    leer(env, t, &ClaveM3::Respaldo(id)).unwrap_or(Vec::new(env))
}

pub(crate) fn propuestas(env: &Env, t: &Tanda, id: u32) -> Vec<Propuesta> {
    leer(env, t, &ClaveM3::Propuestas(id)).unwrap_or(Vec::new(env))
}

pub(crate) fn guardar_propuestas(env: &Env, t: &Tanda, id: u32, v: &Vec<Propuesta>) {
    guardar(env, t, &ClaveM3::Propuestas(id), v);
}

pub(crate) fn fondo_primas(env: &Env, t: &Tanda, id: u32) -> i128 {
    leer(env, t, &ClaveM3::FondoPrimas(id)).unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

/// Cada modo usa solo sus parámetros; los demás deben venir en cero (así nadie cree que aplican).
pub(crate) fn validar_opciones(o: &OpcionesTanda) -> Result<(), Error> {
    let ok = match o.modo {
        ModoTurnos::Llegada | ModoTurnos::Eleccion | ModoTurnos::Sorteo => {
            o.prima_max_bps == 0 && o.descuento_max_bps == 0
        }
        ModoTurnos::PrecioPorTurno => {
            (1..=MAX_PRIMA_BPS).contains(&o.prima_max_bps) && o.descuento_max_bps == 0
        }
        // En la subasta los turnos se asignan al cobrar: no hay turnos futuros que intercambiar.
        ModoTurnos::Subasta => {
            (1..=MAX_DESCUENTO_BPS).contains(&o.descuento_max_bps)
                && o.prima_max_bps == 0
                && !o.permitir_intercambio
        }
    };
    if ok {
        Ok(())
    } else {
        Err(Error::OpcionesInvalidas)
    }
}

// ---------------------------------------------------------------------------
// Las puertas que usa el flujo principal (lib.rs)
// ---------------------------------------------------------------------------

/// Turno (posición) que recibe quien se une ahora. `pedido` = el turno que eligió (`unirse_en_turno`).
/// - Sin opciones, o modo llegada: el siguiente por orden de llegada (como siempre).
/// - Elección y precio por turno: el turno pedido, o el libre más bajo si no pidió ninguno.
/// - Sorteo y subasta: todavía ninguno (`SIN_TURNO`).
pub(crate) fn posicion_al_unirse(
    env: &Env,
    t: &Tanda,
    id: u32,
    miembros: &Vec<Address>,
    pedido: Option<u32>,
) -> Result<u32, Error> {
    let modo = match opciones(env, t, id) {
        None => ModoTurnos::Llegada,
        Some(o) => o.modo,
    };
    match modo {
        ModoTurnos::Eleccion | ModoTurnos::PrecioPorTurno => {
            let turnos = turnos_de(env, t, id);
            match pedido {
                Some(p) if p >= t.n_miembros => Err(Error::TurnoInvalido),
                Some(p) if turnos.contains_key(p) => Err(Error::TurnoOcupado),
                Some(p) => Ok(p),
                None => Ok((0..t.n_miembros)
                    .find(|p| !turnos.contains_key(*p))
                    .unwrap_or(t.n_miembros)),
            }
        }
        _ if pedido.is_some() => Err(Error::ModoNoPermite),
        ModoTurnos::Sorteo | ModoTurnos::Subasta => Ok(SIN_TURNO),
        _ => Ok(miembros.len()),
    }
}

/// colateral_i = max(cuota, cuota × (n − 1 − i) × cobertura / 100%)
/// Con cobertura 100%, alcanza exactamente para las cuotas que el miembro aún debe
/// después de cobrar su turno: huir después de cobrar deja ganancia cero.
pub(crate) fn colateral_para(t: &Tanda, posicion: u32) -> i128 {
    let restantes = (t.n_miembros - 1 - posicion) as i128;
    let base = t.cuota * restantes * t.cobertura_bps as i128 / BPS;
    base.max(t.cuota)
}

/// Colateral que deja al unirse quien recibe el turno `posicion`. Sin turno todavía (sorteo,
/// subasta): el del último turno (una cuota); el resto se aparta de su bolsa al cobrar.
pub(crate) fn colateral_al_unirse(t: &Tanda, posicion: u32) -> i128 {
    if posicion == SIN_TURNO {
        colateral_para(t, t.n_miembros - 1)
    } else {
        colateral_para(t, posicion)
    }
}

/// Colateral base (antes de los descuentos de historial) del próximo en unirse sin elegir turno.
/// Lo usan `colateral_siguiente` y el historial (M2).
pub(crate) fn colateral_base_siguiente(env: &Env, t: &Tanda, id: u32) -> Result<i128, Error> {
    let miembros = cargar_miembros(env, id);
    if miembros.len() >= t.n_miembros {
        return Err(Error::TandaLlena);
    }
    let pos = posicion_al_unirse(env, t, id, &miembros, None)?;
    Ok(colateral_al_unirse(t, pos))
}

/// Después de guardar al nuevo miembro: anota su turno en el mapa (solo tandas con opciones).
pub(crate) fn al_unirse(env: &Env, t: &Tanda, id: u32, miembro: &Address, posicion: u32) {
    if posicion == SIN_TURNO || opciones(env, t, id).is_none() {
        return;
    }
    let mut turnos = turnos_de(env, t, id);
    turnos.set(posicion, miembro.clone());
    guardar_turnos(env, t, id, &turnos);
}

/// Cuando entra el último. Sorteo: el contrato sortea el orden y asigna los turnos.
/// Subasta: sortea el orden de respaldo (quién cobra en las rondas sin ofertas).
/// En esta transacción no se le paga a nadie, así el resultado del azar no cambia qué datos toca.
pub(crate) fn al_llenarse(
    env: &Env,
    t: &Tanda,
    id: u32,
    miembros: &Vec<Address>,
) -> Result<(), Error> {
    let Some(o) = opciones(env, t, id) else {
        return Ok(());
    };
    match o.modo {
        ModoTurnos::Sorteo => {
            let mut orden = miembros.clone();
            env.prng().shuffle(&mut orden);
            let mut turnos = Map::new(env);
            for (i, dir) in orden.iter().enumerate() {
                let i = i as u32;
                let mut m = cargar_miembro(env, id, &dir)?;
                m.posicion = i;
                guardar_miembro(env, id, &dir, &m);
                turnos.set(i, dir);
            }
            guardar_turnos(env, t, id, &turnos);
            EvSorteo { id, orden }.publish(env);
        }
        ModoTurnos::Subasta => {
            let mut orden = miembros.clone();
            env.prng().shuffle(&mut orden);
            guardar(env, t, &ClaveM3::Respaldo(id), &orden);
        }
        _ => {}
    }
    Ok(())
}

/// Regla 3 de `cerrar_ronda`: quién cobra la ronda y cuánto le toca de la bolsa, ANTES de
/// apartar su garantía (`completar_garantia`) o de retenerla si está en mora.
/// - Sin opciones: quien se unió en esa posición, con la bolsa completa (como siempre).
/// - Con opciones: el dueño del turno con su prima (precio por turno), o el ganador de la
///   subasta con su descuento (que se reparte como dividendo).
pub(crate) fn resolver_ronda(
    env: &Env,
    t: &mut Tanda,
    id: u32,
    miembros: &Vec<Address>,
    ronda: u32,
    bolsa: i128,
) -> Result<(Address, i128), Error> {
    let Some(o) = opciones(env, t, id) else {
        return Ok((miembros.get(ronda).unwrap(), bolsa));
    };
    limpiar_propuestas(env, t, id, ronda + 1)?;
    match o.modo {
        ModoTurnos::Subasta => resolver_subasta(env, t, id, miembros, ronda, bolsa),
        modo => {
            let duenio = turnos_de(env, t, id)
                .get(ronda)
                .ok_or(Error::NoEncontrada)?;
            let bolsa = if modo == ModoTurnos::PrecioPorTurno {
                aplicar_prima(env, t, id, &o, ronda, &duenio, bolsa)
            } else {
                bolsa
            };
            Ok((duenio, bolsa))
        }
    }
}

/// Aparta de la bolsa de quien cobra lo que le falta a su garantía para el turno que cobra
/// (sorteo y subasta, quien adelantó su turno en un intercambio, o quien ya usó su garantía
/// para cubrir un impago). Va a la bóveda y vuelve al final con rendimiento.
/// Devuelve cuánto se apartó: siempre 0 en las tandas sin opciones (así funcionan hoy).
pub(crate) fn completar_garantia(
    env: &Env,
    t: &mut Tanda,
    id: u32,
    dir: &Address,
    m: &mut Miembro,
    disponible: i128,
) -> Result<i128, Error> {
    // Quien cobra la ronda `r` tiene el turno `r` (m.posicion == ronda). Sin turno válido no se
    // aparta nada (no debería pasar; así `colateral_para` nunca se desborda).
    if disponible <= 0 || m.posicion >= t.n_miembros || opciones(env, t, id).is_none() {
        return Ok(0);
    }
    let ronda = m.posicion;
    let objetivo = ganchos::ajustar_colateral(env, t, dir, colateral_para(t, ronda));
    let apartar = (objetivo - m.colateral).min(disponible);
    if apartar <= 0 {
        return Ok(0);
    }
    depositar_en_boveda(env, t, id, apartar)?;
    m.colateral += apartar;
    m.colateral_inicial += apartar;
    EvGarantia {
        id,
        ronda,
        miembro: dir.clone(),
        monto: apartar,
    }
    .publish(env);
    Ok(apartar)
}

// ---------------------------------------------------------------------------
// Precio por turno
// ---------------------------------------------------------------------------

/// prima_i = bolsa × prima_max × (n − 1 − 2i) / (n − 1). Positiva: paga (primeros turnos);
/// negativa: recibe (últimos). Como la división redondea hacia cero, prima_i = −prima_(n−1−i)
/// exacto y la suma de todas es 0: lo que pagan los apurados lo ganan los pacientes.
pub(crate) fn prima_de_turno(t: &Tanda, prima_max_bps: u32, posicion: u32) -> i128 {
    let n = t.n_miembros as i128;
    let factor = n - 1 - 2 * posicion as i128;
    t.cuota * n * prima_max_bps as i128 * factor / ((n - 1) * BPS)
}

/// Descuenta la prima de la bolsa (va al fondo) o le suma la bonificación (sale del fondo).
/// Las primas positivas siempre se cobran antes que las bonificaciones, así el fondo nunca
/// queda en negativo y termina en 0. Si la bolsa se retiene (moroso), la prima igual se aparta.
fn aplicar_prima(
    env: &Env,
    t: &mut Tanda,
    id: u32,
    o: &OpcionesTanda,
    ronda: u32,
    duenio: &Address,
    bolsa: i128,
) -> i128 {
    let prima = prima_de_turno(t, o.prima_max_bps, ronda);
    let mut fondo = fondo_primas(env, t, id);
    let movida = if prima >= 0 {
        prima.min(bolsa)
    } else {
        -((-prima).min(fondo))
    };
    fondo += movida;
    // Por seguridad: si en el último turno quedara algo en el fondo, se reparte al final.
    if ronda + 1 == t.n_miembros && fondo > 0 {
        t.retenido += fondo;
        fondo = 0;
    }
    guardar(env, t, &ClaveM3::FondoPrimas(id), &fondo);
    if movida != 0 {
        EvPrima {
            id,
            ronda,
            miembro: duenio.clone(),
            prima: movida,
        }
        .publish(env);
    }
    bolsa - movida
}

// ---------------------------------------------------------------------------
// Subasta
// ---------------------------------------------------------------------------

/// Gana la mejor oferta válida; si no hay, el primero del orden de respaldo que aún no tenga
/// turno y esté al día; si todos los que faltan están en mora, el primero de ellos (su bolsa se
/// retendrá). El descuento se reparte en partes iguales entre los demás miembros al día, como
/// dividendo que se suma a su garantía (un solo depósito en la bóveda).
/// Se reescriben TODOS los miembros: así los datos que toca la transacción no dependen de quién gane.
fn resolver_subasta(
    env: &Env,
    t: &mut Tanda,
    id: u32,
    miembros: &Vec<Address>,
    ronda: u32,
    bolsa: i128,
) -> Result<(Address, i128), Error> {
    let mut datos: Vec<Miembro> = Vec::new(env);
    for dir in miembros.iter() {
        datos.push_back(cargar_miembro(env, id, &dir)?);
    }
    let elegible = |i: u32| {
        let m = datos.get(i).unwrap();
        m.posicion == SIN_TURNO && !m.moroso
    };

    // 1) La mejor oferta, si quien la hizo sigue pudiendo cobrar.
    let oferta = oferta_vigente(env, t, id, ronda);
    env.storage().persistent().remove(&ClaveM3::Oferta(id));
    let mut ganador: Option<u32> = None;
    let mut descuento_bps: u32 = 0;
    if let Some(of) = oferta {
        if let Some(i) = miembros.first_index_of(&of.miembro) {
            if elegible(i) {
                ganador = Some(i);
                descuento_bps = of.descuento_bps;
            }
        }
    }
    // 2) Sin oferta válida: el orden de respaldo (sorteado al llenarse).
    let por_respaldo = ganador.is_none();
    if ganador.is_none() {
        ganador = respaldo(env, t, id)
            .iter()
            .filter_map(|d| miembros.first_index_of(&d))
            .find(|i| elegible(*i));
    }
    // 3) Todos los que faltan están en mora: el primero sin turno (su bolsa se retiene).
    if ganador.is_none() {
        ganador = (0..miembros.len()).find(|i| datos.get(*i).unwrap().posicion == SIN_TURNO);
    }
    let g = ganador.ok_or(Error::NoEncontrada)?;
    let dir_ganador = miembros.get(g).unwrap();

    // Descuento y dividendos.
    let descuento = bolsa * descuento_bps as i128 / BPS;
    let mut receptores: Vec<u32> = Vec::new(env);
    for i in 0..miembros.len() {
        if i != g && !datos.get(i).unwrap().moroso {
            receptores.push_back(i);
        }
    }
    let k = receptores.len() as i128;
    let dividendo = if k > 0 { descuento / k } else { 0 };
    if descuento > 0 {
        if k == 0 {
            t.retenido += descuento; // nadie al día puede recibirlo: se reparte al final
        } else {
            let resto = descuento - dividendo * k;
            for (j, i) in receptores.iter().enumerate() {
                let mut m = datos.get(i).unwrap();
                m.colateral += dividendo + if j as i128 == k - 1 { resto } else { 0 };
                datos.set(i, m);
            }
            depositar_en_boveda(env, t, id, descuento)?;
        }
    }

    let mut mg = datos.get(g).unwrap();
    mg.posicion = ronda;
    datos.set(g, mg);
    for (i, dir) in miembros.iter().enumerate() {
        guardar_miembro(env, id, &dir, &datos.get(i as u32).unwrap());
    }
    let mut turnos = turnos_de(env, t, id);
    turnos.set(ronda, dir_ganador.clone());
    guardar_turnos(env, t, id, &turnos);

    EvSubasta {
        id,
        ronda,
        ganador: dir_ganador.clone(),
        descuento,
        dividendo,
        por_respaldo,
    }
    .publish(env);
    Ok((dir_ganador, bolsa - descuento))
}

// ---------------------------------------------------------------------------
// Intercambios
// ---------------------------------------------------------------------------

/// ¿Este miembro puede cambiar su turno? Debe tener turno, que sea futuro y estar al día.
pub(crate) fn intercambiable(m: &Miembro, ronda_actual: u32) -> bool {
    m.posicion != SIN_TURNO && m.posicion > ronda_actual && !m.cobro && !m.moroso
}

/// Retira las propuestas que ya no se pueden aceptar desde la ronda `desde` (un turno llegó o
/// alguien cayó en mora) y devuelve lo guardado a quien propuso. Así nunca queda dinero atrapado.
fn limpiar_propuestas(env: &Env, t: &Tanda, id: u32, desde: u32) -> Result<(), Error> {
    let props = propuestas(env, t, id);
    if props.is_empty() {
        return Ok(());
    }
    let mut quedan = Vec::new(env);
    for p in props.iter() {
        let a = cargar_miembro(env, id, &p.de)?;
        let b = cargar_miembro(env, id, &p.con)?;
        if intercambiable(&a, desde) && intercambiable(&b, desde) {
            quedan.push_back(p);
        } else {
            devolver_compensacion(env, t, &p);
            EvPropuestaRetirada {
                id,
                de: p.de,
                con: p.con,
            }
            .publish(env);
        }
    }
    guardar_propuestas(env, t, id, &quedan);
    Ok(())
}

/// Lo que `de` dejó guardado al proponer vuelve a `de`.
pub(crate) fn devolver_compensacion(env: &Env, t: &Tanda, p: &Propuesta) {
    if p.compensacion > 0 {
        token::Client::new(env, &t.token).transfer(
            &env.current_contract_address(),
            &p.de,
            &p.compensacion,
        );
    }
}

// ---------------------------------------------------------------------------
// Bóveda
// ---------------------------------------------------------------------------

/// Deposita en la bóveda `monto` que ya está en el contrato (como `unirse`).
fn depositar_en_boveda(env: &Env, t: &mut Tanda, _id: u32, monto: i128) -> Result<(), Error> {
    let yo = env.current_contract_address();
    // Cuando M1 esté en `integracion`: `boveda_de(env, id, t)` (ACORDADO en el tablero).
    let boveda = direccion_boveda(env)?;
    token::Client::new(env, &t.token).approve(
        &yo,
        &boveda,
        &monto,
        &(env.ledger().sequence() + 100),
    );
    t.shares_boveda += BovedaClient::new(env, &boveda).depositar(&yo, &monto);
    Ok(())
}
