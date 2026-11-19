// Contrato dos eventos que entram no data lake (camada bronze) e regras de validação
// usadas pelo ETL para promover um registro à camada prata.
//
// Envelope comum a todo evento:
// { evento_id, tipo, origem, ocorrido_em (ISO-8601 com fuso), ingerido_em, dados: {...} }

// Turmas abrem em ciclos de 30 dias a partir desta data (calendário das instituições)
export const INICIO_CICLOS = "2026-08-21";
export const DIAS_CICLO = 30;
export function cicloDe(data) {
  return Math.floor((Date.parse(data + "T12:00:00Z") - Date.parse(INICIO_CICLOS + "T12:00:00Z")) / 86400000 / DIAS_CICLO);
}

export const TIPOS = ["busca", "reserva", "cancelamento", "presenca", "leitura_iot"];
export const SALAS = ["SALA-A", "SALA-B", "SALA-C"];
export const TURNOS = ["qualquer", "manha", "tarde", "noite"];
export const INTERESSES = ["Capacitação profissional", "Geração de renda", "Apoio social e jurídico"];

// Eixo temático = liga a categoria do serviço ao interesse informado pelo cidadão
export const EIXO_POR_CATEGORIA = {
  "Capacitação Profissional": "Capacitação profissional",
  "Qualificação": "Capacitação profissional",
  "Empregabilidade": "Capacitação profissional",
  "Geração de Renda": "Geração de renda",
  "Atendimento Social": "Apoio social e jurídico",
  "Serviço Jurídico": "Apoio social e jurídico"
};

const ID_SERVICO = /^SRV-\d{2}$/;
const HASH = /^[0-9a-f]{16}$/;
const PROTOCOLO = /^CC-[0-9A-F]{6}$/;

// Aceita "2026-09-01T10:00:00-03:00", "...Z" e o formato legado "2026-09-01 10:00:00" (assume -03:00)
export function normalizarData(valor) {
  if (typeof valor !== "string") return null;
  let v = valor.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) v = v.replace(" ", "T") + "-03:00";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Data e hora no fuso de São Paulo (UTC-3, sem horário de verão desde 2019)
export function partesLocais(data) {
  const local = new Date(data.getTime() - 3 * 3600 * 1000);
  const iso = local.toISOString();
  return { data: iso.slice(0, 10), hora: local.getUTCHours(), diaSemana: local.getUTCDay() };
}

const VALIDADORES = {
  busca(d) {
    if (!HASH.test(d.perfil_hash ?? "")) return "perfil_hash_invalido";
    if (!INTERESSES.includes(d.interesse)) return "interesse_invalido";
    if (!TURNOS.includes(d.turno)) return "turno_invalido";
    if (!Array.isArray(d.recomendados)) return "recomendados_ausente";
    if (d.recomendados.some(r => !ID_SERVICO.test(r?.servico_id ?? "") || !Number.isFinite(r?.score))) return "recomendacao_invalida";
    return null;
  },
  reserva(d) {
    if (!HASH.test(d.perfil_hash ?? "")) return "perfil_hash_invalido";
    if (!ID_SERVICO.test(d.servico_id ?? "")) return "servico_invalido";
    if (!["confirmada", "sem_vaga"].includes(d.resultado)) return "resultado_invalido";
    if (d.resultado === "confirmada" && !PROTOCOLO.test(d.reserva_id ?? "")) return "protocolo_invalido";
    return null;
  },
  cancelamento(d) { return PROTOCOLO.test(d.reserva_id ?? "") ? null : "protocolo_invalido"; },
  presenca(d) { return PROTOCOLO.test(d.reserva_id ?? "") ? null : "protocolo_invalido"; },
  leitura_iot(d) {
    if (!SALAS.includes(d.sala)) return "sala_invalida";
    if (d.sensor === "fluxo") return ["entrada", "saida"].includes(d.evento) ? null : "evento_fluxo_invalido";
    if (d.sensor === "temperatura") {
      const v = Number(d.valor);
      return Number.isFinite(v) && v >= -20 && v <= 70 ? null : "temperatura_fora_da_faixa";
    }
    return "sensor_invalido";
  }
};

// Retorna { ok: true, registro } ou { ok: false, motivo }
export function validarEvento(e) {
  if (!e || typeof e !== "object") return { ok: false, motivo: "registro_nao_objeto" };
  if (typeof e.evento_id !== "string" || e.evento_id.length < 8) return { ok: false, motivo: "evento_id_ausente" };
  if (!TIPOS.includes(e.tipo)) return { ok: false, motivo: "tipo_desconhecido" };
  const quando = normalizarData(e.ocorrido_em);
  if (!quando) return { ok: false, motivo: "data_invalida" };
  if (!e.dados || typeof e.dados !== "object") return { ok: false, motivo: "dados_ausentes" };
  const motivo = VALIDADORES[e.tipo](e.dados);
  if (motivo) return { ok: false, motivo };
  return { ok: true, registro: { ...e, ocorrido_em: quando.toISOString(), _quando: quando } };
}
