//! Pruebas de la misión M1 (tandas largas y TTL). Ya está declarado en `lib.rs`.
//! Usa los helpers compartidos (`setup`, `Ctx`, `assert_conservacion`, ...) de `test.rs`.
//!
//! OJO con el entorno de pruebas: desde el SDK 23, leer un dato archivado NO falla en las pruebas
//! (se "restaura solo", igual que en la red desde el protocolo 23, pero allá con costo extra).
//! Por eso estas pruebas no esperan un error: revisan el TTL de cada dato ANTES de cada salto de
//! tiempo y fallan si alguno se archivaría en el camino.
#![allow(unused_imports)]
extern crate std;

use crate::test::*;
use crate::*;
use soroban_sdk::{
    contracttype,
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Ledger,
    },
    token::StellarAssetClient,
    vec, Address, Env, IntoVal, Val,
};
use std::{format, string::String, vec::Vec as StdVec};

/// Segundos por ledger en la red (aproximado).
pub(crate) const SEG_POR_LEDGER: u64 = 5;
pub(crate) const DIA: u64 = 86_400;
pub(crate) const SEMANA: u64 = 7 * DIA;
/// En la interfaz, 1 mes = 30 días.
pub(crate) const MES: u64 = 30 * DIA;

/// Límites de testnet (consultados por RPC en la configuración de la red, ledger 5 008 837).
pub(crate) const MAX_TTL_TESTNET: u32 = 3_110_400; // ~180 días
pub(crate) const MIN_TTL_PERSISTENTE_TESTNET: u32 = 120_960; // ~7 días

/// Saldo de las personas extra (la primera de 12 deja 11 cuotas de garantía).
pub(crate) const SALDO_GRANDE: i128 = 5_000 * U;

/// Misma forma que la clave privada `Clave::Shares` de la bóveda simulada, para leer su TTL.
#[contracttype]
#[derive(Clone)]
enum ClaveBoveda {
    Shares(Address),
}

/// Copia los límites de vida de los datos de testnet en el entorno de pruebas.
pub(crate) fn como_testnet(c: &Ctx) {
    c.env.ledger().with_mut(|l| {
        l.max_entry_ttl = MAX_TTL_TESTNET;
        l.min_persistent_entry_ttl = MIN_TTL_PERSISTENTE_TESTNET;
    });
}

/// Pasa el tiempo de verdad: avanza el reloj Y los ledgers (uno cada 5 s).
/// (El helper `avanzar` de test.rs solo suma un ledger: sirve para minutos, no para meses.)
pub(crate) fn pasar(c: &Ctx, segundos: u64) {
    c.env.ledger().with_mut(|l| {
        l.timestamp += segundos;
        l.sequence_number += (segundos / SEG_POR_LEDGER) as u32;
    });
}

/// `n` personas con saldo de sobra (la primera, ana, la segunda, beto, la tercera, carla).
pub(crate) fn personas(c: &Ctx, n: usize) -> StdVec<Address> {
    let sac = StellarAssetClient::new(&c.env, &c.token.address);
    let mut v = std::vec![c.ana.clone(), c.beto.clone(), c.carla.clone()];
    for p in &v {
        sac.mint(p, &(SALDO_GRANDE - SALDO_INICIAL));
    }
    while v.len() < n {
        let p = Address::generate(&c.env);
        sac.mint(&p, &SALDO_GRANDE);
        v.push(p);
    }
    v.truncate(n);
    v
}

/// Conservación con cualquier lista de personas: nada se crea ni se pierde.
pub(crate) fn assert_conservacion_de(c: &Ctx, gente: &[Address]) {
    let mut total = c.saldo(&c.boveda) + c.saldo(&c.tanda_addr);
    for p in gente {
        total += c.saldo(p);
    }
    // ana, beto y carla empezaron con SALDO_INICIAL y `personas` les completó SALDO_GRANDE.
    let n_extra = gente.len().saturating_sub(3) as i128;
    let esperado = FONDEO_BOVEDA + 3 * SALDO_GRANDE + n_extra * SALDO_GRANDE;
    assert_eq!(total, esperado, "el dinero no cuadra");
}

fn ttl_persistente<K: IntoVal<Env, Val>>(env: &Env, contrato: &Address, clave: &K) -> u32 {
    env.as_contract(contrato, || env.storage().persistent().get_ttl(clave))
}

fn existe<K: IntoVal<Env, Val>>(env: &Env, contrato: &Address, clave: &K) -> bool {
    env.as_contract(contrato, || env.storage().persistent().has(clave))
}

fn ttl_instancia(env: &Env, contrato: &Address) -> u32 {
    env.as_contract(contrato, || env.storage().instance().get_ttl())
}

/// Vida (TTL, en ledgers) de cada dato que la tanda `id` necesita para seguir funcionando:
/// la instancia del contrato, la tanda, la lista de miembros, cada miembro, los pagos de la
/// ronda en curso y, en la bóveda, su instancia y las participaciones del contrato de la tanda.
pub(crate) fn vidas(c: &Ctx, id: u32) -> StdVec<(String, u32)> {
    let env = &c.env;
    let yo = &c.tanda_addr;
    let mut out = StdVec::new();
    out.push((String::from("instancia de la tanda"), ttl_instancia(env, yo)));
    out.push((
        format!("Tanda({id})"),
        ttl_persistente(env, yo, &DataKey::Tanda(id)),
    ));
    out.push((
        format!("Miembros({id})"),
        ttl_persistente(env, yo, &DataKey::Miembros(id)),
    ));
    let t = c.tanda.get_tanda(&id);
    let lista: soroban_sdk::Vec<Address> = env.as_contract(yo, || {
        env.storage()
            .persistent()
            .get(&DataKey::Miembros(id))
            .unwrap()
    });
    for (i, dir) in lista.iter().enumerate() {
        out.push((
            format!("Miembro({id}, #{i})"),
            ttl_persistente(env, yo, &DataKey::Miembro(id, dir.clone())),
        ));
        let pago = DataKey::Pagado(id, t.ronda_actual, dir.clone());
        if t.estado == Estado::Activa && existe(env, yo, &pago) {
            out.push((
                format!("Pagado({id}, {}, #{i})", t.ronda_actual),
                ttl_persistente(env, yo, &pago),
            ));
        }
    }
    out.push((String::from("instancia de la bóveda"), ttl_instancia(env, &c.boveda)));
    let shares = ClaveBoveda::Shares(yo.clone());
    if existe(env, &c.boveda, &shares) {
        out.push((
            String::from("bóveda: Shares(tanda)"),
            ttl_persistente(env, &c.boveda, &shares),
        ));
    }
    out
}

/// Falla si algún dato de la tanda se archivaría al pasar `segundos`.
pub(crate) fn assert_sobrevive(c: &Ctx, id: u32, segundos: u64, momento: &str) {
    let salto = (segundos / SEG_POR_LEDGER) as u32;
    for (nombre, ttl) in vidas(c, id) {
        assert!(
            ttl >= salto,
            "{momento}: {nombre} se archivaría (le quedan {ttl} ledgers y vamos a avanzar {salto})"
        );
    }
}

/// Pasa el tiempo comprobando antes que nada de la tanda se archive en el camino.
pub(crate) fn pasar_sin_archivar(c: &Ctx, id: u32, segundos: u64, momento: &str) {
    assert_sobrevive(c, id, segundos, momento);
    pasar(c, segundos);
}

// ===========================================================================
// A1: los datos no deben archivarse en una tanda de 12 meses
// ===========================================================================

/// Tanda mensual de 12 personas (12 meses) de punta a punta. Todos pagan a los 3 días de abrir
/// cada ronda y la ronda se cierra 2 días después de vencer (atraso realista).
/// Antes del arreglo fallaba: `Miembros(id)` (y las participaciones en la bóveda) no se renovaban.
#[test]
fn tanda_mensual_de_12_meses_sin_datos_archivados() {
    let c = setup_con(500, 1, false);
    como_testnet(&c);
    let gente = personas(&c, 12);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &12,
        &MES,
        &1_000,
        &10_000,
    );
    for (i, p) in gente.iter().enumerate() {
        c.tanda.unirse(&id, p);
        if i + 1 < gente.len() {
            // Llenar una tanda real toma días.
            pasar_sin_archivar(&c, id, DIA, "mientras se llena");
        }
    }
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Activa);

    for ronda in 0..12u32 {
        pasar_sin_archivar(&c, id, 3 * DIA, &format!("ronda {ronda}, antes de pagar"));
        for p in &gente {
            c.tanda.pagar_cuota(&id, p);
        }
        // Vence a los 30 días; se cierra 2 días tarde.
        pasar_sin_archivar(&c, id, MES - 3 * DIA + 2 * DIA, &format!("ronda {ronda}, antes de cerrar"));
        c.tanda.cerrar_ronda(&id);
    }
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::PorLiquidar);
    pasar_sin_archivar(&c, id, 5 * DIA, "antes de finalizar");
    c.tanda.finalizar(&id);

    for p in &gente {
        assert!(!c.miembro(id, p).moroso);
    }
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(&c, &gente);
}

// ===========================================================================
// A2: la bóveda simulada no debe quedar insolvente con tandas de meses
// ===========================================================================

/// Con el acelerador de la demo (×52 560), un mes de tanda equivale a ~4 300 años de intereses:
/// la bóveda debía mucho más de lo que tenía y `finalizar` fallaba (la tanda quedaba trabada).
#[test]
fn boveda_acelerada_con_meses_no_traba_la_tanda() {
    let c = setup_con(500, 52_560, false);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &MES,
        &1_000,
        &10_000,
    );
    c.tanda.unirse(&id, &c.ana);
    c.tanda.unirse(&id, &c.beto);
    c.tanda.unirse(&id, &c.carla);
    for _ in 0..3 {
        for p in [&c.ana, &c.beto, &c.carla] {
            c.tanda.pagar_cuota(&id, p);
        }
        pasar(&c, MES);
        c.tanda.cerrar_ronda(&id);
    }
    c.tanda.finalizar(&id);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
}
