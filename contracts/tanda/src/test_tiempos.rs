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
