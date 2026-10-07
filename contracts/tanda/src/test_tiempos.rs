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
        Address as _, Events as _, Ledger,
    },
    token::StellarAssetClient,
    vec, Address, Env, Event as _, IntoVal, Val,
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

/// Como `setup_con`, pero con la tanda y la bóveda compiladas a WASM (`stellar contract build`), para
/// medir el costo real (con la VM). Falla si no se compiló antes.
pub(crate) fn setup_wasm(apr_bps: u32, acelerador: u32) -> Ctx {
    let leer = |nombre: &str| {
        let ruta = format!(
            "{}/../../target/wasm32v1-none/release/{nombre}.wasm",
            env!("CARGO_MANIFEST_DIR")
        );
        std::fs::read(&ruta)
            .unwrap_or_else(|_| panic!("falta {ruta}: corre `stellar contract build`"))
    };
    let (wasm_tanda, wasm_boveda) = (leer("tanda"), leer("boveda_simulada"));
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = 1_000;
        l.sequence_number = 100;
    });
    let emisor = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(emisor).address();
    let sac = StellarAssetClient::new(&env, &token_addr);
    let token = soroban_sdk::token::TokenClient::new(&env, &token_addr);
    let boveda = env.register(
        wasm_boveda.as_slice(),
        (token_addr.clone(), apr_bps, acelerador),
    );
    sac.mint(&boveda, &FONDEO_BOVEDA);
    let tanda_addr = env.register(wasm_tanda.as_slice(), ());
    let tanda = TandaContractClient::new(&env, &tanda_addr);
    tanda.inicializar(&Address::generate(&env), &boveda, &None);
    let creador = Address::generate(&env);
    let (ana, beto, carla) = (
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    );
    for p in [&ana, &beto, &carla] {
        sac.mint(p, &SALDO_INICIAL);
    }
    let verificador = Address::generate(&env);
    Ctx {
        env,
        tanda,
        tanda_addr,
        boveda,
        token,
        creador,
        ana,
        beto,
        carla,
        verificador,
    }
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
    out.push((
        String::from("instancia de la tanda"),
        ttl_instancia(env, yo),
    ));
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
    out.push((
        String::from("instancia de la bóveda"),
        ttl_instancia(env, &c.boveda),
    ));
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
        pasar_sin_archivar(
            &c,
            id,
            MES - 3 * DIA + 2 * DIA,
            &format!("ronda {ronda}, antes de cerrar"),
        );
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

/// La política de vida: lo que le falta a la tanda + 30 días, con tope en el máximo de la red.
#[test]
fn la_vida_de_los_datos_cubre_lo_que_falta_con_tope_de_la_red() {
    let c = setup();
    como_testnet(&c);
    let margen = 30 * DIA / SEG_POR_LEDGER;

    // Semanal de 3: le faltan 3 semanas -> 3 semanas + 30 días.
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &SEMANA,
        &1_000,
        &10_000,
    );
    c.tanda.unirse(&id, &c.ana);
    c.tanda.unirse(&id, &c.beto);
    c.tanda.unirse(&id, &c.carla);
    let esperado = (3 * SEMANA / SEG_POR_LEDGER + margen) as u32;
    for (nombre, ttl) in vidas(&c, id) {
        if nombre.starts_with("Tanda") || nombre.starts_with("Miembro") {
            assert!(
                ttl + 2 >= esperado && ttl <= esperado,
                "{nombre}: {ttl} en vez de {esperado}"
            );
        }
    }

    // Mensual de 12: 12 meses no caben (máximo ~180 días): queda en el máximo de la red.
    let gente = personas(&c, 12);
    let id12 = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &12,
        &MES,
        &1_000,
        &10_000,
    );
    for p in &gente {
        c.tanda.unirse(&id12, p);
    }
    for (nombre, ttl) in vidas(&c, id12) {
        if nombre.starts_with("Tanda") || nombre.starts_with("Miembro") {
            assert!(ttl >= MAX_TTL_TESTNET - 2, "{nombre}: {ttl}");
        }
    }
}

// ===========================================================================
// Ronda máxima (90 días)
// ===========================================================================

#[test]
fn la_ronda_mas_larga_es_de_90_dias() {
    let c = setup();
    let t = &c.token.address;
    let cr = &c.creador;
    c.tanda
        .crear_tanda(cr, t, &CUOTA, &3, &(90 * DIA), &1_000, &10_000);
    assert_eq!(
        c.tanda
            .try_crear_tanda(cr, t, &CUOTA, &3, &(90 * DIA + 1), &1_000, &10_000),
        Err(Ok(Error::ParametroInvalido))
    );
}

// ===========================================================================
// A4: calendario anclado
// ===========================================================================

/// Rondas cortas (la demo): igual que antes, la ronda siguiente empieza al cerrar.
#[test]
fn calendario_con_rondas_cortas_queda_igual_que_antes() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    c.avanzar(PERIODO + 30); // se cierra 30 s tarde
    c.tanda.cerrar_ronda(&id);
    let ahora = c.env.ledger().timestamp();
    assert_eq!(c.tanda.get_tanda(&id).inicio_ronda, ahora);
    assert_eq!(c.tanda.get_ronda(&id).1, ahora + PERIODO);
}

/// Tanda mensual cerrada con atraso cada ronda: las fechas de pago no se corren.
#[test]
fn calendario_mensual_no_se_corre_aunque_se_cierre_tarde() {
    let c = setup();
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
    let t0 = c.env.ledger().timestamp();
    for ronda in 0..3u64 {
        assert_eq!(
            c.tanda.get_ronda(&id).1,
            t0 + (ronda + 1) * MES,
            "ronda {ronda}"
        );
        pasar(&c, 2 * DIA);
        for p in [&c.ana, &c.beto, &c.carla] {
            c.tanda.pagar_cuota(&id, p);
        }
        pasar(&c, MES - 2 * DIA + 3 * DIA); // se cierra 3 días tarde
        c.tanda.cerrar_ronda(&id);
    }
    // Antes, cada cierre tardío corría todo: la última ronda habría vencido 6 días después.
    for p in [&c.ana, &c.beto, &c.carla] {
        assert_eq!(c.miembro(id, p).atrasos, 0);
    }
    c.tanda.finalizar(&id);
    c.assert_conservacion();
}

/// Aunque el cierre se atrase, quien paga antes de la fecha fija no queda "tarde". Y si el cierre se
/// atrasó tanto que la fecha fija ya casi pasó, igual hay al menos 3 días para pagar.
#[test]
fn cierre_atrasado_no_castiga_a_quien_paga_a_tiempo() {
    let c = setup();
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
    let t0 = c.env.ledger().timestamp();

    // Ronda 1: todos pagan; se cierra 10 días tarde (día 40). La ronda 2 sigue venciendo el día 60.
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    pasar(&c, MES + 10 * DIA);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.tanda.get_ronda(&id).1, t0 + 2 * MES);
    // Pagan el día 59: a tiempo.
    pasar(&c, 19 * DIA);
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    for p in [&c.ana, &c.beto, &c.carla] {
        assert_eq!(c.miembro(id, p).atrasos, 0);
    }

    // Ronda 2: se cierra el día 89, casi al vencer la ronda 3 (día 90): igual quedan 3 días.
    pasar(&c, 30 * DIA);
    c.tanda.cerrar_ronda(&id);
    let ahora = c.env.ledger().timestamp();
    assert_eq!(ahora, t0 + 89 * DIA);
    assert_eq!(c.tanda.get_ronda(&id).1, ahora + 3 * DIA);
    // Pagar el día 91 (después de la fecha fija, dentro de los 3 días) no es atraso.
    pasar(&c, 2 * DIA);
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    for p in [&c.ana, &c.beto, &c.carla] {
        assert_eq!(c.miembro(id, p).atrasos, 0);
    }
    pasar(&c, DIA);
    c.tanda.cerrar_ronda(&id);
    c.tanda.finalizar(&id);
    c.assert_conservacion();
}

// ===========================================================================
// A2: bóveda rápida para tandas de prueba y bóveda real para las demás
// ===========================================================================

/// Despliega otra bóveda simulada (por ejemplo, la rápida) fondeada como la principal.
pub(crate) fn otra_boveda(c: &Ctx, acelerador: u32) -> Address {
    let b = c.env.register(
        boveda_simulada::BovedaSimulada,
        (c.token.address.clone(), 500u32, acelerador),
    );
    StellarAssetClient::new(&c.env, &c.token.address).mint(&b, &FONDEO_BOVEDA);
    b
}

#[test]
fn boveda_rapida_solo_para_tandas_de_prueba_y_cada_tanda_conserva_la_suya() {
    let c = setup_con(500, 1, false); // la principal, sin acelerar
    let rapida = otra_boveda(&c, 52_560);
    c.tanda.configurar_boveda_rapida(&Some(rapida.clone()));

    let demo = c.crear(10_000); // rondas de 2 minutos
    let mensual = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &MES,
        &1_000,
        &10_000,
    );
    assert_eq!(c.tanda.get_boveda(&demo), rapida);
    assert_eq!(c.tanda.get_boveda(&mensual), c.boveda);

    // El admin cambia la bóveda rápida: la tanda de demo ya creada conserva la suya.
    let rapida2 = otra_boveda(&c, 52_560);
    c.tanda.configurar_boveda_rapida(&Some(rapida2.clone()));
    assert_eq!(c.tanda.get_boveda(&demo), rapida);
    let demo2 = c.crear(10_000);
    assert_eq!(c.tanda.get_boveda(&demo2), rapida2);

    // La tanda de demo funciona de punta a punta con su bóveda y rinde.
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.unirse(&demo, p);
    }
    let rapida_cliente = boveda_simulada::BovedaSimuladaClient::new(&c.env, &rapida);
    assert!(rapida_cliente.shares_de(&c.tanda_addr) > 0);
    for _ in 0..3 {
        for p in [&c.ana, &c.beto, &c.carla] {
            c.tanda.pagar_cuota(&demo, p);
        }
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&demo);
    }
    c.tanda.finalizar(&demo);
    for p in [&c.ana, &c.beto, &c.carla] {
        assert!(
            c.saldo(p) > SALDO_INICIAL,
            "con la bóveda rápida se nota el rendimiento"
        );
    }
    let total = c.saldo(&c.ana)
        + c.saldo(&c.beto)
        + c.saldo(&c.carla)
        + c.saldo(&c.boveda)
        + c.saldo(&rapida)
        + c.saldo(&rapida2)
        + c.saldo(&c.tanda_addr);
    assert_eq!(
        total,
        3 * SALDO_INICIAL + 3 * FONDEO_BOVEDA,
        "el dinero no cuadra"
    );

    // Quitar la bóveda rápida: las tandas nuevas usan la principal.
    c.tanda.configurar_boveda_rapida(&None);
    let demo3 = c.crear(10_000);
    assert_eq!(c.tanda.get_boveda(&demo3), c.boveda);
}

#[test]
fn solo_el_admin_configura_la_boveda_rapida() {
    let c = setup();
    let rapida = otra_boveda(&c, 52_560);
    c.env.set_auths(&[]);
    assert!(c.tanda.try_configurar_boveda_rapida(&Some(rapida)).is_err());
}

/// Una bóveda sin la función opcional `renovar` (por ejemplo, el adaptador de Blend) no rompe nada:
/// la llamada falla por dentro y la tanda sigue.
#[test]
fn llamar_renovar_a_un_contrato_que_no_lo_tiene_no_falla() {
    let c = setup();
    let token = c.token.address.clone();
    let r = c.env.as_contract(&c.tanda_addr, || {
        c.env.try_invoke_contract::<(), soroban_sdk::Error>(
            &token,
            &soroban_sdk::Symbol::new(&c.env, "renovar"),
            vec![&c.env, c.tanda_addr.clone().into_val(&c.env)],
        )
    });
    assert!(r.is_err());
}

// ===========================================================================
// A2: la bóveda nunca promete más de lo que tiene
// ===========================================================================

fn depositar_directo(c: &Ctx, boveda: &Address, quien: &Address, monto: i128) -> i128 {
    let b = boveda_simulada::BovedaSimuladaClient::new(&c.env, boveda);
    let vence = c.env.ledger().sequence() + 1_000;
    c.token.approve(quien, boveda, &monto, &vence);
    b.depositar(quien, &monto)
}

/// Con el acelerador de la demo y meses de por medio, el precio se topa en saldo / participaciones:
/// todos pueden retirar, nadie recibe menos de lo que depositó y el precio nunca baja.
#[test]
fn boveda_acelerada_nunca_promete_mas_de_lo_que_tiene_ni_baja_de_precio() {
    let c = setup_con(500, 52_560, false);
    let b = boveda_simulada::BovedaSimuladaClient::new(&c.env, &c.boveda);
    let s_ana = depositar_directo(&c, &c.boveda, &c.ana, 500 * U);
    let mut precio_antes = b.precio();
    pasar(&c, 10 * DIA);
    let s_beto = depositar_directo(&c, &c.boveda, &c.beto, 300 * U);
    for _ in 0..6 {
        let p = b.precio();
        assert!(p >= precio_antes, "el precio no debe bajar");
        precio_antes = p;
        let promete = b.valor(&(b.total_shares()));
        assert!(
            promete <= c.saldo(&c.boveda),
            "promete {promete}, tiene {}",
            c.saldo(&c.boveda)
        );
        pasar(&c, MES);
    }
    // Retiran todo: nadie recibe menos de lo que depositó (salvo el redondeo de la última cifra,
    // porque el precio se quedó quieto en el tope) y no queda ninguna participación.
    let redondeo = b.precio() / 10_000_000 + 1;
    let r_beto = b.retirar(&c.beto, &s_beto);
    let r_ana = b.retirar(&c.ana, &s_ana);
    assert!(r_beto >= 300 * U - redondeo, "Beto recibió {r_beto}");
    assert!(r_ana >= 500 * U, "Ana recibió {r_ana}");
    assert_eq!(b.total_shares(), 0);
    c.assert_conservacion();
}

/// Sin acelerar (como en la vida real): un año al 5 % anual rinde 5 %.
#[test]
fn boveda_sin_acelerar_rinde_el_5_por_ciento_en_un_anio() {
    let c = setup_con(500, 1, false);
    let b = boveda_simulada::BovedaSimuladaClient::new(&c.env, &c.boveda);
    let s = depositar_directo(&c, &c.boveda, &c.ana, 1_000 * U);
    pasar(&c, 365 * DIA);
    let valor = b.valor(&s);
    assert!((1_049 * U..=1_050 * U).contains(&valor), "valor {valor}");
    b.retirar(&c.ana, &s);
    c.assert_conservacion();
}

/// Bóveda sin acelerar: el precio sube una unidad mínima cada ~63 s. Si nadie paga la primera ronda
/// (de 60 s), las tres garantías se sacan completas al mismo precio al que entraron, y el redondeo
/// pedía unas unidades más de las que había: antes la tanda se trababa al cerrar la ronda.
#[test]
fn una_tanda_no_se_traba_por_redondeo_de_la_boveda() {
    let c = setup_con(500, 1, false);
    pasar(&c, 64); // precio 1,0000001: depositar ya no da participaciones exactas
    let id = c
        .tanda
        .crear_tanda(&c.creador, &c.token.address, &CUOTA, &3, &60, &1_000, &0);
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.unirse(&id, p);
    }
    pasar(&c, 60); // mismo precio que al depositar
    c.tanda.cerrar_ronda(&id); // nadie pagó: las tres garantías cubren
    for p in [&c.ana, &c.beto, &c.carla] {
        assert_eq!(c.miembro(id, p).colateral, 0);
    }
    c.assert_conservacion();
}

/// Hallazgo de M4: si el precio de la bóveda no sube (bóveda sin acelerar en el mismo minuto, o
/// topada por saldo), sacar toda la garantía de una tanda pide unas unidades más de las que tiene.
/// Antes las tomaba de OTRA tanda del mismo contrato, que después no podía finalizar.
#[test]
fn una_tanda_nunca_gasta_participaciones_de_otra() {
    let c = setup_con(500, 1, false);
    pasar(&c, 64); // precio 1,0000001 durante el próximo minuto
    let gente = personas(&c, 6);
    let b = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &MES,
        &1_000,
        &10_000,
    );
    for p in &gente[3..6] {
        c.tanda.unirse(&b, p);
    }
    let a = c
        .tanda
        .crear_tanda(&c.creador, &c.token.address, &CUOTA, &3, &60, &1_000, &0);
    for p in &gente[0..3] {
        c.tanda.unirse(&a, p);
    }
    pasar(&c, 60); // mismo precio
    c.tanda.cerrar_ronda(&a); // nadie pagó en A: sus tres garantías salen completas
    assert!(c.tanda.get_tanda(&a).shares_boveda >= 0);

    // B sigue con sus participaciones intactas y termina bien.
    for _ in 0..3 {
        for p in &gente[3..6] {
            c.tanda.pagar_cuota(&b, p);
        }
        pasar(&c, MES);
        c.tanda.cerrar_ronda(&b);
    }
    c.tanda.finalizar(&b);
    for _ in 0..2 {
        pasar(&c, 60);
        c.tanda.cerrar_ronda(&a);
    }
    c.tanda.finalizar(&a);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(&c, &gente);
}

/// Pedido de ORQ: con la bóveda casi sin fondeo (1 TUSD) y el acelerador de la demo, el tope de
/// solvencia se activa enseguida. Con depósitos y retiros alternados, el precio nunca baja y la
/// bóveda nunca promete más de lo que tiene.
#[test]
fn boveda_casi_sin_fondeo_precio_nunca_baja_con_depositos_y_retiros_alternados() {
    let c = setup();
    let pobre = c.env.register(
        boveda_simulada::BovedaSimulada,
        (c.token.address.clone(), 500u32, 52_560u32),
    );
    StellarAssetClient::new(&c.env, &c.token.address).mint(&pobre, &U);
    let b = boveda_simulada::BovedaSimuladaClient::new(&c.env, &pobre);
    let mut precio = b.precio();
    let revisar = |precio: &mut i128| {
        let p = b.precio();
        assert!(p >= *precio, "el precio bajó de {} a {p}", *precio);
        *precio = p;
        assert!(b.valor(&b.total_shares()) <= c.saldo(&pobre));
    };
    let s_ana = depositar_directo(&c, &pobre, &c.ana, 300 * U);
    revisar(&mut precio);
    pasar(&c, DIA);
    revisar(&mut precio);
    let s_beto = depositar_directo(&c, &pobre, &c.beto, 200 * U);
    revisar(&mut precio);
    let quemadas = b.retirar_monto(&c.ana, &(100 * U));
    revisar(&mut precio);
    pasar(&c, 3 * DIA);
    let s_carla = depositar_directo(&c, &pobre, &c.carla, 100 * U);
    revisar(&mut precio);
    b.retirar(&c.beto, &s_beto);
    revisar(&mut precio);
    pasar(&c, MES);
    let s_beto2 = depositar_directo(&c, &pobre, &c.beto, 50 * U);
    revisar(&mut precio);
    b.retirar(&c.ana, &(s_ana - quemadas));
    revisar(&mut precio);
    b.retirar(&c.carla, &s_carla);
    revisar(&mut precio);
    b.retirar(&c.beto, &s_beto2);
    assert_eq!(b.total_shares(), 0);
    // Nadie perdió más que el redondeo de la última cifra; el fondeo (1 TUSD) se repartió.
    let redondeo = 4 * (precio / 10_000_000 + 1);
    for p in [&c.ana, &c.beto, &c.carla] {
        assert!(c.saldo(p) >= SALDO_INICIAL - redondeo, "{}", c.saldo(p));
    }
    assert!(c.saldo(&pobre) >= 0);
}

// ===========================================================================
// v4 (N3): cerrar la ronda antes si todos pagaron
// ===========================================================================

fn opciones_de(modo: ModoTurnos, sellada: bool) -> OpcionesTanda {
    OpcionesTanda {
        modo,
        permitir_intercambio: false,
        prima_max_bps: if modo == ModoTurnos::PrecioPorTurno {
            1_000
        } else {
            0
        },
        descuento_max_bps: if modo == ModoTurnos::Subasta {
            2_000
        } else {
            0
        },
        primeros_con_historial: 0,
        puntaje_primeros: 0,
        ofertas_selladas: sellada,
    }
}

/// Crea una tanda mensual de 3 (Ana, Beto, Carla) con el modo dado (`None`: `crear_tanda`) y la llena.
fn mensual_con_modo(c: &Ctx, modo: Option<(ModoTurnos, bool)>) -> u32 {
    let gente = [&c.ana, &c.beto, &c.carla];
    let id = match modo {
        None => c.tanda.crear_tanda(
            &c.creador,
            &c.token.address,
            &CUOTA,
            &3,
            &MES,
            &1_000,
            &10_000,
        ),
        Some((m, sellada)) => c.tanda.crear_tanda_avanzada(
            &c.creador,
            &c.token.address,
            &CUOTA,
            &3,
            &MES,
            &1_000,
            &10_000,
            &opciones_de(m, sellada),
        ),
    };
    let elige = matches!(
        modo,
        Some((ModoTurnos::Eleccion, _)) | Some((ModoTurnos::PrecioPorTurno, _))
    );
    for (i, p) in gente.iter().enumerate() {
        if elige {
            c.tanda.unirse_en_turno(&id, p, &(i as u32));
        } else {
            c.tanda.unirse(&id, p);
        }
    }
    id
}

/// Todos pagan a los 2 días y la ronda se cierra ya. Quien cobra recibe en ese momento, la ronda
/// siguiente se puede pagar desde ya (sin atraso) y su fecha límite es la de siempre.
#[test]
fn todos_pagaron_se_cierra_antes_y_las_fechas_no_se_mueven() {
    let c = setup();
    let id = mensual_con_modo(&c, None);
    let t0 = c.env.ledger().timestamp();
    let gente = [&c.ana, &c.beto, &c.carla];
    for ronda in 0..3u64 {
        let vence = t0 + (ronda + 1) * MES;
        assert_eq!(c.tanda.get_ronda(&id).1, vence, "ronda {ronda}");
        pasar(&c, 2 * DIA);
        for p in gente {
            c.tanda.pagar_cuota(&id, p);
        }
        let cobra = gente[ronda as usize];
        let antes = c.saldo(cobra);
        c.tanda.cerrar_ronda(&id);
        // El evento de la ronda cerrada antes, con su fecha límite (antes de otra llamada).
        let ev = EvCierreAnticipado {
            id,
            ronda: ronda as u32,
            vence,
        }
        .to_xdr(&c.env, &c.tanda_addr);
        assert!(
            c.env.events().all().events().contains(&ev),
            "ronda {ronda}: falta el evento `antes`"
        );
        assert_eq!(c.saldo(cobra), antes + 300 * U, "ronda {ronda}: cobra ya");
    }
    // Nadie quedó tarde aunque cada ronda se pagó "antes de empezar".
    for p in gente {
        let m = c.miembro(id, p);
        assert_eq!((m.atrasos, m.multas_pendientes), (0, 0));
    }
    // La tanda terminó a los 6 días, no a los 3 meses.
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::PorLiquidar);
    assert_eq!(c.env.ledger().timestamp(), t0 + 6 * DIA);
    c.tanda.finalizar(&id);
    c.assert_conservacion();
}

/// Si falta alguien por pagar, sigue el error de siempre; al vencer se cierra como antes.
#[test]
fn no_se_cierra_antes_si_falta_alguien_por_pagar() {
    let c = setup();
    let id = mensual_con_modo(&c, None);
    c.tanda.pagar_cuota(&id, &c.ana);
    c.tanda.pagar_cuota(&id, &c.beto);
    let t = c.tanda.get_tanda(&id);
    assert_eq!(
        c.tanda.try_cerrar_ronda(&id),
        Err(Ok(Error::RondaNoVencida))
    );
    assert_eq!(c.tanda.get_tanda(&id), t, "el error no cambia nada");
    pasar(&c, MES);
    c.tanda.cerrar_ronda(&id); // la garantía de Carla cubre su cuota
    assert_eq!(c.miembro(id, &c.carla).atrasos, 1);
    c.assert_conservacion();
}

/// Ronda que se pagó antes de su inicio y luego no se paga completa: vence en su fecha y se cierra
/// normal. Quien paga después de la fecha límite queda tarde, como siempre.
#[test]
fn tras_un_cierre_anticipado_la_ronda_siguiente_vence_en_su_fecha() {
    let c = setup();
    let id = mensual_con_modo(&c, None);
    let t0 = c.env.ledger().timestamp();
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    c.tanda.cerrar_ronda(&id);
    let t = c.tanda.get_tanda(&id);
    assert_eq!(t.inicio_ronda, t0 + MES, "inicio_ronda queda en el futuro");
    assert_eq!(c.tanda.get_ronda(&id).1, t0 + 2 * MES);
    c.tanda.pagar_cuota(&id, &c.ana);
    pasar(&c, 2 * MES - DIA);
    c.tanda.pagar_cuota(&id, &c.beto); // a tiempo: un día antes de la fecha
    assert_eq!(
        c.tanda.try_cerrar_ronda(&id),
        Err(Ok(Error::RondaNoVencida))
    );
    pasar(&c, 2 * DIA);
    c.tanda.pagar_cuota(&id, &c.carla); // tarde
    assert_eq!(c.miembro(id, &c.beto).atrasos, 0);
    assert_eq!(c.miembro(id, &c.carla).atrasos, 1);
    c.tanda.cerrar_ronda(&id);
    // La tercera ronda vence un mes después de la segunda, aunque la primera se cerró antes.
    assert_eq!(c.tanda.get_ronda(&id).1, t0 + 3 * MES);
    c.assert_conservacion();
}

/// En todos los modos de turnos menos la subasta, si todos pagaron se cierra antes. En la subasta
/// (abierta o sellada), no: las ofertas siguen abiertas hasta que vence la ronda.
#[test]
fn cierre_anticipado_en_cada_modo_menos_subasta() {
    let modos = [
        None,
        Some((ModoTurnos::Llegada, false)),
        Some((ModoTurnos::Eleccion, false)),
        Some((ModoTurnos::PrecioPorTurno, false)),
        Some((ModoTurnos::Sorteo, false)),
        Some((ModoTurnos::Subasta, false)),
        Some((ModoTurnos::Subasta, true)),
    ];
    for modo in modos {
        let c = setup();
        let id = mensual_con_modo(&c, modo);
        let subasta = matches!(modo, Some((ModoTurnos::Subasta, _)));
        let t0 = c.env.ledger().timestamp();
        for ronda in 0..3u32 {
            for p in [&c.ana, &c.beto, &c.carla] {
                c.tanda.pagar_cuota(&id, p);
            }
            if subasta {
                assert_eq!(
                    c.tanda.try_cerrar_ronda(&id),
                    Err(Ok(Error::SubastaNoCierraAntes)),
                    "{modo:?}"
                );
                pasar(&c, c.tanda.get_ronda(&id).1 - c.env.ledger().timestamp());
            }
            c.tanda.cerrar_ronda(&id);
            let cobro = [&c.ana, &c.beto, &c.carla]
                .iter()
                .any(|p| c.miembro(id, p).posicion == ronda && c.miembro(id, p).cobro);
            assert!(cobro, "{modo:?}: nadie cobró la ronda {ronda}");
            if !subasta {
                assert_eq!(c.env.ledger().timestamp(), t0, "{modo:?}");
                assert_eq!(
                    c.tanda.get_ronda(&id).1,
                    t0 + (ronda as u64 + 2) * MES,
                    "{modo:?}: la fecha siguiente no se mueve"
                );
            }
        }
        c.tanda.finalizar(&id);
        c.assert_conservacion();
    }
}

/// Cierres anticipados seguidos: se pueden encadenar mientras la fecha límite siguiente quede a lo
/// sumo a 120 días (para que los datos de la tanda no se archiven antes de que alguien los use).
/// Con rondas mensuales, unas 3 rondas adelantadas; con la ronda más larga (90 días), cerrar antes
/// solo en sus últimos 30 días.
#[test]
fn los_cierres_anticipados_tienen_un_tope_de_120_dias() {
    let c = setup();
    let g = personas(&c, 5);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &5,
        &MES,
        &1_000,
        &10_000,
    );
    for p in &g {
        c.tanda.unirse(&id, p);
    }
    let t0 = c.env.ledger().timestamp();
    for ronda in 0..3u64 {
        for p in &g {
            c.tanda.pagar_cuota(&id, p);
        }
        c.tanda.cerrar_ronda(&id);
        assert_eq!(c.tanda.get_ronda(&id).1, t0 + (ronda + 2) * MES);
    }
    // La cuarta seguida dejaría la fecha siguiente a 150 días: no.
    for p in &g {
        c.tanda.pagar_cuota(&id, p);
    }
    assert_eq!(
        c.tanda.try_cerrar_ronda(&id),
        Err(Ok(Error::CierreMuyAdelantado))
    );
    // Un mes después ya queda a 120 días: sí.
    pasar(&c, MES);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.tanda.get_ronda(&id).1, t0 + 5 * MES);
    for p in &g {
        assert_eq!(c.miembro(id, p).atrasos, 0);
    }

    // Ronda de 90 días: cerrar antes solo en sus últimos 30 días.
    let trimestral = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &(90 * DIA),
        &1_000,
        &10_000,
    );
    for p in &g[..3] {
        c.tanda.unirse(&trimestral, p);
    }
    for p in &g[..3] {
        c.tanda.pagar_cuota(&trimestral, p);
    }
    pasar(&c, 59 * DIA);
    assert_eq!(
        c.tanda.try_cerrar_ronda(&trimestral),
        Err(Ok(Error::CierreMuyAdelantado))
    );
    pasar(&c, DIA);
    c.tanda.cerrar_ronda(&trimestral);
    assert_conservacion_de(&c, &g);
}

/// Peor caso del cierre anticipado: 12 personas, todas pagan y cada ronda se cierra al instante
/// (rondas de 2 minutos: el tope de 120 días no limita).
/// Revisa además, antes de cada cierre, todos los pagos de la ronda (12 lecturas extra a lo sumo).
fn recorrer_peor_caso_cierre_anticipado(c: &Ctx) -> crate::test_deudas::Medidas {
    let medidas = core::cell::RefCell::new(crate::test_deudas::Medidas::new());
    let medir = |que: &'static str, f: &dyn Fn()| crate::test_deudas::medir_en(c, &medidas, que, f);
    let g = personas(c, 12);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &12,
        &PERIODO,
        &1_000,
        &10_000,
    );
    for p in &g {
        c.tanda.unirse(&id, p);
    }
    for _ in 0..12u32 {
        for p in &g {
            c.tanda.pagar_cuota(&id, p);
        }
        medir("cerrar antes", &|| c.tanda.cerrar_ronda(&id));
    }
    // Y el error con 11 de 12 (el más caro: revisa a todos antes de fallar).
    let id2 = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &12,
        &PERIODO,
        &1_000,
        &10_000,
    );
    for p in &g {
        c.tanda.unirse(&id2, p);
    }
    for p in &g[..11] {
        c.tanda.pagar_cuota(&id2, p);
    }
    medir("cerrar (falla)", &|| {
        assert_eq!(
            c.tanda.try_cerrar_ronda(&id2),
            Err(Ok(Error::RondaNoVencida))
        );
    });
    c.tanda.finalizar(&id);
    medidas.into_inner()
}

#[test]
fn peor_caso_12_miembros_cierre_anticipado() {
    let c = setup();
    let m = recorrer_peor_caso_cierre_anticipado(&c);
    crate::test_deudas::imprimir("Cierre anticipado, 12 miembros (nativo):", &m);
}

/// Con WASM: `stellar contract build && PEOR_CASO_WASM=1 cargo test -p tanda peor_caso -- --nocapture`
#[test]
fn peor_caso_12_miembros_cierre_anticipado_en_wasm() {
    if std::env::var("PEOR_CASO_WASM").is_err() {
        std::println!("(omitida: corre `stellar contract build` y luego con PEOR_CASO_WASM=1)");
        return;
    }
    let c = setup_wasm(0, 1);
    let m = recorrer_peor_caso_cierre_anticipado(&c);
    crate::test_deudas::imprimir("Cierre anticipado, 12 miembros (WASM):", &m);
}
