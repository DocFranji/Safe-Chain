//! Leer y guardar datos, y mantenerlos vivos.
//!
//! Stellar cobra "alquiler" por guardar datos: cada entrada tiene una vida (TTL) en ledgers
//! (~5 s cada uno). Si nadie la renueva, el dato se archiva y el contrato deja de verlo.
use soroban_sdk::{Address, Env, Vec};

use crate::{DataKey, Error, Miembro, Tanda};

// Vida de los datos guardados (en ledgers de ~5 s).
// Vida de los datos guardados (en ledgers de ~5 s). Ver `extender_*` abajo.
const TTL_UMBRAL: u32 = 17_280; // ~1 día
const TTL_EXTENDER: u32 = 518_400; // ~30 días

pub(crate) fn direccion_boveda(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Boveda)
        .ok_or(Error::NoInicializado)
}

pub(crate) fn cargar_tanda(env: &Env, id: u32) -> Result<Tanda, Error> {
    let clave = DataKey::Tanda(id);
    let t = env
        .storage()
        .persistent()
        .get(&clave)
        .ok_or(Error::NoEncontrada)?;
    extender(env, &clave);
    Ok(t)
}

pub(crate) fn guardar_tanda(env: &Env, id: u32, t: &Tanda) {
    let clave = DataKey::Tanda(id);
    env.storage().persistent().set(&clave, t);
    extender(env, &clave);
}

pub(crate) fn cargar_miembros(env: &Env, id: u32) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::Miembros(id))
        .unwrap_or(Vec::new(env))
}

pub(crate) fn guardar_miembros(env: &Env, id: u32, v: &Vec<Address>) {
    let clave = DataKey::Miembros(id);
    env.storage().persistent().set(&clave, v);
    extender(env, &clave);
}

pub(crate) fn cargar_miembro(env: &Env, id: u32, dir: &Address) -> Result<Miembro, Error> {
    let clave = DataKey::Miembro(id, dir.clone());
    let m = env
        .storage()
        .persistent()
        .get(&clave)
        .ok_or(Error::NoEsMiembro)?;
    extender(env, &clave);
    Ok(m)
}

pub(crate) fn guardar_miembro(env: &Env, id: u32, dir: &Address, m: &Miembro) {
    let clave = DataKey::Miembro(id, dir.clone());
    env.storage().persistent().set(&clave, m);
    extender(env, &clave);
}

/// Stellar cobra "alquiler" por guardar datos: si no se renueva, el dato se archiva
/// y la tanda "desaparece" a mitad de la demo. Cada vez que tocamos un dato, lo renovamos.
pub(crate) fn extender(env: &Env, clave: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(clave, TTL_UMBRAL, TTL_EXTENDER);
    extender_instancia(env);
}

pub(crate) fn extender_instancia(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
}
