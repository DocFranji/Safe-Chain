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
//!
//! Diseño y decisiones: `docs/tiempos-y-deudas.md`.
use soroban_sdk::{contractimpl, token, Address, Env, Vec};

use crate::almacenamiento::*;
use crate::{
    ganchos, BovedaClient, ClaveM1, Deuda, Error, Estado, EvAbono, EvBolsaRecuperada,
    EvDeudaPagada, Faltante, Tanda, TandaContract, TandaContractArgs, TandaContractClient, BPS,
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

#[contractimpl]
impl TandaContract {
    /// Paga (toda o una parte) la deuda de `miembro` en la tanda `id`. Puede pagarla otra persona
    /// (`pagador`, que es quien firma y de quien sale el dinero). Devuelve la deuda que queda.
    ///
    /// Solo mientras la tanda está `Activa` o `PorLiquidar`. No se puede pagar de más.
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
        if t.estado != Estado::Activa && t.estado != Estado::PorLiquidar {
            return Err(Error::EstadoInvalido);
        }
        let mut m = cargar_miembro(&env, id, &miembro)?;
        if m.deuda <= 0 {
            return Err(Error::SinDeuda);
        }
        if monto > m.deuda {
            return Err(Error::PagoExcesivo);
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
