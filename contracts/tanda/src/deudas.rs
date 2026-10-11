//! Misión **M1**: que un moroso pueda pagar su deuda y volver a estar al día.
//!
//! Cómo funciona:
//! - Cuando la garantía de alguien ya no alcanza para cubrir su cuota, queda **moroso** y lo que
//!   falta se suma a su `deuda`. Ese faltante lo sufrió quien cobró esa ronda (recibió de menos).
//!   `cerrar_ronda` lo anota aquí (`anotar_ronda`): ronda, a quién se le debe y cuánto.
//! - `pagar_deuda` reparte el pago del faltante más viejo al más nuevo, **a quien cobró de menos**.
//!   Si la bolsa de esa persona estaba retenida (también era morosa), el pago se suma a esa bolsa.
//! - Al saldar todo: deja de ser moroso, puede volver a pagar cuotas y cobrar, y si su propia bolsa
//!   se retuvo, la recupera menos sus multas pendientes (que van al fondo de premios). Si todavía le
//!   quedan cuotas por pagar, de esa bolsa primero se repone su garantía para esas cuotas (como la que
//!   dejó al unirse; vuelve al final con rendimiento): así no puede cobrar y volver a desaparecer.
//! - Puede pagar otra persona (por ejemplo, un familiar): el dinero sale de `pagador`.
//! - (v4) **También después de finalizar.** El contrato ya no guarda dinero de esa tanda, así que el
//!   pago va directo de `pagador` a quien recibió de menos. Si esa ronda tenía la bolsa retenida (la
//!   de otro moroso o la del propio deudor), esa bolsa se repartió al finalizar: el pago va en partes
//!   iguales a quienes recibieron ese reparto (`Repartidos`). Saldar ya no devuelve la bolsa retenida
//!   (se repartió), pero sí deja al día: el historial anota `DeudaSaldada` y la persona se desbloquea.
//!
//! - (v5) **La garantía de un moroso se reparte al final, en proporción.** Si la garantía de alguien no
//!   alcanza para todo lo que le falta pagar, no se usa mientras la tanda sigue: cada falta es deuda a
//!   favor de quien cobró de menos. Al `finalizar`, lo que quede de su garantía (`repartir_garantias`)
//!   se reparte entre esos afectados según cuánto le falta a cada uno, y se descuenta de su deuda.
//!   Si paga su deuda antes, la garantía sigue siendo suya.
//!
//! Diseño y decisiones: `docs/tiempos-y-deudas.md`.
use soroban_sdk::{contractimpl, token, Address, Env, Map, Vec};

use crate::almacenamiento::*;
use crate::{
    ganchos, BovedaClient, ClaveM1, Deuda, Error, Estado, EvAbono, EvAbonoFinal, EvBolsaRecuperada,
    EvDeudaPagada, EvGarantiaRepartida, Faltante, Miembro, ParteGarantia, Tanda, TandaContract,
    TandaContractArgs, TandaContractClient, BPS,
};

/// Garantía para las `restantes` cuotas que alguien todavía debe, con las reglas de la tanda: la
/// misma fórmula que la garantía escalonada al unirse (`colateral_para`), con piso de una cuota.
fn garantia_para(t: &Tanda, restantes: u32) -> i128 {
    if restantes == 0 {
        return 0;
    }
    let base = t.cuota * restantes as i128 * t.cobertura_bps as i128 / BPS;
    base.max(t.cuota)
}

fn deuda_vacia(env: &Env) -> Deuda {
    Deuda {
        faltantes: Vec::new(env),
        bolsa_retenida: 0,
        pagado: 0,
    }
}

fn cargar_deuda(env: &Env, id: u32, dir: &Address) -> Deuda {
    env.storage()
        .persistent()
        .get(&ClaveM1::DeudaDe(id, dir.clone()))
        .unwrap_or_else(|| deuda_vacia(env))
}

fn guardar_deuda(env: &Env, t: &Tanda, id: u32, dir: &Address, d: &Deuda) {
    let clave = ClaveM1::DeudaDe(id, dir.clone());
    env.storage().persistent().set(&clave, d);
    renovar_para_tanda(env, t, &clave);
}

/// La llama `cerrar_ronda` justo después de pagar (o retener) la bolsa de la ronda `ronda`:
/// - `faltantes`: lo que cada moroso no alcanzó a cubrir esta ronda; se le debe a `beneficiario`.
/// - `retenida`: la bolsa que no se le pagó a `beneficiario` por ser moroso (0 si sí cobró).
pub(crate) fn anotar_ronda(
    env: &Env,
    t: &Tanda,
    id: u32,
    ronda: u32,
    beneficiario: &Address,
    faltantes: &Vec<(Address, i128)>,
    retenida: i128,
) {
    for (dir, monto) in faltantes.iter() {
        let mut d = cargar_deuda(env, id, &dir);
        d.faltantes.push_back(Faltante {
            ronda,
            acreedor: beneficiario.clone(),
            monto,
        });
        guardar_deuda(env, t, id, &dir, &d);
    }
    if retenida > 0 {
        let mut d = cargar_deuda(env, id, beneficiario);
        d.bolsa_retenida += retenida;
        guardar_deuda(env, t, id, beneficiario, &d);
    }
}

/// (v4) La llama `finalizar` cuando reparte bolsas retenidas: anota quiénes las recibieron
/// (`elegidos`), para que lo que se pague después por esas rondas les llegue a ellos.
pub(crate) fn anotar_reparto(env: &Env, id: u32, elegidos: &Vec<Address>) {
    let clave = ClaveM1::Repartidos(id);
    env.storage().persistent().set(&clave, elegidos);
    extender(env, &clave);
}

/// (v4) Al final de `finalizar`: si alguien quedó debiendo, todo lo de la tanda vive lo máximo que
/// permite la red (~180 días en testnet), para que pueda pagar sin restaurar datos archivados.
pub(crate) fn al_finalizar(env: &Env, t: &Tanda, id: u32, datos: &Vec<Miembro>) {
    if datos.iter().any(|m| m.deuda > 0) {
        renovar_tras_finalizar(env, t, id);
    }
}

/// Cuántas partes (moroso → afectado) van detalladas en los eventos de un solo `finalizar`.
const PARTES_MAX: u32 = 24;

/// Lo que `repartir_garantias` le dice a `finalizar`.
pub(crate) struct GarantiasRepartidas {
    /// Cuánto de lo retirado de la bóveda es de los morosos (su garantía y su parte del rendimiento):
    /// ya no entra al reparto de los demás.
    pub sacado: i128,
    /// La suma de esas garantías, sin rendimiento.
    pub garantia: i128,
}

/// (v5) Primer paso de `finalizar` para quien quedó moroso y todavía tiene garantía: se reparte entre
/// quienes cobraron de menos, en proporción a lo que le falta a cada uno (sin contar su propia ronda),
/// y se descuenta de su deuda y de esos faltantes. Nunca se paga más de lo que se debe.
/// - Parte entera hacia abajo para cada afectado; las unidades que sobran, de una en una a los
///   primeros afectados (así nadie recibe más de lo que se le debe y no se pierde ninguna).
/// - Si el afectado SÍ cobró su bolsa, la parte se suma a lo que recibe (`pagos`). Si su bolsa quedó
///   retenida (también era moroso), la parte va al fondo `retenido` que se reparte entre quienes
///   cumplieron: igual que `abonar` mientras la tanda sigue.
/// - Si le sobra garantía (su deuda con los demás ya era menor), lo que sobra queda en `m.colateral`
///   y `finalizar` se lo devuelve, menos sus multas.
/// - `usado[i]` = cuánto de su garantía se fue a pagar su deuda.
///
/// `total` es todo lo retirado de la bóveda y `suma_colateral` la suma de las garantías: cada moroso
/// tiene derecho a `total × su garantía / suma_colateral` (capital más su parte del rendimiento).
///
/// Eventos: uno por moroso (`EvGarantiaRepartida`). Cada parte pesa ~125 bytes y la red rechaza la
/// transacción si sus eventos pasan de 16 KiB (con 11 morosos y 11 afectados serían ~120 partes), así
/// que solo las primeras `PARTES_MAX` de la transacción van detalladas; el resto de los eventos trae el
/// total repartido y `partes` vacío.
pub(crate) fn repartir_garantias(
    env: &Env,
    t: &mut Tanda,
    id: u32,
    miembros: &Vec<Address>,
    datos: &mut Vec<Miembro>,
    pagos: &mut Vec<i128>,
    usado: &mut Vec<i128>,
    total: i128,
    suma_colateral: i128,
) -> GarantiasRepartidas {
    let mut r = GarantiasRepartidas {
        sacado: 0,
        garantia: 0,
    };
    if suma_colateral <= 0 {
        return r;
    }
    let total = total.max(0);
    let mut detalladas: u32 = 0;
    for i in 0..datos.len() {
        let mut m = datos.get(i).unwrap();
        if !m.moroso || m.colateral <= 0 {
            continue;
        }
        let deudor = miembros.get(i).unwrap();
        let bruto = total * m.colateral / suma_colateral;
        r.sacado += bruto;
        r.garantia += m.colateral;

        // Lo que se le debe a cada afectado (su propia ronda no cuenta: no hay a quién pagarle).
        let mut d = cargar_deuda(env, id, &deudor);
        let mut debe: Map<Address, i128> = Map::new(env);
        let mut total_debe: i128 = 0;
        for f in d.faltantes.iter() {
            if f.acreedor == deudor {
                continue;
            }
            let antes = debe.get(f.acreedor.clone()).unwrap_or(0);
            debe.set(f.acreedor, antes + f.monto);
            total_debe += f.monto;
        }
        let a = bruto.min(total_debe);
        if a > 0 {
            // Partes proporcionales, y las unidades que sobran de una en una a los primeros.
            let mut partes: Vec<(Address, i128)> = Vec::new(env);
            let mut dado: i128 = 0;
            for (acreedor, debido) in debe.iter() {
                let parte = a * debido / total_debe;
                dado += parte;
                partes.push_back((acreedor, parte));
            }
            let mut sobran = a - dado;
            let mut con_resto: Vec<(Address, i128)> = Vec::new(env);
            for (acreedor, parte) in partes.iter() {
                let extra = if sobran > 0 { 1 } else { 0 };
                sobran -= extra;
                con_resto.push_back((acreedor, parte + extra));
            }

            // Pagar: directo, o al fondo si su bolsa quedó retenida.
            let mut aviso: Vec<ParteGarantia> = Vec::new(env);
            let mut falta_por_acreedor: Map<Address, i128> = Map::new(env);
            for (acreedor, parte) in con_resto.iter() {
                if parte <= 0 {
                    continue;
                }
                // Un acreedor siempre es miembro; si no lo encontrara, su parte va al fondo en vez de
                // trabar `finalizar`.
                let cobro = match miembros.first_index_of(&acreedor) {
                    Some(j) if datos.get(j).unwrap().cobro => {
                        pagos.set(j, pagos.get(j).unwrap() + parte);
                        true
                    }
                    _ => {
                        t.retenido += parte;
                        false
                    }
                };
                falta_por_acreedor.set(acreedor.clone(), parte);
                aviso.push_back(ParteGarantia {
                    acreedor,
                    monto: parte,
                    a_pozo: !cobro,
                });
            }

            // Descontar de sus faltantes, del más viejo al más nuevo.
            let mut quedan: Vec<Faltante> = Vec::new(env);
            for f in d.faltantes.iter() {
                let por_pagar = falta_por_acreedor.get(f.acreedor.clone()).unwrap_or(0);
                if f.acreedor == deudor || por_pagar == 0 {
                    quedan.push_back(f);
                    continue;
                }
                let abono = por_pagar.min(f.monto);
                falta_por_acreedor.set(f.acreedor.clone(), por_pagar - abono);
                if abono < f.monto {
                    quedan.push_back(Faltante {
                        monto: f.monto - abono,
                        ..f
                    });
                }
            }
            d.faltantes = quedan;
            d.pagado += a;
            guardar_deuda(env, t, id, &deudor, &d);

            m.deuda -= a;
            usado.set(i, a);
            if detalladas + aviso.len() > PARTES_MAX {
                aviso = Vec::new(env);
            }
            detalladas += aviso.len();
            EvGarantiaRepartida {
                id,
                deudor: deudor.clone(),
                repartido: a,
                deuda_restante: m.deuda,
                partes: aviso,
            }
            .publish(env);
        }
        m.colateral = bruto - a;
        datos.set(i, m);
    }
    r
}

/// (v4) Renueva al máximo de la red todo lo de una tanda finalizada que todavía tiene deudas.
fn renovar_tras_finalizar(env: &Env, t: &Tanda, id: u32) {
    let max = env.storage().max_ttl();
    renovar_tanda_con_vida(env, id, t, max);
    let clave = ClaveM1::Repartidos(id);
    if env.storage().persistent().has(&clave) {
        renovar(env, &clave, max);
    }
}

#[contractimpl]
impl TandaContract {
    /// Paga (toda o una parte) la deuda de `miembro` en la tanda `id`. Puede pagarla otra persona
    /// (`pagador`, que es quien firma y de quien sale el dinero). Devuelve la deuda que queda.
    ///
    /// Mientras la tanda está `Activa` o `PorLiquidar`, y también después de `Finalizada` (v4: el
    /// dinero va directo a quien recibió de menos). No se puede pagar de más.
    pub fn pagar_deuda(
        env: Env,
        id: u32,
        miembro: Address,
        pagador: Address,
        monto: i128,
    ) -> Result<i128, Error> {
        pagador.require_auth();
        if monto <= 0 {
            return Err(Error::MontoInvalido);
        }
        let mut t = cargar_tanda(&env, id)?;
        if !matches!(
            t.estado,
            Estado::Activa | Estado::PorLiquidar | Estado::Finalizada
        ) {
            return Err(Error::EstadoInvalido);
        }
        let mut m = cargar_miembro(&env, id, &miembro)?;
        if m.deuda <= 0 {
            return Err(Error::SinDeuda);
        }
        if monto > m.deuda {
            return Err(Error::PagoExcesivo);
        }
        if t.estado == Estado::Finalizada {
            return Ok(pagar_tras_finalizar(
                &env, &t, id, &miembro, &pagador, monto, m,
            ));
        }

        let yo = env.current_contract_address();
        let tok = token::Client::new(&env, &t.token);
        tok.transfer(&pagador, &yo, &monto);
        m.deuda -= monto;
        let deuda_restante = m.deuda;
        EvDeudaPagada {
            id,
            miembro: miembro.clone(),
            pagador: pagador.clone(),
            monto,
            deuda_restante,
        }
        .publish(&env);

        // Repartir el pago, del faltante más viejo al más nuevo, a quien cobró de menos.
        let mut d = cargar_deuda(&env, id, &miembro);
        let mut resto = monto;
        let mut quedan: Vec<Faltante> = Vec::new(&env);
        for f in d.faltantes.iter() {
            if resto == 0 {
                quedan.push_back(f);
                continue;
            }
            let abono = resto.min(f.monto);
            resto -= abono;
            let retenida = if f.acreedor == miembro && !m.cobro {
                // Es su propia ronda: era moroso cuando le tocaba cobrar y su bolsa quedó retenida.
                // Pagar esa cuota completa su propia bolsa (`d` se guarda abajo).
                t.retenido += abono;
                d.bolsa_retenida += abono;
                true
            } else {
                abonar(&env, &mut t, id, &f.acreedor, abono, &tok)
            };
            EvAbono {
                id,
                deudor: miembro.clone(),
                acreedor: f.acreedor.clone(),
                ronda: f.ronda,
                monto: abono,
                retenida,
            }
            .publish(&env);
            if abono < f.monto {
                quedan.push_back(Faltante {
                    monto: f.monto - abono,
                    ..f
                });
            }
        }
        d.faltantes = quedan;
        // Por si alguna regla futura sumara deuda sin anotar a quién se le debe: lo que sobre va al
        // fondo que se reparte al final entre quienes cumplieron. (Hoy no pasa: suman lo mismo.)
        if resto > 0 {
            t.retenido += resto;
        }
        d.pagado += monto;

        // Saldó todo: vuelve a estar al día y, si su bolsa se retuvo, la recupera menos sus multas.
        if deuda_restante == 0 {
            m.moroso = false;
            if d.bolsa_retenida > 0 {
                let bolsa = d.bolsa_retenida;
                let multas = m.multas_pendientes.min(bolsa);
                m.multas_pendientes -= multas;
                t.fondo_premios += multas;
                t.retenido -= bolsa;
                let mut neto = bolsa - multas;
                // Si la tanda sigue, todavía debe las cuotas de esta ronda en adelante: primero se repone
                // su garantía para esas cuotas (va a la bóveda y vuelve al final con rendimiento).
                // (M3) Sirve igual en todos los modos de turnos: cuenta las cuotas que faltan desde la
                // ronda actual, no el turno (`turnos::completar_garantia` usa el turno y apartaría de más).
                let restantes = if t.estado == Estado::Activa {
                    t.n_miembros - t.ronda_actual
                } else {
                    0
                };
                let garantia = (garantia_para(&t, restantes) - m.colateral).clamp(0, neto);
                if garantia > 0 {
                    let boveda = boveda_de(&env, id, &t)?;
                    tok.approve(&yo, &boveda, &garantia, &(env.ledger().sequence() + 100));
                    t.shares_boveda += BovedaClient::new(&env, &boveda).depositar(&yo, &garantia);
                    m.colateral += garantia;
                    neto -= garantia;
                }
                if neto > 0 {
                    tok.transfer(&yo, &miembro, &neto);
                }
                d.bolsa_retenida = 0;
                m.cobro = true;
                EvBolsaRecuperada {
                    id,
                    miembro: miembro.clone(),
                    monto: neto,
                    multas,
                    garantia,
                }
                .publish(&env);
            }
        }

        guardar_deuda(&env, &t, id, &miembro, &d);
        guardar_miembro(&env, id, &miembro, &m);
        ganchos::al_pagar_deuda(&env, &t, id, &miembro, monto, deuda_restante);
        guardar_tanda(&env, id, &t);
        Ok(deuda_restante)
    }

    /// La deuda de `miembro` en la tanda `id`: a quién le debe (por ronda), su bolsa retenida si la
    /// tiene, y cuánto ha pagado. Si nunca debió nada, todo vacío.
    pub fn get_deuda(env: Env, id: u32, miembro: Address) -> Result<Deuda, Error> {
        cargar_tanda(&env, id)?;
        cargar_miembro(&env, id, &miembro)?;
        Ok(cargar_deuda(&env, id, &miembro))
    }

    /// Las deudas de la tanda `id` en una sola consulta: solo de quienes alguna vez debieron algo
    /// (incluye a quienes ya saldaron: `faltantes` vacío y `pagado > 0`).
    pub fn get_deudas(env: Env, id: u32) -> Result<Vec<(Address, Deuda)>, Error> {
        cargar_tanda(&env, id)?;
        let p = env.storage().persistent();
        let mut out = Vec::new(&env);
        for dir in cargar_miembros(&env, id).iter() {
            if let Some(d) = p.get::<_, Deuda>(&ClaveM1::DeudaDe(id, dir.clone())) {
                out.push_back((dir, d));
            }
        }
        Ok(out)
    }
}

/// (v4) `pagar_deuda` en una tanda `Finalizada`. El contrato ya no tiene dinero de esa tanda: el pago
/// va directo de `pagador` a quien le corresponde, del faltante más viejo al más nuevo:
/// - si quien cobró de menos SÍ recibió su bolsa, a esa persona;
/// - si su bolsa quedó retenida (era morosa, o es el propio deudor) y al finalizar se repartió, en
///   partes iguales a quienes recibieron ese reparto (`Repartidos`), que son quienes perdieron ese
///   dinero; si nadie lo recibió (todos terminaron en mora), a quien cobró de menos.
///
/// Se junta lo de cada persona y se le paga UNA vez: como mucho 11 transferencias y 11 eventos,
/// aunque la deuda tenga faltantes de muchas rondas.
///
/// Saldar no devuelve la bolsa retenida (ya se repartió), pero deja a la persona al día.
fn pagar_tras_finalizar(
    env: &Env,
    t: &Tanda,
    id: u32,
    miembro: &Address,
    pagador: &Address,
    monto: i128,
    mut m: Miembro,
) -> i128 {
    let repartidos: Vec<Address> = env
        .storage()
        .persistent()
        .get(&ClaveM1::Repartidos(id))
        .unwrap_or_else(|| Vec::new(env));
    m.deuda -= monto;
    let deuda_restante = m.deuda;
    EvDeudaPagada {
        id,
        miembro: miembro.clone(),
        pagador: pagador.clone(),
        monto,
        deuda_restante,
    }
    .publish(env);

    // 1) Del faltante más viejo al más nuevo: cuánto va directo a cada quien y cuánto al reparto.
    let mut d = cargar_deuda(env, id, miembro);
    let mut directo: Map<Address, i128> = Map::new(env);
    let mut al_reparto: i128 = 0;
    let mut resto = monto;
    let mut quedan: Vec<Faltante> = Vec::new(env);
    for f in d.faltantes.iter() {
        if resto == 0 {
            quedan.push_back(f);
            continue;
        }
        let abono = resto.min(f.monto);
        resto -= abono;
        let cobro = if f.acreedor == *miembro {
            m.cobro
        } else {
            cargar_miembro(env, id, &f.acreedor)
                .map(|a| a.cobro)
                .unwrap_or(true)
        };
        if cobro || repartidos.is_empty() {
            let antes = directo.get(f.acreedor.clone()).unwrap_or(0);
            directo.set(f.acreedor.clone(), antes + abono);
        } else {
            al_reparto += abono;
        }
        if abono < f.monto {
            quedan.push_back(Faltante {
                monto: f.monto - abono,
                ..f
            });
        }
    }
    d.faltantes = quedan;
    // Los faltantes suman la deuda, así que no sobra nada. Si alguna regla futura sumara deuda sin
    // anotar a quién se le debe, eso va al reparto (como antes de finalizar iba al fondo final).
    al_reparto += resto;

    // 2) Lo del reparto, en partes iguales; el resto del redondeo, al último.
    let mut del_reparto: Map<Address, i128> = Map::new(env);
    if al_reparto > 0 {
        let k = repartidos.len() as i128;
        if k == 0 {
            // Solo por la regla futura de arriba sin nadie a quien repartir: queda en el contrato.
            token::Client::new(env, &t.token).transfer(
                pagador,
                env.current_contract_address(),
                &al_reparto,
            );
        } else {
            let parte = al_reparto / k;
            for (j, dir) in repartidos.iter().enumerate() {
                let extra = if j as i128 == k - 1 {
                    al_reparto - parte * k
                } else {
                    0
                };
                del_reparto.set(dir, parte + extra);
            }
        }
    }

    // 3) Una transferencia por persona.
    let tok = token::Client::new(env, &t.token);
    for (hacia, cuanto) in directo.iter() {
        entregar(env, &tok, id, pagador, miembro, &hacia, cuanto, false);
    }
    for (hacia, cuanto) in del_reparto.iter() {
        entregar(env, &tok, id, pagador, miembro, &hacia, cuanto, true);
    }

    d.pagado += monto;
    if deuda_restante == 0 {
        m.moroso = false;
    }
    guardar_deuda(env, t, id, miembro, &d);
    guardar_miembro(env, id, miembro, &m);
    ganchos::al_pagar_deuda(env, t, id, miembro, monto, deuda_restante);
    renovar_tras_finalizar(env, t, id);
    deuda_restante
}

/// (v4) Pasa `monto` de `pagador` a `hacia` y lo anuncia (`EvAbonoFinal`).
fn entregar(
    env: &Env,
    tok: &token::Client,
    id: u32,
    pagador: &Address,
    deudor: &Address,
    hacia: &Address,
    monto: i128,
    reparto: bool,
) {
    if monto <= 0 {
        return;
    }
    if pagador != hacia {
        tok.transfer(pagador, hacia, &monto);
    }
    EvAbonoFinal {
        id,
        deudor: deudor.clone(),
        hacia: hacia.clone(),
        monto,
        reparto,
    }
    .publish(env);
}

/// Entrega `monto` a `acreedor` (quien cobró de menos). Si su bolsa sigue retenida porque también
/// es moroso, el monto se suma a esa bolsa (la recupera si salda, o se reparte al final).
/// Devuelve `true` si quedó retenido.
fn abonar(
    env: &Env,
    t: &mut Tanda,
    id: u32,
    acreedor: &Address,
    monto: i128,
    tok: &token::Client,
) -> bool {
    let cobro = cargar_miembro(env, id, acreedor)
        .map(|a| a.cobro)
        .unwrap_or(true);
    if cobro {
        tok.transfer(&env.current_contract_address(), acreedor, &monto);
        return false;
    }
    t.retenido += monto;
    let mut d = cargar_deuda(env, id, acreedor);
    d.bolsa_retenida += monto;
    guardar_deuda(env, t, id, acreedor, &d);
    true
}
