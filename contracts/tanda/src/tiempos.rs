//! Misión **M1**: tiempos de la vida real.
//!
//! - **Calendario anclado** (`inicio_siguiente`): las fechas de pago no se corren aunque una ronda
//!   se cierre tarde, ni tampoco si se cierra antes.
//! - **Cerrar antes** (`revisar_cierre_anticipado`, v4): si todos pagaron, la ronda se puede cerrar
//!   antes de su fecha límite (menos en la subasta).
//! - **Bóveda rápida** (`configurar_boveda_rapida`): una bóveda acelerada solo para tandas de prueba
//!   (rondas de hasta 10 minutos), para que el rendimiento se note en una demo. Las tandas reales
//!   usan la bóveda principal, sin acelerar. Cada tanda guarda su bóveda al crearse.
//!
//! Diseño y decisiones: `docs/tiempos-y-deudas.md`.
use soroban_sdk::{contractimpl, Address, Env};

use crate::almacenamiento::*;
use crate::{
    turnos, ClaveM1, DataKey, Error, EvBovedaRapida, ModoTurnos, Tanda, TandaContract,
    TandaContractArgs, TandaContractClient,
};

/// Si el cierre de una ronda se atrasa mucho, la siguiente igual deja al menos este tiempo para
/// pagar (o la ronda completa, si es más corta).
pub(crate) const GRACIA_MAX_SEG: u64 = 3 * 86_400;

/// Inicio de la ronda que sigue a la de `t` (la que se está cerrando), con calendario anclado:
///
/// `vence_siguiente = max(vence_anterior + periodo, ahora + min(periodo, 3 días))`
///
/// - Las fechas quedan fijas (cada `periodo`) aunque el cierre llegue tarde.
/// - Si el cierre se atrasó tanto que quedaría muy poco para pagar, se da al menos
///   `min(periodo, 3 días)`: nadie queda "tarde" por culpa de un cierre atrasado.
/// - Con rondas de hasta 3 días (por ejemplo, la demo de 1 minuto) da lo mismo que antes:
///   la ronda siguiente empieza al cerrar.
/// - (v4) Si la ronda se cerró antes porque todos pagaron (`ahora < vence_anterior`), la siguiente
///   vence en `vence_anterior + periodo`, como siempre.
///
/// `inicio_ronda` es siempre "fecha límite − periodo". Tras un cierre anticipado queda **en el
/// futuro**: la ronda ya está abierta (se puede pagar desde ya), solo que su plazo es más largo.
pub(crate) fn inicio_siguiente(t: &Tanda, ahora: u64) -> u64 {
    let vence_anterior = t.inicio_ronda + t.periodo_seg;
    let gracia = t.periodo_seg.min(GRACIA_MAX_SEG);
    let vence = (vence_anterior + t.periodo_seg).max(ahora + gracia);
    vence - t.periodo_seg
}

/// (v4) Un cierre anticipado no puede dejar la fecha límite siguiente a más de esto. Cada cierre
/// renueva los datos de la tanda a lo sumo ~180 días (el máximo de la red): con este tope quedan al
/// menos 60 días de margen para pagar y cerrar a tiempo, como con una ronda normal. Sin tope, varios
/// cierres anticipados seguidos alejaban tanto la fecha límite que los datos se archivaban antes.
/// Con rondas mensuales permite adelantar unas 3 rondas; con la ronda más larga (90 días), cerrar
/// antes en sus últimos 30 días.
pub(crate) const HORIZONTE_CIERRE_ANTES_SEG: u64 = 120 * 86_400;

/// (v4) `cerrar_ronda` antes de la fecha límite: solo si todos los miembros pagaron la ronda en curso
/// (así nadie queda cubierto por su garantía ni en mora antes de tiempo), nunca en la subasta (las
/// ofertas están abiertas hasta que vence la ronda) y sin alejar la fecha límite siguiente más de
/// `HORIZONTE_CIERRE_ANTES_SEG`.
///
/// Errores: `SubastaNoCierraAntes` en la subasta; `RondaNoVencida` si falta alguien por pagar;
/// `CierreMuyAdelantado` si la fecha siguiente quedaría muy lejos.
pub(crate) fn revisar_cierre_anticipado(
    env: &Env,
    t: &Tanda,
    id: u32,
    miembros: &soroban_sdk::Vec<Address>,
) -> Result<(), Error> {
    if turnos::opciones(env, t, id).is_some_and(|o| o.modo == ModoTurnos::Subasta) {
        return Err(Error::SubastaNoCierraAntes);
    }
    let p = env.storage().persistent();
    for dir in miembros.iter() {
        if !p.has(&DataKey::Pagado(id, t.ronda_actual, dir)) {
            return Err(Error::RondaNoVencida);
        }
    }
    let vence_siguiente = t.inicio_ronda + 2 * t.periodo_seg;
    if vence_siguiente > env.ledger().timestamp() + HORIZONTE_CIERRE_ANTES_SEG {
        return Err(Error::CierreMuyAdelantado);
    }
    Ok(())
}

#[contractimpl]
impl TandaContract {
    /// (Solo el admin) Bóveda rápida para tandas de prueba (rondas de hasta 10 minutos).
    /// `None` la quita. Solo afecta a las tandas que se creen después: cada tanda conserva la suya.
    pub fn configurar_boveda_rapida(env: Env, boveda: Option<Address>) -> Result<(), Error> {
        let s = env.storage().instance();
        let admin: Address = s.get(&DataKey::Admin).ok_or(Error::NoInicializado)?;
        admin.require_auth();
        match &boveda {
            Some(b) => s.set(&ClaveM1::BovedaRapida, b),
            None => s.remove(&ClaveM1::BovedaRapida),
        }
        extender_instancia(&env);
        EvBovedaRapida { boveda }.publish(&env);
        Ok(())
    }

    /// La bóveda donde está la garantía de la tanda `id` (la web la usa para mostrar el rendimiento).
    pub fn get_boveda(env: Env, id: u32) -> Result<Address, Error> {
        let t = cargar_tanda(&env, id)?;
        match env.storage().persistent().get(&ClaveM1::BovedaDe(id)) {
            Some(b) => Ok(b),
            None => elegir_boveda(&env, &t),
        }
    }
}
