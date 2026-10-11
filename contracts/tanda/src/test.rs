//! Pruebas del contrato de la tanda.
//!
//! Cada prueba arma un "mini blockchain" en memoria (Env), despliega el token de prueba,
//! la bóveda simulada y la tanda, y simula a Ana, Beto y Carla.
//! Correr con:  cargo test
#![cfg(test)]
extern crate std;

// Los helpers (`setup`, `Ctx`, `assert_conservacion`...) son `pub(crate)` para que cada misión
// escriba sus pruebas en su propio archivo (`test_<mision>.rs`) con `use crate::test::*;`.

use super::*;
use boveda_simulada::BovedaSimulada;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

/// 1 TUSD con 7 decimales.
pub(crate) const U: i128 = 10_000_000;
pub(crate) const CUOTA: i128 = 100 * U;
pub(crate) const PERIODO: u64 = 120;
pub(crate) const SALDO_INICIAL: i128 = 1_000 * U;
pub(crate) const FONDEO_BOVEDA: i128 = 10_000 * U;

pub(crate) struct Ctx {
    pub(crate) env: Env,
    pub(crate) tanda: TandaContractClient<'static>,
    pub(crate) tanda_addr: Address,
    pub(crate) boveda: Address,
    pub(crate) token: TokenClient<'static>,
    pub(crate) creador: Address,
    pub(crate) ana: Address,
    pub(crate) beto: Address,
    pub(crate) carla: Address,
    pub(crate) verificador: Address,
}

pub(crate) fn setup_con(apr_bps: u32, acelerador: u32, con_verificador: bool) -> Ctx {
    let env = Env::default();
    // En pruebas aceptamos todas las firmas; hay una prueba aparte que verifica firmas reales.
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = 1_000;
        l.sequence_number = 100;
    });

    // Token de prueba "TUSD" (un Stellar Asset Contract, igual que en testnet).
    let emisor = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(emisor);
    let token_addr = sac.address();
    let sac_admin = StellarAssetClient::new(&env, &token_addr);
    let token = TokenClient::new(&env, &token_addr);

    // Bóveda simulada, fondeada para poder pagar intereses.
    let boveda = env.register(BovedaSimulada, (token_addr.clone(), apr_bps, acelerador));
    sac_admin.mint(&boveda, &FONDEO_BOVEDA);

    // Contrato de la tanda.
    let tanda_addr = env.register(TandaContract, ());
    let tanda = TandaContractClient::new(&env, &tanda_addr);
    let admin = Address::generate(&env);
    let verificador = Address::generate(&env);
    let v = if con_verificador {
        Some(verificador.clone())
    } else {
        None
    };
    tanda.inicializar(&admin, &boveda, &v);

    let creador = Address::generate(&env);
    let ana = Address::generate(&env);
    let beto = Address::generate(&env);
    let carla = Address::generate(&env);
    for p in [&ana, &beto, &carla] {
        sac_admin.mint(p, &SALDO_INICIAL);
    }

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

pub(crate) fn setup() -> Ctx {
    setup_con(0, 1, false)
}

impl Ctx {
    pub(crate) fn crear(&self, cobertura_bps: u32) -> u32 {
        self.tanda.crear_tanda(
            &self.creador,
            &self.token.address,
            &CUOTA,
            &3,
            &PERIODO,
            &1_000, // multa 10%
            &cobertura_bps,
        )
    }

    pub(crate) fn crear_y_llenar(&self, cobertura_bps: u32) -> u32 {
        let id = self.crear(cobertura_bps);
        self.tanda.unirse(&id, &self.ana);
        self.tanda.unirse(&id, &self.beto);
        self.tanda.unirse(&id, &self.carla);
        id
    }

    pub(crate) fn avanzar(&self, segundos: u64) {
        self.env.ledger().with_mut(|l| {
            l.timestamp += segundos;
            l.sequence_number += 1;
        });
    }

    pub(crate) fn saldo(&self, a: &Address) -> i128 {
        self.token.balance(a)
    }

    pub(crate) fn miembro(&self, id: u32, a: &Address) -> Miembro {
        self.tanda
            .get_miembros(&id)
            .iter()
            .find(|(d, _)| d == a)
            .unwrap()
            .1
    }

    /// La prueba más importante: no se crea ni se pierde dinero.
    /// Suma de saldos de miembros + bóveda + contrato = lo que existía al inicio.
    pub(crate) fn assert_conservacion(&self) {
        let total = self.saldo(&self.ana)
            + self.saldo(&self.beto)
            + self.saldo(&self.carla)
            + self.saldo(&self.boveda)
            + self.saldo(&self.tanda_addr);
        assert_eq!(
            total,
            3 * SALDO_INICIAL + FONDEO_BOVEDA,
            "el dinero no cuadra"
        );
    }
}

// ===========================================================================
// P0
// ===========================================================================

#[test]
fn camino_feliz_todos_pagan_a_tiempo() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    let personas = [c.ana.clone(), c.beto.clone(), c.carla.clone()];

    for ronda in 0..3u32 {
        let antes = c.saldo(&personas[ronda as usize]);
        for p in &personas {
            c.tanda.pagar_cuota(&id, p);
        }
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&id);
        // El beneficiario es el de posicion == ronda, y recibe la bolsa completa (3 × 100).
        assert_eq!(
            c.saldo(&personas[ronda as usize]),
            antes - CUOTA + 3 * CUOTA
        );
        assert!(c.miembro(id, &personas[ronda as usize]).cobro);
    }
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::PorLiquidar);

    c.tanda.finalizar(&id);
    // Sin rendimiento (apr 0) y sin multas: todos terminan exactamente como empezaron.
    for p in &personas {
        assert_eq!(c.saldo(p), SALDO_INICIAL);
    }
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Finalizada);
    c.assert_conservacion();
}

#[test]
fn se_activa_exactamente_al_unirse_el_ultimo() {
    let c = setup();
    let id = c.crear(10_000);
    c.tanda.unirse(&id, &c.ana);
    c.tanda.unirse(&id, &c.beto);
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Abierta);
    c.tanda.unirse(&id, &c.carla);
    let t = c.tanda.get_tanda(&id);
    assert_eq!(t.estado, Estado::Activa);
    assert_eq!(t.inicio_ronda, c.env.ledger().timestamp());
}

#[test]
fn no_se_puede_unir_dos_veces_ni_a_una_tanda_llena() {
    let c = setup();
    let id = c.crear(10_000);
    c.tanda.unirse(&id, &c.ana);
    assert_eq!(c.tanda.try_unirse(&id, &c.ana), Err(Ok(Error::YaEsMiembro)));
    c.tanda.unirse(&id, &c.beto);
    c.tanda.unirse(&id, &c.carla);
    let cuarto = Address::generate(&c.env);
    assert_eq!(c.tanda.try_unirse(&id, &cuarto), Err(Ok(Error::TandaLlena)));
}

#[test]
fn no_se_puede_pagar_dos_veces_la_misma_ronda() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    c.tanda.pagar_cuota(&id, &c.ana);
    assert_eq!(c.tanda.try_pagar_cuota(&id, &c.ana), Err(Ok(Error::YaPago)));
}

#[test]
fn no_se_puede_cerrar_antes_de_vencer() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    c.avanzar(PERIODO - 1);
    assert_eq!(
        c.tanda.try_cerrar_ronda(&id),
        Err(Ok(Error::RondaNoVencida))
    );
    c.avanzar(1);
    c.tanda.cerrar_ronda(&id); // justo al vencer ya se puede
}

#[test]
fn parametros_invalidos_se_rechazan() {
    let c = setup();
    let t = &c.token.address;
    let cr = &c.creador;
    assert_eq!(
        c.tanda.try_crear_tanda(cr, t, &0, &3, &120, &1000, &10000),
        Err(Ok(Error::ParametroInvalido))
    );
    assert_eq!(
        c.tanda
            .try_crear_tanda(cr, t, &CUOTA, &2, &120, &1000, &10000),
        Err(Ok(Error::ParametroInvalido))
    );
    assert_eq!(
        c.tanda
            .try_crear_tanda(cr, t, &CUOTA, &13, &120, &1000, &10000),
        Err(Ok(Error::ParametroInvalido))
    );
    assert_eq!(
        c.tanda
            .try_crear_tanda(cr, t, &CUOTA, &3, &59, &1000, &10000),
        Err(Ok(Error::ParametroInvalido))
    );
    assert_eq!(
        c.tanda
            .try_crear_tanda(cr, t, &CUOTA, &3, &120, &5001, &10000),
        Err(Ok(Error::ParametroInvalido))
    );
    assert_eq!(
        c.tanda
            .try_crear_tanda(cr, t, &CUOTA, &3, &120, &1000, &10001),
        Err(Ok(Error::ParametroInvalido))
    );
}

// ===========================================================================
// P1
// ===========================================================================

#[test]
fn colateral_escalonado() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    // n=3, cobertura 100%: 200, 100, 100
    assert_eq!(c.miembro(id, &c.ana).colateral, 200 * U);
    assert_eq!(c.miembro(id, &c.beto).colateral, 100 * U);
    assert_eq!(c.miembro(id, &c.carla).colateral, 100 * U);
    // El colateral salió del miembro y está en la bóveda, no en el contrato.
    assert_eq!(c.saldo(&c.ana), SALDO_INICIAL - 200 * U);
    assert_eq!(c.saldo(&c.tanda_addr), 0);

    // n=5, cobertura 50%: max(100, 100×(4,3,2,1,0)×0.5) = 200, 150, 100, 100, 100
    let id5 = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &5,
        &PERIODO,
        &1000,
        &5_000,
    );
    let esperados = [200 * U, 150 * U, 100 * U, 100 * U, 100 * U];
    for e in esperados {
        assert_eq!(c.tanda.colateral_siguiente(&id5), e);
        let p = Address::generate(&c.env);
        StellarAssetClient::new(&c.env, &c.token.address).mint(&p, &SALDO_INICIAL);
        c.tanda.unirse(&id5, &p);
    }
}

/// El escenario EXACTO de la demo (tabla de la sección "Colateral y penalidades"):
/// Ana cobra primero y desaparece; Beto paga tarde una vez.
#[test]
fn escenario_demo_ana_huye_beto_paga_tarde() {
    // 5% anual, acelerado para que en ~6 minutos se note.
    let c = setup_con(500, 52_560, false);
    let id = c.crear_y_llenar(10_000);

    // Ronda 1 (índice 0): todos pagan, Ana cobra 300.
    c.tanda.pagar_cuota(&id, &c.ana);
    c.tanda.pagar_cuota(&id, &c.beto);
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.saldo(&c.ana), SALDO_INICIAL - 200 * U - CUOTA + 300 * U);

    // Ronda 2: Ana desaparece. Su colateral cubre su cuota y Beto cobra 300 COMPLETOS.
    c.tanda.pagar_cuota(&id, &c.beto);
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO);
    let beto_antes = c.saldo(&c.beto);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.saldo(&c.beto), beto_antes + 300 * U);
    assert_eq!(c.miembro(id, &c.ana).colateral, 100 * U);

    // Ronda 3: Carla paga a tiempo; Beto paga TARDE (después del vencimiento).
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO + 10);
    c.tanda.pagar_cuota(&id, &c.beto);
    let mb = c.miembro(id, &c.beto);
    assert_eq!(mb.atrasos, 1);
    assert_eq!(mb.multas_pendientes, 10 * U);
    assert_eq!(mb.colateral, 100 * U); // la multa NO se cobra todavía
    let carla_antes = c.saldo(&c.carla);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.saldo(&c.carla), carla_antes + 300 * U); // de nuevo, bolsa completa

    // Final.
    let t = c.tanda.get_tanda(&id);
    let valor_boveda = BovedaClient::new(&c.env, &c.boveda).valor(&t.shares_boveda);
    c.tanda.finalizar(&id);

    let ma = c.miembro(id, &c.ana);
    assert_eq!(ma.atrasos, 2);
    assert!(!ma.moroso); // su colateral alcanzó para todo
                         // Ana: neto 0. Huir no le dio nada.
    assert_eq!(c.saldo(&c.ana), SALDO_INICIAL);

    // Rendimiento real = lo que devolvió la bóveda - 200 de colateral (Beto 100 + Carla 100).
    let rend = valor_boveda - 200 * U;
    assert!(rend > 0, "debería haber rendimiento");
    // Se reparte en proporción al colateral ya sin multas: Beto 90, Carla 100.
    let rend_beto = rend * 90 / 190;
    let rend_carla = rend - rend_beto;
    // Beto: −10 de multa + su parte del rendimiento; sin premio.
    assert_eq!(c.saldo(&c.beto), SALDO_INICIAL - 10 * U + rend_beto);
    // Carla: +10 de premio (la multa de Beto) + su parte del rendimiento.
    assert_eq!(c.saldo(&c.carla), SALDO_INICIAL + 10 * U + rend_carla);

    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
    std::println!(
        "Demo: rendimiento total {} TUSD | Beto recibe {} | Carla recibe {}",
        rend as f64 / U as f64,
        rend_beto as f64 / U as f64,
        rend_carla as f64 / U as f64
    );
}

/// (M1 v5) Si la garantía NO alcanza para todo lo que falta pagar, no se usa mientras la tanda sigue:
/// cada falta es deuda a favor de quien cobró de menos, y al finalizar la garantía se reparte entre
/// los afectados en proporción a lo que le faltó a cada uno.
#[test]
fn impago_sin_colateral_suficiente_queda_moroso() {
    let c = setup();
    let id = c.crear_y_llenar(0); // cobertura 0%: todos ponen solo 1 cuota
                                  // Ronda 0: todos pagan, Ana cobra.
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
    // Ronda 1: Ana no paga. Su garantía (100) no alcanza para las 2 cuotas que le quedan: no se usa.
    // Queda morosa, debe 100 y Beto cobra la bolsa incompleta (200).
    c.tanda.pagar_cuota(&id, &c.beto);
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO);
    let beto_antes = c.saldo(&c.beto);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.saldo(&c.beto), beto_antes + 200 * U);
    let ma = c.miembro(id, &c.ana);
    assert!(ma.moroso);
    assert_eq!(ma.deuda, 100 * U);
    assert_eq!(ma.colateral, 100 * U); // la garantía sigue intacta
                                       // Una morosa no puede pagar cuotas.
    assert_eq!(
        c.tanda.try_pagar_cuota(&id, &c.ana),
        Err(Ok(Error::MiembroMoroso))
    );
    // Ronda 2: sigue sin pagar. Debe 200 y Carla cobra 200.
    c.tanda.pagar_cuota(&id, &c.beto);
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO);
    let carla_antes = c.saldo(&c.carla);
    c.tanda.cerrar_ronda(&id);
    let ma = c.miembro(id, &c.ana);
    assert_eq!(ma.deuda, 200 * U);
    assert_eq!(c.saldo(&c.carla), carla_antes + 200 * U);

    // Al finalizar, su garantía (100) se reparte entre Beto y Carla según lo que le faltó a cada uno
    // (100 y 100): 50 y 50. Le quedan 100 de deuda.
    let (beto_antes, carla_antes) = (c.saldo(&c.beto), c.saldo(&c.carla));
    c.tanda.finalizar(&id);
    assert_eq!(c.saldo(&c.beto), beto_antes + 100 * U + 50 * U); // su garantía + su parte
    assert_eq!(c.saldo(&c.carla), carla_antes + 100 * U + 50 * U);
    let ma = c.miembro(id, &c.ana);
    assert!(ma.moroso);
    assert_eq!(ma.deuda, 100 * U);
    assert_eq!(ma.colateral, 0);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
}

/// (M1 v5) Si la garantía alcanza para TODO lo que le falta pagar, se sigue cubriendo al instante.
#[test]
fn impago_con_garantia_suficiente_se_cubre_al_instante() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    // Ronda 0: todos pagan, Ana cobra 300.
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
    // Ronda 1: Ana (200 de garantía) no paga. Le quedan 2 cuotas y su garantía las cubre: Beto cobra
    // 300 completos y Ana no queda morosa.
    c.tanda.pagar_cuota(&id, &c.beto);
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO);
    let beto_antes = c.saldo(&c.beto);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.saldo(&c.beto), beto_antes + 300 * U);
    let ma = c.miembro(id, &c.ana);
    assert!(!ma.moroso);
    assert_eq!(ma.deuda, 0);
    assert_eq!(ma.colateral, 100 * U);
    c.assert_conservacion();
}

#[test]
fn beneficiario_moroso_su_bolsa_se_retiene_y_se_reparte_al_final() {
    let c = setup();
    let id = c.crear_y_llenar(0);
    // Carla (turno 3) nunca paga. Su garantía (100) no alcanza para las 3 cuotas: cada falta es deuda.
    for ronda in 0..2u32 {
        c.tanda.pagar_cuota(&id, &c.ana);
        c.tanda.pagar_cuota(&id, &c.beto);
        c.avanzar(PERIODO);
        let beneficiario = if ronda == 0 { &c.ana } else { &c.beto };
        let antes = c.saldo(beneficiario);
        c.tanda.cerrar_ronda(&id);
        // Cobra la bolsa incompleta: 200 (puso 100 y le llegaron 100 de otro).
        assert_eq!(c.saldo(beneficiario), antes + 200 * U);
    }
    assert!(c.miembro(id, &c.carla).moroso);
    assert_eq!(c.miembro(id, &c.carla).deuda, 200 * U);
    assert_eq!(c.miembro(id, &c.carla).colateral, 100 * U);
    assert_eq!(
        c.tanda.try_pagar_cuota(&id, &c.carla),
        Err(Ok(Error::MiembroMoroso))
    );
    // Ronda 3: le tocaba a Carla, pero es morosa: la bolsa (200) se retiene.
    c.tanda.pagar_cuota(&id, &c.ana);
    c.tanda.pagar_cuota(&id, &c.beto);
    c.avanzar(PERIODO);
    let carla_antes = c.saldo(&c.carla);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(c.saldo(&c.carla), carla_antes);
    assert_eq!(c.tanda.get_tanda(&id).retenido, 200 * U);

    c.tanda.finalizar(&id);
    // El retenido se reparte entre Ana y Beto (sin atrasos): 100 cada uno. Y la garantía de Carla (100)
    // se reparte entre ellos según lo que les faltó (100 y 100): 50 cada uno.
    // Ana: −100 col −300 cuotas +200 bolsa +100 col +100 premio +50 garantía de Carla = +50
    assert_eq!(c.saldo(&c.ana), SALDO_INICIAL + 50 * U);
    // Beto: −100 −300 +200 +100 +100 +50 = +50
    assert_eq!(c.saldo(&c.beto), SALDO_INICIAL + 50 * U);
    // Carla pierde su garantía y su bolsa.
    assert_eq!(c.saldo(&c.carla), SALDO_INICIAL - 100 * U);
    // Todavía debe 200: 50 a Ana, 50 a Beto (lo que la garantía no alcanzó) y 100 de su propia ronda.
    let mc = c.miembro(id, &c.carla);
    assert!(mc.moroso);
    assert_eq!(mc.deuda, 200 * U);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
}

#[test]
fn pago_tarde_anota_multa_pero_no_la_cobra_hasta_el_final() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    c.avanzar(PERIODO + 1);
    c.tanda.pagar_cuota(&id, &c.beto);
    let mb = c.miembro(id, &c.beto);
    assert_eq!(mb.atrasos, 1);
    assert_eq!(mb.multas_pendientes, 10 * U);
    assert_eq!(mb.colateral, 100 * U);
}

#[test]
fn cancelar_devuelve_todo_y_solo_mientras_esta_abierta() {
    let c = setup_con(500, 52_560, false);
    let id = c.crear(10_000);
    c.tanda.unirse(&id, &c.ana);
    c.tanda.unirse(&id, &c.beto);
    c.avanzar(300);
    c.tanda.cancelar(&id);
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Cancelada);
    // Recuperan su colateral (y un poco de rendimiento).
    assert!(c.saldo(&c.ana) > SALDO_INICIAL);
    assert!(c.saldo(&c.beto) > SALDO_INICIAL);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
    assert_eq!(
        c.tanda.try_unirse(&id, &c.carla),
        Err(Ok(Error::EstadoInvalido))
    );

    let id2 = c.crear_y_llenar(10_000);
    assert_eq!(c.tanda.try_cancelar(&id2), Err(Ok(Error::EstadoInvalido)));
}

#[test]
fn sin_la_firma_correcta_falla() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    // Quitamos las firmas simuladas: ahora nadie "firmó" nada.
    c.env.set_auths(&[]);
    assert!(c.tanda.try_pagar_cuota(&id, &c.ana).is_err());
    let otro = Address::generate(&c.env);
    assert!(c
        .tanda
        .try_crear_tanda(&otro, &c.token.address, &CUOTA, &3, &PERIODO, &1000, &10000)
        .is_err());
    // cerrar_ronda NO necesita firma de nadie (a propósito).
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
}

#[test]
fn no_se_puede_inicializar_dos_veces() {
    let c = setup();
    let x = Address::generate(&c.env);
    assert_eq!(
        c.tanda.try_inicializar(&x, &c.boveda, &None),
        Err(Ok(Error::YaInicializado))
    );
}

// ===========================================================================
// P2
// ===========================================================================

#[test]
fn con_verificador_solo_entran_direcciones_verificadas() {
    let c = setup_con(0, 1, true);
    let id = c.crear(10_000);
    assert_eq!(
        c.tanda.try_unirse(&id, &c.ana),
        Err(Ok(Error::NoVerificado))
    );
    c.tanda.marcar_verificado(&c.ana, &true);
    c.tanda.unirse(&id, &c.ana);
    let _ = &c.verificador;
}

#[test]
fn dos_tandas_en_la_misma_boveda_no_mezclan_rendimiento() {
    let c = setup_con(500, 52_560, false);
    // Tanda 1 se llena ahora; la tanda 2, 10 minutos después (su colateral rinde menos).
    let id1 = c.crear_y_llenar(10_000);
    c.avanzar(600);
    let id2 = c.crear_y_llenar(10_000);

    for id in [id1, id2] {
        for _ in 0..3 {
            for p in [&c.ana, &c.beto, &c.carla] {
                c.tanda.pagar_cuota(&id, p);
            }
            c.avanzar(PERIODO);
            c.tanda.cerrar_ronda(&id);
        }
    }
    let b = BovedaClient::new(&c.env, &c.boveda);
    let rend1 = b.valor(&c.tanda.get_tanda(&id1).shares_boveda) - 400 * U;
    let rend2 = b.valor(&c.tanda.get_tanda(&id2).shares_boveda) - 400 * U;
    assert!(rend1 > rend2, "la tanda que depositó antes debe rendir más");
    c.tanda.finalizar(&id1);
    c.tanda.finalizar(&id2);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
}
