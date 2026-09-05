/**
 * app-booking.js — Sistema de Agendamento e Gestão do Studio Jane Barreiros
 * Armazenamento via Firebase Realtime Database (sync entre dispositivos).
 * Versão: 1.7.0
 */

var APP_VERSION = '1.3.2';

(function () {
  'use strict';

  /* ================================================================
     CONSTANTES
     ================================================================ */
  var DURACAO_SLOT_MIN = 30;
  var HORARIO_ABERTURA = 9;
  var HORARIO_FECHAMENTO = 19;
  var DIAS_FECHADOS = [0, 1];
  var ADMIN_SENHA = 'jane2026';
  var KEY_AUTH = 'jane-admin-auth';

  /* ================================================================
     FIREBASE CONFIG
     ================================================================ */
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyA35ij-3cbUKNId5yirK5A3BMKzVGvip0o",
    authDomain: "jane-barreiros.firebaseapp.com",
    databaseURL: "https://jane-barreiros-default-rtdb.firebaseio.com",
    projectId: "jane-barreiros",
    storageBucket: "jane-barreiros.firebasestorage.app",
    messagingSenderId: "1086587981477",
    appId: "1:1086587981477:web:67a1ca3816df8d64e2c74c"
  };

  var _db = null;
  var _cache = {};       // cache em memória por chave
  var _loaded = {};      // marco de dados já carregados do Firebase
  var _initialized = false;
  var _loadingComplete = false;
  var REST_BASE = FIREBASE_CONFIG.databaseURL + '/jane-booking';

  /* ================================================================
     REST API FALLBACK — fallback HTTP quando SDK falha
     ================================================================ */
  function _restPut(key, val) {
    var url = REST_BASE + '/' + key + '.json';
    return fetch(url, { method: 'PUT', body: JSON.stringify(val) })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function _restGet(key) {
    var url = REST_BASE + '/' + key + '.json';
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function _restGetWithTimeout(key, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Timeout ' + ms + 'ms')); }, ms);
      _restGet(key).then(function (val) {
        clearTimeout(timer);
        resolve(val);
      }).catch(function (e) {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  /* Toast de erro visível na tela */
  function _showFirebaseError(contexto, erro) {
    var msg = '[Firebase ERRO] ' + contexto + ': ' + erro;
    console.error(msg);
    var isPerm = erro.indexOf('PERMISSAO NEGADA') !== -1 || erro.indexOf('permission_denied') !== -1 || erro.indexOf('PERMISSION_DENIED') !== -1;
    var border = isPerm ? '#EF4444' : '#F59E0B';
    var textColor = isPerm ? '#FCA5A5' : '#FDE68A';
    var container = document.getElementById('toast-container');
    if (container) {
      var toast = document.createElement('div');
      toast.style.cssText = 'pointer-events:auto;max-width:420px;padding:14px 18px;border-radius:12px;background:#1E1E1E;border:1px solid ' + border + ';color:' + textColor + ';font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.5);animation:toastIn .35s ease-out;margin-bottom:8px;';
      var title = isPerm ? 'ERRO DE PERMISSAO - Firebase' : 'Erro ao salvar no Firebase';
      var desc = isPerm ? 'As regras de escrita nao estao publicadas. Abra o Firebase Console > Realtime Database > Regras e publique com .write: true para jane-booking.' : erro;
      toast.innerHTML = '<strong style="color:' + border + ';">' + title + '</strong><br><span style="color:#9CA3AF;font-size:12px;">' + desc + '</span><br><span style="color:#6B7280;font-size:11px;">Dados salvos localmente. Tente recarregar a pagina.</span>';
      container.appendChild(toast);
      setTimeout(function () { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(function () { toast.remove(); }, 300); }, 10000);
    }
  }

  function initFirebase() {
    if (_initialized) {
      /* Reconexão: se _db existe mas estava offline, força goOnline */
      if (_db && typeof firebase !== 'undefined' && firebase.database) {
        try { _db.goOnline(); } catch (e) {}
      }
      return;
    }
    if (typeof firebase === 'undefined' || !firebase.database) {
      console.warn('[Booking] Firebase SDK não carregado. Usando fallback localStorage.');
      _initLocalStorageFallback();
      return;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    _db = firebase.database();
    _initialized = true;
    console.log('[Booking] Firebase conectado. db:', !!_db);

    /* Reconexão ao sair do Back-Forward Cache (BFCache) */
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        console.log('[Booking] Página restaurada do BFCache. Reconectando Firebase...');
        try {
          _db.goOnline();
          console.log('[Booking] Firebase goOnline() executado.');
        } catch (e) {
          console.warn('[Booking] goOnline falhou, reinicializando...', e);
          _initialized = false;
          _db = null;
          initFirebase();
        }
      }
    });
  }

  /* ================================================================
     HELPERS DE ARMAZENAMENTO (Firebase + memory cache)
     ================================================================ */
  function toArray(obj) {
    if (Array.isArray(obj)) return obj;
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).sort(function(a,b){return parseInt(a)-parseInt(b);}).map(function(k){return obj[k];});
  }

  function getStore(key) {
    if (_cache[key] !== undefined) return toArray(JSON.parse(JSON.stringify(_cache[key])));
    return null;
  }

  function setStore(key, val) {
    _cache[key] = JSON.parse(JSON.stringify(val));
    console.log('[Booking] setStore:', key, '| _db:', !!_db, '| itens:', Array.isArray(val) ? val.length : typeof val);

    /* Salva em localStorage sempre (garantia offline) */
    var PII_KEYS = ['clientes'];
    if (PII_KEYS.indexOf(key) === -1) {
      try { localStorage.setItem('jane-booking-' + key, JSON.stringify(val)); } catch (e) {}
    }

    function _handleError(err) {
      var msg = (err && err.message) ? err.message : String(err);
      if (msg.indexOf('permission_denied') !== -1 || msg.indexOf('PERMISSION_DENIED') !== -1) {
        _showFirebaseError('Salvando ' + key, 'PERMISSAO NEGADA pelo Firebase. Verifique as rules no Console.');
      } else {
        _showFirebaseError('Salvar ' + key, msg);
      }
    }

    /* Retorna Promise que resolve quando Firebase confirma */
    return new Promise(function (resolve) {
      /* 1) Tenta SDK Firebase */
      if (_db) {
        try {
          _db.ref('jane-booking/' + key).set(val).then(function () {
            console.log('[Booking] Firebase OK (SDK):', key);
            resolve(true);
          }).catch(function (e) {
            console.error('[Booking] Firebase SDK ERRO:', key, e.message || e);
            /* 2) Fallback: REST API PUT */
            _restPut(key, val).then(function () {
              console.log('[Booking] Firebase OK (REST):', key);
              resolve(true);
            }).catch(function (e2) {
              console.error('[Booking] Firebase REST ERRO:', key, e2.message || e2);
              _handleError(e2);
              resolve(false);
            });
          });
        } catch (e) {
          console.error('[Booking] Firebase exception:', key, e);
          _restPut(key, val).then(function () {
            console.log('[Booking] Firebase OK (REST after exception):', key);
            resolve(true);
          }).catch(function (e2) {
            _handleError(e2);
            resolve(false);
          });
        }
      } else {
        /* 3) SDK desconectado: REST direto */
        console.warn('[Booking] SDK offline. Usando REST API...');
        _restPut(key, val).then(function () {
          console.log('[Booking] Firebase OK (REST fallback):', key);
          resolve(true);
        }).catch(function (e) {
          console.error('[Booking] Firebase REST ERRO:', key, e.message || e);
          _handleError(e);
          resolve(false);
        });
      }
    });
  }

  function loadFromFirebase(key, cb) {
    if (!_db) { cb(null); return; }
    _db.ref('jane-booking/' + key).once('value').then(function (snap) {
      cb(snap.val());
    }).catch(function () { cb(null); });
  }

  function listenFirebase(key, cb) {
    if (!_db) return;
    _db.ref('jane-booking/' + key).on('value', function (snap) {
      var val = snap.val();
      _cache[key] = val;
      _loaded[key] = true;
      if (cb) cb(val);
    });
  }

  /* Carrega todos os dados do Firebase para a memória + migra localStorage antigo */
  function _sincronizarNomesClientes() {
    var clientes = _cache['clientes'] || [];
    var agendamentos = _cache['agendamentos'] || [];
    if (!clientes.length || !agendamentos.length) return;
    var mapaClientes = {};
    clientes.forEach(function (c) {
      var tel = (c.whatsapp || '').replace(/\D/g, '');
      if (tel) mapaClientes[tel] = c.nome;
    });
    var alterado = false;
    agendamentos.forEach(function (a) {
      var tel = (a.cliente_whatsapp || '').replace(/\D/g, '');
      var nomeCorreto = mapaClientes[tel];
      if (nomeCorreto && a.cliente_nome !== nomeCorreto) {
        console.log('[Sync] Corrigindo nome:', a.cliente_nome, '->', nomeCorreto, '| tel:', tel);
        a.cliente_nome = nomeCorreto;
        alterado = true;
      }
    });
    if (alterado) {
      setAgendamentos(agendamentos);
      console.log('[Sync] Nomes de clientes sincronizados nos agendamentos.');
    }
  }

  function loadAllData(cb) {
    var keys = ['agendamentos', 'clientes', 'servicos', 'bloqueios', 'lista_espera', 'profissionais', 'secoes', 'estoque', 'despesas', 'curso_vendas'];
    var pending = keys.length;
    var done = function () { pending--; if (pending <= 0) { _loadingComplete = true; console.log('[Booking] loadAllData COMPLETO. Cache atualizado.'); _sincronizarNomesClientes(); if (cb) cb(); } };

    function _processVal(key, val, fonte) {
      console.log('[Booking] _processVal:', key, '| fonte:', fonte, '| dados:', val === null ? 'NULL' : (Array.isArray(val) ? val.length + ' itens' : typeof val));
      if (key === 'servicos' && val !== null && Array.isArray(val)) {
        console.log('[DEBUG-F5] Serviços recebidos do Firebase:', val.length);
        console.log('[DEBUG-F5] Nomes:', val.map(function(s){ return s.nome; }).join(', '));
      }
      if (val !== null && Array.isArray(val)) {
        console.log('[Booking] Primeiros 3 itens:', JSON.stringify(val.slice(0, 3)));
      }

      /* Mescla dados antigos do localStorage (chave quebrada 'undefined') */
      var localAntigo = null;
      try { localAntigo = JSON.parse(localStorage.getItem('undefined' + key)); } catch (e) {}
      if (localAntigo && Array.isArray(localAntigo)) {
        if (val === null) {
          val = localAntigo;
        } else if (Array.isArray(val)) {
          var existentes = {};
          val.forEach(function (item) { if (item && item.id) existentes[item.id] = true; });
          localAntigo.forEach(function (item) {
            if (item && item.id && !existentes[item.id]) {
              val.push(item);
              existentes[item.id] = true;
            }
          });
        }
        try { localStorage.removeItem('undefined' + key); } catch (e) {}
      }

      if (val !== null) {
        /* Firebase retornou dados → sobrescreve TUDO (cache + localStorage) */
        _cache[key] = val;
        console.log('[Booking] Firebase load:', key, '| itens:', Array.isArray(val) ? val.length : typeof val, '| fonte:', fonte);
        var PII_KEYS = ['clientes'];
        if (PII_KEYS.indexOf(key) === -1) {
          try { localStorage.setItem('jane-booking-' + key, JSON.stringify(val)); } catch (e) {}
        }
      } else {
        /* Firebase vazio → tenta localStorage como último recurso */
        console.log('[Booking] Firebase vazio:', key, '| tentando localStorage...');
        var local = null;
        try { local = JSON.parse(localStorage.getItem('jane-booking-' + key)); } catch (e) {}
        if (local) {
          console.log('[Booking] localStorage usado:', key, '| itens:', Array.isArray(local) ? local.length : typeof local);
          _cache[key] = local;
        } else {
          console.log('[Booking] Nenhum dado encontrado para:', key);
        }
      }
      _loaded[key] = true;
    }

    keys.forEach(function (key) {
      if (_db) {
        /* 1) Tenta SDK Firebase */
        var sdkDone = false;
        var sdkTimeout = setTimeout(function () {
          if (sdkDone) return;
          sdkDone = true;
          console.warn('[Booking] SDK timeout (2s) para', key, '| tentando REST...');
          _restGetWithTimeout(key, 5000).then(function (val) {
            console.log('[Carregando Servicos do Firebase REST]:', key, '|', JSON.stringify(val).substring(0, 200));
            _processVal(key, val, 'REST');
            done();
          }).catch(function (e) {
            console.error('[Booking] REST ERRO:', key, e.message || e);
            _processVal(key, null, 'nenhum');
            done();
          });
        }, 2000);

        _db.ref('jane-booking/' + key).once('value').then(function (snap) {
          if (sdkDone) return;
          sdkDone = true;
          clearTimeout(sdkTimeout);
          var val = snap.val();
          console.log('[Carregando Servicos do Firebase]:', key, '|', JSON.stringify(val).substring(0, 200));
          _processVal(key, val, 'SDK');
          done();
        }).catch(function (e) {
          if (sdkDone) return;
          sdkDone = true;
          clearTimeout(sdkTimeout);
          console.error('[Booking] SDK ERRO:', key, e.message || e);
          _restGetWithTimeout(key, 5000).then(function (val) {
            console.log('[Carregando Servicos do Firebase REST]:', key, '|', JSON.stringify(val).substring(0, 200));
            _processVal(key, val, 'REST-fallback');
            done();
          }).catch(function (e2) {
            _processVal(key, null, 'nenhum');
            done();
          });
        });
      } else {
        /* SDK desconectado: REST direto */
        _restGetWithTimeout(key, 5000).then(function (val) {
          console.log('[Carregando Servicos do Firebase REST]:', key, '|', JSON.stringify(val).substring(0, 200));
          _processVal(key, val, 'REST-offline');
          done();
        }).catch(function () {
          var localFinal = null;
          try { localFinal = JSON.parse(localStorage.getItem('jane-booking-' + key)); } catch (e) {}
          if (!localFinal) {
            try { localFinal = JSON.parse(localStorage.getItem('undefined' + key)); } catch (e) {}
          }
          if (localFinal) _cache[key] = localFinal;
          _loaded[key] = true;
          done();
        });
      }
    });
  }


  /* Fallback localStorage (se Firebase não carregar) */
  function _initLocalStorageFallback() {
    _initialized = true;
    _db = null;
    ['agendamentos', 'clientes', 'servicos', 'bloqueios', 'lista_espera'].forEach(function (key) {
      try { _cache[key] = JSON.parse(localStorage.getItem('jane-booking-' + key)); } catch (e) {}
      _loaded[key] = true;
    });
  }
  var DEFAULT_SERVICOS = [
    { ordem: 1,  nome: 'Alisamento orgânico',                  preco: 'A partir de R$ 200,00', duracao: '2h 55min', duracao_min: 175, diasRetorno: 90,  nota: 'Os valores são a partir, consulte nossos preços antes de agendar.' },
    { ordem: 2,  nome: 'Botox',                                 preco: 'A partir de R$ 130,00', duracao: '2h',       duracao_min: 120, diasRetorno: 60,  nota: 'Valor a partir, depende do tamanho e quantidade de cabelo.' },
    { ordem: 3,  nome: 'Corte',                                 preco: 'A partir de R$ 50,00',  duracao: '1h',       duracao_min: 60,  diasRetorno: 30,  nota: 'Lavar + cortar (Escova fica à parte).' },
    { ordem: 4,  nome: 'Escova com chapinha',                   preco: 'A partir de R$ 50,00',  duracao: '1h',       duracao_min: 60,  diasRetorno: 21,  nota: 'Valores a partir.' },
    { ordem: 5,  nome: 'Hidratação',                            preco: 'A partir de R$ 50,00',  duracao: '30min',    duracao_min: 30,  diasRetorno: 15,  nota: 'Sem escova.' },
    { ordem: 6,  nome: 'Luzes',                                 preco: 'A partir de R$ 450,00', duracao: '6h',       duracao_min: 360, diasRetorno: 90,  nota: 'Luzes + tintura + tratamento + escova. Valores a partir, depende da quantidade que vai puxar no cabelo.' },
    { ordem: 7,  nome: 'Luzes Masculino',                       preco: 'A partir de R$ 150,00', duracao: '1h 05min', duracao_min: 65,  diasRetorno: 60,  nota: '' },
    { ordem: 8,  nome: 'Matização para Loiros',                  preco: 'A partir de R$ 60,00',  duracao: '30min',    duracao_min: 30,  diasRetorno: 30,  nota: '' },
    { ordem: 9,  nome: 'Mega Hair (Colocação - Cápsulas)',       preco: 'Consulte',              duracao: '6h',       duracao_min: 360, diasRetorno: 120, nota: 'A partir de 100 gramas + preparação das cápsulas (Colocação).' },
    { ordem: 10, nome: 'Mega Hair (Ponto Americano)',             preco: 'Consulte',              duracao: '1h',       duracao_min: 60,  diasRetorno: 60,  nota: '' },
    { ordem: 11, nome: 'Morena Iluminada',                       preco: 'A partir de R$ 450,00', duracao: '4h 50min', duracao_min: 290, diasRetorno: 90,  nota: 'Usamos mais tintas que o comum. Valor referente às mechas no papel personalizado + tratamentos + escova e finalização.' },
    { ordem: 12, nome: 'Pacote de Tratamento Robson Peluquero',  preco: 'A partir de R$ 350,00', duracao: '30min (por sessão)', duracao_min: 30, diasRetorno: 30, nota: 'Pacote com 4 sessões (1 mês de tratamento). Valor à vista.' },
    { ordem: 13, nome: 'Progressiva Japonesa Liso Lambido',      preco: 'A partir de R$ 140,00', duracao: '2h',       duracao_min: 120, diasRetorno: 90,  nota: 'Valor a partir, depende do tamanho e quantidade do cabelo.' },
    { ordem: 14, nome: 'Progressiva Sem Formol',                 preco: 'A partir de R$ 200,00', duracao: '3h',       duracao_min: 180, diasRetorno: 90,  nota: 'Valor a partir, depende do tamanho e quantidade do cabelo.' },
    { ordem: 15, nome: 'Reconstrução Robson Peluquero Carvão Ativado', preco: 'A partir de R$ 150,00', duracao: '1h', duracao_min: 60, diasRetorno: 30, nota: 'Detox e reconstrói a fibra. Valor a partir.' },
    { ordem: 16, nome: 'Reconstrução Robson Peluquero',          preco: 'A partir de R$ 100,00', duracao: '1h',       duracao_min: 60,  diasRetorno: 30,  nota: '' },
    { ordem: 17, nome: 'Reconstrução Robson Extreme',            preco: 'A partir de R$ 100,00', duracao: '1h',       duracao_min: 60,  diasRetorno: 30,  nota: 'Valores a partir.' },
    { ordem: 18, nome: 'Reconstrução Robson Master Love',        preco: 'A partir de R$ 100,00', duracao: '1h 20min', duracao_min: 80,  diasRetorno: 30,  nota: 'Valores a partir.' },
    { ordem: 19, nome: 'Selagem',                                preco: 'A partir de R$ 150,00', duracao: '2h',       duracao_min: 120, diasRetorno: 90,  nota: 'Valor a partir, depende do tamanho e quantidade do cabelo.' },
    { ordem: 20, nome: 'Teste de Mecha',                         preco: 'A partir de R$ 20,00',  duracao: '2h',       duracao_min: 120, diasRetorno: 14,  nota: '' },
    { ordem: 21, nome: 'Tintura com Tinta do Salão + Escova',    preco: 'A partir de R$ 150,00', duracao: '1h 30min', duracao_min: 90,  diasRetorno: 45,  nota: 'Valores a partir.' },
    { ordem: 22, nome: 'Tintura com Tinta da Cliente + Escova',  preco: 'A partir de R$ 90,00',  duracao: '1h 30min', duracao_min: 90,  diasRetorno: 45,  nota: 'Valores a partir.' },
    { ordem: 23, nome: 'Tintura com Tinta do Salão Sem Escova',  preco: 'A partir de R$ 80,00',  duracao: '40min',    duracao_min: 40,  diasRetorno: 45,  nota: 'Valores a partir.' }
  ];

  /* ================================================================
     SERVIÇOS
     ================================================================ */
  function getServicos() {
    /* 1) Tenta cache em memória */
    var data = getStore('servicos');
    if (data && data.length) {
      console.log('[Booking] getServicos:', data.length, 'itens do cache');
      return data;
    }
    /* 2) Tenta localStorage (salvo na última sessão) */
    var local = null;
    try { local = JSON.parse(localStorage.getItem('jane-booking-servicos')); } catch (e) {}
    if (local && local.length) {
      console.log('[Booking] getServicos:', local.length, 'itens do localStorage');
      _cache['servicos'] = local;
      return toArray(local);
    }
    /* 3) Último recurso: DEFAULT */
    console.log('[Booking] getServicos: sem dados, usando DEFAULT (' + DEFAULT_SERVICOS.length + ' itens)');
    return DEFAULT_SERVICOS.slice();
  }

  function setServicos(lista) {
    return setStore('servicos', lista);
  }

  function getServicoPorNome(nome) {
    return getServicos().find(function (s) { return s.nome === nome; }) || null;
  }

  /* ================================================================
     PROFISSIONAIS
     ================================================================ */
  var DEFAULT_PROFISSIONAIS = [
    { id: '1', nome: 'Jane Barreiros', especialidade: 'Geral', status: 'ativo' }
  ];

  function getProfissionais() {
    var lista = getStore('profissionais');
    if (lista && lista.length) return lista;
    return DEFAULT_PROFISSIONAIS.slice();
  }

  function setProfissionais(lista) {
    return setStore('profissionais', lista);
  }

  /* ================================================================
     SEÇÕES
     ================================================================ */
  var DEFAULT_SECOES = [
    { id: '1', nome: 'Cabelo', ordem: 1 },
    { id: '2', nome: 'Tratamento', ordem: 2 },
    { id: '3', nome: 'Alisamento', ordem: 3 },
    { id: '4', nome: 'Mega Hair', ordem: 4 }
  ];

  function getSecoes() {
    var lista = getStore('secoes');
    if (lista && lista.length) return lista;
    return DEFAULT_SECOES.slice();
  }

  function setSecoes(lista) {
    return setStore('secoes', lista);
  }

  /* ================================================================
     ESTOQUE
     ================================================================ */
  var DEFAULT_ESTOQUE = [
    { id: 'e1',  nome: 'Pó Descolorante Dust Free 500g',           categoria: 'Uso Interno', quantidade: 6,  estoqueMinimo: 2, precoCusto: 65.00,  precoVenda: 0 },
    { id: 'e2',  nome: 'Água Oxigenada 20 Vol 900ml',              categoria: 'Uso Interno', quantidade: 8,  estoqueMinimo: 3, precoCusto: 28.00,  precoVenda: 0 },
    { id: 'e3',  nome: 'Água Oxigenada 30 Vol 900ml',              categoria: 'Uso Interno', quantidade: 2,  estoqueMinimo: 3, precoCusto: 28.00,  precoVenda: 0 },
    { id: 'e4',  nome: 'Kit Progressiva Orgânica 1L',              categoria: 'Uso Interno', quantidade: 4,  estoqueMinimo: 2, precoCusto: 180.00, precoVenda: 0 },
    { id: 'e5',  nome: 'Máscara Reconstrução Profunda 1kg',        categoria: 'Uso Interno', quantidade: 5,  estoqueMinimo: 2, precoCusto: 85.00,  precoVenda: 0 },
    { id: 'e6',  nome: 'Óleo Reparador Sublime 60ml',              categoria: 'Revenda',    quantidade: 12, estoqueMinimo: 4, precoCusto: 35.00,  precoVenda: 79.90 },
    { id: 'e7',  nome: 'Shampoo Pós-Química Home Care 300ml',      categoria: 'Revenda',    quantidade: 10, estoqueMinimo: 3, precoCusto: 30.00,  precoVenda: 68.00 },
    { id: 'e8',  nome: 'Condicionador Pós-Química Home Care 300ml', categoria: 'Revenda',    quantidade: 10, estoqueMinimo: 3, precoCusto: 32.00,  precoVenda: 72.00 },
    { id: 'e9',  nome: 'Protetor Térmico Leave-in 200ml',          categoria: 'Revenda',    quantidade: 3,  estoqueMinimo: 4, precoCusto: 28.00,  precoVenda: 65.00 },
    { id: 'e10', nome: 'Luvas Nitrílicas Pretas P/M/G (Caixa 100un)', categoria: 'Uso Interno', quantidade: 5, estoqueMinimo: 2, precoCusto: 42.00, precoVenda: 0 }
  ];

  function getEstoque() {
    var lista = getStore('estoque');
    if (lista && lista.length) return lista;
    return DEFAULT_ESTOQUE.slice();
  }

  function setEstoque(lista) {
    return setStore('estoque', lista);
  }

  /* ================================================================
     DESPESAS
     ================================================================ */
  function getDespesas() {
    return getStore('despesas') || [];
  }

  function setDespesas(lista) {
    return setStore('despesas', lista);
  }

  /* ================================================================
     CURSO — Vendas do Curso (lucro por venda)
     ================================================================ */
  var CURSO_LUCRO_POR_VENDA = 37.90;

  function getCursoVendas() {
    try {
      var raw = localStorage.getItem('jane-booking-curso_vendas');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { vendas: 0, totalLucro: 0, historico: [] };
  }

  function setCursoVendas(data) {
    try { localStorage.setItem('jane-booking-curso_vendas', JSON.stringify(data)); } catch (e) {}
    if (_db) {
      try { _db.ref('jane-booking/curso_vendas').set(data); } catch (e) {}
    }
    return data;
  }

  function registrarVendaCurso() {
    var data = getCursoVendas();
    data.vendas = (data.vendas || 0) + 1;
    data.totalLucro = parseFloat(((data.totalLucro || 0) + CURSO_LUCRO_POR_VENDA).toFixed(2));
    data.historico = data.historico || [];
    data.historico.push({ data: new Date().toISOString(), valor: CURSO_LUCRO_POR_VENDA });
    setCursoVendas(data);
    return data;
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

  function capitalizarNome(nome) {
    if (!nome || typeof nome !== 'string') return nome;
    return nome.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function nomeFormatado(nome) {
    return capitalizarNome(nome);
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
      cliente_nome: capitalizarNome(dados.cliente_nome),
      cliente_whatsapp: dados.cliente_whatsapp,
      cliente_email: dados.cliente_email || '',
      forma_pagamento: dados.forma_pagamento || '',
      observacoes: dados.observacoes || '',
      origem: dados.origem || '',  // 'online' | 'recepcao' | ''
      status: dados.status || 'pendente',       // pendente | confirmado | em_atendimento | cancelado | concluido
      valor_informado: dados.valor_informado || 0,
      valor_servico: dados.valor_servico || 0,
      valor_produtos: dados.valor_produtos || 0,
      valor_total: dados.valor_total || 0,
      produtos_vendidos: dados.produtos_vendidos || [],
      criado_em: new Date().toISOString()
    };
    lista.push(ag);
    setAgendamentos(lista);
    return ag;
  }

  function editarAgendamento(id, dados) {
    var lista = getAgendamentos();
    lista.forEach(function (a) {
      if (a.id === id) {
        if (dados.data !== undefined) a.data = dados.data;
        if (dados.horario !== undefined) a.horario = dados.horario;
        if (dados.servico !== undefined) a.servico = dados.servico;
        if (dados.duracao_min !== undefined) a.duracao_min = dados.duracao_min;
        if (dados.valor_informado !== undefined) a.valor_informado = dados.valor_informado;
        if (dados.valor_total !== undefined) a.valor_total = dados.valor_total;
        if (dados.profissional !== undefined) a.profissional = dados.profissional;
        if (dados.forma_pagamento !== undefined) a.forma_pagamento = dados.forma_pagamento;
        if (dados.nota !== undefined) a.nota = dados.nota;
        if (dados.status !== undefined) a.status = dados.status;
      }
    });
    setAgendamentos(lista);
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
     Permite até 3 agendamentos simultâneos (3 funcionárias).
     Única regra: serviço deve terminar até HORARIO_FECHAMENTO (19:00).
     ================================================================ */
  var FUNCIONARIAS = 3;
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

        var conflitos = 0;
        for (var i = 0; i < ags.length; i++) {
          var agInicio = horarioParaMinutos(ags[i].horario);
          var agFim = agInicio + ags[i].duracao_min;
          if (slotInicio < agFim && slotFim > agInicio) {
            conflitos++;
          }
        }
        if (conflitos < FUNCIONARIAS) {
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

  function setValorInformado(id, valor) {
    var lista = getAgendamentos();
    lista.forEach(function (a) {
      if (a.id === id) a.valor_informado = valor;
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
      cliente_nome: capitalizarNome(dados.cliente_nome),
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
      existente.nome = capitalizarNome(nome);
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
      nome: capitalizarNome(nome),
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
        if (dados.nome !== undefined) c.nome = capitalizarNome(dados.nome);
        if (dados.email !== undefined) c.email = dados.email;
        if (dados.whatsapp !== undefined) c.whatsapp = dados.whatsapp;
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
    msg += 'Terça a Sábado: 09:00 às 19:00\n';
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
    version: APP_VERSION,
    capitalizarNome: capitalizarNome,
    nomeFormatado: nomeFormatado,
    initFirebase: initFirebase,
    loadAllData: loadAllData,
    listenFirebase: listenFirebase,
    getServicos: getServicos,
    setServicos: setServicos,
    getServicoPorNome: getServicoPorNome,
    getDuracaoServico: getDuracaoServico,
    getAgendamentos: getAgendamentos,
    setAgendamentos: setAgendamentos,
    criarAgendamento: criarAgendamento,
    editarAgendamento: editarAgendamento,
    cancelarAgendamento: cancelarAgendamento,
    concluirAgendamento: concluirAgendamento,
    setAgendamentoStatus: setAgendamentoStatus,
    setValorInformado: setValorInformado,
    agendamentosDoDia: agendamentosDoDia,
    agendamentosDaSemana: agendamentosDaSemana,
    getAgendamentosDoPeriodo: getAgendamentosDoPeriodo,
    getDiasComAgendamento: getDiasComAgendamento,
    getProfissionais: getProfissionais,
    setProfissionais: setProfissionais,
    getSecoes: getSecoes,
    setSecoes: setSecoes,
    getEstoque: getEstoque,
    setEstoque: setEstoque,
    getDespesas: getDespesas,
    setDespesas: setDespesas,
    getCursoVendas: getCursoVendas,
    setCursoVendas: setCursoVendas,
    registrarVendaCurso: registrarVendaCurso,
    CURSO_LUCRO_POR_VENDA: CURSO_LUCRO_POR_VENDA,
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
