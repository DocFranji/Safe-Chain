//! # Contrato de Tanda On-Chain (MVP para el hackathon)
//!
//! Un solo contrato maneja muchas tandas, cada una identificada por un número (`id`).
//!
//! Idea central:
//! 1. Al unirse, cada miembro deposita un **colateral escalonado**: quien cobra antes
//!    pone más garantía (porque después de cobrar todavía debe más cuotas).
//! 2. El colateral se guarda en una **bóveda** que genera rendimiento.
//! 3. Cada ronda todos pagan una cuota y el miembro de turno recibe la bolsa.
//! 4. Si alguien no paga, **su colateral cubre su cuota**: el beneficiario cobra completo.
//! 5. Al final, cada uno recupera su colateral sobrante + rendimiento, y las multas se
//!    reparten entre quienes nunca se atrasaron.
//!
//! Convenciones:
//! - Montos en `i128`, en la unidad mínima del token (7 decimales: 100 TUSD = 1_000_000_000).
//! - Porcentajes en puntos básicos (bps): 10_000 = 100%.
#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, Env, Vec,
};

#[cfg(test)]
mod test;

// ---------------------------------------------------------------------------
// Constantes: límites de los parámetros (sección "Parámetros y estado" de la spec)
// ---------------------------------------------------------------------------

const BPS: i128 = 10_000;
const MIN_MIEMBROS: u32 = 3;
/// Máximo 12 para que los bucles de `cerrar_ronda` y `finalizar` no excedan el
/// presupuesto de cómputo que Stellar permite por transacción.
const MAX_MIEMBROS: u32 = 12;
const MIN_PERIODO_SEG: u64 = 60;
const MAX_PENALIDAD_BPS: u32 = 5_000;
const MAX_COBERTURA_BPS: u32 = 10_000;

// Vida de los datos guardados (en ledgers de ~5 s). Ver `extender_*` abajo.
const TTL_UMBRAL: u32 = 17_280; // ~1 día
const TTL_EXTENDER: u32 = 518_400; // ~30 días

// ---------------------------------------------------------------------------
// Interfaz de la bóveda. La tanda solo conoce estas 4 funciones, así que la bóveda
// simulada y un futuro adaptador a Blend son intercambiables.
// ---------------------------------------------------------------------------

#[contractclient(name = "BovedaClient")]
pub trait Boveda {
    fn depositar(env: Env, desde: Address, monto: i128) -> i128;
    fn retirar(env: Env, hacia: Address, shares: i128) -> i128;
    fn retirar_monto(env: Env, hacia: Address, monto: i128) -> i128;
    fn valor(env: Env, shares: i128) -> i128;
}

// ---------------------------------------------------------------------------
// Tipos guardados en la blockchain
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Estado {
    Abierta,
    Activa,
    PorLiquidar,
    Finalizada,
    Cancelada,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tanda {
    pub creador: Address,
    pub token: Address,
    pub cuota: i128,
    pub n_miembros: u32,
    pub periodo_seg: u64,
    pub penalidad_bps: u32,
    pub cobertura_bps: u32,
    pub estado: Estado,
    /// Ronda en curso: 0..n_miembros. En la ronda `r` cobra el miembro con `posicion == r`.
    pub ronda_actual: u32,
    /// Momento (timestamp) en que abrió la ronda actual. Vence en `inicio_ronda + periodo_seg`.
    pub inicio_ronda: u64,
    /// Participaciones de ESTA tanda en la bóveda (varias tandas comparten bóveda).
    pub shares_boveda: i128,
    /// Multas cobradas (se llena en `finalizar`).
    pub fondo_premios: i128,
    /// Bolsas que no se pagaron porque el beneficiario era moroso.
    pub retenido: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Miembro {
    /// Turno: 0 cobra en la ronda 0.
    pub posicion: u32,
    pub colateral_inicial: i128,
    /// Colateral que le queda (baja si cubre impagos o multas).
    pub colateral: i128,
    pub atrasos: u32,
    pub multas_pendientes: i128,
    /// Cuotas que su colateral no alcanzó a cubrir.
    pub deuda: i128,
    pub moroso: bool,
    /// Ya recibió su turno.
    pub cobro: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    // "instance": datos del contrato completo (viven mientras viva el contrato)
    Admin,
    Boveda,
    Verificador,
    Contador,
    // "persistent": un registro por tanda / miembro
    Tanda(u32),
    Miembros(u32),
    Miembro(u32, Address),
    Pagado(u32, u32, Address),
    Verificado(Address),
}

// ---------------------------------------------------------------------------
// Errores: un código fijo por cada problema, para que la interfaz muestre un
// mensaje claro en español en vez de "transaction failed".
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    YaInicializado = 1,
    NoEncontrada = 2,
    EstadoInvalido = 3,
    ParametroInvalido = 4,
    YaEsMiembro = 5,
    TandaLlena = 6,
    NoEsMiembro = 7,
    YaPago = 8,
    RondaNoVencida = 9,
    MiembroMoroso = 10,
    NoVerificado = 11,
    NoAutorizado = 12,
    NoInicializado = 13,
}

// ---------------------------------------------------------------------------
// Eventos: avisos que el contrato publica y la interfaz escucha para actualizarse.
// ---------------------------------------------------------------------------

#[contractevent(topics = ["creada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvCreada {
    #[topic]
    pub id: u32,
    pub creador: Address,
    pub cuota: i128,
    pub n_miembros: u32,
}

#[contractevent(topics = ["unido"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvUnido {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub posicion: u32,
    pub colateral: i128,
}

#[contractevent(topics = ["iniciada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvIniciada {
    #[topic]
    pub id: u32,
    pub inicio_ronda: u64,
}

#[contractevent(topics = ["pago"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvPago {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub ronda: u32,
    pub tarde: bool,
}

/// El momento clave de la demo: "el colateral de Ana cubrió su cuota".
#[contractevent(topics = ["cubierto"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvCubierto {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub ronda: u32,
    pub monto: i128,
}

#[contractevent(topics = ["moroso"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvMoroso {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub deuda: i128,
}

#[contractevent(topics = ["ronda"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvRonda {
    #[topic]
    pub id: u32,
    pub ronda: u32,
    pub beneficiario: Address,
    pub monto_pagado: i128,
}

#[contractevent(topics = ["liquidado"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvLiquidado {
    #[topic]
    pub id: u32,
    pub miembro: Address,
    pub monto: i128,
}

#[contractevent(topics = ["finalizada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvFinalizada {
    #[topic]
    pub id: u32,
    pub rendimiento: i128,
    pub fondo_premios: i128,
    pub retenido: i128,
    /// Lo que no se pudo repartir porque no había a quién (caso extremo).
    pub sin_repartir: i128,
}

#[contractevent(topics = ["cancelada"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvCancelada {
    #[topic]
    pub id: u32,
}

// ---------------------------------------------------------------------------
// El contrato
// ---------------------------------------------------------------------------

#[contract]
pub struct TandaContract;

#[contractimpl]
impl TandaContract {
    /// Configura el contrato una sola vez: quién es el admin, qué bóveda usar y,
    /// opcionalmente, quién puede marcar direcciones como verificadas (gancho SUGEF).
    pub fn inicializar(
        env: Env,
        admin: Address,
        boveda: Address,
        verificador: Option<Address>,
    ) -> Result<(), Error> {
        let s = env.storage().instance();
        if s.has(&DataKey::Admin) {
            return Err(Error::YaInicializado);
        }
        admin.require_auth();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Boveda, &boveda);
        if let Some(v) = verificador {
            s.set(&DataKey::Verificador, &v);
        }
        s.set(&DataKey::Contador, &0u32);
        extender_instancia(&env);
        Ok(())
    }

    /// (P2) El verificador marca una dirección como verificada (KYC hecho fuera de la cadena).
    pub fn marcar_verificado(env: Env, miembro: Address, verificado: bool) -> Result<(), Error> {
        let v: Address = env
            .storage()
            .instance()
            .get(&DataKey::Verificador)
            .ok_or(Error::NoAutorizado)?;
        v.require_auth();
        let clave = DataKey::Verificado(miembro);
        env.storage().persistent().set(&clave, &verificado);
        extender(&env, &clave);
        Ok(())
    }

    /// Crea una tanda nueva en estado `Abierta` y devuelve su id.
    /// El creador NO queda como miembro: si quiere participar, llama `unirse`.
    pub fn crear_tanda(
        env: Env,
        creador: Address,
        token: Address,
        cuota: i128,
        n_miembros: u32,
        periodo_seg: u64,
        penalidad_bps: u32,
        cobertura_bps: u32,
    ) -> Result<u32, Error> {
        creador.require_auth();
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NoInicializado);
        }
        if cuota <= 0
            || !(MIN_MIEMBROS..=MAX_MIEMBROS).contains(&n_miembros)
            || periodo_seg < MIN_PERIODO_SEG
            || penalidad_bps > MAX_PENALIDAD_BPS
            || cobertura_bps > MAX_COBERTURA_BPS
        {
            return Err(Error::ParametroInvalido);
        }

        let s = env.storage().instance();
        let id: u32 = s.get::<_, u32>(&DataKey::Contador).unwrap_or(0) + 1;
        s.set(&DataKey::Contador, &id);
        extender_instancia(&env);

        let tanda = Tanda {
            creador: creador.clone(),
            token,
            cuota,
            n_miembros,
            periodo_seg,
            penalidad_bps,
            cobertura_bps,
            estado: Estado::Abierta,
            ronda_actual: 0,
            inicio_ronda: 0,
            shares_boveda: 0,
            fondo_premios: 0,
            retenido: 0,
        };
        guardar_tanda(&env, id, &tanda);
        guardar_miembros(&env, id, &Vec::new(&env));

        EvCreada {
            id,
            creador,
            cuota,
            n_miembros,
        }
        .publish(&env);
        Ok(id)
    }

    /// Unirse a una tanda abierta: paga el colateral, que va directo a la bóveda.
    /// El orden de llegada define el turno. Cuando entra el último, la tanda arranca.
    pub fn unirse(env: Env, id: u32, miembro: Address) -> Result<(), Error> {
        miembro.require_auth();
        let mut t = cargar_tanda(&env, id)?;
        match t.estado {
            Estado::Abierta => {}
            Estado::Cancelada => return Err(Error::EstadoInvalido),
            _ => return Err(Error::TandaLlena),
        }
        // (P2) Si hay verificador configurado, solo entran direcciones verificadas.
        if env.storage().instance().has(&DataKey::Verificador) {
            let ok: bool = env
                .storage()
                .persistent()
                .get(&DataKey::Verificado(miembro.clone()))
                .unwrap_or(false);
            if !ok {
                return Err(Error::NoVerificado);
            }
        }
        let clave_m = DataKey::Miembro(id, miembro.clone());
        if env.storage().persistent().has(&clave_m) {
            return Err(Error::YaEsMiembro);
        }

        let mut miembros = cargar_miembros(&env, id);
        let posicion = miembros.len();
        let colateral = colateral_para(&t, posicion);

        // 1) El miembro le pasa el colateral al contrato.
        let yo = env.current_contract_address();
        let tok = token::Client::new(&env, &t.token);
        tok.transfer(&miembro, &yo, &colateral);

        // 2) El contrato le da permiso a la bóveda por ese monto y deposita.
        let boveda = direccion_boveda(&env)?;
        tok.approve(&yo, &boveda, &colateral, &(env.ledger().sequence() + 100));
        let shares = BovedaClient::new(&env, &boveda).depositar(&yo, &colateral);
        t.shares_boveda += shares;

        let m = Miembro {
            posicion,
            colateral_inicial: colateral,
            colateral,
            atrasos: 0,
            multas_pendientes: 0,
            deuda: 0,
            moroso: false,
            cobro: false,
        };
        guardar_miembro(&env, id, &miembro, &m);
        miembros.push_back(miembro.clone());
        guardar_miembros(&env, id, &miembros);
        EvUnido {
            id,
            miembro,
            posicion,
            colateral,
        }
        .publish(&env);

        // 3) ¿Se llenó? Entonces arranca la ronda 0.
        if miembros.len() == t.n_miembros {
            t.estado = Estado::Activa;
            t.ronda_actual = 0;
            t.inicio_ronda = env.ledger().timestamp();
            EvIniciada {
                id,
                inicio_ronda: t.inicio_ronda,
            }
            .publish(&env);
        }
        guardar_tanda(&env, id, &t);
        Ok(())
    }

    /// Paga la cuota de la ronda ACTUAL. Si ya venció el plazo, cuenta como pago tarde:
    /// suma un atraso y una multa pendiente (que se cobra del colateral al final).
    pub fn pagar_cuota(env: Env, id: u32, miembro: Address) -> Result<(), Error> {
        miembro.require_auth();
        let t = cargar_tanda(&env, id)?;
        if t.estado != Estado::Activa {
            return Err(Error::EstadoInvalido);
        }
        let mut m = cargar_miembro(&env, id, &miembro)?;
        if m.moroso {
            return Err(Error::MiembroMoroso);
        }
        let clave_pago = DataKey::Pagado(id, t.ronda_actual, miembro.clone());
        if env.storage().persistent().has(&clave_pago) {
            return Err(Error::YaPago);
        }

        token::Client::new(&env, &t.token).transfer(
            &miembro,
            env.current_contract_address(),
            &t.cuota,
        );

        let tarde = env.ledger().timestamp() > t.inicio_ronda + t.periodo_seg;
        if tarde {
            m.atrasos += 1;
            m.multas_pendientes += multa(&t);
            guardar_miembro(&env, id, &miembro, &m);
        }
        env.storage().persistent().set(&clave_pago, &true);
        extender(&env, &clave_pago);

        EvPago {
            id,
            miembro,
            ronda: t.ronda_actual,
            tarde,
        }
        .publish(&env);
        Ok(())
    }

    /// Cierra la ronda vencida. CUALQUIERA puede llamarla (así nadie bloquea la tanda).
    /// - Quien no pagó: su colateral cubre la cuota. Si no alcanza, queda moroso.
    /// - El beneficiario de turno recibe la bolsa (o se retiene si es moroso).
    pub fn cerrar_ronda(env: Env, id: u32) -> Result<(), Error> {
        let mut t = cargar_tanda(&env, id)?;
        if t.estado != Estado::Activa {
            return Err(Error::EstadoInvalido);
        }
        let ahora = env.ledger().timestamp();
        if ahora < t.inicio_ronda + t.periodo_seg {
            return Err(Error::RondaNoVencida);
        }

        let yo = env.current_contract_address();
        let boveda = BovedaClient::new(&env, &direccion_boveda(&env)?);
        let miembros = cargar_miembros(&env, id);
        let ronda = t.ronda_actual;
        let mut bolsa: i128 = 0;

        for dir in miembros.iter() {
            if env
                .storage()
                .persistent()
                .has(&DataKey::Pagado(id, ronda, dir.clone()))
            {
                bolsa += t.cuota;
                continue;
            }
            // No pagó: el colateral responde.
            let mut m = cargar_miembro(&env, id, &dir)?;
            m.atrasos += 1;
            let cubierto = if m.colateral >= t.cuota {
                // Regla 1: alcanza. Se cubre la cuota y se anota la multa (se cobra al final).
                m.multas_pendientes += multa(&t);
                t.cuota
            } else {
                // Regla 2: no alcanza. Entra lo que queda y el miembro queda moroso.
                m.deuda += t.cuota - m.colateral;
                if !m.moroso {
                    m.moroso = true;
                    EvMoroso {
                        id,
                        miembro: dir.clone(),
                        deuda: m.deuda,
                    }
                    .publish(&env);
                }
                m.colateral
            };
            if cubierto > 0 {
                m.colateral -= cubierto;
                let quemadas = boveda.retirar_monto(&yo, &cubierto);
                t.shares_boveda -= quemadas;
                bolsa += cubierto;
                EvCubierto {
                    id,
                    miembro: dir.clone(),
                    ronda,
                    monto: cubierto,
                }
                .publish(&env);
            }
            guardar_miembro(&env, id, &dir, &m);
        }

        // Regla 3: paga al beneficiario de turno (o retiene si es moroso).
        let beneficiario = miembros.get(ronda).unwrap();
        let mut mb = cargar_miembro(&env, id, &beneficiario)?;
        let monto_pagado = if mb.moroso {
            t.retenido += bolsa;
            0
        } else {
            if bolsa > 0 {
                token::Client::new(&env, &t.token).transfer(&yo, &beneficiario, &bolsa);
            }
            mb.cobro = true;
            guardar_miembro(&env, id, &beneficiario, &mb);
            bolsa
        };
        EvRonda {
            id,
            ronda,
            beneficiario,
            monto_pagado,
        }
        .publish(&env);

        // La siguiente ronda empieza AHORA (no desde el vencimiento anterior), para que
        // nadie quede "tarde" por culpa de un cierre atrasado.
        t.ronda_actual += 1;
        t.inicio_ronda = ahora;
        if t.ronda_actual == t.n_miembros {
            t.estado = Estado::PorLiquidar;
        }
        guardar_tanda(&env, id, &t);
        Ok(())
    }

    /// Reparte todo al terminar las rondas. CUALQUIERA puede llamarla.
    /// Orden: retirar de la bóveda → cobrar multas → devolver colateral + rendimiento
    /// → repartir multas y retenido entre los cumplidos.
    pub fn finalizar(env: Env, id: u32) -> Result<(), Error> {
        let mut t = cargar_tanda(&env, id)?;
        if t.estado != Estado::PorLiquidar {
            return Err(Error::EstadoInvalido);
        }
        let yo = env.current_contract_address();
        let miembros = cargar_miembros(&env, id);
        let n = miembros.len();

        // 1) Retirar todo de la bóveda.
        let total = if t.shares_boveda > 0 {
            BovedaClient::new(&env, &direccion_boveda(&env)?).retirar(&yo, &t.shares_boveda)
        } else {
            0
        };
        t.shares_boveda = 0;

        // Cargamos a todos los miembros en memoria para trabajar más simple.
        let mut datos: Vec<Miembro> = Vec::new(&env);
        let mut suma_colateral: i128 = 0;
        for dir in miembros.iter() {
            let m = cargar_miembro(&env, id, &dir)?;
            suma_colateral += m.colateral;
            datos.push_back(m);
        }
        // 2) Rendimiento = lo que devolvió la bóveda - el colateral que había.
        //    (Puede ser negativo si la bóveda perdió; se reparte igual, en proporción.)
        let rendimiento = total - suma_colateral;

        // 3) Cobrar multas del colateral sobrante.
        for i in 0..n {
            let mut m = datos.get(i).unwrap();
            let cobrar = m.multas_pendientes.min(m.colateral);
            m.colateral -= cobrar;
            m.multas_pendientes -= cobrar;
            t.fondo_premios += cobrar;
            datos.set(i, m);
        }

        // 4) Colateral + rendimiento, en proporción al colateral (ya sin multas).
        let mut pagos: Vec<i128> = Vec::new(&env);
        let mut suma_col2: i128 = 0;
        for i in 0..n {
            pagos.push_back(0);
            let m = datos.get(i).unwrap();
            if !m.moroso {
                suma_col2 += m.colateral;
            }
        }
        if suma_col2 > 0 {
            let mut repartido: i128 = 0;
            let mut ultimo: Option<u32> = None;
            for i in 0..n {
                let m = datos.get(i).unwrap();
                if !m.moroso && m.colateral > 0 {
                    let parte = rendimiento * m.colateral / suma_col2;
                    pagos.set(i, m.colateral + parte);
                    repartido += parte;
                    ultimo = Some(i);
                }
            }
            // El resto del redondeo va al último receptor: el saldo termina en 0 exacto.
            if let Some(u) = ultimo {
                pagos.set(u, pagos.get(u).unwrap() + (rendimiento - repartido));
            }
        } else {
            // Nadie tiene colateral: el rendimiento se suma al fondo de premios.
            t.fondo_premios += rendimiento;
        }

        // 5) Multas + retenido, en partes iguales entre quienes nunca se atrasaron.
        //    Si no hay ninguno, entre los no morosos. Si tampoco, queda sin repartir.
        let pozo = t.fondo_premios + t.retenido;
        let mut sin_repartir: i128 = 0;
        if pozo > 0 {
            let mut elegibles: Vec<u32> = Vec::new(&env);
            for i in 0..n {
                let m = datos.get(i).unwrap();
                if !m.moroso && m.atrasos == 0 {
                    elegibles.push_back(i);
                }
            }
            if elegibles.is_empty() {
                for i in 0..n {
                    if !datos.get(i).unwrap().moroso {
                        elegibles.push_back(i);
                    }
                }
            }
            let k = elegibles.len() as i128;
            if k == 0 {
                sin_repartir = pozo;
            } else {
                let parte = pozo / k;
                let resto = pozo - parte * k;
                for (j, i) in elegibles.iter().enumerate() {
                    let extra = if j as i128 == k - 1 { resto } else { 0 };
                    pagos.set(i, pagos.get(i).unwrap() + parte + extra);
                }
            }
        }

        // 6) Transferir y dejar registro.
        let tok = token::Client::new(&env, &t.token);
        for i in 0..n {
            let dir = miembros.get(i).unwrap();
            let monto = pagos.get(i).unwrap();
            if monto > 0 {
                tok.transfer(&yo, &dir, &monto);
            }
            let mut m = datos.get(i).unwrap();
            m.colateral = 0;
            guardar_miembro(&env, id, &dir, &m);
            EvLiquidado {
                id,
                miembro: dir,
                monto,
            }
            .publish(&env);
        }

        t.estado = Estado::Finalizada;
        guardar_tanda(&env, id, &t);
        EvFinalizada {
            id,
            rendimiento,
            fondo_premios: t.fondo_premios,
            retenido: t.retenido,
            sin_repartir,
        }
        .publish(&env);
        Ok(())
    }

    /// Solo el creador, y solo mientras la tanda está `Abierta` (no se llenó):
    /// devuelve a cada uno su colateral más su parte del rendimiento.
    pub fn cancelar(env: Env, id: u32) -> Result<(), Error> {
        let mut t = cargar_tanda(&env, id)?;
        t.creador.require_auth();
        if t.estado != Estado::Abierta {
            return Err(Error::EstadoInvalido);
        }
        let yo = env.current_contract_address();
        let miembros = cargar_miembros(&env, id);
        let total = if t.shares_boveda > 0 {
            BovedaClient::new(&env, &direccion_boveda(&env)?).retirar(&yo, &t.shares_boveda)
        } else {
            0
        };
        t.shares_boveda = 0;

        let mut suma: i128 = 0;
        for dir in miembros.iter() {
            suma += cargar_miembro(&env, id, &dir)?.colateral;
        }
        let tok = token::Client::new(&env, &t.token);
        let mut repartido: i128 = 0;
        let n = miembros.len();
        for i in 0..n {
            let dir = miembros.get(i).unwrap();
            let mut m = cargar_miembro(&env, id, &dir)?;
            let monto = if i == n - 1 {
                total - repartido // el último se lleva el resto del redondeo
            } else {
                total * m.colateral / suma
            };
            repartido += monto;
            if monto > 0 {
                tok.transfer(&yo, &dir, &monto);
            }
            m.colateral = 0;
            guardar_miembro(&env, id, &dir, &m);
        }
        t.estado = Estado::Cancelada;
        guardar_tanda(&env, id, &t);
        EvCancelada { id }.publish(&env);
        Ok(())
    }

    // ---------------------------------------------------------------------
    // Consultas (no cambian nada, no cuestan firma): las usa la interfaz.
    // ---------------------------------------------------------------------

    pub fn get_tanda(env: Env, id: u32) -> Result<Tanda, Error> {
        cargar_tanda(&env, id)
    }

    pub fn get_miembros(env: Env, id: u32) -> Result<Vec<(Address, Miembro)>, Error> {
        cargar_tanda(&env, id)?;
        let mut out = Vec::new(&env);
        for dir in cargar_miembros(&env, id).iter() {
            let m = cargar_miembro(&env, id, &dir)?;
            out.push_back((dir, m));
        }
        Ok(out)
    }

    /// (ronda actual, fecha límite, quiénes ya pagaron)
    pub fn get_ronda(env: Env, id: u32) -> Result<(u32, u64, Vec<Address>), Error> {
        let t = cargar_tanda(&env, id)?;
        let mut pagaron = Vec::new(&env);
        for dir in cargar_miembros(&env, id).iter() {
            if env
                .storage()
                .persistent()
                .has(&DataKey::Pagado(id, t.ronda_actual, dir.clone()))
            {
                pagaron.push_back(dir);
            }
        }
        Ok((t.ronda_actual, t.inicio_ronda + t.periodo_seg, pagaron))
    }

    /// Cuántas tandas se han creado (los ids van de 1 a este número).
    pub fn total_tandas(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Contador)
            .unwrap_or(0)
    }

    /// Colateral que pagaría el próximo en unirse (para mostrarlo antes de firmar).
    pub fn colateral_siguiente(env: Env, id: u32) -> Result<i128, Error> {
        let t = cargar_tanda(&env, id)?;
        let pos = cargar_miembros(&env, id).len();
        if pos >= t.n_miembros {
            return Err(Error::TandaLlena);
        }
        Ok(colateral_para(&t, pos))
    }
}

// ---------------------------------------------------------------------------
// Funciones internas
// ---------------------------------------------------------------------------

/// colateral_i = max(cuota, cuota × (n − 1 − i) × cobertura / 100%)
/// Con cobertura 100%, alcanza exactamente para las cuotas que el miembro aún debe
/// después de cobrar su turno: huir después de cobrar deja ganancia cero.
fn colateral_para(t: &Tanda, posicion: u32) -> i128 {
    let restantes = (t.n_miembros - 1 - posicion) as i128;
    let base = t.cuota * restantes * t.cobertura_bps as i128 / BPS;
    base.max(t.cuota)
}

fn multa(t: &Tanda) -> i128 {
    t.cuota * t.penalidad_bps as i128 / BPS
}

fn direccion_boveda(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Boveda)
        .ok_or(Error::NoInicializado)
}

fn cargar_tanda(env: &Env, id: u32) -> Result<Tanda, Error> {
    let clave = DataKey::Tanda(id);
    let t = env
        .storage()
        .persistent()
        .get(&clave)
        .ok_or(Error::NoEncontrada)?;
    extender(env, &clave);
    Ok(t)
}

fn guardar_tanda(env: &Env, id: u32, t: &Tanda) {
    let clave = DataKey::Tanda(id);
    env.storage().persistent().set(&clave, t);
    extender(env, &clave);
}

fn cargar_miembros(env: &Env, id: u32) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::Miembros(id))
        .unwrap_or(Vec::new(env))
}

fn guardar_miembros(env: &Env, id: u32, v: &Vec<Address>) {
    let clave = DataKey::Miembros(id);
    env.storage().persistent().set(&clave, v);
    extender(env, &clave);
}

fn cargar_miembro(env: &Env, id: u32, dir: &Address) -> Result<Miembro, Error> {
    let clave = DataKey::Miembro(id, dir.clone());
    let m = env
        .storage()
        .persistent()
        .get(&clave)
        .ok_or(Error::NoEsMiembro)?;
    extender(env, &clave);
    Ok(m)
}

fn guardar_miembro(env: &Env, id: u32, dir: &Address, m: &Miembro) {
    let clave = DataKey::Miembro(id, dir.clone());
    env.storage().persistent().set(&clave, m);
    extender(env, &clave);
}

/// Stellar cobra "alquiler" por guardar datos: si no se renueva, el dato se archiva
/// y la tanda "desaparece" a mitad de la demo. Cada vez que tocamos un dato, lo renovamos.
fn extender(env: &Env, clave: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(clave, TTL_UMBRAL, TTL_EXTENDER);
    extender_instancia(env);
}

fn extender_instancia(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_UMBRAL, TTL_EXTENDER);
}
