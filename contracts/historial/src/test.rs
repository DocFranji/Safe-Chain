//! Pruebas del contrato de historial. Correr con: `cargo test -p historial`.
#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Events as _, Ledger, MockAuth, MockAuthInvoke,
    },
    vec, Env, Event as _, IntoVal,
};

const U: i128 = 10_000_000;
const CUOTA: i128 = 100 * U;

struct Ctx {
    env: Env,
    h: HistorialContractClient<'static>,
    contrato: Address,
    admin: Address,
    tanda: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = 1_000;
        l.sequence_number = 100;
    });
    let contrato = env.register(HistorialContract, ());
    let h = HistorialContractClient::new(&env, &contrato);
    let admin = Address::generate(&env);
    h.inicializar(&admin);
    let tanda = Address::generate(&env);
    h.autorizar_emisor(&tanda);
    Ctx {
        env,
        h,
        contrato,
        admin,
        tanda,
    }
}

impl Ctx {
    fn hm(&self, miembro: &Address, hecho: Hecho, monto: i128) -> HechoMiembro {
        HechoMiembro {
            miembro: miembro.clone(),
            hecho,
            monto,
        }
    }
    /// Registra un hecho suelto en la tanda `id` con cuota `CUOTA`.
    fn uno(&self, id: u32, miembro: &Address, hecho: Hecho) {
        self.h.registrar_lote(
            &self.tanda,
            &id,
            &CUOTA,
            &vec![&self.env, self.hm(miembro, hecho, CUOTA)],
        );
    }
}

#[test]
fn empieza_en_cero_sin_beneficios() {
    let c = setup();
    let nadie = Address::generate(&c.env);
    assert_eq!(c.h.historial(&nadie), Historial::default());
    assert_eq!(c.h.puntaje(&nadie), 0);
    assert_eq!(c.h.nivel(&nadie), Nivel::Nuevo);
    assert_eq!(c.h.beneficio_colateral_bps(&nadie), 0);
}

#[test]
fn puntos_de_cada_hecho() {
    let casos = [
        (Hecho::CuotaATiempo, 10u32, 0u32),
        (Hecho::CuotaTarde, 3, 0),
        (Hecho::CuotaCubierta, 0, 15),
        (Hecho::Moroso, 0, 100),
        (Hecho::DeudaSaldada, 60, 0),
        (Hecho::TandaCumplida, 50, 0),
        (Hecho::TandaConAtrasos, 25, 0),
        (Hecho::Cobro, 0, 0),
    ];
    for (hecho, pos, neg) in casos {
        let c = setup();
        let ana = Address::generate(&c.env);
        c.uno(1, &ana, hecho);
        let h = c.h.historial(&ana);
        assert_eq!(
            (h.puntos_positivos, h.puntos_negativos),
            (pos, neg),
            "{hecho:?}"
        );
        assert_eq!(h.primera_actividad, 1_000);
    }
}

#[test]
fn contadores_y_monto_pagado() {
    let c = setup();
    let ana = Address::generate(&c.env);
    let lote = vec![
        &c.env,
        c.hm(&ana, Hecho::CuotaATiempo, CUOTA),
        c.hm(&ana, Hecho::CuotaTarde, CUOTA),
        c.hm(&ana, Hecho::CuotaCubierta, CUOTA),
        c.hm(&ana, Hecho::Cobro, 3 * CUOTA),
        c.hm(&ana, Hecho::TandaConAtrasos, 0),
    ];
    c.h.registrar_lote(&c.tanda, &1, &CUOTA, &lote);
    let h = c.h.historial(&ana);
    assert_eq!(h.cuotas_a_tiempo, 1);
    assert_eq!(h.cuotas_tarde, 1);
    assert_eq!(h.cuotas_cubiertas, 1);
    assert_eq!(h.cobros, 1);
    assert_eq!(h.tandas_con_atrasos, 1);
    assert_eq!(h.monto_pagado, 2 * CUOTA); // solo lo que pagó de su bolsillo
    assert_eq!(c.h.puntaje(&c.tanda), 0);
    assert_eq!(c.h.puntaje(&ana), 10 + 3 + 25 - 15);
}

#[test]
fn niveles_y_descuentos() {
    assert_eq!(nivel_de_puntaje(0), Nivel::Nuevo);
    assert_eq!(nivel_de_puntaje(99), Nivel::Nuevo);
    assert_eq!(nivel_de_puntaje(100), Nivel::Bronce);
    assert_eq!(nivel_de_puntaje(299), Nivel::Bronce);
    assert_eq!(nivel_de_puntaje(300), Nivel::Plata);
    assert_eq!(nivel_de_puntaje(599), Nivel::Plata);
    assert_eq!(nivel_de_puntaje(600), Nivel::Oro);

    let h = |p| Historial {
        puntos_positivos: p,
        ..Default::default()
    };
    assert_eq!(beneficio_de(&h(99)), 0);
    assert_eq!(beneficio_de(&h(100)), 1_000);
    assert_eq!(beneficio_de(&h(300)), 2_500);
    assert_eq!(beneficio_de(&h(600)), 5_000);
}

/// Una tanda de 6 sin atrasos = 6×10 + 50 = 110 (Bronce), con eventos y ultima_actividad.
#[test]
fn una_tanda_cumplida_da_bronce() {
    let c = setup();
    let ana = Address::generate(&c.env);
    for r in 0..6u64 {
        c.env.ledger().with_mut(|l| l.timestamp = 1_000 + r * 60);
        c.uno(1, &ana, Hecho::CuotaATiempo);
    }
    c.uno(1, &ana, Hecho::TandaCumplida);
    assert_eq!(c.h.puntaje(&ana), 110);
    assert_eq!(c.h.nivel(&ana), Nivel::Bronce);
    assert_eq!(c.h.beneficio_colateral_bps(&ana), 1_000);
    let h = c.h.historial(&ana);
    assert_eq!((h.primera_actividad, h.ultima_actividad), (1_000, 1_300));
    assert_eq!(h.tandas_cumplidas, 1);
    assert_eq!(h.monto_pagado, 6 * CUOTA);
}

/// Lo negativo no se borra: saldar suma, pero la mora queda y no recupera los −100.
#[test]
fn la_mora_no_se_borra_al_saldar() {
    let c = setup();
    let ana = Address::generate(&c.env);
    for _ in 0..12 {
        c.uno(1, &ana, Hecho::CuotaATiempo);
    }
    c.uno(1, &ana, Hecho::TandaCumplida);
    assert_eq!(c.h.puntaje(&ana), 150); // 170, con el tope de 150 por tanda
    c.uno(2, &ana, Hecho::Moroso);
    assert_eq!(c.h.puntaje(&ana), 50);
    // Con mora sin saldar no hay beneficio, aunque el puntaje vuelva a subir.
    for _ in 0..8 {
        c.uno(3, &ana, Hecho::CuotaATiempo);
    }
    assert_eq!(c.h.puntaje(&ana), 130);
    assert_eq!(c.h.nivel(&ana), Nivel::Bronce);
    assert_eq!(c.h.beneficio_colateral_bps(&ana), 0);
    c.uno(2, &ana, Hecho::DeudaSaldada);
    let h = c.h.historial(&ana);
    assert_eq!(h.veces_moroso, 1);
    assert_eq!(h.deudas_saldadas, 1);
    assert_eq!(h.puntos_negativos, 100);
    assert_eq!(c.h.puntaje(&ana), 190);
    assert_eq!(c.h.beneficio_colateral_bps(&ana), 1_000);
}

#[test]
fn el_puntaje_no_baja_de_cero_pero_lo_negativo_se_guarda() {
    let c = setup();
    let ana = Address::generate(&c.env);
    c.uno(1, &ana, Hecho::Moroso);
    c.uno(1, &ana, Hecho::CuotaATiempo);
    assert_eq!(c.h.puntaje(&ana), 0);
    let h = c.h.historial(&ana);
    assert_eq!((h.puntos_positivos, h.puntos_negativos), (10, 100));
}

/// Anti-inflado (a): en tandas con cuota menor a la mínima, los positivos no cuentan y los negativos sí.
#[test]
fn cuota_minima_solo_frena_lo_positivo() {
    let c = setup();
    let ana = Address::generate(&c.env);
    let chica = CUOTA_MINIMA_DEFECTO - 1;
    let lote = vec![
        &c.env,
        c.hm(&ana, Hecho::CuotaATiempo, chica),
        c.hm(&ana, Hecho::TandaCumplida, 0),
        c.hm(&ana, Hecho::CuotaCubierta, chica),
    ];
    c.h.registrar_lote(&c.tanda, &1, &chica, &lote);
    let h = c.h.historial(&ana);
    assert_eq!(h.cuotas_a_tiempo, 1); // el hecho queda anotado...
    assert_eq!(h.puntos_positivos, 0); // ...pero no suma
    assert_eq!(h.puntos_negativos, 15);
    // Justo en la mínima sí cuenta.
    let lote = vec![
        &c.env,
        c.hm(&ana, Hecho::CuotaATiempo, CUOTA_MINIMA_DEFECTO),
    ];
    c.h.registrar_lote(&c.tanda, &2, &CUOTA_MINIMA_DEFECTO, &lote);
    assert_eq!(c.h.historial(&ana).puntos_positivos, 10);
}

/// Anti-inflado (b): máximo 150 positivos por tanda y persona. Otra tanda, u otro emisor, empiezan de cero.
#[test]
fn tope_por_tanda() {
    let c = setup();
    let (ana, beto) = (Address::generate(&c.env), Address::generate(&c.env));
    for _ in 0..20 {
        c.uno(1, &ana, Hecho::CuotaATiempo);
    }
    assert_eq!(c.h.puntaje(&ana), 150);
    assert_eq!(c.h.puntos_en_tanda(&c.tanda, &1, &ana), 150);
    // Los negativos siguen contando en la tanda topada.
    c.uno(1, &ana, Hecho::CuotaCubierta);
    assert_eq!(c.h.puntaje(&ana), 135);
    // Beto en la misma tanda tiene su propio tope.
    c.uno(1, &beto, Hecho::CuotaATiempo);
    assert_eq!(c.h.puntaje(&beto), 10);
    // Otra tanda del mismo emisor.
    c.uno(2, &ana, Hecho::TandaCumplida);
    assert_eq!(c.h.puntaje(&ana), 185);
    // El mismo id en otro contrato de tanda es otra tanda.
    let otra = Address::generate(&c.env);
    c.h.autorizar_emisor(&otra);
    let lote = vec![&c.env, c.hm(&ana, Hecho::CuotaATiempo, CUOTA)];
    c.h.registrar_lote(&otra, &1, &CUOTA, &lote);
    assert_eq!(c.h.puntaje(&ana), 195);
    // El tope recorta el último hecho a lo que falte.
    for _ in 0..14 {
        c.uno(3, &beto, Hecho::CuotaATiempo);
    }
    c.uno(3, &beto, Hecho::TandaCumplida); // 140 + 50 → solo suma 10
    assert_eq!(c.h.puntos_en_tanda(&c.tanda, &3, &beto), 150);
}

/// Las reglas nuevas solo valen para hechos futuros: lo ganado no se recalcula.
#[test]
fn reglas_nuevas_no_cambian_el_pasado() {
    let c = setup();
    let ana = Address::generate(&c.env);
    c.uno(1, &ana, Hecho::CuotaATiempo);
    let nuevas = Reglas {
        cuota_minima: 1_000 * U,
        tope_por_tanda: 20,
    };
    c.h.configurar_reglas(&nuevas);
    assert_eq!(c.h.reglas(), nuevas);
    assert_eq!(c.h.puntaje(&ana), 10);
    c.uno(1, &ana, Hecho::CuotaATiempo); // cuota de 100 < 1 000: ya no suma
    assert_eq!(c.h.puntaje(&ana), 10);
}

#[test]
fn reglas_invalidas() {
    let c = setup();
    let r = c.h.try_configurar_reglas(&Reglas {
        cuota_minima: -1,
        tope_por_tanda: 10,
    });
    assert_eq!(r, Err(Ok(Error::ParametroInvalido)));
    let r = c.h.try_configurar_reglas(&Reglas {
        cuota_minima: 0,
        tope_por_tanda: 0,
    });
    assert_eq!(r, Err(Ok(Error::ParametroInvalido)));
}

#[test]
fn no_se_inicializa_dos_veces() {
    let c = setup();
    assert_eq!(
        c.h.try_inicializar(&c.admin),
        Err(Ok(Error::YaInicializado))
    );
}

#[test]
fn sin_inicializar_no_registra() {
    let env = Env::default();
    env.mock_all_auths();
    let h = HistorialContractClient::new(&env, &env.register(HistorialContract, ()));
    let x = Address::generate(&env);
    assert_eq!(h.try_autorizar_emisor(&x), Err(Ok(Error::NoInicializado)));
    assert_eq!(
        h.try_registrar_lote(&x, &1, &CUOTA, &vec![&env]),
        Err(Ok(Error::NoAutorizado))
    );
    assert_eq!(h.try_reglas(), Err(Ok(Error::NoInicializado)));
}

#[test]
fn emisor_no_autorizado_no_escribe() {
    let c = setup();
    let falso = Address::generate(&c.env);
    let ana = Address::generate(&c.env);
    let lote = vec![&c.env, c.hm(&ana, Hecho::TandaCumplida, 0)];
    assert_eq!(
        c.h.try_registrar_lote(&falso, &1, &CUOTA, &lote),
        Err(Ok(Error::NoAutorizado))
    );
    assert_eq!(c.h.historial(&ana), Historial::default());
    assert!(!c.h.es_emisor(&falso));
    assert!(c.h.es_emisor(&c.tanda));
}

/// Revocar solo frena lo futuro: lo ya escrito se queda.
#[test]
fn revocar_no_borra() {
    let c = setup();
    let ana = Address::generate(&c.env);
    c.uno(1, &ana, Hecho::CuotaATiempo);
    c.h.revocar_emisor(&c.tanda);
    assert!(!c.h.es_emisor(&c.tanda));
    let lote = vec![&c.env, c.hm(&ana, Hecho::CuotaATiempo, CUOTA)];
    assert_eq!(
        c.h.try_registrar_lote(&c.tanda, &1, &CUOTA, &lote),
        Err(Ok(Error::NoAutorizado))
    );
    assert_eq!(c.h.puntaje(&ana), 10);
    // Se puede volver a autorizar.
    c.h.autorizar_emisor(&c.tanda);
    c.uno(1, &ana, Hecho::CuotaATiempo);
    assert_eq!(c.h.puntaje(&ana), 20);
}

#[test]
fn lote_invalido() {
    let c = setup();
    let ana = Address::generate(&c.env);
    let lote = vec![&c.env, c.hm(&ana, Hecho::CuotaATiempo, -1)];
    assert_eq!(
        c.h.try_registrar_lote(&c.tanda, &1, &CUOTA, &lote),
        Err(Ok(Error::ParametroInvalido))
    );
    let mut grande = vec![&c.env];
    for _ in 0..=MAX_LOTE {
        grande.push_back(c.hm(&ana, Hecho::Cobro, 0));
    }
    assert_eq!(
        c.h.try_registrar_lote(&c.tanda, &1, &CUOTA, &grande),
        Err(Ok(Error::ParametroInvalido))
    );
    assert_eq!(c.h.historial(&ana), Historial::default());
}

/// Firmas reales: solo el admin autoriza emisores y solo el emisor escribe por sí mismo.
#[test]
fn firmas_reales() {
    let env = Env::default();
    let contrato = env.register(HistorialContract, ());
    let h = HistorialContractClient::new(&env, &contrato);
    let admin = Address::generate(&env);
    let intruso = Address::generate(&env);
    let tanda = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contrato,
            fn_name: "inicializar",
            args: (&admin,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    h.inicializar(&admin);

    // El intruso firma, pero no es el admin.
    env.mock_auths(&[MockAuth {
        address: &intruso,
        invoke: &MockAuthInvoke {
            contract: &contrato,
            fn_name: "autorizar_emisor",
            args: (&tanda,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(h.try_autorizar_emisor(&tanda).is_err());

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contrato,
            fn_name: "autorizar_emisor",
            args: (&tanda,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    h.autorizar_emisor(&tanda);

    // Alguien que no es la tanda intenta escribir a nombre de la tanda.
    let ana = Address::generate(&env);
    let lote = vec![
        &env,
        HechoMiembro {
            miembro: ana.clone(),
            hecho: Hecho::TandaCumplida,
            monto: 0,
        },
    ];
    env.mock_auths(&[MockAuth {
        address: &intruso,
        invoke: &MockAuthInvoke {
            contract: &contrato,
            fn_name: "registrar_lote",
            args: (&tanda, 1u32, CUOTA, lote.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(h.try_registrar_lote(&tanda, &1, &CUOTA, &lote).is_err());
    assert_eq!(h.puntaje(&ana), 0);
}

#[test]
fn publica_un_evento_por_hecho() {
    let c = setup();
    let (ana, beto) = (Address::generate(&c.env), Address::generate(&c.env));
    let lote = vec![
        &c.env,
        c.hm(&ana, Hecho::CuotaATiempo, CUOTA),
        c.hm(&beto, Hecho::Moroso, 40 * U),
    ];
    c.h.registrar_lote(&c.tanda, &7, &CUOTA, &lote);
    let eventos = c.env.events().all();
    assert_eq!(
        eventos,
        std::vec![
            EvHecho {
                miembro: ana,
                emisor: c.tanda.clone(),
                tanda_id: 7,
                hecho: Hecho::CuotaATiempo,
                monto: CUOTA,
                puntos: 10,
            }
            .to_xdr(&c.env, &c.contrato),
            EvHecho {
                miembro: beto,
                emisor: c.tanda.clone(),
                tanda_id: 7,
                hecho: Hecho::Moroso,
                monto: 40 * U,
                puntos: -100,
            }
            .to_xdr(&c.env, &c.contrato),
        ]
    );
}

/// Los acumulados y la instancia se renuevan al máximo de la red en cada escritura.
#[test]
fn renueva_la_vida_de_los_datos() {
    let c = setup();
    let ana = Address::generate(&c.env);
    c.uno(1, &ana, Hecho::CuotaATiempo);
    let max = c.env.storage().max_ttl();
    c.env.as_contract(&c.contrato, || {
        let s = c.env.storage();
        assert_eq!(s.persistent().get_ttl(&Clave::Hist(ana.clone())), max);
        assert_eq!(
            s.persistent()
                .get_ttl(&Clave::PuntosTanda(c.tanda.clone(), 1)),
            max
        );
        assert_eq!(s.persistent().get_ttl(&Clave::Emisor(c.tanda.clone())), max);
        assert_eq!(s.instance().get_ttl(), max);
    });
}
