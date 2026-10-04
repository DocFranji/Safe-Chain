//! Leer y guardar datos, y mantenerlos vivos.
//!
//! Stellar cobra "alquiler" por guardar datos: cada entrada tiene una vida (TTL) en ledgers
//! (~5 s cada uno). Si nadie la renueva, el dato se archiva. Desde el protocolo 23 un dato archivado
//! no se pierde (la transacción que lo usa lo restaura), pero cuesta más y la experiencia se vuelve
//! frágil, así que la tanda mantiene vivo todo lo que necesita.
//!
//! Política (misión M1, `docs/tiempos-y-deudas.md`):
//! - **Vida según lo que le falta a la tanda**: lo que falta para que termine + 30 días de margen,
//!   con tope en el máximo de la red (`max_ttl`, ~180 días en testnet). Ver `vida_tanda`.
//! - **`guardar_tanda` renueva TODO lo de la tanda** (lista, miembros, deudas, bóveda). Toda operación
//!   que cambia una tanda termina ahí, así que nadie tiene que acordarse de renovar.
//! - **Piso al leer o escribir un dato suelto** (`extender`): si le quedan menos de 30 días, se lleva a 31.
//!   Ojo: en testnet un dato nuevo nace con solo 7 días de vida.
//! - La instancia (y el código) del contrato, al máximo de la red.
//!
//! Otras misiones: si agregan una clave por tanda, renuévenla con `renovar_para_tanda`.
use soroban_sdk::{vec, Address, Env, IntoVal, Symbol, Val, Vec};

use crate::{ClaveM1, DataKey, Error, Estado, Miembro, Tanda};

/// Segundos por ledger (testnet: 5,0 s medidos el 3 de octubre de 2026).
pub(crate) const SEG_POR_LEDGER: u64 = 5;
/// Ledgers en un día.
pub(crate) const DIA_LEDGERS: u32 = 17_280;
/// Vida extra después del fin previsto de la tanda: cubre cierres atrasados y el `finalizar`.
pub(crate) const MARGEN_LEDGERS: u32 = 30 * DIA_LEDGERS;
/// Piso para datos sueltos: si les quedan menos de 30 días, se llevan a 31.
const PISO_UMBRAL: u32 = 30 * DIA_LEDGERS;
const PISO_VIDA: u32 = 31 * DIA_LEDGERS;

/// Rondas de hasta 10 minutos = tanda de prueba: usa la bóveda rápida si el admin la configuró.
pub(crate) const MAX_PERIODO_RAPIDO_SEG: u64 = 600;

// ---------------------------------------------------------------------------
// Bóveda de cada tanda
// ---------------------------------------------------------------------------

/// La bóveda principal (la que se configuró en `inicializar`).
pub(crate) fn direccion_boveda(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Boveda)
        .ok_or(Error::NoInicializado)
}

/// Qué bóveda le corresponde a una tanda nueva. Las tandas de prueba (rondas de hasta 10 minutos)
/// usan la bóveda rápida si existe; las demás, la principal. (M4: aquí entra la bóveda por token.)
pub(crate) fn elegir_boveda(env: &Env, t: &Tanda) -> Result<Address, Error> {
    if t.periodo_seg <= MAX_PERIODO_RAPIDO_SEG {
        if let Some(b) = env.storage().instance().get(&ClaveM1::BovedaRapida) {
            return Ok(b);
        }
    }
    direccion_boveda(env)
}

/// Elige y guarda la bóveda de la tanda `id`. Se llama al crearla: desde ahí no cambia, aunque el
/// admin configure otra bóveda para las tandas nuevas.
pub(crate) fn fijar_boveda(env: &Env, id: u32, t: &Tanda) -> Result<Address, Error> {
    let b = elegir_boveda(env, t)?;
    let clave = ClaveM1::BovedaDe(id);
    env.storage().persistent().set(&clave, &b);
    renovar_para_tanda(env, t, &clave);
    Ok(b)
}

/// La bóveda de la tanda `id`. Si no estaba guardada (por ejemplo, la creó otra función), la fija ahora.
pub(crate) fn boveda_de(env: &Env, id: u32, t: &Tanda) -> Result<Address, Error> {
    match env.storage().persistent().get(&ClaveM1::BovedaDe(id)) {
        Some(b) => Ok(b),
        None => fijar_boveda(env, id, t),
    }
}

// ---------------------------------------------------------------------------
// Leer y guardar
// ---------------------------------------------------------------------------

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

/// Guarda la tanda y renueva TODO lo que necesita (ver `renovar_tanda`).
pub(crate) fn guardar_tanda(env: &Env, id: u32, t: &Tanda) {
    let clave = DataKey::Tanda(id);
    env.storage().persistent().set(&clave, t);
    renovar_tanda(env, id, t);
}

pub(crate) fn cargar_miembros(env: &Env, id: u32) -> Vec<Address> {
    let clave = DataKey::Miembros(id);
    match env.storage().persistent().get(&clave) {
        Some(v) => {
            extender(env, &clave);
            v
        }
        None => Vec::new(env),
    }
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

// ---------------------------------------------------------------------------
// Vida de los datos (TTL)
// ---------------------------------------------------------------------------

/// Cuántos ledgers deben vivir los datos de la tanda `t`: lo que le falta + 30 días de margen,
/// con tope en el máximo que permite la red.
/// - `Abierta`: como si arrancara ya (n rondas por delante).
/// - `Activa`: hasta el vencimiento de la última ronda.
/// - `PorLiquidar`, `Finalizada`, `Cancelada`: solo el margen. Después de terminar puede archivarse:
///   su historia de largo plazo vive en el historial (misión M2).
pub(crate) fn vida_tanda(env: &Env, t: &Tanda) -> u32 {
    let ahora = env.ledger().timestamp();
    let fin = match t.estado {
        Estado::Abierta => ahora.saturating_add(t.periodo_seg.saturating_mul(t.n_miembros as u64)),
        Estado::Activa => {
            let rondas = t.n_miembros.saturating_sub(t.ronda_actual) as u64;
            t.inicio_ronda
                .saturating_add(t.periodo_seg.saturating_mul(rondas))
        }
        _ => ahora,
    };
    hasta(env, fin)
}

/// Vida de lo que solo importa durante la ronda en curso (los pagos): hasta su vencimiento + margen.
pub(crate) fn vida_ronda(env: &Env, t: &Tanda) -> u32 {
    hasta(env, t.inicio_ronda.saturating_add(t.periodo_seg))
}

/// Ledgers que faltan para el momento `fin` (segundos Unix), más el margen, con tope de la red.
fn hasta(env: &Env, fin: u64) -> u32 {
    let faltan = fin.saturating_sub(env.ledger().timestamp()) / SEG_POR_LEDGER;
    let vida = faltan.saturating_add(MARGEN_LEDGERS as u64);
    vida.min(env.storage().max_ttl() as u64) as u32
}

/// Renueva `clave` (persistente, debe existir) para que viva al menos `vida` ledgers.
/// Solo paga si le falta más de un día para llegar a esa vida.
pub(crate) fn renovar<K: IntoVal<Env, Val>>(env: &Env, clave: &K, vida: u32) {
    let vida = vida.min(env.storage().max_ttl());
    env.storage()
        .persistent()
        .extend_ttl(clave, vida.saturating_sub(DIA_LEDGERS), vida);
}

/// Renueva una clave de la tanda `t` (debe existir) con la vida de la tanda.
/// Para las claves nuevas de cualquier misión (por ejemplo `ClaveM2` u `Opciones(id)`).
pub(crate) fn renovar_para_tanda<K: IntoVal<Env, Val>>(env: &Env, t: &Tanda, clave: &K) {
    renovar(env, clave, vida_tanda(env, t));
}

/// Renueva TODO lo que la tanda `id` necesita para seguir funcionando: la tanda, la lista de
/// miembros, cada miembro, sus deudas, la bóveda de la tanda (su clave, y la instancia y el código
/// del contrato de la bóveda) y la instancia de este contrato. La llama `guardar_tanda`.
pub(crate) fn renovar_tanda(env: &Env, id: u32, t: &Tanda) {
    let vida = vida_tanda(env, t);
    let p = env.storage().persistent();
    renovar(env, &DataKey::Tanda(id), vida);

    let clave_lista = DataKey::Miembros(id);
    if let Some(miembros) = p.get::<_, Vec<Address>>(&clave_lista) {
        renovar(env, &clave_lista, vida);
        for dir in miembros.iter() {
            renovar(env, &DataKey::Miembro(id, dir.clone()), vida);
            let deuda = ClaveM1::DeudaDe(id, dir);
            if p.has(&deuda) {
                renovar(env, &deuda, vida);
            }
        }
    }

    let clave_boveda = ClaveM1::BovedaDe(id);
    if let Some(boveda) = p.get::<_, Address>(&clave_boveda) {
        renovar(env, &clave_boveda, vida);
        // La bóveda es otro contrato: renovar su instancia y su código no necesita permiso.
        let vida_b = vida.min(env.storage().max_ttl());
        env.deployer()
            .extend_ttl(boveda.clone(), vida_b.saturating_sub(DIA_LEDGERS), vida_b);
        // Y sus datos de esta tanda (participaciones), si la bóveda sabe hacerlo: mientras la tanda
        // corre, nadie retira de la bóveda si todos pagan. Es opcional: si la bóveda no tiene
        // `renovar` (o falla), no pasa nada.
        if t.estado == Estado::Activa {
            let _ = env.try_invoke_contract::<(), soroban_sdk::Error>(
                &boveda,
                &Symbol::new(env, "renovar"),
                vec![env, env.current_contract_address().into_val(env)],
            );
        }
    }
    extender_instancia(env);
}

/// Piso para un dato suelto (al leerlo o escribirlo): si le quedan menos de 30 días, se lleva a 31.
/// También renueva la instancia del contrato.
pub(crate) fn extender<K: IntoVal<Env, Val>>(env: &Env, clave: &K) {
    env.storage()
        .persistent()
        .extend_ttl(clave, PISO_UMBRAL, PISO_VIDA);
    extender_instancia(env);
}

/// La instancia (configuración compartida por todas las tandas) y el código del contrato viven
/// lo máximo que permite la red. Se renuevan como mucho una vez al día.
pub(crate) fn extender_instancia(env: &Env) {
    let max = env.storage().max_ttl();
    env.storage()
        .instance()
        .extend_ttl(max.saturating_sub(DIA_LEDGERS), max);
}
