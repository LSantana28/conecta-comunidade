// Estado da aplicação em memória (MVP). Interface pensada para trocar por um banco
// (PostgreSQL/MongoDB) sem mudar as rotas: cada função é uma "operação de repositório".
import crypto from "node:crypto";
import { catalogoInicial } from "../core/catalogo.js";

export const LIMITE_TEMPERATURA = 30;
const MAX_LEITURAS = 200;

export function criarStore() {
  const servicos = catalogoInicial();
  const reservas = new Map();             // protocolo -> reserva
  const demandaPorInteresse = {};         // interesse -> nº de buscas
  const recomendadoPorServico = {};       // id -> nº de vezes recomendado
  const leituras = [];                    // histórico IoT (últimas N)
  const salas = {};
  for (const s of servicos) {
    salas[s.sala] ??= { sala: s.sala, capacidade: s.capacidadeSala, ocupacao: 0, temperatura: null, atualizadoEm: null };
  }
  const metricas = { requisicoes: 0, erros: 0, recomendacoes: 0, reservas: 0, cancelamentos: 0, leiturasIoT: 0, inicio: Date.now() };

  return {
    metricas,

    listarServicos() {
      return servicos.map(s => ({ ...s, ocupacaoSala: salas[s.sala] }));
    },

    buscarServico(id) { return servicos.find(s => s.id === id); },

    registrarBusca(interesse, recomendacoes) {
      demandaPorInteresse[interesse] = (demandaPorInteresse[interesse] ?? 0) + 1;
      for (const r of recomendacoes) recomendadoPorServico[r.id_servico] = (recomendadoPorServico[r.id_servico] ?? 0) + 1;
      metricas.recomendacoes += 1;
    },

    // Regra 4 — baixa imediata no saldo
    reservar({ id_servico, primeiroNome }) {
      const servico = this.buscarServico(id_servico);
      if (!servico) return { erro: "Serviço não encontrado.", status: 404 };
      if (servico.vagas <= 0) return { erro: "Não há mais vagas neste serviço.", status: 409 };
      servico.vagas -= 1;
      const protocolo = "CC-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      const reserva = {
        protocolo, id_servico, titulo: servico.titulo, instituicao: servico.instituicao,
        turno: servico.turno, sala: servico.sala, primeiroNome, status: "confirmada", criadaEm: new Date().toISOString()
      };
      reservas.set(protocolo, reserva);
      metricas.reservas += 1;
      return { reserva, vagasRestantes: servico.vagas };
    },

    buscarReserva(protocolo) { return reservas.get(protocolo) ?? null; },

    cancelar(protocolo) {
      const r = reservas.get(protocolo);
      if (!r) return { erro: "Reserva não encontrada.", status: 404 };
      if (r.status !== "confirmada") return { erro: "Reserva já está " + r.status + ".", status: 409 };
      r.status = "cancelada";
      this.buscarServico(r.id_servico).vagas += 1;   // devolve a vaga ao saldo
      metricas.cancelamentos += 1;
      return { reserva: r };
    },

    listarReservas() { return [...reservas.values()]; },

    // IoT — sensores de fluxo (entrada/saída) e temperatura
    registrarLeitura(leitura) {
      const sala = salas[leitura.sala];
      if (!sala) return { erro: "Sala não cadastrada.", status: 404 };
      if (leitura.sensor === "fluxo") {
        sala.ocupacao = Math.max(0, sala.ocupacao + (leitura.evento === "entrada" ? 1 : -1));
      } else {
        sala.temperatura = leitura.valor;
      }
      sala.atualizadoEm = new Date().toISOString();
      const registro = { ...leitura, ocupacaoApos: sala.ocupacao, em: sala.atualizadoEm };
      leituras.push(registro);
      if (leituras.length > MAX_LEITURAS) leituras.shift();
      metricas.leiturasIoT += 1;
      return { sala: { ...sala, alertas: alertasDaSala(sala) } };
    },

    estadoSalas() {
      return Object.values(salas).map(s => ({ ...s, alertas: alertasDaSala(s) }));
    },

    dashboard() {
      const porServico = servicos.map(s => {
        const ativas = [...reservas.values()].filter(r => r.id_servico === s.id && r.status !== "cancelada").length;
        const ocupadas = s.vagasTotais - s.vagas;
        return {
          id: s.id, titulo: s.titulo, categoria: s.categoria, turno: s.turno,
          vagasTotais: s.vagasTotais, saldo: s.vagas, ocupadas, reservasPlataforma: ativas,
          utilizacao: Math.round((ocupadas / s.vagasTotais) * 100),
          vezesRecomendado: recomendadoPorServico[s.id] ?? 0
        };
      });
      const totalOfertadas = porServico.reduce((a, s) => a + s.vagasTotais, 0);
      const totalSaldo = porServico.reduce((a, s) => a + s.saldo, 0);
      return {
        geradoEm: new Date().toISOString(),
        totais: {
          vagasOfertadas: totalOfertadas,
          vagasDisponiveis: totalSaldo,
          vagasOcupadas: totalOfertadas - totalSaldo,
          taxaUtilizacao: Math.round(((totalOfertadas - totalSaldo) / totalOfertadas) * 100),
          reservasPlataforma: metricas.reservas - metricas.cancelamentos,
          buscas: metricas.recomendacoes
        },
        porServico,
        demandaPorInteresse: { ...demandaPorInteresse },
        salas: this.estadoSalas(),
        ultimasLeituras: leituras.slice(-12).reverse()
      };
    }
  };
}

export function alertasDaSala(sala) {
  const alertas = [];
  if (sala.ocupacao >= sala.capacidade) alertas.push("Lotação máxima atingida");
  else if (sala.ocupacao >= sala.capacidade * 0.8) alertas.push("Ocupação acima de 80%");
  if (sala.temperatura !== null && sala.temperatura > LIMITE_TEMPERATURA) alertas.push(`Temperatura acima de ${LIMITE_TEMPERATURA} °C`);
  return alertas;
}
