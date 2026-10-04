//! Ganchos: avisos internos de lo que le pasa a cada miembro.
//!
//! El flujo principal (`lib.rs`) llama a estas funciones en los momentos clave. Hoy no hacen
//! nada: son el punto de conexión para la misión de HISTORIAL CREDITICIO, que las llena
//! (por ejemplo, avisando a un contrato de historial). Así esa misión no necesita tocar
//! el flujo principal, y las demás misiones no chocan con ella.
//!
//! Reglas para quien las llene:
//! - Nunca deben hacer fallar la operación principal por un problema del historial.
//! - Deben ser baratas: se llaman dentro de bucles (`cerrar_ronda`, `finalizar`).
use soroban_sdk::{Address, Env};

use crate::{Error, Miembro, Tanda};

/// Antes de unirse: ¿esta persona puede entrar? (por ejemplo, un puntaje mínimo).
/// Devolver un `Err` cancela la unión. Hoy: todos pueden.
pub(crate) fn puede_unirse(
    _env: &Env,
    _t: &Tanda,
    _id: u32,
    _miembro: &Address,
) -> Result<(), Error> {
    Ok(())
}

/// Colateral final que deja `miembro` (por ejemplo, con descuento por buen historial).
/// Recibe el colateral normal del turno. Hoy: no cambia nada.
pub(crate) fn ajustar_colateral(
    _env: &Env,
    _t: &Tanda,
    _miembro: &Address,
    colateral: i128,
) -> i128 {
    colateral
}

/// Alguien se unió a la tanda `id` en el turno `posicion` dejando `colateral`.
pub(crate) fn al_unirse(
    _env: &Env,
    _t: &Tanda,
    _id: u32,
    _miembro: &Address,
    _posicion: u32,
    _colateral: i128,
) {
}

/// Alguien pagó su cuota de la ronda `ronda`. `tarde` = después del vencimiento.
pub(crate) fn al_pagar(
    _env: &Env,
    _t: &Tanda,
    _id: u32,
    _miembro: &Address,
    _ronda: u32,
    _tarde: bool,
) {
}

/// Alguien NO pagó y su colateral cubrió `monto` de su cuota en la ronda `ronda`.
pub(crate) fn al_cubrir(
    _env: &Env,
    _t: &Tanda,
    _id: u32,
    _miembro: &Address,
    _ronda: u32,
    _monto: i128,
) {
}

/// Alguien quedó moroso: su colateral no alcanzó y debe `deuda`.
pub(crate) fn al_quedar_moroso(_env: &Env, _t: &Tanda, _id: u32, _miembro: &Address, _deuda: i128) {
}

/// El beneficiario de la ronda `ronda` recibió `monto`.
pub(crate) fn al_cobrar(
    _env: &Env,
    _t: &Tanda,
    _id: u32,
    _miembro: &Address,
    _ronda: u32,
    _monto: i128,
) {
}

/// La tanda terminó: así quedó el miembro (`m.atrasos`, `m.moroso`, `m.deuda`...) y recibió `monto`.
pub(crate) fn al_terminar(
    _env: &Env,
    _t: &Tanda,
    _id: u32,
    _miembro: &Address,
    _m: &Miembro,
    _monto: i128,
) {
}

/// (M1) Alguien pagó `monto` de la deuda de `miembro`; le queda `deuda_restante`
/// (0 = la saldó: ya no es moroso). Puede haberla pagado otra persona.
pub(crate) fn al_pagar_deuda(
    _env: &Env,
    _t: &Tanda,
    _id: u32,
    _miembro: &Address,
    _monto: i128,
    _deuda_restante: i128,
) {
}
