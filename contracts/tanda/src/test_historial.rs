//! Pruebas de la misión M2 (historial crediticio). Ya está declarado en `lib.rs`.
//! Usa los helpers compartidos (`setup`, `Ctx`, `assert_conservacion`, ...) de `test.rs`.
extern crate std;

use crate::test::*;
use crate::test_tiempos::{assert_conservacion_de, personas};
use crate::*;
use historial::{HistorialContract, HistorialContractClient, Nivel};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    vec, Address, Env, Event as _, Vec,
};
use std::vec::Vec as StdVec;

pub(crate) type Hist = HistorialContractClient<'static>;

/// Despliega el historial, autoriza a la tanda como emisor y lo conecta.
pub(crate) fn con_historial(c: &Ctx) -> Hist {
    let h = desplegar_historial(&c.env);
    h.autorizar_emisor(&c.tanda_addr);
    c.tanda.configurar_historial(&Some(h.address.clone()));
    h
}

pub(crate) fn desplegar_historial(env: &Env) -> Hist {
    let dir = env.register(HistorialContract, ());
    let h = HistorialContractClient::new(env, &dir);
    h.inicializar(&Address::generate(env));
    h
}

/// Le da puntos a `quien` como si viniera de otras tandas (emisor de prueba autorizado).
fn dar_puntos(c: &Ctx, h: &Hist, quien: &Address, cuotas: u32) {
    let otra = Address::generate(&c.env);
    h.autorizar_emisor(&otra);
    let mut id = 1000;
    let mut faltan = cuotas;
    while faltan > 0 {
        // 12 cuotas por tanda + cierre: dentro del tope de 150 por tanda (12×10 + 25 = 145).
        let n = faltan.min(12);
        let mut lote = Vec::new(&c.env);
        for _ in 0..n {
            lote.push_back(historial::HechoMiembro {
                miembro: quien.clone(),
                hecho: historial::Hecho::CuotaATiempo,
                monto: CUOTA,
            });
        }
        h.registrar_lote(&otra, &id, &CUOTA, &lote);
        faltan -= n;
        id += 1;
    }
}

/// Todos pagan a tiempo en cada ronda y se cierra; luego se finaliza.
fn jugar_todos_pagan(c: &Ctx, id: u32, gente: &[Address]) {
    let n = c.tanda.get_tanda(&id).n_miembros;
    for _ in 0..n {
        for p in gente {
            c.tanda.pagar_cuota(&id, p);
        }
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&id);
    }
    c.tanda.finalizar(&id);
}

// ===========================================================================
// Hechos que llegan al historial
// ===========================================================================

#[test]
fn tanda_completa_actualiza_a_todos() {
    let c = setup();
    let h = con_historial(&c);
    let id = c.crear_y_llenar(10_000);
    jugar_todos_pagan(&c, id, &[c.ana.clone(), c.beto.clone(), c.carla.clone()]);
    for p in [&c.ana, &c.beto, &c.carla] {
        let x = h.historial(p);
        assert_eq!(x.cuotas_a_tiempo, 3);
        assert_eq!(x.tandas_cumplidas, 1);
        assert_eq!(x.cobros, 1);
        assert_eq!(x.monto_pagado, 3 * CUOTA);
        assert_eq!(h.puntaje(p), 3 * 10 + 50);
        assert_eq!(h.puntos_en_tanda(&c.tanda_addr, &id, p), 80);
    }
    c.assert_conservacion();
}

#[test]
fn pago_tarde_y_tanda_con_atrasos() {
    let c = setup();
    let h = con_historial(&c);
    let id = c.crear_y_llenar(10_000);
    for r in 0..3 {
        c.tanda.pagar_cuota(&id, &c.ana);
        c.tanda.pagar_cuota(&id, &c.beto);
        if r == 1 {
            c.avanzar(PERIODO + 1);
            c.tanda.pagar_cuota(&id, &c.carla); // tarde
        } else {
            c.tanda.pagar_cuota(&id, &c.carla);
            c.avanzar(PERIODO);
        }
        c.tanda.cerrar_ronda(&id);
    }
    c.tanda.finalizar(&id);
    let x = h.historial(&c.carla);
    assert_eq!((x.cuotas_a_tiempo, x.cuotas_tarde), (2, 1));
    assert_eq!((x.tandas_cumplidas, x.tandas_con_atrasos), (0, 1));
    assert_eq!(h.puntaje(&c.carla), 2 * 10 + 3 + 25);
    c.assert_conservacion();
}

/// Ana deja de pagar: su garantía (una cuota) no alcanza para las 2 cuotas que le quedan, así que no la
/// cubre (v5) y queda morosa (−100). No recibe "tanda terminada". Los demás sí.
#[test]
fn el_moroso_queda_marcado() {
    let c = setup();
    let h = con_historial(&c);
    let id = c.crear_y_llenar(0); // garantía mínima: una cuota
    c.tanda.pagar_cuota(&id, &c.ana);
    c.tanda.pagar_cuota(&id, &c.beto);
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id); // Ana cobra
    for _ in 0..2 {
        c.tanda.pagar_cuota(&id, &c.beto);
        c.tanda.pagar_cuota(&id, &c.carla);
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&id);
    }
    c.tanda.finalizar(&id);

    let a = h.historial(&c.ana);
    assert_eq!(a.cuotas_a_tiempo, 1);
    assert_eq!(a.cuotas_cubiertas, 0);
    assert_eq!(a.veces_moroso, 1);
    assert_eq!(a.tandas_cumplidas + a.tandas_con_atrasos, 0);
    assert_eq!(a.puntos_negativos, 100);
    assert_eq!(h.puntaje(&c.ana), 0);
    assert_eq!(h.beneficio_colateral_bps(&c.ana), 0);
    for p in [&c.beto, &c.carla] {
        assert_eq!(h.historial(p).tandas_cumplidas, 1);
        assert_eq!(h.puntaje(p), 80);
    }
    c.assert_conservacion();
}

/// Con M1: quien salda su deuda suma +60, pero su mora queda registrada.
#[test]
fn saldar_la_deuda_suma_pero_no_borra() {
    let c = setup();
    let h = con_historial(&c);
    let id = c.crear_y_llenar(0);
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
    c.tanda.pagar_cuota(&id, &c.beto);
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id); // Ana: morosa (su garantía no alcanza para lo que le falta)
    c.tanda.pagar_cuota(&id, &c.beto);
    c.tanda.pagar_cuota(&id, &c.carla);
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id); // Ana: sigue morosa, debe una cuota más
    let deuda = c.miembro(id, &c.ana).deuda;
    assert_eq!(deuda, 2 * CUOTA);

    // Un abono parcial no cuenta; saldar todo sí.
    c.tanda.pagar_deuda(&id, &c.ana, &c.ana, &(deuda / 2));
    assert_eq!(h.historial(&c.ana).deudas_saldadas, 0);
    c.tanda
        .pagar_deuda(&id, &c.ana, &c.ana, &(deuda - deuda / 2));
    let a = h.historial(&c.ana);
    assert_eq!((a.veces_moroso, a.deudas_saldadas), (1, 1));
    assert_eq!(a.puntos_negativos, 100);
    assert_eq!(a.puntos_positivos, 10 + 60);
    c.tanda.finalizar(&id);
    c.assert_conservacion();
}

// ===========================================================================
// La tanda nunca se rompe por el historial
// ===========================================================================

/// Historial conectado pero la tanda NO está autorizada como emisor: el historial rechaza, la
/// tanda sigue igual y nada se anota.
#[test]
fn historial_que_rechaza_no_rompe_la_tanda() {
    let c = setup();
    let h = desplegar_historial(&c.env); // sin autorizar_emisor
    c.tanda.configurar_historial(&Some(h.address.clone()));
    let id = c.crear_y_llenar(0);
    jugar_todos_pagan(&c, id, &[c.ana.clone(), c.beto.clone(), c.carla.clone()]);
    assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Finalizada);
    assert_eq!(h.puntaje(&c.ana), 0);
    c.assert_conservacion();
}

/// La dirección del historial no es un contrato de historial (es la bóveda) o no existe:
/// todo funciona y no hay descuento.
#[test]
fn historial_roto_no_rompe_la_tanda() {
    for roto in [None, Some(())] {
        let c = setup();
        let dir = match roto {
            None => c.boveda.clone(),
            Some(_) => Address::generate(&c.env),
        };
        c.tanda.configurar_historial(&Some(dir));
        let id = c.crear(10_000);
        c.tanda.configurar_requisitos(&id, &0, &true);
        let normal = c.tanda.colateral_siguiente(&id);
        assert_eq!(c.tanda.colateral_para_miembro(&id, &c.ana), normal);
        c.tanda.unirse(&id, &c.ana);
        c.tanda.unirse(&id, &c.beto);
        c.tanda.unirse(&id, &c.carla);
        assert_eq!(c.miembro(id, &c.ana).colateral_inicial, normal);
        jugar_todos_pagan(&c, id, &[c.ana.clone(), c.beto.clone(), c.carla.clone()]);
        assert_eq!(c.tanda.get_tanda(&id).estado, Estado::Finalizada);
        c.assert_conservacion();
    }
}

/// Sin historial configurado, los ganchos no hacen nada (las pruebas de `test.rs` lo cubren
/// todo el camino); aquí: ni siquiera queda un búfer.
#[test]
fn sin_historial_no_anota_nada() {
    let c = setup();
    let id = c.crear_y_llenar(10_000);
    jugar_todos_pagan(&c, id, &[c.ana.clone(), c.beto.clone(), c.carla.clone()]);
    c.env.as_contract(&c.tanda_addr, || {
        assert!(!c
            .env
            .storage()
            .temporary()
            .has(&ClaveM2::HechosPendientes(id)));
    });
    assert_eq!(c.tanda.get_historial(), None);
    c.assert_conservacion();
}

/// El búfer es por tanda y se vacía al enviarlo: los hechos de una tanda nunca salen con el
/// número de otra.
#[test]
fn dos_tandas_no_se_mezclan() {
    let c = setup();
    let h = con_historial(&c);
    let gente = [c.ana.clone(), c.beto.clone(), c.carla.clone()];
    let uno = c.crear_y_llenar(10_000);
    let dos = c.crear_y_llenar(10_000);
    // Ronda 0 de ambas, intercalada: en la 1 nadie paga (Ana, que cobra esa ronda, queda morosa; a Beto
    // y a Carla los cubre su garantía); en la 2 todos pagan.
    for p in &gente {
        c.tanda.pagar_cuota(&dos, p);
    }
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&uno);
    c.tanda.cerrar_ronda(&dos);
    for p in &gente {
        // Cada uno: en la tanda 1, solo un hecho negativo; en la 2, una cuota a tiempo.
        assert_eq!(h.puntos_en_tanda(&c.tanda_addr, &uno, p), 0);
        assert_eq!(h.puntos_en_tanda(&c.tanda_addr, &dos, p), 10);
        let x = h.historial(p);
        if *p == c.ana {
            assert_eq!(
                (x.veces_moroso, x.cuotas_cubiertas, x.cuotas_a_tiempo),
                (1, 0, 1)
            );
        } else {
            assert_eq!(
                (x.veces_moroso, x.cuotas_cubiertas, x.cuotas_a_tiempo),
                (0, 1, 1)
            );
        }
    }
    // Los búferes quedaron vacíos.
    c.env.as_contract(&c.tanda_addr, || {
        let tmp = c.env.storage().temporary();
        assert!(!tmp.has(&ClaveM2::HechosPendientes(uno)));
        assert!(!tmp.has(&ClaveM2::HechosPendientes(dos)));
    });
    // Ana cobró solo en la 2: en la 1 era morosa y su bolsa se retuvo.
    assert_eq!(h.historial(&c.ana).cobros, 1);
}

// ===========================================================================
// Beneficios: puntaje mínimo y descuento de garantía
// ===========================================================================

#[test]
fn puntaje_minimo_entra_o_no_entra() {
    let c = setup();
    let h = con_historial(&c);
    let id = c.crear(10_000);
    c.tanda.configurar_requisitos(&id, &100, &false);
    assert_eq!(
        c.tanda.get_requisitos(&id),
        Requisitos {
            puntaje_minimo: 100,
            descuento: false
        }
    );
    // Una billetera nueva (cero) no entra: el cero nunca da beneficios.
    assert_eq!(
        c.tanda.try_unirse(&id, &c.ana),
        Err(Ok(Error::PuntajeInsuficiente))
    );
    dar_puntos(&c, &h, &c.ana, 9); // 90
    assert_eq!(
        c.tanda.try_unirse(&id, &c.ana),
        Err(Ok(Error::PuntajeInsuficiente))
    );
    dar_puntos(&c, &h, &c.ana, 1); // 100
    c.tanda.unirse(&id, &c.ana);
    assert_eq!(c.tanda.get_miembros(&id).len(), 1);
    c.assert_conservacion();
}

/// Si la tanda pidió puntaje y el historial no responde, no deja entrar (falla cerrado).
#[test]
fn puntaje_minimo_falla_cerrado() {
    let c = setup();
    con_historial(&c);
    let id = c.crear(10_000);
    c.tanda.configurar_requisitos(&id, &50, &false);
    c.tanda.configurar_historial(&Some(c.boveda.clone())); // ya no es un historial
    assert_eq!(
        c.tanda.try_unirse(&id, &c.ana),
        Err(Ok(Error::HistorialNoConfigurado))
    );
    c.tanda.configurar_historial(&None);
    assert_eq!(
        c.tanda.try_unirse(&id, &c.ana),
        Err(Ok(Error::HistorialNoConfigurado))
    );
}

#[test]
fn requisitos_solo_con_la_tanda_abierta_y_vacia() {
    let c = setup();
    // Sin historial no se pueden pedir requisitos (pero sí dejarlos en cero).
    let id = c.crear(10_000);
    assert_eq!(
        c.tanda.try_configurar_requisitos(&id, &100, &false),
        Err(Ok(Error::HistorialNoConfigurado))
    );
    assert_eq!(
        c.tanda.try_configurar_requisitos(&id, &0, &true),
        Err(Ok(Error::HistorialNoConfigurado))
    );
    c.tanda.configurar_requisitos(&id, &0, &false);

    con_historial(&c);
    c.tanda.unirse(&id, &c.ana);
    assert_eq!(
        c.tanda.try_configurar_requisitos(&id, &0, &true),
        Err(Ok(Error::RequisitosBloqueados))
    );
    let llena = c.crear_y_llenar(10_000);
    assert_eq!(
        c.tanda.try_configurar_requisitos(&llena, &0, &true),
        Err(Ok(Error::RequisitosBloqueados))
    );
    assert_eq!(
        c.tanda.try_configurar_requisitos(&99, &0, &true),
        Err(Ok(Error::NoEncontrada))
    );
    assert_eq!(
        c.tanda.try_get_requisitos(&99),
        Err(Ok(Error::NoEncontrada))
    );
    assert_eq!(c.tanda.get_requisitos(&llena), Requisitos::default());
}

/// Ana (Plata) deja 25 % menos de garantía; Beto (Oro) en el último turno deja una cuota (no menos);
/// Carla (Nuevo) deja la normal. La tanda completa cuadra.
#[test]
fn descuento_de_garantia_por_nivel() {
    let c = setup();
    let h = con_historial(&c);
    dar_puntos(&c, &h, &c.ana, 30); // 300: Plata
    dar_puntos(&c, &h, &c.beto, 60); // 600: Oro
    assert_eq!(h.nivel(&c.ana), Nivel::Plata);
    assert_eq!(h.nivel(&c.beto), Nivel::Oro);

    let id = c.crear(10_000);
    c.tanda.configurar_requisitos(&id, &0, &true);
    // Turno 0: normal 2 cuotas → Plata −25 % = 1,5 cuotas.
    assert_eq!(c.tanda.colateral_siguiente(&id), 2 * CUOTA);
    assert_eq!(c.tanda.colateral_para_miembro(&id, &c.ana), 3 * CUOTA / 2);
    assert_eq!(c.tanda.colateral_para_miembro(&id, &c.carla), 2 * CUOTA);
    c.tanda.unirse(&id, &c.ana);
    c.tanda.unirse(&id, &c.carla); // turno 1: normal (1 cuota)
                                   // Turno 2: normal 1 cuota; Oro −50 % daría media cuota, pero nunca menos de una.
    assert_eq!(c.tanda.colateral_para_miembro(&id, &c.beto), CUOTA);
    c.tanda.unirse(&id, &c.beto);
    assert_eq!(c.miembro(id, &c.ana).colateral_inicial, 3 * CUOTA / 2);
    assert_eq!(c.miembro(id, &c.carla).colateral_inicial, CUOTA);
    assert_eq!(c.miembro(id, &c.beto).colateral_inicial, CUOTA);
    c.assert_conservacion();

    jugar_todos_pagan(&c, id, &[c.ana.clone(), c.carla.clone(), c.beto.clone()]);
    c.assert_conservacion();
    assert_eq!(c.saldo(&c.tanda_addr), 0);
}

/// Sin `descuento` en la tanda, el nivel no cambia la garantía.
#[test]
fn sin_descuento_el_nivel_no_cambia_nada() {
    let c = setup();
    let h = con_historial(&c);
    dar_puntos(&c, &h, &c.ana, 60);
    let id = c.crear(10_000);
    assert_eq!(c.tanda.colateral_para_miembro(&id, &c.ana), 2 * CUOTA);
    c.tanda.unirse(&id, &c.ana);
    assert_eq!(c.miembro(id, &c.ana).colateral_inicial, 2 * CUOTA);
}

/// Con mora sin saldar no hay descuento, aunque el puntaje dé nivel.
#[test]
fn moroso_sin_saldar_no_tiene_descuento() {
    let c = setup();
    let h = con_historial(&c);
    dar_puntos(&c, &h, &c.ana, 40); // 400
    let otra = Address::generate(&c.env);
    h.autorizar_emisor(&otra);
    h.registrar_lote(
        &otra,
        &1,
        &CUOTA,
        &vec![
            &c.env,
            historial::HechoMiembro {
                miembro: c.ana.clone(),
                hecho: historial::Hecho::Moroso,
                monto: CUOTA,
            },
        ],
    );
    assert_eq!(h.puntaje(&c.ana), 300);
    let id = c.crear(10_000);
    c.tanda.configurar_requisitos(&id, &0, &true);
    assert_eq!(c.tanda.colateral_para_miembro(&id, &c.ana), 2 * CUOTA);
}

#[test]
fn colateral_para_miembro_con_tanda_llena() {
    let c = setup();
    con_historial(&c);
    let id = c.crear_y_llenar(10_000);
    assert_eq!(
        c.tanda.try_colateral_para_miembro(&id, &c.ana),
        Err(Ok(Error::TandaLlena))
    );
}

// ===========================================================================
// Configuración y eventos
// ===========================================================================

#[test]
fn configurar_historial_y_eventos() {
    let c = setup();
    let h = desplegar_historial(&c.env);
    c.tanda.configurar_historial(&Some(h.address.clone()));
    assert_eq!(
        c.env.events().all().events().last().unwrap().clone(),
        EvHistorialConfigurado {
            historial: Some(h.address.clone())
        }
        .to_xdr(&c.env, &c.tanda_addr)
    );
    assert_eq!(c.tanda.get_historial(), Some(h.address.clone()));
    let id = c.crear(10_000);
    c.tanda.configurar_requisitos(&id, &120, &true);
    assert_eq!(
        c.env.events().all().events().last().unwrap().clone(),
        EvRequisitos {
            id,
            puntaje_minimo: 120,
            descuento: true
        }
        .to_xdr(&c.env, &c.tanda_addr)
    );
    c.tanda.configurar_historial(&None);
    assert_eq!(c.tanda.get_historial(), None);
}

/// Firmas reales: solo el admin conecta el historial y solo el creador pone requisitos.
#[test]
fn firmas_reales() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    use soroban_sdk::IntoVal;
    let c = setup();
    let id = c.crear(10_000);
    let h = desplegar_historial(&c.env);
    let intruso = Address::generate(&c.env);
    c.env.mock_auths(&[MockAuth {
        address: &intruso,
        invoke: &MockAuthInvoke {
            contract: &c.tanda_addr,
            fn_name: "configurar_historial",
            args: (Some(h.address.clone()),).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);
    assert!(c
        .tanda
        .try_configurar_historial(&Some(h.address.clone()))
        .is_err());
    c.env.mock_auths(&[MockAuth {
        address: &intruso,
        invoke: &MockAuthInvoke {
            contract: &c.tanda_addr,
            fn_name: "configurar_requisitos",
            args: (id, 0u32, false).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);
    assert!(c.tanda.try_configurar_requisitos(&id, &0, &false).is_err());
    c.env.mock_auths(&[MockAuth {
        address: &c.creador,
        invoke: &MockAuthInvoke {
            contract: &c.tanda_addr,
            fn_name: "configurar_requisitos",
            args: (id, 0u32, false).into_val(&c.env),
            sub_invokes: &[],
        },
    }]);
    c.tanda.configurar_requisitos(&id, &0, &false);
}

// ===========================================================================
// Peor caso: 12 miembros con el historial conectado
// ===========================================================================

/// Límites de mainnet por transacción (testnet permite más: 400 M y 200 entradas).
const MAX_INSTRUCCIONES: i64 = 100_000_000;
const MAX_ESCRITURAS: u32 = 50;
const MAX_LECTURAS: u32 = 100;
/// Bytes de eventos por transacción: la simulación no lo revisa y la red rechaza lo que se pase.
/// El historial es el que más emite en el peor cierre (un `hist_hecho` por hecho).
const MAX_EVENTOS_BYTES: u32 = 16_384;

type Medidas = StdVec<(&'static str, i64, u32, u32)>;

/// 12 personas con garantía mínima, descuento activado y casi nadie paga: cada cierre registra
/// hasta 12 hechos en un solo lote (cubiertas, morosos y el cobro), y `finalizar` 12 más.
fn recorrer_peor_caso(c: &Ctx, h: &Hist) -> Medidas {
    let medidas = core::cell::RefCell::new(Medidas::new());
    let medir = |que: &'static str, f: &dyn Fn()| {
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
    };
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
    c.tanda.configurar_requisitos(&id, &0, &true);
    for p in &g {
        medir("unirse", &|| c.tanda.unirse(&id, p));
    }
    for ronda in 0..12u32 {
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
    medir("pagar_deuda", &|| {
        c.tanda.pagar_deuda(&id, ana, ana, &deuda);
    });
    medir("finalizar", &|| c.tanda.finalizar(&id));
    // Todo llegó al historial.
    assert_eq!(h.historial(ana).deudas_saldadas, 1);
    for p in &g {
        let x = h.historial(p);
        assert!(x.cuotas_a_tiempo >= 1 && x.veces_moroso + x.cuotas_cubiertas >= 1);
    }
    assert_eq!(c.saldo(&c.tanda_addr), 0);
    assert_conservacion_de(c, &g);
    medidas.into_inner()
}

fn imprimir(titulo: &str, m: &Medidas) {
    std::println!("{titulo}");
    for (que, instr, lecturas, escrituras) in m {
        std::println!(
            "  {que:<13} {:>6.1} M instrucciones · {lecturas:>3} lecturas · {escrituras:>3} escrituras",
            *instr as f64 / 1e6
        );
    }
}

#[test]
fn peor_caso_12_miembros_con_historial() {
    let c = setup();
    let h = con_historial(&c);
    let m = recorrer_peor_caso(&c, &h);
    imprimir("Peor caso con historial, 12 miembros (nativo):", &m);
}

/// Con WASM real (incluye la VM): `stellar contract build && PEOR_CASO_WASM=1 cargo test -p tanda
/// peor_caso_12_miembros_con_historial_en_wasm -- --nocapture`.
#[test]
fn peor_caso_12_miembros_con_historial_en_wasm() {
    if std::env::var("PEOR_CASO_WASM").is_err() {
        std::println!("(omitida: corre `stellar contract build` y luego con PEOR_CASO_WASM=1)");
        return;
    }
    let c = crate::test_tiempos::setup_wasm(0, 1);
    let m = recorrer_peor_caso_wasm(&c);
    imprimir("Peor caso con historial, 12 miembros (WASM):", &m);
}

/// Igual que `recorrer_peor_caso`, pero el historial también es WASM.
fn recorrer_peor_caso_wasm(c: &Ctx) -> Medidas {
    let ruta = std::format!(
        "{}/../../target/wasm32v1-none/release/historial.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    let wasm = std::fs::read(&ruta).unwrap_or_else(|_| panic!("falta {ruta}"));
    let dir = c.env.register(wasm.as_slice(), ());
    let h = HistorialContractClient::new(&c.env, &dir);
    h.inicializar(&Address::generate(&c.env));
    h.autorizar_emisor(&c.tanda_addr);
    c.tanda.configurar_historial(&Some(dir));
    recorrer_peor_caso(c, &h)
}

/// `finalizar` con 12 personas que cumplieron: cada una suma "tanda cumplida" (12 historiales y
/// 12 topes por tanda en un lote). Es el `finalizar` que más escribe en el historial.
#[test]
fn finalizar_12_cumplidos_con_historial() {
    let c = setup();
    let h = con_historial(&c);
    let g = personas(&c, 12);
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
    for _ in 0..12 {
        for p in &g {
            c.tanda.pagar_cuota(&id, p);
        }
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&id);
    }
    c.env.cost_estimate().budget().reset_unlimited();
    c.tanda.finalizar(&id);
    let r = c.env.cost_estimate().resources();
    let lecturas = r.disk_read_entries + r.memory_read_entries;
    std::println!(
        "finalizar, 12 cumplidos con historial: {:.1} M instrucciones · {lecturas} lecturas · {} escrituras",
        r.instructions as f64 / 1e6,
        r.write_entries
    );
    assert!(r.instructions < MAX_INSTRUCCIONES);
    assert!(r.write_entries <= MAX_ESCRITURAS);
    assert!(lecturas <= MAX_LECTURAS);
    assert!(r.contract_events_size_bytes <= MAX_EVENTOS_BYTES);
    for p in &g {
        // 12 cuotas (120) + 50 = 170, con el tope de 150 por tanda.
        assert_eq!(h.puntaje(p), 150);
        assert_eq!(h.nivel(p), Nivel::Bronce);
    }
    assert_conservacion_de(&c, &g);
}

/// Hallazgo 3 de `docs/seguridad.md`: los requisitos de una tanda larga (3 rondas de 90 días = 270,
/// más que la vida máxima de un dato en testnet, ~180 días) no deben archivarse mientras la tanda sigue.
/// Se renuevan con la tanda en cada cierre de ronda.
#[test]
fn los_requisitos_viven_lo_que_dure_la_tanda() {
    use crate::test_tiempos::{como_testnet, pasar, SEG_POR_LEDGER};
    use soroban_sdk::testutils::storage::Persistent as _;
    const NOVENTA_DIAS: u64 = 90 * 86_400;
    let c = setup();
    como_testnet(&c);
    con_historial(&c);
    let gente = personas(&c, 3);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &NOVENTA_DIAS,
        &1_000,
        &10_000,
    );
    c.tanda.configurar_requisitos(&id, &0, &true);
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    let vida = || {
        c.env.as_contract(&c.tanda_addr, || {
            c.env
                .storage()
                .persistent()
                .get_ttl(&ClaveM2::Requisitos(id))
        })
    };
    let ronda_en_ledgers = (NOVENTA_DIAS / SEG_POR_LEDGER) as u32;
    for ronda in 0..3 {
        assert!(
            vida() > ronda_en_ledgers,
            "ronda {ronda}: a los requisitos les quedan {} ledgers y la ronda dura {ronda_en_ledgers}",
            vida()
        );
        for p in &gente {
            c.tanda.pagar_cuota(&id, p);
        }
        pasar(&c, NOVENTA_DIAS);
        c.tanda.cerrar_ronda(&id);
    }
    assert_eq!(
        c.tanda.get_requisitos(&id),
        Requisitos {
            puntaje_minimo: 0,
            descuento: true
        }
    );
    c.tanda.finalizar(&id);
    assert_conservacion_de(&c, &gente);
}

// ===========================================================================
// v4 · N2a: quien debe no se une a otra tanda hasta pagar
// ===========================================================================

/// Deja a Ana en mora en una tanda nueva de 3 (garantía mínima): paga la ronda 0, cobra y deja de
/// pagar. Devuelve el id de esa tanda.
fn ana_en_mora(c: &Ctx) -> u32 {
    let id = c.crear_y_llenar(0);
    for p in [&c.ana, &c.beto, &c.carla] {
        c.tanda.pagar_cuota(&id, p);
    }
    c.avanzar(PERIODO);
    c.tanda.cerrar_ronda(&id);
    for _ in 0..2 {
        c.tanda.pagar_cuota(&id, &c.beto);
        c.tanda.pagar_cuota(&id, &c.carla);
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&id);
    }
    assert!(c.miembro(id, &c.ana).moroso);
    id
}

fn tanda_eleccion(c: &Ctx) -> u32 {
    let o = OpcionesTanda {
        modo: ModoTurnos::Eleccion,
        permitir_intercambio: false,
        prima_max_bps: 0,
        descuento_max_bps: 0,
        primeros_con_historial: 0,
        puntaje_primeros: 0,
        ofertas_selladas: false,
    };
    c.tanda.crear_tanda_avanzada(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &3,
        &PERIODO,
        &1_000,
        &10_000,
        &o,
    )
}

#[test]
fn quien_debe_no_se_une_a_otra_tanda_hasta_pagar() {
    let c = setup();
    let h = con_historial(&c);
    let vieja = ana_en_mora(&c);
    assert!(h.tiene_mora(&c.ana));

    // Las dos formas de unirse rechazan a Ana; a Beto (al día) no.
    let llegada = c.crear(10_000);
    assert_eq!(
        c.tanda.try_unirse(&llegada, &c.ana),
        Err(Ok(Error::DeudaPendiente))
    );
    let eleccion = tanda_eleccion(&c);
    assert_eq!(
        c.tanda.try_unirse_en_turno(&eleccion, &c.ana, &0),
        Err(Ok(Error::DeudaPendiente))
    );
    c.tanda.unirse(&llegada, &c.beto);
    c.tanda.unirse_en_turno(&eleccion, &c.beto, &1);

    // Un abono parcial no alcanza; saldar todo, sí.
    let deuda = c.miembro(vieja, &c.ana).deuda;
    c.tanda.pagar_deuda(&vieja, &c.ana, &c.ana, &(deuda / 2));
    assert_eq!(
        c.tanda.try_unirse(&llegada, &c.ana),
        Err(Ok(Error::DeudaPendiente))
    );
    c.tanda
        .pagar_deuda(&vieja, &c.ana, &c.ana, &(deuda - deuda / 2));
    assert!(!h.tiene_mora(&c.ana));
    c.tanda.unirse(&llegada, &c.ana);
    c.tanda.unirse_en_turno(&eleccion, &c.ana, &0);
    c.assert_conservacion();
}

/// Cae en mora, salda, vuelve a caer y vuelve a saldar: queda desbloqueado (el contador no se
/// descuadra: un `Moroso` por caída y un `DeudaSaldada` por cada vez que llega a cero).
#[test]
fn dos_caidas_en_mora_y_dos_pagos_desbloquean() {
    let c = setup();
    let h = con_historial(&c);
    for vuelta in 1..=2u32 {
        let id = ana_en_mora(&c);
        let x = h.historial(&c.ana);
        assert_eq!((x.veces_moroso, x.deudas_saldadas), (vuelta, vuelta - 1));
        let otra = c.crear(10_000);
        assert_eq!(
            c.tanda.try_unirse(&otra, &c.ana),
            Err(Ok(Error::DeudaPendiente))
        );
        let deuda = c.miembro(id, &c.ana).deuda;
        c.tanda.pagar_deuda(&id, &c.ana, &c.ana, &deuda);
        let x = h.historial(&c.ana);
        assert_eq!((x.veces_moroso, x.deudas_saldadas), (vuelta, vuelta));
        c.tanda.unirse(&otra, &c.ana);
        c.tanda.finalizar(&id);
    }
    c.assert_conservacion();
}

/// Seguir moroso varias rondas no suma más de una caída.
#[test]
fn seguir_moroso_varias_rondas_es_una_sola_caida() {
    let c = setup();
    let h = con_historial(&c);
    let gente = personas(&c, 5);
    let id = c.tanda.crear_tanda(
        &c.creador,
        &c.token.address,
        &CUOTA,
        &5,
        &PERIODO,
        &1_000,
        &0,
    );
    for p in &gente {
        c.tanda.unirse(&id, p);
    }
    for ronda in 0..5 {
        for p in &gente {
            // gente[0] solo paga la primera ronda: después queda en mora y sigue sin pagar.
            if ronda == 0 || p != &gente[0] {
                c.tanda.pagar_cuota(&id, p);
            }
        }
        c.avanzar(PERIODO);
        c.tanda.cerrar_ronda(&id);
    }
    assert_eq!(h.historial(&gente[0]).veces_moroso, 1);
    assert!(c.miembro(id, &gente[0]).deuda > CUOTA); // debe varias cuotas, una sola caída
}

/// Si el historial no responde (o rechazó los hechos), nadie queda bloqueado por eso.
#[test]
fn sin_historial_que_responda_no_se_bloquea() {
    // Historial que rechaza los hechos: la mora nunca quedó anotada.
    let c = setup();
    let h = desplegar_historial(&c.env);
    c.tanda.configurar_historial(&Some(h.address.clone()));
    ana_en_mora(&c);
    let otra = c.crear(10_000);
    c.tanda.unirse(&otra, &c.ana);

    // La mora sí quedó anotada, pero después el historial deja de responder.
    let c = setup();
    con_historial(&c);
    ana_en_mora(&c);
    c.tanda.configurar_historial(&Some(c.boveda.clone()));
    let otra = c.crear(10_000);
    c.tanda.unirse(&otra, &c.ana);

    // Sin historial configurado.
    let c = setup();
    con_historial(&c);
    ana_en_mora(&c);
    c.tanda.configurar_historial(&None);
    let otra = c.crear(10_000);
    c.tanda.unirse(&otra, &c.ana);
}
