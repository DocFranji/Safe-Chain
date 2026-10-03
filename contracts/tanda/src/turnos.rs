//! Turnos: quién cobra en cada ronda y cuánto colateral deja cada turno.
//!
//! Hoy el turno es el ORDEN DE LLEGADA: el primero en unirse cobra en la ronda 0.
//! La misión de turnos (subasta, sorteo, elegir turno con precio, intercambio) cambia
//! sobre todo este archivo; el resto del contrato solo llama a estas funciones.
use soroban_sdk::{Address, Env, Vec};

use crate::{Tanda, BPS};

/// Turno (posición) que recibe quien se une ahora. Hoy: el siguiente libre por orden de llegada.
pub(crate) fn posicion_al_unirse(_env: &Env, _t: &Tanda, miembros: &Vec<Address>) -> u32 {
    miembros.len()
}

/// Quién cobra la bolsa en la ronda `ronda`. Hoy: quien se unió en esa posición.
pub(crate) fn beneficiario_de_ronda(
    _env: &Env,
    _t: &Tanda,
    miembros: &Vec<Address>,
    ronda: u32,
) -> Address {
    miembros.get(ronda).unwrap()
}

/// colateral_i = max(cuota, cuota × (n − 1 − i) × cobertura / 100%)
/// Con cobertura 100%, alcanza exactamente para las cuotas que el miembro aún debe
/// después de cobrar su turno: huir después de cobrar deja ganancia cero.
pub(crate) fn colateral_para(t: &Tanda, posicion: u32) -> i128 {
    let restantes = (t.n_miembros - 1 - posicion) as i128;
    let base = t.cuota * restantes * t.cobertura_bps as i128 / BPS;
    base.max(t.cuota)
}
