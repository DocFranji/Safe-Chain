//! Ganchos: avisos internos de lo que le pasa a cada miembro.
//!
//! El flujo principal (`lib.rs`) llama a estas funciones en los momentos clave. Las llena la misión
//! M2 (historial crediticio): le reportan cada hecho al contrato `historial` y aplican los requisitos
//! de cada tanda (puntaje mínimo y descuento de garantía). Ver `docs/historial.md`.
//!
//! Reglas:
//! - **Nunca hacen fallar la operación principal por un problema del historial**: las escrituras
//!   usan `try_*` y descartan el error. Si no hay historial configurado, no hacen nada.
//!   (Única excepción: `puede_unirse` en una tanda que PIDIÓ puntaje mínimo; si el historial no
//!   responde, no deja entrar.)
//! - **Son baratas**: dentro de los bucles (`cerrar_ronda`, `finalizar`) solo anotan el hecho en un
//!   búfer de la tanda, y `al_fin_operacion` lo envía en UNA sola llamada al historial.
//! - **Quien llame `al_cubrir`, `al_quedar_moroso`, `al_cobrar` o `al_terminar` debe llamar
//!   `al_fin_operacion` al final de su función**; si no, esos hechos no llegan al historial.
use soroban_sdk::{vec, Address, Env, Vec};

use crate::almacenamiento::renovar_para_tanda;
use crate::requisitos::{direccion_historial, requisitos_de, HistorialClient};
use crate::{ClaveM2, Error, Hecho, HechoMiembro, Miembro, Tanda, BPS};

// ---------------------------------------------------------------------------
// Envío al historial
// ---------------------------------------------------------------------------

/// Envía `hechos` al historial en una sola llamada. Si falla, la tanda sigue igual.
fn enviar(env: &Env, historial: &Address, t: &Tanda, id: u32, hechos: &Vec<HechoMiembro>) {
    if hechos.is_empty() {
        return;
    }
    let _ = HistorialClient::new(env, historial).try_registrar_lote(
        &env.current_contract_address(),
        &id,
        &t.cuota,
        hechos,
    );
}

/// Envía un hecho suelto ya (operaciones con un solo hecho: pagar una cuota, saldar una deuda).
fn enviar_uno(env: &Env, t: &Tanda, id: u32, miembro: &Address, hecho: Hecho, monto: i128) {
    if let Some(h) = direccion_historial(env) {
        let hm = HechoMiembro {
            miembro: miembro.clone(),
            hecho,
            monto,
        };
        enviar(env, &h, t, id, &vec![env, hm]);
    }
}

/// Anota un hecho en el búfer de la tanda `id` (memoria temporal: solo vive en esta operación).
fn anotar(env: &Env, id: u32, miembro: &Address, hecho: Hecho, monto: i128) {
    if direccion_historial(env).is_none() {
        return;
    }
    let clave = ClaveM2::HechosPendientes(id);
    let tmp = env.storage().temporary();
    let mut hechos: Vec<HechoMiembro> = tmp.get(&clave).unwrap_or_else(|| Vec::new(env));
    hechos.push_back(HechoMiembro {
        miembro: miembro.clone(),
        hecho,
        monto,
    });
    tmp.set(&clave, &hechos);
}

/// Fin de una operación que anotó hechos (`cerrar_ronda`, `finalizar`): los envía en un solo lote
/// y vacía el búfer de la tanda.
pub(crate) fn al_fin_operacion(env: &Env, t: &Tanda, id: u32) {
    // Los requisitos viven lo que dure la tanda: se renuevan en cada cierre (en tandas de más de
    // ~150 días se archivarían a mitad de camino; hallazgo 3 de `docs/seguridad.md`).
    let req = ClaveM2::Requisitos(id);
    if env.storage().persistent().has(&req) {
        renovar_para_tanda(env, t, &req);
    }
    let clave = ClaveM2::HechosPendientes(id);
    let tmp = env.storage().temporary();
    let Some(hechos) = tmp.get::<_, Vec<HechoMiembro>>(&clave) else {
        return;
    };
    tmp.remove(&clave);
    if let Some(h) = direccion_historial(env) {
        enviar(env, &h, t, id, &hechos);
    }
}

// ---------------------------------------------------------------------------
// Beneficios (requisitos de la tanda)
// ---------------------------------------------------------------------------

/// Antes de unirse: si la tanda pide puntaje mínimo, ¿lo alcanza?
pub(crate) fn puede_unirse(env: &Env, t: &Tanda, id: u32, miembro: &Address) -> Result<(), Error> {
    // Una tanda puede pasar mucho tiempo abierta: sus requisitos también se renuevan al unirse alguien.
    let clave = ClaveM2::Requisitos(id);
    if env.storage().persistent().has(&clave) {
        renovar_para_tanda(env, t, &clave);
    }
    let req = requisitos_de(env, id);
    if req.puntaje_minimo == 0 {
        return Ok(());
    }
    // La tanda pidió puntaje: sin historial que responda, no se puede comprobar (falla cerrado).
    let h = direccion_historial(env).ok_or(Error::HistorialNoConfigurado)?;
    let puntaje = match HistorialClient::new(env, &h).try_puntaje(miembro) {
        Ok(Ok(p)) => p,
        _ => return Err(Error::HistorialNoConfigurado),
    };
    if puntaje < req.puntaje_minimo {
        return Err(Error::PuntajeInsuficiente);
    }
    Ok(())
}

/// Garantía final que deja `miembro`: con descuento por historial si la tanda lo da.
/// Nunca menos de una cuota (ni más que la normal). Si el historial falla: sin descuento.
pub(crate) fn ajustar_colateral(
    env: &Env,
    t: &Tanda,
    id: u32,
    miembro: &Address,
    colateral: i128,
) -> i128 {
    if !requisitos_de(env, id).descuento {
        return colateral;
    }
    let Some(h) = direccion_historial(env) else {
        return colateral;
    };
    let bps = match HistorialClient::new(env, &h).try_beneficio_colateral_bps(miembro) {
        Ok(Ok(b)) => (b as i128).min(BPS),
        _ => 0,
    };
    let con_descuento = colateral - colateral * bps / BPS;
    con_descuento.max(t.cuota.min(colateral))
}

// ---------------------------------------------------------------------------
// Hechos
// ---------------------------------------------------------------------------

/// Alguien se unió a la tanda `id` en el turno `posicion` dejando `colateral`.
/// (No es un hecho del historial. `posicion` puede no ser un índice: ver misión M3.)
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
pub(crate) fn al_pagar(env: &Env, t: &Tanda, id: u32, miembro: &Address, _ronda: u32, tarde: bool) {
    let hecho = if tarde {
        Hecho::CuotaTarde
    } else {
        Hecho::CuotaATiempo
    };
    enviar_uno(env, t, id, miembro, hecho, t.cuota);
}

/// Alguien NO pagó y su colateral cubrió `monto` de su cuota en la ronda `ronda`.
pub(crate) fn al_cubrir(
    env: &Env,
    _t: &Tanda,
    id: u32,
    miembro: &Address,
    _ronda: u32,
    monto: i128,
) {
    anotar(env, id, miembro, Hecho::CuotaCubierta, monto);
}

/// Alguien quedó moroso: su colateral no alcanzó y debe `deuda`.
pub(crate) fn al_quedar_moroso(env: &Env, _t: &Tanda, id: u32, miembro: &Address, deuda: i128) {
    anotar(env, id, miembro, Hecho::Moroso, deuda);
}

/// El beneficiario de la ronda `ronda` recibió `monto`.
pub(crate) fn al_cobrar(
    env: &Env,
    _t: &Tanda,
    id: u32,
    miembro: &Address,
    _ronda: u32,
    monto: i128,
) {
    anotar(env, id, miembro, Hecho::Cobro, monto);
}

/// La tanda terminó: así quedó el miembro (`m.atrasos`, `m.moroso`...) y recibió `monto`.
/// Un moroso no "termina" la tanda: su mora ya quedó registrada.
pub(crate) fn al_terminar(
    env: &Env,
    _t: &Tanda,
    id: u32,
    miembro: &Address,
    m: &Miembro,
    monto: i128,
) {
    if m.moroso {
        return;
    }
    let hecho = if m.atrasos == 0 {
        Hecho::TandaCumplida
    } else {
        Hecho::TandaConAtrasos
    };
    anotar(env, id, miembro, hecho, monto.max(0));
}

/// (M1) Alguien pagó `monto` de la deuda de `miembro`; le queda `deuda_restante`
/// (0 = la saldó: ya no es moroso). Puede haberla pagado otra persona.
pub(crate) fn al_pagar_deuda(
    env: &Env,
    t: &Tanda,
    id: u32,
    miembro: &Address,
    monto: i128,
    deuda_restante: i128,
) {
    if deuda_restante == 0 {
        enviar_uno(env, t, id, miembro, Hecho::DeudaSaldada, monto);
    }
}
