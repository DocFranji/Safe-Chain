//! Misión **M1 (v5)**: el nombre de la tanda, guardado en el contrato.
//!
//! - Se elige **al crear** (en la misma firma): `crear_tanda_con_nombre` y
//!   `crear_tanda_avanzada_con_nombre`. Un nombre vacío significa "sin nombre" (se muestra "Tanda N").
//! - Es público y no se puede cambiar después.
//! - Se guarda en una clave propia (`ClaveM1::Nombre(id)`), no dentro de `Tanda`: así `get_tanda` y las
//!   tandas anteriores no cambian. `get_nombre` y `get_nombres` lo leen barato desde la lista.
//! - También viaja en el evento `creada` (campo `nombre`).
//!
//! Reglas (`validar`): de 2 a 40 caracteres; letras (con tildes: á é í ó ú ü ñ y el resto de Latin-1),
//! números, espacios y `. , - _ ! ? ¿ ¡`; sin espacio al principio ni al final. Cuenta caracteres, no
//! bytes. El texto debe llegar normalizado (NFC): una `e` más un acento suelto no es válida.
//!
//! Diseño y decisiones: `docs/tiempos-y-deudas.md`, sección "v5".
use soroban_sdk::{contractimpl, Address, Env, String, Vec};

use crate::almacenamiento::*;
use crate::{
    ClaveM1, Error, OpcionesTanda, Tanda, TandaContract, TandaContractArgs, TandaContractClient,
};

/// Caracteres mínimo y máximo de un nombre.
pub const NOMBRE_MIN: u32 = 2;
pub const NOMBRE_MAX: u32 = 40;
/// Bytes máximos: ningún carácter permitido ocupa más de 2 bytes en UTF-8.
const BYTES_MAX: usize = (NOMBRE_MAX as usize) * 2;
/// Cuántos nombres devuelve `get_nombres` como máximo en una llamada.
const LOTE_MAX: u32 = 50;

/// Decodifica el carácter que empieza en `b[i]` y dice si está permitido.
/// Devuelve `(es_espacio, bytes_que_ocupa)`; `None` si el carácter no se permite.
fn caracter(b: &[u8], i: usize) -> Option<(bool, usize)> {
    let c = b[i];
    match c {
        b' ' => Some((true, 1)),
        b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' => Some((false, 1)),
        b'.' | b',' | b'-' | b'_' | b'!' | b'?' => Some((false, 1)),
        // Dos bytes: ¡ (C2 A1), ¿ (C2 BF) y las letras de Latin-1 (U+00C0–U+00FF: C3 80–BF),
        // menos × (C3 97) y ÷ (C3 B7).
        0xC2 => match b.get(i + 1) {
            Some(0xA1) | Some(0xBF) => Some((false, 2)),
            _ => None,
        },
        0xC3 => match b.get(i + 1) {
            Some(0x97) | Some(0xB7) => None,
            Some(0x80..=0xBF) => Some((false, 2)),
            _ => None,
        },
        _ => None,
    }
}

/// Revisa un nombre. Vacío = sin nombre (válido). Si no, `NombreInvalido`.
pub(crate) fn validar(nombre: &String) -> Result<(), Error> {
    let len = nombre.len() as usize;
    if len == 0 {
        return Ok(());
    }
    if len > BYTES_MAX {
        return Err(Error::NombreInvalido);
    }
    let mut buf = [0u8; BYTES_MAX];
    nombre.copy_into_slice(&mut buf[..len]);
    let b = &buf[..len];

    let (mut i, mut caracteres) = (0usize, 0u32);
    let mut ultimo_espacio = false;
    while i < len {
        let (espacio, ocupa) = caracter(b, i).ok_or(Error::NombreInvalido)?;
        if espacio && (i == 0) {
            return Err(Error::NombreInvalido);
        }
        ultimo_espacio = espacio;
        caracteres += 1;
        i += ocupa;
    }
    if ultimo_espacio || !(NOMBRE_MIN..=NOMBRE_MAX).contains(&caracteres) {
        return Err(Error::NombreInvalido);
    }
    Ok(())
}

/// La llama `crear_en` ya con el nombre validado: lo guarda (si no está vacío) con la vida de la tanda.
pub(crate) fn guardar(env: &Env, t: &Tanda, id: u32, nombre: &String) {
    if nombre.is_empty() {
        return;
    }
    let clave = ClaveM1::Nombre(id);
    env.storage().persistent().set(&clave, nombre);
    renovar_para_tanda(env, t, &clave);
}

fn leer(env: &Env, id: u32) -> String {
    env.storage()
        .persistent()
        .get(&ClaveM1::Nombre(id))
        .unwrap_or_else(|| String::from_str(env, ""))
}

#[contractimpl]
impl TandaContract {
    /// Igual que `crear_tanda` (orden de llegada, mismas reglas), con nombre. `nombre` vacío = sin
    /// nombre; si no, de 2 a 40 caracteres (error `NombreInvalido`).
    pub fn crear_tanda_con_nombre(
        env: Env,
        creador: Address,
        token: Address,
        cuota: i128,
        n_miembros: u32,
        periodo_seg: u64,
        penalidad_bps: u32,
        cobertura_bps: u32,
        nombre: String,
    ) -> Result<u32, Error> {
        Self::crear_en(
            env,
            creador,
            token,
            cuota,
            n_miembros,
            periodo_seg,
            penalidad_bps,
            cobertura_bps,
            nombre,
        )
    }

    /// Igual que `crear_tanda_avanzada` (turnos a elección), con nombre.
    pub fn crear_tanda_avanzada_con_nombre(
        env: Env,
        creador: Address,
        token: Address,
        cuota: i128,
        n_miembros: u32,
        periodo_seg: u64,
        penalidad_bps: u32,
        cobertura_bps: u32,
        opciones: OpcionesTanda,
        nombre: String,
    ) -> Result<u32, Error> {
        Self::avanzada_en(
            env,
            creador,
            token,
            cuota,
            n_miembros,
            periodo_seg,
            penalidad_bps,
            cobertura_bps,
            opciones,
            nombre,
        )
    }

    /// El nombre de la tanda `id`. Vacío si no tiene (o si la tanda no existe): se muestra "Tanda N".
    /// Solo lectura y barata (una sola entrada).
    pub fn get_nombre(env: Env, id: u32) -> String {
        leer(&env, id)
    }

    /// Los nombres de las tandas `desde`, `desde + 1`, … (hasta 50 por llamada): la posición `i` del
    /// resultado es el nombre de la tanda `desde + i`. Para la lista, en una sola consulta.
    pub fn get_nombres(env: Env, desde: u32, cuantos: u32) -> Vec<String> {
        let mut out = Vec::new(&env);
        for i in 0..cuantos.min(LOTE_MAX) {
            let Some(id) = desde.checked_add(i) else {
                break;
            };
            out.push_back(leer(&env, id));
        }
        out
    }
}
