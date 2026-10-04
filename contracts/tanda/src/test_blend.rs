//! Pruebas de la misión M4 (bóveda por token). Ya está declarado en `lib.rs`.
//! Usa los helpers compartidos (`setup`, `Ctx`, `assert_conservacion`, ...) de `test.rs`.
//!
//! Aquí la segunda moneda ("USDC") usa otra bóveda simulada: el adaptador de Blend no se puede
//! usar en este crate (depende de `tanda`). Sus pruebas con la tanda completa están en
//! `contracts/adaptador_blend/src/test_auditoria.rs`.
#![allow(unused_imports)]
extern crate std;

use crate::test::*;
use crate::*;
use boveda_simulada::{BovedaSimulada, BovedaSimuladaClient};
use soroban_sdk::{
    contract, contractimpl,
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

/// La segunda moneda (hace de "USDC de Blend") con su propia bóveda, fondeada para pagar intereses.
struct Usdc {
    token: TokenClient<'static>,
    sac: StellarAssetClient<'static>,
    boveda: Address,
}

fn usdc(c: &Ctx) -> Usdc {
    let sac_c = c
        .env
        .register_stellar_asset_contract_v2(Address::generate(&c.env));
    let token = TokenClient::new(&c.env, &sac_c.address());
    let sac = StellarAssetClient::new(&c.env, &sac_c.address());
    let boveda = otra_boveda_de(c, &sac_c.address());
    for p in [&c.ana, &c.beto, &c.carla] {
        sac.mint(p, &SALDO_INICIAL);
    }
    Usdc { token, sac, boveda }
}

fn otra_boveda_de(c: &Ctx, token: &Address) -> Address {
    let b = c
        .env
        .register(BovedaSimulada, (token.clone(), 500u32, 52_560u32));
    StellarAssetClient::new(&c.env, token).mint(&b, &FONDEO_BOVEDA);
    b
}

impl Usdc {
    fn crear(&self, c: &Ctx, n: u32) -> u32 {
        c.tanda.crear_tanda(
            &c.creador,
            &self.token.address,
            &CUOTA,
            &n,
            &PERIODO,
            &1_000,
            &10_000,
        )
    }
    fn saldo(&self, a: &Address) -> i128 {
        self.token.balance(a)
    }
    /// Lo mismo que `assert_conservacion`, pero en USDC.
    fn assert_conservacion(&self, c: &Ctx) {
        let total = self.saldo(&c.ana)
            + self.saldo(&c.beto)
            + self.saldo(&c.carla)
            + self.saldo(&self.boveda)
            + self.saldo(&c.tanda_addr);
        assert_eq!(
            total,
            3 * SALDO_INICIAL + FONDEO_BOVEDA,
            "el dinero en USDC no cuadra"
        );
    }
}

/// Una "bóveda" mínima que solo dice qué token guarda, como `token()` del adaptador de Blend.
#[contract]
pub struct BovedaQueDiceToken;

#[contractimpl]
impl BovedaQueDiceToken {
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&0u32, &token);
    }
    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&0u32).unwrap()
    }
}

/// Una tanda en TUSD y otra en USDC al mismo tiempo, en el mismo contrato: cada una usa la bóveda de
/// su moneda, las dos terminan, rinden y el dinero cuadra en cada moneda por separado.
#[test]
fn cada_token_usa_su_boveda_y_el_dinero_cuadra() {
    let c = setup_con(500, 52_560, false);
    let u = usdc(&c);
    c.tanda
        .registrar_boveda(&u.token.address, &Some(u.boveda.clone()));
    assert_eq!(
        c.tanda.get_boveda_token(&u.token.address),
        Some(u.boveda.clone())
    );
    assert_eq!(c.tanda.get_boveda_token(&c.token.address), None);

    let t = c.crear_y_llenar(10_000); // TUSD: regla general (la principal)
    let d = u.crear(&c, 3); // USDC: la registrada
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.unirse(&d, p);
    }
    assert_eq!(c.tanda.get_boveda(&t), c.boveda);
    assert_eq!(c.tanda.get_boveda(&d), u.boveda);
    // Cada bóveda guarda solo su moneda.
    let bov_tusd = BovedaSimuladaClient::new(&c.env, &c.boveda);
    let bov_usdc = BovedaSimuladaClient::new(&c.env, &u.boveda);
    assert_eq!(
        bov_tusd.shares_de(&c.tanda_addr),
        c.tanda.get_tanda(&t).shares_boveda
    );
    assert_eq!(
        bov_usdc.shares_de(&c.tanda_addr),
        c.tanda.get_tanda(&d).shares_boveda
    );

    // Ronda 0: en USDC, Ana no paga (su garantía en USDC la cubre); en TUSD todos pagan.
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&t, p);
    }
    c.tanda.pagar_cuota(&d, &c.beto);
    c.tanda.pagar_cuota(&d, &c.carla);
    for _ in 0..3 {
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&t);
        c.tanda.cerrar_ronda(&d);
        if c.tanda.get_tanda(&t).estado == Estado::Activa {
            for p in [&c.ana, &c.beto, &c.carla] {
                c.tanda.pagar_cuota(&t, p);
                c.tanda.pagar_cuota(&d, p);
            }
        }
    }
    c.tanda.finalizar(&t);
    c.tanda.finalizar(&d);
    assert_eq!(c.tanda.get_tanda(&t).estado, Estado::Finalizada);
    assert_eq!(c.tanda.get_tanda(&d).estado, Estado::Finalizada);
    assert_eq!(bov_tusd.shares_de(&c.tanda_addr), 0);
    assert_eq!(bov_usdc.shares_de(&c.tanda_addr), 0);
    // El contrato de la tanda no se queda con nada de ninguna moneda.
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_eq!(u.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
    u.assert_conservacion(&c);
    // Beto y Carla cumplieron en USDC: recuperan su garantía con rendimiento y el premio.
    assert!(u.saldo(&c.beto) > SALDO_INICIAL && u.saldo(&c.carla) > SALDO_INICIAL);
}

/// Solo el admin registra; cambiar o quitar el registro solo afecta a las tandas nuevas.
#[test]
fn registrar_solo_admin_y_solo_para_tandas_nuevas() {
    let c = setup();
    let u = usdc(&c);
    let otra = otra_boveda_de(&c, &u.token.address);

    c.env.set_auths(&[]);
    assert!(c
        .tanda
        .try_registrar_boveda(&u.token.address, &Some(u.boveda.clone()))
        .is_err());
    c.env.mock_all_auths();

    c.tanda
        .registrar_boveda(&u.token.address, &Some(u.boveda.clone()));
    let a = u.crear(&c, 3);
    c.tanda
        .registrar_boveda(&u.token.address, &Some(otra.clone()));
    let b = u.crear(&c, 3);
    assert_eq!(
        c.tanda.get_boveda(&a),
        u.boveda,
        "la tanda vieja conserva la suya"
    );
    assert_eq!(c.tanda.get_boveda(&b), otra);

    // La tanda vieja funciona de punta a punta con su bóveda aunque el registro cambió.
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.unirse(&a, p);
    }
    for _ in 0..3 {
        for p in [&c.ana, &c.beto, &c.carla] {
            c.tanda.pagar_cuota(&a, p);
        }
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&a);
    }
    c.tanda.finalizar(&a);
    assert_eq!(c.tanda.get_tanda(&a).estado, Estado::Finalizada);
    u.assert_conservacion_con(&c, &otra);

    // Quitar el registro: el token vuelve a la regla general.
    c.tanda.registrar_boveda(&u.token.address, &None);
    assert_eq!(c.tanda.get_boveda_token(&u.token.address), None);
}

impl Usdc {
    /// Conservación cuando hay una segunda bóveda de USDC en juego.
    fn assert_conservacion_con(&self, c: &Ctx, otra: &Address) {
        let total = self.saldo(&c.ana)
            + self.saldo(&c.beto)
            + self.saldo(&c.carla)
            + self.saldo(&self.boveda)
            + self.saldo(otra)
            + self.saldo(&c.tanda_addr);
        assert_eq!(
            total,
            3 * SALDO_INICIAL + 2 * FONDEO_BOVEDA,
            "el dinero en USDC no cuadra"
        );
    }
}

/// Errores 55 y 56: una bóveda que dice qué token guarda (como el adaptador de Blend) solo se puede
/// registrar para ese token, y una tanda no se puede crear en un token sin bóveda propia si la
/// bóveda general dice guardar otro.
#[test]
fn bovedas_que_dicen_su_token() {
    let c = setup();
    let u = usdc(&c);
    let dice_tusd = c
        .env
        .register(BovedaQueDiceToken, (c.token.address.clone(),));
    let dice_usdc = c
        .env
        .register(BovedaQueDiceToken, (u.token.address.clone(),));

    assert_eq!(
        c.tanda
            .try_registrar_boveda(&u.token.address, &Some(dice_tusd.clone())),
        Err(Ok(Error::BovedaDeOtroToken))
    );
    c.tanda
        .registrar_boveda(&u.token.address, &Some(dice_usdc.clone()));
    assert_eq!(c.tanda.get_boveda(&u.crear(&c, 3)), dice_usdc);

    // Otro contrato de tanda cuya bóveda general dice guardar TUSD.
    let otra_tanda = TandaContractClient::new(&c.env, &c.env.register(TandaContract, ()));
    otra_tanda.inicializar(&Address::generate(&c.env), &dice_tusd, &None);
    let crear = |token: &Address| {
        otra_tanda.try_crear_tanda(&c.creador, token, &CUOTA, &3, &PERIODO, &1_000, &10_000)
    };
    assert_eq!(crear(&u.token.address), Err(Ok(Error::TokenSinBoveda)));
    assert!(crear(&c.token.address).is_ok());
    // Una bóveda que no dice su token (la simulada) se acepta, como hasta ahora.
    assert!(c
        .tanda
        .try_registrar_boveda(&u.token.address, &Some(u.boveda.clone()))
        .is_ok());
}

/// Peor caso en la bóveda registrada: 12 miembros en USDC, nadie paga nunca. Todas las rondas
/// sacan garantía de la bóveda de USDC, la tanda termina y el dinero cuadra.
#[test]
fn peor_caso_12_miembros_en_la_boveda_registrada() {
    let c = setup_con(500, 52_560, false);
    let u = usdc(&c);
    c.tanda
        .registrar_boveda(&u.token.address, &Some(u.boveda.clone()));
    let miembros: std::vec::Vec<Address> = (0..12).map(|_| Address::generate(&c.env)).collect();
    for m in &miembros {
        u.sac.mint(m, &(20 * CUOTA));
    }
    let id = u.crear(&c, 12);
    for m in &miembros {
        c.tanda.unirse(&id, m);
    }
    let total = || {
        miembros.iter().map(|m| u.saldo(m)).sum::<i128>()
            + u.saldo(&u.boveda)
            + u.saldo(&c.tanda_addr)
    };
    let inicial = total();
    let mut max_cpu = 0;
    for _ in 0..12 {
        c.avanzar(PERIODO);
        c.env.cost_estimate().budget().reset_unlimited();
        c.tanda.cerrar_ronda(&id);
        max_cpu = max_cpu.max(c.env.cost_estimate().budget().cpu_instruction_cost());
    }
    c.env.cost_estimate().budget().reset_unlimited();
    c.tanda.finalizar(&id);
    let cpu_fin = c.env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("USDC, 12 miembros sin pagar: cerrar_ronda máx {max_cpu} · finalizar {cpu_fin}");
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Finalizada);
    assert_eq!(total(), inicial, "el dinero en USDC no cuadra");
    // La bóveda de USDC le devolvió todo a la tanda. (Lo que queda en el contrato es lo que la tanda
    // deja "sin repartir" por diseño cuando todos terminan morosos; no depende de la bóveda.)
    assert_eq!(
        BovedaSimuladaClient::new(&c.env, &u.boveda).shares_de(&c.tanda_addr),
        0
    );
    assert!(max_cpu < 100_000_000 && cpu_fin < 100_000_000);
}

/// Cuántos `transfer` del token salieron de `boveda` en la última llamada.
fn retiros_de(c: &Ctx, token: &Address, boveda: &Address) -> usize {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::xdr::{ContractEventBody, ScSymbol, ScVal};
    use soroban_sdk::TryFromVal;
    let transfer = ScVal::Symbol(ScSymbol("transfer".try_into().unwrap()));
    let desde = ScVal::try_from_val(&c.env, &boveda.to_val()).unwrap();
    c.env
        .events()
        .all()
        .filter_by_contract(token)
        .events()
        .iter()
        .filter(|e| {
            let ContractEventBody::V0(b) = &e.body;
            b.topics.len() >= 2 && b.topics[0] == transfer && b.topics[1] == desde
        })
        .count()
}

/// Un cierre en el que 11 garantías cubren su cuota saca de la bóveda UNA sola vez. Con Blend, un
/// retiro por moroso emitía un evento por retiro y la transacción pasaba el límite de 16 KiB de eventos
/// de la red: la ronda no se podía cerrar (docs/blend.md §9). El reparto no cambia y el dinero cuadra.
#[test]
fn cerrar_ronda_saca_de_la_boveda_una_sola_vez() {
    let c = setup_con(500, 52_560, false);
    let u = usdc(&c);
    c.tanda
        .registrar_boveda(&u.token.address, &Some(u.boveda.clone()));
    let miembros: std::vec::Vec<Address> = (0..12).map(|_| Address::generate(&c.env)).collect();
    for m in &miembros {
        u.sac.mint(m, &(20 * CUOTA));
    }
    let id = u.crear(&c, 12);
    for m in &miembros {
        c.tanda.unirse(&id, m);
    }
    let total = || {
        miembros.iter().map(|m| u.saldo(m)).sum::<i128>()
            + u.saldo(&u.boveda)
            + u.saldo(&c.tanda_addr)
    };
    let inicial = total();
    // El presupuesto del entorno se acumula en toda la prueba; aquí importa contar los retiros.
    c.env.cost_estimate().budget().reset_unlimited();

    // Ronda 1: solo paga quien cobra; las garantías de los otros 11 cubren sus cuotas.
    let quien_cobra = &miembros[0];
    c.tanda.pagar_cuota(&id, quien_cobra);
    let antes = u.saldo(quien_cobra);
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(retiros_de(&c, &u.token.address, &u.boveda), 1);
    assert_eq!(
        u.saldo(quien_cobra),
        antes + 12 * CUOTA,
        "la bolsa sale completa"
    );
    for m in &miembros[1..] {
        assert_eq!(c.miembro(id, m).atrasos, 1);
    }
    assert_eq!(total(), inicial);

    // Con todos al día no se toca la bóveda al cerrar.
    for m in &miembros {
        c.tanda.pagar_cuota(&id, m);
    }
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
    assert_eq!(retiros_de(&c, &u.token.address, &u.boveda), 0);

    // El resto sin pagos hasta el final: todo vuelve y el dinero cuadra.
    for _ in 2..12 {
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&id);
        assert!(retiros_de(&c, &u.token.address, &u.boveda) <= 1);
    }
    c.tanda.finalizar(&id);
    assert_eq!(total(), inicial, "el dinero en USDC no cuadra");
    assert_eq!(
        BovedaSimuladaClient::new(&c.env, &u.boveda).shares_de(&c.tanda_addr),
        0
    );
}
