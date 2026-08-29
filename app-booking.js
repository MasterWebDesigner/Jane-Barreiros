/**
 * app-booking.js — Sistema de Agendamento e Gestão do Studio Jane Barreiros
 * Armazenamento 100% local via localStorage.
 */

(function () {
  'use strict';

  /* ================================================================
     CONSTANTES
     ================================================================ */
  var STORAGE_PREFIX = 'jane-booking-';
  var DURACAO_SLOT_MIN = 30;            // blocos de 30 min
  var HORARIO_ABERTURA = 9;             // 09:00
  var HORARIO_FECHAMENTO = 18;          // 18:00
  var DIAS_FECHADOS = [0, 1];           // 0=Domingo, 1=Segunda
  var ADMIN_SENHA = 'jane2026';         // senha do painel admin
  var KEY_AUTH = STORAGE_PREFIX + 'admin_auth';

  /* ================================================================
     SERVIÇOS PADRÃO (editável pelo admin)
     ================================================================ */
  var DEFAULT_SERVICOS = [
    { ordem: 1,  nome: 'Alisamento orgânico',                  preco: 'A partir de R$ 200,00', duracao: '2h 55min', duracao_min: 175, nota: 'Os valores são a partir, consulte nossos preços antes de agendar.' },
    { ordem: 2,  nome: 'Botox',                                 preco: 'A partir de R$ 130,00', duracao: '2h',       duracao_min: 120, nota: 'Valor a partir, depende do tamanho e quantidade de cabelo.' },
    { ordem: 3,  nome: 'Corte',                                 preco: 'A partir de R$ 50,00',  duracao: '1h',       duracao_min: 60,  nota: 'Lavar + cortar (Escova fica à parte).' },
    { ordem: 4,  nome: 'Escova com chapinha',                   preco: 'A partir de R$ 50,00',  duracao: '1h',       duracao_min: 60,  nota: 'Valores a partir.' },
    { ordem: 5,  nome: 'Hidratação',                            preco: 'A partir de R$ 50,00',  duracao: '30min',    duracao_min: 30,  nota: 'Sem escova.' },
    { ordem: 6,  nome: 'Luzes',                                 preco: 'A partir de R$ 450,00', duracao: '6h',       duracao_min: 360, nota: 'Luzes + tintura + tratamento + escova. Valores a partir, depende da quantidade que vai puxar no cabelo.' },
    { ordem: 7,  nome: 'Luzes Masculino',                       preco: 'A partir de R$ 150,00', duracao: '1h 05min', duracao_min: 65,  nota: '' },
    { ordem: 8,  nome: 'Matização para Loiros',                  preco: 'A partir de R$ 60,00',  duracao: '30min',    duracao_min: 30,  nota: '' },
    { ordem: 9,  nome: 'Mega Hair (Colocação - Cápsulas)',       preco: 'Consulte',              duracao: '6h',       duracao_min: 360, nota: 'A partir de 100 gramas + preparação das cápsulas (Colocação).' },
    { ordem: 10, nome: 'Mega Hair (Ponto Americano)',             preco: 'Consulte',              duracao: '1h',       duracao_min: 60,  nota: '' },
    { ordem: 11, nome: 'Morena Iluminada',                       preco: 'A partir de R$ 450,00', duracao: '4h 50min', duracao_min: 290, nota: 'Usamos mais tintas que o comum. Valor referente às mechas no papel personalizado + tratamentos + escova e finalização.' },
    { ordem: 12, nome: 'Pacote de Tratamento Robson Peluquero',  preco: 'A partir de R$ 350,00', duracao: '30min (por sessão)', duracao_min: 30, nota: 'Pacote com 4 sessões (1 mês de tratamento). Valor à vista.' },
    { ordem: 13, nome: 'Progressiva Japonesa Liso Lambido',      preco: 'A partir de R$ 140,00', duracao: '2h',       duracao_min: 120, nota: 'Valor a partir, depende do tamanho e quantidade do cabelo.' },
    { ordem: 14, nome: 'Progressiva Sem Formol',                 preco: 'A partir de R$ 200,00', duracao: '3h',       duracao_min: 180, nota: 'Valor a partir, depende do tamanho e quantidade do cabelo.' },
    { ordem: 15, nome: 'Reconstrução Robson Peluquero Carvão Ativado', preco: 'A partir de R$ 150,00', duracao: '1h', duracao_min: 60, nota: 'Detox e reconstrói a fibra. Valor a partir.' },
    { ordem: 16, nome: 'Reconstrução Robson Peluquero',          preco: 'A partir de R$ 100,00', duracao: '1h',       duracao_min: 60,  nota: '' },
    { ordem: 17, nome: 'Reconstrução Robson Extreme',            preco: 'A partir de R$ 100,00', duracao: '1h',       duracao_min: 60,  nota: 'Valores a partir.' },
    { ordem: 18, nome: 'Reconstrução Robson Master Love',        preco: 'A partir de R$ 100,00', duracao: '1h 20min', duracao_min: 80,  nota: 'Valores a partir.' },
    { ordem: 19, nome: 'Selagem',                                preco: 'A partir de R$ 150,00', duracao: '2h',       duracao_min: 120, nota: 'Valor a partir, depende do tamanho e quantidade do cabelo.' },
    { ordem: 20, nome: 'Teste de Mecha',                         preco: 'A partir de R$ 20,00',  duracao: '2h',       duracao_min: 120, nota: '' },
    { ordem: 21, nome: 'Tintura com Tinta do Salão + Escova',    preco: 'A partir de R$ 150,00', duracao: '1h 30min', duracao_min: 90,  nota: 'Valores a partir.' },
    { ordem: 22, nome: 'Tintura com Tinta da Cliente + Escova',  preco: 'A partir de R$ 90,00',  duracao: '1h 30min', duracao_min: 90,  nota: 'Valores a partir.' },
    { ordem: 23, nome: 'Tintura com Tinta do Salão Sem Escova',  preco: 'A partir de R$ 80,00',  duracao: '40min',    duracao_min: 40,  nota: 'Valores a partir.' }
  ];

  /* ================================================================
     HELPERS DE ARMAZENAMENTO
     ================================================================ */
  function getStore(key) {
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key)); }
    catch (e) { return null; }
  }

  function setStore(key, val) {
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val)); }
    catch (e) { /* quota exceeded — ignore */ }
  }

  /* ================================================================
     SERVIÇOS
     ================================================================ */
  function getServicos() {
    var data = getStore('servicos');
    if (!data || !data.length) {
      setStore('servicos', DEFAULT_SERVICOS);
      return DEFAULT_SERVICOS.slice();
    }
    return data;
  }

  function setServicos(lista) {
    setStore('servicos', lista);
  }

  function getServicoPorNome(nome) {
    return getServicos().find(function (s) { return s.nome === nome; }) || null;
  }

  /* ================================================================
     AGENDAMENTOS
     ================================================================ */
  function getAgendamentos() {
    return getStore('agendamentos') || [];
  }

  function setAgendamentos(lista) {
    setStore('agendamentos', lista);
  }

  function gerarId() {
    return 'ag-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  }

  function criarAgendamento(dados) {
    var lista = getAgendamentos();
    var ag = {
      id: gerarId(),
      servico: dados.servico,
      duracao_min: dados.duracao_min || 60,
      data: dados.data,           // "YYYY-MM-DD"
      horario: dados.horario,     // "09:00"
      profissional: dados.profissional || '',
      cliente_nome: dados.cliente_nome,
      cliente_whatsapp: dados.cliente_whatsapp,
      cliente_email: dados.cliente_email || '',
      forma_pagamento: dados.forma_pagamento || '',
      observacoes: dados.observacoes || '',
      origem: dados.origem || '',  // 'online' | 'recepcao' | ''
      status: dados.status || 'pendente',       // pendente | confirmado | em_atendimento | cancelado | concluido
      criado_em: new Date().toISOString()
    };
    lista.push(ag);
    setAgendamentos(lista);
    return ag;
  }

  function cancelarAgendamento(id) {
    var lista = getAgendamentos();
    lista.forEach(function (a) {
      if (a.id === id) a.status = 'cancelado';
    });
    setAgendamentos(lista);
  }

  function concluirAgendamento(id) {
    var lista = getAgendamentos();
    lista.forEach(function (a) {
      if (a.id === id) a.status = 'concluido';
    });
    setAgendamentos(lista);
  }

  function agendamentosDoDia(dataStr) {
    return getAgendamentos().filter(function (a) {
      return a.data === dataStr && (a.status === 'confirmado' || a.status === 'pendente' || a.status === 'em_atendimento');
    });
  }

  function agendamentosDaSemana(dataStr) {
    var base = new Date(dataStr + 'T12:00:00');
    var diaSemana = base.getDay();
    var inicio = new Date(base);
    inicio.setDate(base.getDate() - diaSemana);
    var fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    var iniStr = fmtData(inicio);
    var fimStr = fmtData(fim);
    return getAgendamentos().filter(function (a) {
      return a.data >= iniStr && a.data <= fimStr && (a.status === 'confirmado' || a.status === 'pendente' || a.status === 'em_atendimento');
    });
  }

  /* ================================================================
     HORÁRIOS DISPONÍVEIS
     ================================================================ */
  function horariosDisponiveis(dataStr, duracaoMin) {
    var ags = agendamentosDoDia(dataStr);
    var blocoMin = DURACAO_SLOT_MIN;
    var slots = [];
    for (var h = HORARIO_ABERTURA; h < HORARIO_FECHAMENTO; h++) {
      for (var m = 0; m < 60; m += blocoMin) {
        var hh = (h < 10 ? '0' : '') + h;
        var mm = (m < 10 ? '0' : '') + m;
        var slotInicio = h * 60 + m;
        var slotFim = slotInicio + duracaoMin;
        if (slotFim > HORARIO_FECHAMENTO * 60) continue;

        var ocupado = false;
        for (var i = 0; i < ags.length; i++) {
          var agInicio = horarioParaMinutos(ags[i].horario);
          var agFim = agInicio + ags[i].duracao_min;
          if (slotInicio < agFim && slotFim > agInicio) {
            ocupado = true;
            break;
          }
        }
        if (!ocupado) {
          slots.push(hh + ':' + mm);
        }
      }
    }
    return slots;
  }

  function horarioParaMinutos(h) {
    var p = h.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  /* ================================================================
     AGENDAMENTOS — CONSULTAS AVANÇADAS
     ================================================================ */
  function getAgendamentosDoPeriodo(dataIni, dataFim) {
    return getAgendamentos().filter(function (a) {
      return a.data >= dataIni && a.data <= dataFim;
    });
  }

  function getDiasComAgendamento(ano, mes) {
    var prefix = ano + '-' + (mes < 10 ? '0' : '') + mes + '-';
    var dias = {};
    getAgendamentos().forEach(function (a) {
      if (a.data && a.data.indexOf(prefix) === 0 && a.status !== 'cancelado') {
        var d = parseInt(a.data.split('-')[2], 10);
        dias[d] = true;
      }
    });
    return Object.keys(dias).map(function (d) { return parseInt(d, 10); });
  }

  function getProfissionais() {
    var mapa = {};
    getAgendamentos().forEach(function (a) {
      if (a.profissional) mapa[a.profissional] = true;
    });
    var lista = Object.keys(mapa);
    if (!lista.length) lista = ['Jane Barreiros'];
    return lista.sort();
  }

  function getAgendamentosPorProfissional(dataStr, profissional) {
    return getAgendamentos().filter(function (a) {
      if (a.data !== dataStr) return false;
      if (a.status !== 'confirmado' && a.status !== 'pendente' && a.status !== 'em_atendimento') return false;
      if (profissional && profissional !== 'Todos' && a.profissional && a.profissional !== profissional) return false;
      return true;
    });
  }

  function setAgendamentoStatus(id, novoStatus) {
    var lista = getAgendamentos();
    lista.forEach(function (a) {
      if (a.id === id) a.status = novoStatus;
    });
    setAgendamentos(lista);
  }

  /* ================================================================
     SERVIÇOS — DURAÇÃO POR NOME
     ================================================================ */
  function getDuracaoServico(nome) {
    var svc = getServicoPorNome(nome);
    return svc ? (svc.duracao_min || 60) : 60;
  }

  /* ================================================================
     BLOQUEIO DE HORÁRIOS / DIAS (admin)
     ================================================================ */
  function getBloqueios() {
    return getStore('bloqueios') || { datas: [], horarios: [] };
  }

  function setBloqueios(b) {
    setStore('bloqueios', b);
  }

  function estaBloqueado(dataStr, horario) {
    var b = getBloqueios();
    if (b.datas && b.datas.indexOf(dataStr) !== -1) return true;
    if (b.horarios) {
      for (var i = 0; i < b.horarios.length; i++) {
        if (b.horarios[i].data === dataStr && b.horarios[i].horario === horario) return true;
      }
    }
    return false;
  }

  function bloquearDia(dataStr) {
    var b = getBloqueios();
    if (b.datas.indexOf(dataStr) === -1) b.datas.push(dataStr);
    setBloqueios(b);
  }

  function desbloquearDia(dataStr) {
    var b = getBloqueios();
    b.datas = b.datas.filter(function (d) { return d !== dataStr; });
    setBloqueios(b);
  }

  function bloquearHorario(dataStr, horario) {
    var b = getBloqueios();
    b.horarios.push({ data: dataStr, horario: horario });
    setBloqueios(b);
  }

  function desbloquearHorario(dataStr, horario) {
    var b = getBloqueios();
    b.horarios = b.horarios.filter(function (h) {
      return !(h.data === dataStr && h.horario === horario);
    });
    setBloqueios(b);
  }

  /* ================================================================
     LISTA DE ESPERA
     ================================================================ */
  function getListaEspera() {
    return getStore('lista_espera') || [];
  }

  function setListaEspera(lista) {
    setStore('lista_espera', lista);
  }

  function adicionarListaEspera(dados) {
    var lista = getListaEspera();
    var item = {
      id: 'le-' + Date.now(),
      servico: dados.servico,
      data_preferida: dados.data_preferida,
      cliente_nome: dados.cliente_nome,
      cliente_whatsapp: dados.cliente_whatsapp,
      cliente_email: dados.cliente_email || '',
      criado_em: new Date().toISOString(),
      status: 'aguardando' // aguardando | notificado | agendado
    };
    lista.push(item);
    setListaEspera(lista);
    return item;
  }

  function removerListaEspera(id) {
    var lista = getListaEspera().filter(function (i) { return i.id !== id; });
    setListaEspera(lista);
  }

  /* ================================================================
     CLIENTES (derivado dos agendamentos)
     ================================================================ */
  function getClientes() {
    return getStore('clientes') || [];
  }

  function setClientes(lista) {
    setStore('clientes', lista);
  }

  function getClientePorTelefone(telefone) {
    var limpo = telefone.replace(/\D/g, '');
    return getClientes().find(function (c) {
      return c.whatsapp.replace(/\D/g, '') === limpo;
    }) || null;
  }

  function normalizarTag(totalAtendimentos) {
    if (totalAtendimentos <= 1) return 'Nova';
    return 'Ativa';
  }

  function registrarCliente(nome, whatsapp, email, servicoNome) {
    var clientes = getClientes();
    var telefoneLimpo = whatsapp.replace(/\D/g, '');
    var existente = clientes.find(function (c) {
      return c.whatsapp.replace(/\D/g, '') === telefoneLimpo;
    });

    var agora = new Date().toISOString();

    if (existente) {
      existente.nome = nome;
      if (email) existente.email = email;
      existente.total_atendimentos++;
      existente.ultimo_atendimento = agora;
      existente.tag = normalizarTag(existente.total_atendimentos);
      if (servicoNome) {
        if (!existente.historico) existente.historico = [];
        existente.historico.push({ servico: servicoNome, data: agora });
      }
      setClientes(clientes);
      return existente;
    }

    var novo = {
      id: 'cli-' + Date.now(),
      nome: nome,
      whatsapp: whatsapp,
      email: email || '',
      tag: 'Nova',
      total_atendimentos: 1,
      historico: servicoNome ? [{ servico: servicoNome, data: agora }] : [],
      criado_em: agora,
      ultimo_atendimento: agora
    };
    clientes.push(novo);
    setClientes(clientes);
    return novo;
  }

  function calcularValorGasto(cliente) {
    var total = 0;
    if (!cliente.historico || !cliente.historico.length) return total;
    var servicos = getServicos();
    cliente.historico.forEach(function (h) {
      for (var i = 0; i < servicos.length; i++) {
        if (servicos[i].nome === h.servico && servicos[i].preco && servicos[i].preco !== 'Consulte') {
          var m = servicos[i].preco.match(/R\$\s*([\d.,]+)/);
          if (m) total += parseFloat(m[1].replace('.', '').replace(',', '.'));
          break;
        }
      }
    });
    return total;
  }

  function atualizarCliente(id, dados) {
    var clientes = getClientes();
    clientes.forEach(function (c) {
      if (c.id === id) {
        if (dados.tag !== undefined) c.tag = dados.tag;
        if (dados.nome !== undefined) c.nome = dados.nome;
        if (dados.email !== undefined) c.email = dados.email;
      }
    });
    setClientes(clientes);
  }

  /* ================================================================
     ADMIN — AUTENTICAÇÃO
     ================================================================ */
  function adminLogin(senha) {
    if (senha === ADMIN_SENHA) {
      try { sessionStorage.setItem(KEY_AUTH, '1'); } catch (e) {}
      return true;
    }
    return false;
  }

  function adminLogado() {
    try { return sessionStorage.getItem(KEY_AUTH) === '1'; }
    catch (e) { return false; }
  }

  function adminLogout() {
    try { sessionStorage.removeItem(KEY_AUTH); } catch (e) {}
  }

  /* ================================================================
     DASHBOARD / ESTATÍSTICAS
     ================================================================ */
  function statsDoDia(dataStr) {
    var ags = agendamentosDoDia(dataStr);
    var total = ags.length;
    var faturamento = 0;
    ags.forEach(function (a) {
      var svc = getServicoPorNome(a.servico);
      if (svc && svc.preco !== 'Consulte') {
        var m = svc.preco.match(/R\$\s*([\d.,]+)/);
        if (m) faturamento += parseFloat(m[1].replace('.', '').replace(',', '.'));
      }
    });
    return { total: total, faturamento: faturamento };
  }

  function statsGerais() {
    var ags = getAgendamentos();
    var clientes = getClientes();
    var whatsappUnicos = {};
    ags.forEach(function (a) {
      if (a.cliente_whatsapp) {
        var tel = a.cliente_whatsapp.replace(/\D/g, '');
        whatsappUnicos[tel] = true;
      }
    });
    return {
      total_agendamentos: ags.length,
      pendentes: ags.filter(function (a) { return a.status === 'pendente'; }).length,
      confirmados: ags.filter(function (a) { return a.status === 'confirmado'; }).length,
      concluidos: ags.filter(function (a) { return a.status === 'concluido'; }).length,
      cancelados: ags.filter(function (a) { return a.status === 'cancelado'; }).length,
      total_clientes: clientes.length,
      clientes_com_pedidos: Object.keys(whatsappUnicos).length,
      lista_espera: getListaEspera().filter(function (i) { return i.status === 'aguardando'; }).length
    };
  }

  /* ================================================================
     FORMATAÇÃO
     ================================================================ */
  function fmtData(d) {
    var y = d.getFullYear();
    var m = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
    var dia = (d.getDate() < 10 ? '0' : '') + d.getDate();
    return y + '-' + m + '-' + dia;
  }

  function fmtDataBR(dataStr) {
    var p = dataStr.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function nomeDiaSemana(dataStr) {
    var d = new Date(dataStr + 'T12:00:00');
    var nomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return nomes[d.getDay()];
  }

  function hoje() { return fmtData(new Date()); }

  /* ================================================================
     WHATSAPP — MENSAGEM DE CONFIRMAÇÃO
     ================================================================ */
  function montarMsgWhatsApp(ag) {
    var linha = '━━━━━━━━━━━━━━━━━━━━';
    var msg = '📍 *Studio Jane Barreiros*\n' + linha + '\n';
    msg += '✅ *Agendamento Confirmado!*\n\n';
    msg += '💇 Serviço: *' + ag.servico + '*\n';
    msg += '📅 Data: *' + fmtDataBR(ag.data) + '*\n';
    msg += '🕐 Horário: *' + ag.horario + '*\n';
    msg += '👤 Cliente: *' + ag.cliente_nome + '* (' + (ag.cliente_whatsapp || '') + ')\n';
    if (ag.forma_pagamento) msg += '💳 Pagamento: *' + ag.forma_pagamento + '*\n';
    var svc = getServicoPorNome(ag.servico);
    if (svc && svc.preco && svc.preco !== 'Consulte') {
      msg += '💰 Valor: *' + svc.preco + '*\n';
    }
    if (ag.observacoes) msg += '📝 Obs: ' + ag.observacoes + '\n';
    msg += '\n' + linha + '\n';
    msg += 'Para cancelar ou reagendar, responda esta mensagem.\n';
    msg += 'Terça a Sábado: 09:00 às 18:00\n';
    msg += 'Rua Rio Grande Do Sul, 348 — Santo André, SP';
    return msg;
  }

  function enviarWhatsApp(numero, msg) {
    var tel = numero.replace(/\D/g, '');
    if (tel.indexOf('55') !== 0) tel = '55' + tel;
    var url = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
  }

  /* ================================================================
     EXPORTAÇÃO PÚBLICA (window.Booking)
     ================================================================ */
  window.Booking = {
    getServicos: getServicos,
    setServicos: setServicos,
    getServicoPorNome: getServicoPorNome,
    getDuracaoServico: getDuracaoServico,
    getAgendamentos: getAgendamentos,
    criarAgendamento: criarAgendamento,
    cancelarAgendamento: cancelarAgendamento,
    concluirAgendamento: concluirAgendamento,
    setAgendamentoStatus: setAgendamentoStatus,
    agendamentosDoDia: agendamentosDoDia,
    agendamentosDaSemana: agendamentosDaSemana,
    getAgendamentosDoPeriodo: getAgendamentosDoPeriodo,
    getDiasComAgendamento: getDiasComAgendamento,
    getProfissionais: getProfissionais,
    getAgendamentosPorProfissional: getAgendamentosPorProfissional,
    horariosDisponiveis: horariosDisponiveis,
    getBloqueios: getBloqueios,
    bloquearDia: bloquearDia,
    desbloquearDia: desbloquearDia,
    bloquearHorario: bloquearHorario,
    desbloquearHorario: desbloquearHorario,
    estaBloqueado: estaBloqueado,
    getListaEspera: getListaEspera,
    adicionarListaEspera: adicionarListaEspera,
    removerListaEspera: removerListaEspera,
    getClientePorTelefone: getClientePorTelefone,
    calcularValorGasto: calcularValorGasto,
    getClientes: getClientes,
    registrarCliente: registrarCliente,
    atualizarCliente: atualizarCliente,
    statsDoDia: statsDoDia,
    statsGerais: statsGerais,
    adminLogin: adminLogin,
    adminLogado: adminLogado,
    adminLogout: adminLogout,
    fmtData: fmtData,
    fmtDataBR: fmtDataBR,
    nomeDiaSemana: nomeDiaSemana,
    hoje: hoje,
    montarMsgWhatsApp: montarMsgWhatsApp,
    enviarWhatsApp: enviarWhatsApp,
    DIAS_FECHADOS: DIAS_FECHADOS,
    HORARIO_ABERTURA: HORARIO_ABERTURA,
    HORARIO_FECHAMENTO: HORARIO_FECHAMENTO
  };

})();
