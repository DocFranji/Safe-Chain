//! Pruebas de la misión M1 (pagar deudas). Ya está declarado en `lib.rs`.
//! Usa los helpers compartidos (`setup`, `Ctx`, `assert_conservacion`, ...) de `test.rs`.
//!
//! Todas usan garantía mínima (cobertura 0 %: cada quien deja una cuota), para que un impago
//! agote la garantía rápido y la persona quede morosa.
#![allow(unused_imports)]
extern crate std;

use crate::test::*;
use crate::test_tiempos::{assert_conservacion_de, personas};
use crate::*;
use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _,
    },
    token::StellarAssetClient,
    Address,
};
use std::vec::Vec as StdVec;

fn pagan(c: &Ctx, id: u32, quienes: &[&Address]) {
    for p in quienes {
        c.tanda.pagar_cuota(&id, p);
    }
}

fn cerrar(c: &Ctx, id: u32) {
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
}

/// Tanda de 4 con garantía mínima (una cuota). Ana cobra la ronda 1, paga la 2 y en la 3 deja de pagar:
/// su garantía (100) no alcanza para las 2 cuotas que le quedan, así que no se usa (v5): queda morosa y
/// Carla cobra 100 de menos. Deja la tanda en la ronda 4 (Activa), la de Dani.
/// Devuelve (id, gente) con gente = [ana, beto, carla, dani].
fn ana_morosa(c: &Ctx) -> (u32, StdVec<Address>) {
    let g = personas(c, 4);
    let (ana, beto, carla, dani) = (&g[0], &g[1], &g[2], &g[3]);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &4,
        &PERIODO,
        &1_000,
        &0,
    );
    for p in &g {
        c.tanda.unirse(&id, p);
    }
    pagan(c, id, &[ana, beto, carla, dani]);
    cerrar(c, id); // Ana cobra 400
    pagan(c, id, &[ana, beto, carla, dani]);
    cerrar(c, id); // Beto cobra 400
    pagan(c, id, &[beto, carla, dani]);
    let carla_antes = c.saldo(carla);
    cerrar(c, id); // Ana no paga y su garantía no alcanza: queda morosa y Carla cobra 300
    assert_eq!(c.saldo(carla), carla_antes + 300 * U);
    let ma = c.miembro(id, ana);
    assert!(ma.moroso);
    assert_eq!(ma.deuda, 100 * U);
    assert_eq!(ma.colateral, 100 * U); // su garantía sigue intacta: se reparte al final
    (id, g)
}

#[test]
fn moroso_paga_toda_su_deuda_y_le_llega_a_quien_cobro_de_menos() {
    let c = setup();
    let (id, g) = ana_morosa(&c);
    let (ana, beto, carla, dani) = (&g[0], &g[1], &g[2], &g[3]);

    let d = c.tanda.get_deuda(&id, ana);
    assert_eq!(d.faltantes.len(), 1);
    let f = d.faltantes.get(0).unwrap();
    assert_eq!(
        (f.ronda, f.acreedor.clone(), f.monto),
        (2, carla.clone(), 100 * U)
    );

    let carla_antes = c.saldo(carla);
    let ana_antes = c.saldo(ana);
    assert_eq!(c.tanda.pagar_deuda(&id, ana, ana, &(100 * U)), 0);
    // "Ana pagó su deuda: Carla recibió los 100 TUSD que le faltaban."
    assert_eq!(c.saldo(carla), carla_antes + 100 * U);
    assert_eq!(c.saldo(ana), ana_antes - 100 * U);
    let ma = c.miembro(id, ana);
    assert!(!ma.moroso);
    assert_eq!(ma.deuda, 0);
    let d = c.tanda.get_deuda(&id, ana);
    assert_eq!(d.faltantes.len(), 0);
    assert_eq!(d.pagado, 100 * U);
    // get_deudas: solo quien alguna vez debió (Ana), aunque ya saldó.
    let todas = c.tanda.get_deudas(&id);
    assert_eq!(todas.len(), 1);
    assert_eq!(todas.get(0).unwrap(), (ana.clone(), d));

    // Ya al día: vuelve a pagar su cuota y Dani cobra la bolsa completa.
    pagan(&c, id, &[ana, beto, carla, dani]);
    let dani_antes = c.saldo(dani);
    cerrar(&c, id);
    assert_eq!(c.saldo(dani), dani_antes + 400 * U);
    c.tanda.finalizar(&id);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(&c, &g);
}

#[test]
fn pago_parcial_y_despues_el_resto() {
    let c = setup();
    let (id, g) = ana_morosa(&c);
    let (ana, carla) = (&g[0], &g[2]);
    let carla_antes = c.saldo(carla);

    assert_eq!(c.tanda.pagar_deuda(&id, ana, ana, &(30 * U)), 70 * U);
    assert!(c.miembro(id, ana).moroso, "sigue morosa hasta saldar todo");
    assert_eq!(
        c.tanda.try_pagar_cuota(&id, ana),
        Err(Ok(Error::MiembroMoroso))
    );
    assert_eq!(c.saldo(carla), carla_antes + 30 * U);
    let f = c.tanda.get_deuda(&id, ana).faltantes.get(0).unwrap();
    assert_eq!(f.monto, 70 * U);

    assert_eq!(c.tanda.pagar_deuda(&id, ana, ana, &(70 * U)), 0);
    assert_eq!(c.saldo(carla), carla_antes + 100 * U);
    assert!(!c.miembro(id, ana).moroso);
    c.tanda.pagar_cuota(&id, ana);
    assert_conservacion_de(&c, &g);
}

#[test]
fn errores_al_pagar_una_deuda() {
    let c = setup();
    let (id, g) = ana_morosa(&c);
    let (ana, beto) = (&g[0], &g[1]);
    let t = &c.tanda;
    assert_eq!(
        t.try_pagar_deuda(&id, ana, ana, &(100 * U + 1)),
        Err(Ok(Error::PagoExcesivo))
    );
    assert_eq!(
        t.try_pagar_deuda(&id, ana, ana, &0),
        Err(Ok(Error::MontoInvalido))
    );
    assert_eq!(
        t.try_pagar_deuda(&id, ana, ana, &(-5)),
        Err(Ok(Error::MontoInvalido))
    );
    assert_eq!(
        t.try_pagar_deuda(&id, beto, beto, &U),
        Err(Ok(Error::SinDeuda))
    );
    let extrano = Address::generate(&c.env);
    assert_eq!(
        t.try_pagar_deuda(&id, &extrano, ana, &U),
        Err(Ok(Error::NoEsMiembro))
    );
    assert_eq!(
        t.try_pagar_deuda(&99, ana, ana, &U),
        Err(Ok(Error::NoEncontrada))
    );
    // Nada de lo anterior movió dinero.
    assert_eq!(c.miembro(id, ana).deuda, 100 * U);
    assert_conservacion_de(&c, &g);
}

#[test]
fn otra_persona_puede_pagar_la_deuda() {
    let c = setup();
    let (id, g) = ana_morosa(&c);
    let (ana, carla) = (&g[0], &g[2]);
    let mama = Address::generate(&c.env);
    StellarAssetClient::new(&c.env, &c.token.address).mint(&mama, &(100 * U));
    let ana_antes = c.saldo(ana);
    let carla_antes = c.saldo(carla);

    assert_eq!(c.tanda.pagar_deuda(&id, ana, &mama, &(100 * U)), 0);
    assert_eq!(c.saldo(&mama), 0, "el dinero sale de quien paga");
    assert_eq!(c.saldo(ana), ana_antes);
    assert_eq!(c.saldo(carla), carla_antes + 100 * U);
    assert!(!c.miembro(id, ana).moroso);

    // Lo que entró de la mamá ahora está en manos de Carla: el total cuadra contando a la mamá.
    let total: i128 = g.iter().map(|p| c.saldo(p)).sum::<i128>()
        + c.saldo(&mama)
        + c.saldo(&c.boveda)
        + c.saldo(&c.tanda_addr);
    assert_eq!(
        total,
        FONDEO_BOVEDA + 4 * crate::test_tiempos::SALDO_GRANDE + 100 * U
    );
}

#[test]
fn pagar_deuda_exige_la_firma_de_quien_paga() {
    let c = setup();
    let (id, g) = ana_morosa(&c);
    let ana = &g[0];
    c.env.set_auths(&[]);
    assert!(c.tanda.try_pagar_deuda(&id, ana, ana, &(100 * U)).is_err());
}

/// `Activa`, `PorLiquidar` y (v4) `Finalizada`. Ni `Abierta` (todavía no puede haber deudas) ni
/// `Cancelada` (nunca arrancó).
#[test]
fn pagar_deuda_en_cada_estado() {
    let c = setup();
    // Abierta: todavía no puede haber deudas.
    let abierta = c.crear(0);
    c.tanda.unirse(&abierta, &c.ana);
    assert_eq!(
        c.tanda.try_pagar_deuda(&abierta, &c.ana, &c.ana, &U),
        Err(Ok(Error::EstadoInvalido))
    );
    // Cancelada: tampoco.
    c.tanda.cancelar(&abierta);
    assert_eq!(
        c.tanda.try_pagar_deuda(&abierta, &c.ana, &c.ana, &U),
        Err(Ok(Error::EstadoInvalido))
    );

    // Carla queda morosa (rondas 2 y 3) y termina en PorLiquidar: ahí puede pagar.
    let id = carla_morosa_en_su_ronda(&c);
    c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(50 * U));

    // Finalizada (v4): también. Al finalizar, lo que le falta pagar a Beto (50) sale de la garantía de
    // Carla (100) y los otros 50 le vuelven; queda la deuda de su propia ronda.
    c.tanda.finalizar(&id);
    assert_eq!(c.miembro(id, &c.carla).deuda, 100 * U);
    assert_eq!(c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(100 * U)), 0);
    c.assert_conservacion();
}

/// Tanda de 3 con garantía mínima: Carla no paga desde la ronda 2. Su garantía (100) no alcanza para las
/// 2 cuotas que le quedan: queda morosa en la ronda 2 (debe 100 a Beto, que cobra 200) y en la 3 (la
/// suya) su bolsa (200, sin su cuota) se retiene y debe otros 100 a su propia ronda.
/// Deja la tanda en `PorLiquidar`.
fn carla_morosa_en_su_ronda(c: &Ctx) -> u32 {
    let id = c.crear_y_llenar(0);
    pagan(c, id, &[&c.ana, &c.beto, &c.carla]);
    cerrar(c, id);
    pagan(c, id, &[&c.ana, &c.beto]);
    cerrar(c, id); // Carla morosa: Beto cobra 200
    pagan(c, id, &[&c.ana, &c.beto]);
    cerrar(c, id); // su bolsa se retiene
    let t = c.tanda.get_tanda(&id);
    assert_eq!(t.estado, Estado::PorLiquidar);
    assert_eq!(t.retenido, 200 * U);
    let m = c.miembro(id, &c.carla);
    assert!(m.moroso && !m.cobro);
    assert_eq!(m.deuda, 200 * U);
    assert_eq!(m.colateral, 100 * U);
    id
}

// ===========================================================================
// v4 (N2b): pagar la deuda después de que la tanda termina
// ===========================================================================

/// Ana debe 100 a Carla (ronda 3) y 100 a Dani (ronda 4); los dos cobraron su bolsa. Al finalizar, su
/// garantía (100) se reparte entre los dos (50 y 50) y le quedan 100 de deuda. Después de finalizar, el
/// pago va directo de quien paga a cada uno, sin pasar por el contrato, del faltante más viejo al más
/// nuevo, en partes y también pagado por otra persona.
#[test]
fn despues_de_finalizar_el_pago_va_directo_a_quien_cobro_de_menos() {
    let c = setup();
    let (id, g) = ana_morosa(&c);
    let (ana, beto, carla, dani) = (&g[0], &g[1], &g[2], &g[3]);
    pagan(&c, id, &[beto, carla, dani]);
    cerrar(&c, id); // ronda 4: Ana tampoco paga, Dani cobra 300
    assert_eq!(c.miembro(id, ana).deuda, 200 * U);
    let (carla0, dani0) = (c.saldo(carla), c.saldo(dani));
    c.tanda.finalizar(&id);
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Finalizada);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    // La garantía de Ana se repartió: 50 para Carla y 50 para Dani (más su propia garantía de vuelta).
    assert_eq!(c.saldo(carla), carla0 + 100 * U + 50 * U);
    assert_eq!(c.saldo(dani), dani0 + 100 * U + 50 * U);
    assert_eq!(c.miembro(id, ana).deuda, 100 * U);
    assert_eq!(c.miembro(id, ana).colateral, 0);

    // Pagar de más o por quien no debe sigue fallando.
    assert_eq!(
        c.tanda.try_pagar_deuda(&id, ana, ana, &(101 * U)),
        Err(Ok(Error::PagoExcesivo))
    );
    assert_eq!(
        c.tanda.try_pagar_deuda(&id, beto, beto, &U),
        Err(Ok(Error::SinDeuda))
    );
    assert_eq!(
        c.tanda.try_pagar_deuda(&id, ana, ana, &0),
        Err(Ok(Error::MontoInvalido))
    );

    // Ana paga 75: 50 a Carla (lo más viejo) y 25 a Dani.
    let antes: StdVec<i128> = g.iter().map(|p| c.saldo(p)).collect();
    assert_eq!(c.tanda.pagar_deuda(&id, ana, ana, &(75 * U)), 25 * U);
    assert_eq!(c.saldo(ana), antes[0] - 75 * U);
    assert_eq!(c.saldo(carla), antes[2] + 50 * U);
    assert_eq!(c.saldo(dani), antes[3] + 25 * U);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert!(c.miembro(id, ana).moroso);

    // Una persona de fuera (un familiar) paga el resto: los 25 que le faltan a Dani.
    let familiar = Address::generate(&c.env);
    StellarAssetClient::new(&c.env, &c.token.address)
        .mint(&familiar, &crate::test_tiempos::SALDO_GRANDE);
    let dani_antes = c.saldo(dani);
    assert_eq!(c.tanda.pagar_deuda(&id, ana, &familiar, &(25 * U)), 0);
    assert_eq!(c.saldo(dani), dani_antes + 25 * U);
    let m = c.miembro(id, ana);
    assert!(!m.moroso && m.deuda == 0);
    let d = c.tanda.get_deuda(&id, ana);
    assert!(d.faltantes.is_empty());
    assert_eq!(d.pagado, 200 * U); // 100 de su garantía + 75 + 25
                                   // Ya no debe nada.
    assert_eq!(
        c.tanda.try_pagar_deuda(&id, ana, ana, &U),
        Err(Ok(Error::SinDeuda))
    );
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    let mut todos = g.clone();
    todos.push(familiar);
    assert_conservacion_de(&c, &todos);
}

/// El faltante de su propia ronda: la bolsa de Carla se retuvo y al finalizar se repartió entre Ana y
/// Beto. Lo que Carla pague después por esa ronda les llega a ellos, en partes iguales. No recupera
/// la bolsa (ya se repartió), pero queda al día.
#[test]
fn despues_de_finalizar_su_propia_ronda_va_a_quienes_recibieron_el_reparto() {
    let c = setup();
    let id = carla_morosa_en_su_ronda(&c);
    c.tanda.finalizar(&id);
    let reparto: soroban_sdk::Vec<Address> = c.env.as_contract(&c.tanda_addr, || {
        c.env
            .storage()
            .persistent()
            .get(&ClaveM1::Repartidos(id))
            .unwrap()
    });
    assert_eq!(
        reparto,
        soroban_sdk::vec![&c.env, c.ana.clone(), c.beto.clone()]
    );

    let (ana0, beto0, carla0) = (c.saldo(&c.ana), c.saldo(&c.beto), c.saldo(&c.carla));
    // Parcial: 30 (15 para cada uno).
    assert_eq!(
        c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(30 * U)),
        70 * U
    );
    assert_eq!(c.saldo(&c.ana), ana0 + 15 * U);
    assert_eq!(c.saldo(&c.beto), beto0 + 15 * U);
    // Un monto impar: el resto del redondeo va al último.
    let impar = 7 * U + 1;
    c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &impar);
    assert_eq!(c.saldo(&c.ana), ana0 + 15 * U + impar / 2);
    assert_eq!(c.saldo(&c.beto), beto0 + 15 * U + impar - impar / 2);
    // El resto lo paga Ana, que también recibe su parte: a ella no se le transfiere nada.
    let falta = c.miembro(id, &c.carla).deuda;
    let (ana1, beto1) = (c.saldo(&c.ana), c.saldo(&c.beto));
    assert_eq!(c.tanda.pagar_deuda(&id, &c.carla, &c.ana, &falta), 0);
    assert_eq!(c.saldo(&c.ana), ana1 - falta + falta / 2);
    assert_eq!(c.saldo(&c.beto), beto1 + falta - falta / 2);

    let m = c.miembro(id, &c.carla);
    assert!(!m.moroso && !m.cobro && m.deuda == 0);
    assert_eq!(c.saldo(&c.carla), carla0 - 30 * U - impar);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
}

/// Todos terminan en mora: al finalizar nadie recibe reparto. Lo que se pague después va a quien
/// cobró de menos, aunque su bolsa se haya retenido (nadie más la recibió).
#[test]
fn despues_de_finalizar_sin_reparto_va_a_quien_cobro_de_menos() {
    let c = setup();
    let id = c.crear_y_llenar(0);
    pagan(&c, id, &[&c.ana, &c.beto, &c.carla]);
    cerrar(&c, id); // Ana cobra
    cerrar(&c, id); // nadie paga: ninguna garantía alcanza, los tres quedan morosos; la bolsa de Beto sale vacía
    cerrar(&c, id); // nadie paga: la bolsa de Carla sale vacía
    for p in [&c.ana, &c.beto, &c.carla] {
        assert!(c.miembro(id, p).moroso);
    }
    c.tanda.finalizar(&id);
    // Las garantías (300) se repartieron entre los afectados, pero ninguno cobró su bolsa y no hay
    // nadie que haya cumplido: queda sin repartir en el contrato (como siempre que todos terminan en mora).
    assert_eq!(c.saldo(&c.tanda_addr), 300 * U);
    let hay_reparto = c.env.as_contract(&c.tanda_addr, || {
        c.env.storage().persistent().has(&ClaveM1::Repartidos(id))
    });
    assert!(!hay_reparto);
    // A Ana le quedan 100 por pagar (50 a Beto y 50 a Carla); a Beto y a Carla, solo su propia ronda.
    assert_eq!(c.miembro(id, &c.ana).deuda, 100 * U);
    assert_eq!(c.miembro(id, &c.beto).deuda, 100 * U);
    assert_eq!(c.miembro(id, &c.carla).deuda, 100 * U);

    let (beto0, carla0) = (c.saldo(&c.beto), c.saldo(&c.carla));
    c.tanda.pagar_deuda(&id, &c.ana, &c.ana, &(100 * U));
    assert_eq!(c.saldo(&c.beto), beto0 + 50 * U);
    assert_eq!(c.saldo(&c.carla), carla0 + 50 * U);
    // Beto y Carla pagan su propia ronda: el dinero sería para ellos mismos, así que no se mueve nada.
    c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(100 * U));
    c.tanda.pagar_deuda(&id, &c.beto, &c.beto, &(100 * U));
    assert_eq!(c.saldo(&c.beto), beto0 + 50 * U);
    assert_eq!(c.saldo(&c.carla), carla0 + 50 * U);
    for p in [&c.ana, &c.beto, &c.carla] {
        assert!(!c.miembro(id, p).moroso);
    }
    c.assert_conservacion();
}

/// El bloqueo de morosos (N2a, M2) se lee del historial: `veces_moroso > deudas_saldadas`. Saldar
/// después de finalizar debe anotar `DeudaSaldada` una vez, para que la persona se desbloquee.
#[test]
fn saldar_despues_de_finalizar_anota_deuda_saldada_en_el_historial() {
    let c = setup();
    let dir = c.env.register(historial::HistorialContract, ());
    let h = historial::HistorialContractClient::new(&c.env, &dir);
    h.inicializar(&Address::generate(&c.env));
    h.autorizar_emisor(&c.tanda_addr);
    c.tanda.configurar_historial(&Some(dir));

    let id = carla_morosa_en_su_ronda(&c);
    c.tanda.finalizar(&id);
    let antes = h.historial(&c.carla);
    assert_eq!((antes.veces_moroso, antes.deudas_saldadas), (1, 0));

    c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(40 * U));
    assert_eq!(h.historial(&c.carla).deudas_saldadas, 0);
    c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(60 * U));
    let despues = h.historial(&c.carla);
    assert_eq!((despues.veces_moroso, despues.deudas_saldadas), (1, 1));
    c.assert_conservacion();
}

/// Pasa `segundos` (reloj y ledgers) comprobando antes que nada de lo que `pagar_deuda` lee en una tanda
/// finalizada se archive en el camino: la instancia, la tanda, la lista, cada miembro, cada deuda y el
/// reparto. (Las participaciones en la bóveda ya no importan: la tanda no tiene.)
fn pasar_sin_archivar_finalizada(c: &Ctx, id: u32, segundos: u64) {
    let salto = (segundos / 5) as u32;
    let (env, yo) = (&c.env, &c.tanda_addr);
    env.as_contract(yo, || {
        let p = env.storage().persistent();
        assert!(env.storage().instance().get_ttl() >= salto, "instancia");
        assert!(p.get_ttl(&DataKey::Tanda(id)) >= salto, "Tanda");
        assert!(p.get_ttl(&DataKey::Miembros(id)) >= salto, "Miembros");
        let lista: soroban_sdk::Vec<Address> = p.get(&DataKey::Miembros(id)).unwrap();
        for dir in lista.iter() {
            assert!(
                p.get_ttl(&DataKey::Miembro(id, dir.clone())) >= salto,
                "Miembro"
            );
            let d = ClaveM1::DeudaDe(id, dir);
            if p.has(&d) {
                assert!(p.get_ttl(&d) >= salto, "DeudaDe");
            }
        }
        let r = ClaveM1::Repartidos(id);
        if p.has(&r) {
            assert!(p.get_ttl(&r) >= salto, "Repartidos");
        }
    });
    crate::test_tiempos::pasar(c, segundos);
}

/// Una tanda mensual termina con una deuda: sus datos viven lo máximo de la red (~180 días en
/// testnet) y la persona puede pagar meses después sin que nada se haya archivado. Cada pago vuelve
/// a renovar todo.
#[test]
fn la_deuda_se_puede_pagar_meses_despues_de_finalizar() {
    let c = setup();
    crate::test_tiempos::como_testnet(&c);
    let mes = 30 * 86_400;
    let id = c
        .tanda
        .crear_tanda(&c.creador, &c.token.address, &CUOTA, &3, &mes, &1_000, &0);
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.unirse(&id, p);
    }
    let pasar = |s: u64| crate::test_tiempos::pasar_sin_archivar(&c, id, s, "tanda mensual");
    pagan(&c, id, &[&c.ana, &c.beto, &c.carla]);
    pasar(mes);
    c.tanda.cerrar_ronda(&id);
    pagan(&c, id, &[&c.ana, &c.beto]);
    pasar(mes);
    c.tanda.cerrar_ronda(&id);
    pagan(&c, id, &[&c.ana, &c.beto]);
    pasar(mes);
    c.tanda.cerrar_ronda(&id); // Carla morosa
    c.tanda.finalizar(&id);

    // ~5 meses después (150 días) todo sigue vivo y Carla paga una parte.
    let dias = 86_400;
    pasar_sin_archivar_finalizada(&c, id, 150 * dias);
    c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(40 * U));
    // Y otros ~5 meses después, el resto: el pago anterior lo renovó todo.
    pasar_sin_archivar_finalizada(&c, id, 150 * dias);
    assert_eq!(c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(60 * U)), 0);
    c.assert_conservacion();
}

/// Carla queda morosa antes de su turno, salda, vuelve a pagar y cobra su bolsa completa.
#[test]
fn moroso_salda_antes_de_su_turno_y_cobra_normal() {
    let c = setup();
    let id = c.crear_y_llenar(0);
    pagan(&c, id, &[&c.ana, &c.beto]);
    let ana_antes = c.saldo(&c.ana);
    cerrar(&c, id); // Carla no paga y su garantía no alcanza: morosa. Ana cobra 200 (le faltan 100).
    assert_eq!(c.saldo(&c.ana), ana_antes + 200 * U);
    assert_eq!(c.miembro(id, &c.carla).colateral, 100 * U); // su garantía sigue intacta

    assert_eq!(c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(100 * U)), 0);
    assert_eq!(
        c.saldo(&c.ana),
        ana_antes + 300 * U,
        "Ana completa su bolsa"
    );
    pagan(&c, id, &[&c.ana, &c.beto, &c.carla]);
    cerrar(&c, id); // Beto cobra completo
    pagan(&c, id, &[&c.ana, &c.beto, &c.carla]);
    let carla_antes = c.saldo(&c.carla);
    cerrar(&c, id);
    assert_eq!(
        c.saldo(&c.carla),
        carla_antes + 300 * U,
        "Carla cobra completo"
    );
    assert!(c.miembro(id, &c.carla).cobro);

    c.tanda.finalizar(&id);
    // Sin rendimiento ni premios, todos terminan como empezaron: pagar la deuda la dejó al día y
    // recupera su garantía.
    for p in [&c.ana, &c.beto, &c.carla] {
        assert_eq!(c.saldo(p), SALDO_INICIAL);
    }
    c.assert_conservacion();
}

/// Carla paga tarde una vez y luego deja de pagar: su bolsa se retiene. Al final salda todo: Beto
/// recibe lo que le faltaba, Carla recupera su bolsa menos su multa, y la multa se reparte entre quienes
/// nunca se atrasaron.
#[test]
fn moroso_salda_al_final_y_recupera_su_bolsa_retenida_menos_multas() {
    let c = setup();
    let id = c.crear_y_llenar(0);
    pagan(&c, id, &[&c.ana, &c.beto]);
    c.avanzar(PERIODO + 1);
    pagan(&c, id, &[&c.carla]); // Carla paga tarde: multa de 10 pendiente
    c.tanda.cerrar_ronda(&id);
    pagan(&c, id, &[&c.ana, &c.beto]);
    cerrar(&c, id); // Carla no paga y su garantía no alcanza: morosa. Beto cobra 200
    pagan(&c, id, &[&c.ana, &c.beto]);
    cerrar(&c, id); // turno de Carla, morosa: la bolsa (200) se retiene
    let t = c.tanda.get_tanda(&id);
    assert_eq!(t.estado, Estado::PorLiquidar);
    assert_eq!(t.retenido, 200 * U);
    let d = c.tanda.get_deuda(&id, &c.carla);
    assert_eq!(d.bolsa_retenida, 200 * U);
    assert_eq!(d.faltantes.len(), 2); // ronda 2 (a Beto) y ronda 3 (su propia bolsa)

    let beto_antes = c.saldo(&c.beto);
    let carla_antes = c.saldo(&c.carla);
    assert_eq!(c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(200 * U)), 0);
    assert_eq!(c.saldo(&c.beto), beto_antes + 100 * U);
    // Pagó 200 y recuperó su bolsa completa (300) menos la multa (10).
    assert_eq!(c.saldo(&c.carla), carla_antes - 200 * U + 290 * U);
    let t = c.tanda.get_tanda(&id);
    assert_eq!(t.retenido, 0);
    assert_eq!(t.fondo_premios, 10 * U);
    let mc = c.miembro(id, &c.carla);
    assert!(mc.cobro && !mc.moroso);
    assert_eq!(mc.multas_pendientes, 0);

    c.tanda.finalizar(&id);
    // Ana y Beto nunca se atrasaron: se reparten la multa de Carla (5 y 5).
    assert_eq!(c.saldo(&c.ana), SALDO_INICIAL + 5 * U);
    assert_eq!(c.saldo(&c.beto), SALDO_INICIAL + 5 * U);
    assert_eq!(c.saldo(&c.carla), SALDO_INICIAL - 10 * U);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
}

/// Beto queda moroso desde la primera ronda y su bolsa se retiene en su turno. Salda a mitad de la tanda:
/// recupera su bolsa completa. Su garantía nunca se usó (v5), así que ya está puesta para las cuotas
/// que aún debe y no hace falta reponerla (con sorteo o subasta sí: ver `test_turnos`). Al final la
/// recupera.
#[test]
fn moroso_salda_a_mitad_de_tanda_y_recupera_su_bolsa_completa() {
    let c = setup();
    let g = personas(&c, 4);
    let (ana, beto, carla, dani) = (&g[0], &g[1], &g[2], &g[3]);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &4,
        &PERIODO,
        &1_000,
        &0,
    );
    for p in &g {
        c.tanda.unirse(&id, p);
    }
    pagan(&c, id, &[ana, carla, dani]);
    cerrar(&c, id); // Beto no paga y su garantía no alcanza: morosa. Ana cobra 300.
    pagan(&c, id, &[ana, carla, dani]);
    cerrar(&c, id); // turno de Beto, moroso: su bolsa (300) se retiene
    assert_eq!(c.tanda.get_tanda(&id).retenido, 300 * U);

    let beto_antes = c.saldo(beto);
    let ana_antes = c.saldo(ana);
    assert_eq!(c.tanda.pagar_deuda(&id, beto, beto, &(200 * U)), 0);
    assert_eq!(c.saldo(ana), ana_antes + 100 * U); // lo que le faltó a Ana
                                                   // Bolsa 400 (300 + su cuota de esta ronda) − nada de multas − nada que reponer (su garantía está entera).
    assert_eq!(c.saldo(beto), beto_antes - 200 * U + 400 * U);
    let mb = c.miembro(id, beto);
    assert!(!mb.moroso && mb.cobro);
    assert_eq!(mb.colateral, 100 * U);
    let t = c.tanda.get_tanda(&id);
    assert_eq!((t.retenido, t.fondo_premios), (0, 0));

    // Sigue la tanda: Beto vuelve a pagar y al final recupera su garantía.
    for _ in 0..2 {
        pagan(&c, id, &[ana, beto, carla, dani]);
        cerrar(&c, id);
    }
    let beto_antes = c.saldo(beto);
    c.tanda.finalizar(&id);
    assert_eq!(c.saldo(beto), beto_antes + 100 * U);
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(&c, &g);
}

/// Dos morosos: Ana le debe a Carla una ronda en la que la bolsa de Carla se retuvo. El pago de Ana
/// se suma a esa bolsa retenida; cuando Carla salda, la recupera completa.
#[test]
fn abono_a_una_bolsa_retenida_y_luego_recuperada() {
    let c = setup();
    let id = c.crear_y_llenar(0);
    pagan(&c, id, &[&c.ana, &c.beto]);
    cerrar(&c, id); // Carla no paga y su garantía no alcanza: morosa (debe 100 a Ana). Ana cobra 200.
    pagan(&c, id, &[&c.beto]);
    cerrar(&c, id); // Ana tampoco paga: morosa (debe 100 a Beto). Carla debe 100 más a Beto. Beto cobra 100.
    pagan(&c, id, &[&c.beto]);
    cerrar(&c, id); // Ana debe 100 más a Carla; Carla, 100 a su propia ronda: su bolsa (100) se retiene.
    assert_eq!(c.tanda.get_tanda(&id).retenido, 100 * U);
    assert_eq!(c.miembro(id, &c.ana).deuda, 200 * U);
    assert_eq!(c.miembro(id, &c.carla).deuda, 300 * U);

    // Ana paga todo: 100 a Beto (lo más viejo). Carla todavía es morosa y su bolsa está retenida, así
    // que los otros 100 van a esa bolsa y no a su mano.
    let (carla_antes, beto_antes) = (c.saldo(&c.carla), c.saldo(&c.beto));
    c.tanda.pagar_deuda(&id, &c.ana, &c.ana, &(200 * U));
    assert_eq!(c.saldo(&c.beto), beto_antes + 100 * U);
    assert_eq!(c.saldo(&c.carla), carla_antes);
    assert_eq!(c.tanda.get_tanda(&id).retenido, 200 * U);
    assert_eq!(c.tanda.get_deuda(&id, &c.carla).bolsa_retenida, 200 * U);

    // Carla salda (100 a Ana, 100 a Beto y 100 a su propia bolsa) y recupera 300.
    let (ana_antes, beto_antes) = (c.saldo(&c.ana), c.saldo(&c.beto));
    c.tanda.pagar_deuda(&id, &c.carla, &c.carla, &(300 * U));
    assert_eq!(c.saldo(&c.ana), ana_antes + 100 * U);
    assert_eq!(c.saldo(&c.beto), beto_antes + 100 * U);
    assert_eq!(c.saldo(&c.carla), carla_antes - 300 * U + 300 * U);
    assert_eq!(c.tanda.get_tanda(&id).retenido, 0);

    c.tanda.finalizar(&id);
    // Nadie quedó moroso: cada quien recupera su garantía y todos terminan como empezaron.
    for p in [&c.ana, &c.beto, &c.carla] {
        assert_eq!(c.saldo(p), SALDO_INICIAL);
    }
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    c.assert_conservacion();
}

// ===========================================================================
// v5: la garantía de quien no paga se reparte al final, en proporción
// ===========================================================================

/// Una tanda de `n` con la cobertura dada y cuota de 100. Devuelve (id, gente) con la gente en el orden
/// en que llegaron (y cobran).
fn tanda_de(c: &Ctx, n: u32, cobertura_bps: u32) -> (u32, StdVec<Address>) {
    let g = personas(c, n);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &n,
        &PERIODO,
        &1_000,
        &cobertura_bps,
    );
    for p in &g {
        c.tanda.unirse(&id, p);
    }
    (id, g)
}

/// El ejemplo del pedido: garantía de 50 %, la persona cobra en el primer turno y no paga nunca. Antes
/// su garantía pagaba cuotas completas en orden (quien cobraba justo después se llevaba todo y los últimos
/// nada). Ahora se queda quieta y, al terminar, se reparte entre los 4 afectados en partes iguales.
#[test]
fn ejemplo_del_pedido_garantia_del_50_por_ciento_y_no_paga_nunca() {
    let c = setup();
    let (id, g) = tanda_de(&c, 5, 5_000);
    let ana = &g[0];
    // Su garantía: 100 × 4 cuotas que le quedan después de cobrar × 50 % = 200.
    assert_eq!(c.miembro(id, ana).colateral, 200 * U);
    let otros: StdVec<&Address> = g[1..].iter().collect();
    for _ in 0..5 {
        // Ana nunca paga; los demás pagan cuando pueden (quien ya está moroso no).
        let al_dia: StdVec<&Address> = otros
            .iter()
            .copied()
            .filter(|p| !c.miembro(id, p).moroso)
            .collect();
        pagan(&c, id, &al_dia);
        cerrar(&c, id);
    }
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::PorLiquidar);
    let ma = c.miembro(id, ana);
    assert!(ma.moroso && !ma.cobro);
    // Debe las 5 cuotas: 4 a quienes cobraron de menos y 1 a su propia ronda (cuya bolsa se retuvo).
    assert_eq!(ma.deuda, 500 * U);
    assert_eq!(ma.colateral, 200 * U); // la garantía no se tocó
    let d = c.tanda.get_deuda(&id, ana);
    assert_eq!(d.faltantes.len(), 5);
    assert_eq!(c.tanda.get_tanda(&id).retenido, 400 * U);

    let antes: StdVec<i128> = g.iter().map(|p| c.saldo(p)).collect();
    c.tanda.finalizar(&id);
    // La garantía (200) se reparte entre los 4 afectados según lo que le falta a cada uno (100 y 100 y
    // 100 y 100): 50 a cada uno.
    let ma = c.miembro(id, ana);
    assert_eq!(ma.deuda, 300 * U);
    assert_eq!(c.saldo(ana), antes[0], "no recibe nada");
    let d = c.tanda.get_deuda(&id, ana);
    for f in d.faltantes.iter() {
        let esperado = if f.acreedor == *ana { 100 * U } else { 50 * U };
        assert_eq!(f.monto, esperado);
    }
    assert_eq!(d.pagado, 200 * U);
    for (i, p) in g.iter().enumerate().skip(1) {
        // Su garantía de vuelta + 100 del fondo (la bolsa retenida de Ana) + 50 de la garantía de Ana.
        let m = c.miembro(id, p);
        let garantia = ma_garantia(&c, 5, 5_000, i as u32);
        assert_eq!(c.saldo(p), antes[i] + garantia + 100 * U + 50 * U);
        assert!(!m.moroso);
    }
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(&c, &g);
}

/// La garantía que deja quien llega en el lugar `posicion` (la fórmula escalonada).
fn ma_garantia(_c: &Ctx, n: u32, cobertura_bps: u32, posicion: u32) -> i128 {
    let restantes = (n - 1 - posicion) as i128;
    (CUOTA * restantes * cobertura_bps as i128 / 10_000).max(CUOTA)
}

/// Dos morosos con afectados en común: Ana y Beto dejan de pagar desde la ronda 3 (ya cobraron); Carla y
/// Dani cobran después de ellos y los dos les quedan a deber. La garantía de cada moroso se reparte entre
/// sus propios afectados, sin mezclarse con la del otro.
#[test]
fn dos_morosos_con_afectados_en_comun() {
    let c = setup();
    let (id, g) = tanda_de(&c, 5, 0); // garantía mínima: una cuota cada quien
    let (ana, beto, carla, dani, eva) = (&g[0], &g[1], &g[2], &g[3], &g[4]);
    pagan(&c, id, &[ana, beto, carla, dani, eva]);
    cerrar(&c, id); // Ana cobra
    pagan(&c, id, &[ana, beto, carla, dani, eva]);
    cerrar(&c, id); // Beto cobra
    for _ in 0..3 {
        // Ana y Beto ya no pagan (su garantía no alcanza para lo que les queda)
        let al_dia: StdVec<&Address> = [carla, dani, eva]
            .into_iter()
            .filter(|p| !c.miembro(id, p).moroso)
            .collect();
        pagan(&c, id, &al_dia);
        cerrar(&c, id);
    }
    for p in [ana, beto] {
        let m = c.miembro(id, p);
        assert!(m.moroso);
        assert_eq!(m.deuda, 300 * U); // Carla, Dani y Eva
    }
    let antes: StdVec<i128> = g.iter().map(|p| c.saldo(p)).collect();
    c.tanda.finalizar(&id);
    // Cada uno deja 100 de garantía: 33,33… a cada afectado. Carla, Dani y Eva reciben lo de los dos.
    let u = U;
    let parte = 100 * u / 3;
    for p in [ana, beto] {
        let m = c.miembro(id, p);
        assert!(m.moroso);
        assert_eq!(m.deuda, 200 * u);
        assert_eq!(c.saldo(p), antes[g.iter().position(|x| x == p).unwrap()]);
    }
    let recibido: i128 = [carla, dani, eva]
        .iter()
        .map(|p| c.saldo(p) - antes[g.iter().position(|x| x == *p).unwrap()])
        .sum();
    // Lo que recibieron de más: sus 3 garantías devueltas (300) + las de Ana y Beto (200).
    assert_eq!(recibido, 300 * u + 200 * u);
    // Ninguno recibió más de lo que se le debía (200 entre los dos) ni menos de dos partes casi iguales.
    for p in [carla, dani, eva] {
        let extra = c.saldo(p) - antes[g.iter().position(|x| x == p).unwrap()] - 100 * u;
        assert!(
            (2 * parte - 2..=2 * parte + 2).contains(&extra),
            "recibió {extra}"
        );
    }
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(&c, &g);
}

/// Quien paga su deuda a medias y no la termina: lo pagado reduce primero los faltantes más viejos y la
/// garantía se reparte en proporción a lo que queda.
#[test]
fn moroso_que_paga_a_medias_reparte_la_garantia_segun_lo_que_queda() {
    let c = setup();
    let (id, g) = tanda_de(&c, 4, 0);
    let (ana, beto, carla, dani) = (&g[0], &g[1], &g[2], &g[3]);
    pagan(&c, id, &[ana, beto, carla, dani]);
    cerrar(&c, id); // Ana cobra
    for _ in 0..3 {
        // Ana ya no paga
        pagan(&c, id, &[beto, carla, dani]);
        cerrar(&c, id);
    }
    let ma = c.miembro(id, ana);
    assert_eq!(ma.deuda, 300 * U); // Beto, Carla y Dani (100 cada uno)
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::PorLiquidar);

    // Ana paga 40: van a lo más viejo (Beto). Ahora debe 60 a Beto y 100 a Carla y a Dani.
    let beto0 = c.saldo(beto);
    assert_eq!(c.tanda.pagar_deuda(&id, ana, ana, &(40 * U)), 260 * U);
    assert_eq!(c.saldo(beto), beto0 + 40 * U);
    let (carla0, dani0, beto0, ana0) = (c.saldo(carla), c.saldo(dani), c.saldo(beto), c.saldo(ana));

    c.tanda.finalizar(&id);
    // Su garantía (100) se reparte 60 : 100 : 100 sobre 260.
    let parte_beto = 100 * U * 60 / 260;
    let parte_carla = 100 * U * 100 / 260;
    let recibe = |p: &Address, antes: i128| c.saldo(p) - antes - 100 * U; // menos su propia garantía
    let (rb, rc, rd) = (
        recibe(beto, beto0),
        recibe(carla, carla0),
        recibe(dani, dani0),
    );
    assert!((parte_beto..=parte_beto + 2).contains(&rb), "Beto {rb}");
    assert!((parte_carla..=parte_carla + 2).contains(&rc), "Carla {rc}");
    assert!((parte_carla..=parte_carla + 2).contains(&rd), "Dani {rd}");
    // Se repartió toda su garantía, ni un centavo más ni menos.
    assert_eq!(rb + rc + rd, 100 * U);
    assert_eq!(c.saldo(ana), ana0);
    let ma = c.miembro(id, ana);
    assert_eq!(ma.deuda, 160 * U);
    assert!(ma.moroso);
    // Y las deudas quedan en proporción: lo que falta por pagar a cada uno.
    let d = c.tanda.get_deuda(&id, ana);
    let por: StdVec<(Address, i128)> = d.faltantes.iter().map(|f| (f.acreedor, f.monto)).collect();
    let suma: i128 = por.iter().map(|(_, m)| *m).sum();
    assert_eq!(suma, 160 * U);
    assert_eq!(d.pagado, 140 * U); // 40 que pagó + 100 de su garantía
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(&c, &g);
}

/// Si pagan por ella casi toda la deuda, su garantía alcanza de sobra: a los afectados se les paga lo
/// que falta, lo que sobra vuelve a la persona y queda al día.
#[test]
fn si_la_garantia_alcanza_para_toda_la_deuda_queda_al_dia_y_recupera_lo_que_sobra() {
    let c = setup();
    let (id, g) = tanda_de(&c, 4, 0);
    let (ana, beto, carla, dani) = (&g[0], &g[1], &g[2], &g[3]);
    pagan(&c, id, &[ana, beto, carla, dani]);
    cerrar(&c, id);
    for _ in 0..3 {
        pagan(&c, id, &[beto, carla, dani]);
        cerrar(&c, id);
    }
    // Un familiar paga 250 de los 300 que debe: le quedan 50 (a Dani).
    let familiar = Address::generate(&c.env);
    StellarAssetClient::new(&c.env, &c.token.address)
        .mint(&familiar, &crate::test_tiempos::SALDO_GRANDE);
    assert_eq!(c.tanda.pagar_deuda(&id, ana, &familiar, &(250 * U)), 50 * U);
    let (ana0, dani0) = (c.saldo(ana), c.saldo(dani));
    c.tanda.finalizar(&id);
    // Los 50 que faltaban salen de la garantía de Ana (100); los otros 50 le vuelven.
    assert_eq!(c.saldo(dani), dani0 + 100 * U + 50 * U);
    assert_eq!(c.saldo(ana), ana0 + 50 * U);
    let ma = c.miembro(id, ana);
    assert!(!ma.moroso);
    assert_eq!(ma.deuda, 0);
    assert!(c.tanda.get_deuda(&id, ana).faltantes.is_empty());
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    let mut todos = g.clone();
    todos.push(familiar);
    assert_conservacion_de(&c, &todos);
}

/// Límites de mainnet por transacción (más estrictos que los de testnet: 400 M y 200 entradas).
const MAX_INSTRUCCIONES: i64 = 100_000_000;
const MAX_MEMORIA: i64 = 40 * 1024 * 1024;
const MAX_ESCRITURAS: u32 = 50;
const MAX_LECTURAS: u32 = 100;
/// Bytes de eventos por transacción. La simulación no lo revisa: si se pasa, la red rechaza la
/// transacción (le pasó a M4 con USDC y 11 morosos) y la tanda queda trabada.
const MAX_EVENTOS_BYTES: u32 = 16_384;

/// Lo más caro que se midió de cada operación: (nombre, instrucciones, lecturas, escrituras).
pub(crate) type Medidas = StdVec<(&'static str, i64, u32, u32)>;

/// Mide una operación sola (presupuesto ilimitado, ver `recorrer_peor_caso`), revisa los límites de
/// mainnet por transacción y anota lo más caro en `medidas`.
pub(crate) fn medir_en(
    c: &Ctx,
    medidas: &core::cell::RefCell<Medidas>,
    que: &'static str,
    f: &dyn Fn(),
) {
    c.env.cost_estimate().budget().reset_unlimited();
    f();
    let r = c.env.cost_estimate().resources();
    let lecturas = r.disk_read_entries + r.memory_read_entries;
    assert!(
        r.instructions < MAX_INSTRUCCIONES,
        "{que}: {} instrucciones",
        r.instructions
    );
    assert!(
        r.mem_bytes < MAX_MEMORIA,
        "{que}: {} bytes de memoria",
        r.mem_bytes
    );
    assert!(
        r.write_entries <= MAX_ESCRITURAS,
        "{que}: {} escrituras",
        r.write_entries
    );
    assert!(lecturas <= MAX_LECTURAS, "{que}: {lecturas} lecturas");
    assert!(
        r.contract_events_size_bytes <= MAX_EVENTOS_BYTES,
        "{que}: {} bytes de eventos",
        r.contract_events_size_bytes
    );
    let mut m = medidas.borrow_mut();
    match m.iter_mut().find(|x| x.0 == que) {
        Some(x) => {
            x.1 = x.1.max(r.instructions);
            x.2 = x.2.max(lecturas);
            x.3 = x.3.max(r.write_entries);
        }
        None => m.push((que, r.instructions, lecturas, r.write_entries)),
    }
}

/// Peor caso: 12 personas con garantía mínima y casi nadie paga. Cada cierre anota hasta 12
/// faltantes y Ana termina debiendo en 10 rondas distintas. Cada operación se mide sola y se compara
/// con los límites de mainnet por transacción.
///
/// (Se mide con presupuesto ilimitado porque el del entorno de pruebas se acumula durante toda la
/// prueba, incluido el registro de diagnósticos y firmas, y no representa una sola transacción.)
fn recorrer_peor_caso(c: &Ctx) -> Medidas {
    let medidas = core::cell::RefCell::new(Medidas::new());
    let medir = |que: &'static str, f: &dyn Fn()| medir_en(c, &medidas, que, f);
    let g = personas(c, 12);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &12,
        &PERIODO,
        &1_000,
        &0,
    );
    for p in &g {
        medir("unirse", &|| c.tanda.unirse(&id, p)); // el último activa la tanda
    }
    for ronda in 0..12u32 {
        // Solo paga quien cobra esta ronda (y en la primera, todos).
        for (i, p) in g.iter().enumerate() {
            if (ronda == 0 || i as u32 == ronda) && !c.miembro(id, p).moroso {
                medir("pagar_cuota", &|| c.tanda.pagar_cuota(&id, p));
            }
        }
        c.avanzar(PERIODO);
        medir("cerrar_ronda", &|| c.tanda.cerrar_ronda(&id));
    }
    let ana = &g[0];
    let deuda = c.miembro(id, ana).deuda;
    assert!(c.tanda.get_deuda(&id, ana).faltantes.len() >= 10);
    medir("pagar_deuda", &|| {
        c.tanda.pagar_deuda(&id, ana, ana, &deuda);
    });
    medir("finalizar", &|| c.tanda.finalizar(&id));
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(c, &g);
    medidas.into_inner()
}

pub(crate) fn imprimir(titulo: &str, m: &Medidas) {
    std::println!("{titulo}");
    for (que, instr, lecturas, escrituras) in m {
        std::println!(
            "  {que:<13} {:>6.1} M instrucciones · {lecturas:>3} lecturas · {escrituras:>3} escrituras",
            *instr as f64 / 1e6
        );
    }
}

#[test]
fn peor_caso_12_miembros_con_morosos() {
    let c = setup();
    let m = recorrer_peor_caso(&c);
    imprimir(
        "Peor caso, 12 miembros (contratos nativos, sin costo de VM):",
        &m,
    );
}

/// Lo mismo con los contratos compilados a WASM (incluye el costo real de la VM). Necesita
/// `stellar contract build` antes, por eso solo corre con `PEOR_CASO_WASM=1`:
/// `stellar contract build && PEOR_CASO_WASM=1 cargo test -p tanda peor_caso -- --nocapture`
#[test]
fn peor_caso_12_miembros_con_morosos_en_wasm() {
    if std::env::var("PEOR_CASO_WASM").is_err() {
        std::println!("(omitida: corre `stellar contract build` y luego con PEOR_CASO_WASM=1)");
        return;
    }
    let c = crate::test_tiempos::setup_wasm(0, 1);
    let m = recorrer_peor_caso(&c);
    imprimir(
        "Peor caso, 12 miembros (WASM, con el costo real de la VM):",
        &m,
    );
}

/// Peor caso de N2b: 12 personas, la deudora es la última en cobrar y deja de pagar en la ronda 2.
/// Debe a 9 personas que cobraron de menos (rondas 3 a 11) y a su propia ronda, cuya bolsa se reparte
/// al finalizar entre las otras 11. Pagarlo todo después de finalizar: 20 transferencias directas.
fn recorrer_peor_caso_tras_finalizar(c: &Ctx) -> Medidas {
    let medidas = core::cell::RefCell::new(Medidas::new());
    let medir = |que: &'static str, f: &dyn Fn()| medir_en(c, &medidas, que, f);
    let g = personas(c, 12);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &12,
        &PERIODO,
        &1_000,
        &0,
    );
    // La deudora (g[0]) entra al final: cobra la última ronda.
    for p in g[1..].iter().chain(g[..1].iter()) {
        c.tanda.unirse(&id, p);
    }
    let deudora = &g[0];
    for ronda in 0..12u32 {
        for p in &g {
            if ronda == 0 || p != deudora {
                c.tanda.pagar_cuota(&id, p);
            }
        }
        cerrar(c, id);
    }
    assert!(c.miembro(id, deudora).moroso);
    medir("finalizar", &|| c.tanda.finalizar(&id));
    let deuda = c.miembro(id, deudora).deuda;
    assert_eq!(c.tanda.get_deuda(&id, deudora).faltantes.len(), 11);
    // Primero una parte (cubre los faltantes viejos) y luego el resto (incluye el reparto entre 11).
    medir("pagar tras finalizar", &|| {
        c.tanda.pagar_deuda(&id, deudora, deudora, &(deuda / 3));
    });
    let falta = c.miembro(id, deudora).deuda;
    medir("pagar tras finalizar", &|| {
        assert_eq!(c.tanda.pagar_deuda(&id, deudora, deudora, &falta), 0);
    });
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(c, &g);
    medidas.into_inner()
}

#[test]
fn peor_caso_12_miembros_pagar_despues_de_finalizar() {
    let c = setup();
    let m = recorrer_peor_caso_tras_finalizar(&c);
    imprimir("Pagar después de finalizar, 12 miembros (nativo):", &m);
}

/// Con WASM: `stellar contract build && PEOR_CASO_WASM=1 cargo test -p tanda peor_caso -- --nocapture`
#[test]
fn peor_caso_12_miembros_pagar_despues_de_finalizar_en_wasm() {
    if std::env::var("PEOR_CASO_WASM").is_err() {
        std::println!("(omitida: corre `stellar contract build` y luego con PEOR_CASO_WASM=1)");
        return;
    }
    let c = crate::test_tiempos::setup_wasm(0, 1);
    let m = recorrer_peor_caso_tras_finalizar(&c);
    imprimir("Pagar después de finalizar, 12 miembros (WASM):", &m);
}
