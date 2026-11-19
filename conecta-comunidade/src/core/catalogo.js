// Catálogo inicial (seed). Em produção viria das instituições parceiras.
// `vagas` = saldo atual; `vagasTotais` = oferta original (usado no dashboard).
// `sala` liga o serviço ao ponto IoT que mede a ocupação física do espaço.

export const NOMES_TURNO = { qualquer: "Qualquer horário", manha: "Manhã", tarde: "Tarde", noite: "Noite" };

export function catalogoInicial() {
  return [
    {
      id: "SRV-01", titulo: "Curso Gratuito de Informática Básica e Pacote Office",
      instituicao: "Centro Comunitário Esperança", categoria: "Capacitação Profissional",
      turno: "manha", vagas: 15, vagasTotais: 25, impactoSocial: 8, ocupacao: 0.4, inicioEmDias: 5,
      sala: "SALA-A", capacidadeSala: 30,
      tags: ["emprego", "capacitacao", "curso", "informatica", "curriculo", "trabalho", "estudo", "digital", "computador"],
      justificativaBase: "Desenvolve habilidades digitais exigidas na maioria das vagas atuais, aumentando rapidamente sua competitividade no mercado."
    },
    {
      id: "SRV-02", titulo: "Curso de Qualificação Profissional — Atendimento e Vendas",
      instituicao: "Instituto Oportunidade Local", categoria: "Qualificação",
      turno: "tarde", vagas: 8, vagasTotais: 25, impactoSocial: 7, ocupacao: 0.7, inicioEmDias: 20,
      sala: "SALA-B", capacidadeSala: 25,
      tags: ["emprego", "capacitacao", "qualificacao", "profissional", "curso", "trabalho", "vendas", "curriculo"],
      justificativaBase: "Formação prática focada em setores com alta rotatividade e contratação rápida na sua região."
    },
    {
      id: "SRV-03", titulo: "Orientação Profissional e Revisão de Currículo",
      instituicao: "Casa do Trabalhador", categoria: "Empregabilidade",
      turno: "noite", vagas: 5, vagasTotais: 25, impactoSocial: 9, ocupacao: 0.8, inicioEmDias: 10,
      sala: "SALA-C", capacidadeSala: 10,
      tags: ["emprego", "orientacao", "curriculo", "entrevista", "trabalho", "profissional", "capacitacao"],
      justificativaBase: "Atendimento individual para estruturar seu currículo e preparar você para entrevistas enquanto conclui sua capacitação."
    },
    {
      id: "SRV-04", titulo: "Oficina de Empreendedorismo e Microcrédito Comunitário",
      instituicao: "Hub Cidadão", categoria: "Geração de Renda",
      turno: "noite", vagas: 12, vagasTotais: 24, impactoSocial: 7, ocupacao: 0.5, inicioEmDias: 12,
      sala: "SALA-B", capacidadeSala: 25,
      tags: ["renda", "empreender", "empreendedorismo", "negocio", "vendas", "autonomo", "financeiro", "trabalho", "microcredito"],
      justificativaBase: "Ajuda a transformar habilidades práticas em fonte de renda própria com noções de preço, divulgação e gestão."
    },
    {
      id: "SRV-05", titulo: "Atendimento Social e Cadastro em Benefícios (CRAS Parceiro)",
      instituicao: "Núcleo de Apoio Familiar", categoria: "Atendimento Social",
      turno: "manha", vagas: 6, vagasTotais: 15, impactoSocial: 10, ocupacao: 0.6, inicioEmDias: 3,
      sala: "SALA-C", capacidadeSala: 10,
      tags: ["social", "auxilio", "beneficio", "familia", "documentos", "apoio", "cras", "vulnerabilidade"],
      justificativaBase: "Oferece acolhimento e orientação para acesso a programas sociais, regularização de documentos e rede de apoio."
    },
    {
      id: "SRV-06", titulo: "Plantão de Assistência Jurídica Gratuita",
      instituicao: "Defensoria Comunitária", categoria: "Serviço Jurídico",
      turno: "tarde", vagas: 4, vagasTotais: 40, impactoSocial: 10, ocupacao: 0.9, inicioEmDias: 2,
      sala: "SALA-C", capacidadeSala: 10,
      tags: ["social", "juridico", "advogado", "direitos", "pensao", "documentos", "apoio", "legal"],
      justificativaBase: "Garante orientação jurídica gratuita para questões familiares, trabalhistas ou documentação civil."
    }
  ];
}
