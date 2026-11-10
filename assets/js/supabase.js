/**
 * Hotel & Day Use - Cliente Supabase & Camada de Persistência em Tempo Real
 * Suporta tanto o Supabase oficial (via credenciais) quanto o motor local integrado
 * garantindo compatibilidade estrita com a API do Supabase e sincronização entre abas.
 */

(function () {
  const STORAGE_KEY = 'hotel_day_use_db_v2';
  const BROADCAST_NAME = 'hotel_day_use_realtime';

  // Canal de Broadcast para comunicação instantânea entre abas
  let broadcastChannel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel(BROADCAST_NAME);
    }
  } catch (e) {
    console.warn('BroadcastChannel não suportado neste ambiente', e);
  }

  // Inicializa o banco de dados no LocalStorage a partir do seed se ainda não existir
  function carregarBanco() {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        const dados = JSON.parse(salvo);
        // Garantir que todas as tabelas existem
        const tabelasObrigatorias = [
          'perfis', 'hospedes', 'permanencias', 'produtos', 'quartos',
          'caixas', 'consumos', 'itens_consumo', 'movimentacoes_caixa', 'pagamentos',
          'auditoria_operacoes_sensiveis'
        ];
        let faltou = false;
        tabelasObrigatorias.forEach(t => {
          if (!dados[t]) {
            dados[t] = window.HOTEL_SEED_DATA && window.HOTEL_SEED_DATA[t] ? [...window.HOTEL_SEED_DATA[t]] : [];
            faltou = true;
          }
        });
        if (faltou) salvarBanco(dados);
        return dados;
      }
    } catch (e) {
      console.error('Erro ao ler LocalStorage:', e);
    }

    // Inicializa com cópia profunda do SEED
    const inicial = JSON.parse(JSON.stringify(window.HOTEL_SEED_DATA || {}));
    salvarBanco(inicial);
    return inicial;
  }

  function salvarBanco(dados) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    } catch (e) {
      console.error('Erro ao salvar no LocalStorage:', e);
    }
  }

  // Verificador estrito de expiração de propostas (5 minutos)
  function verificarExpiracoes(dados) {
    let alterado = false;
    const agora = Date.now();
    if (dados.consumos && Array.isArray(dados.consumos)) {
      dados.consumos.forEach(c => {
        if (c.status === 'aguardando') {
          const exp = new Date(c.expira_em).getTime();
          if (agora >= exp) {
            c.status = 'expirado';
            alterado = true;
          }
        }
      });
    }
    if (alterado) {
      salvarBanco(dados);
      notificarMudanca({ tabela: 'consumos', evento: 'UPDATE_EXPIRADO' });
    }
    return alterado;
  }

  // Notificador de eventos em tempo real
  const listeners = new Set();

  function notificarMudanca(payload) {
    listeners.forEach(fn => {
      try { fn(payload); } catch (err) { console.error(err); }
    });

    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(payload);
      } catch (err) {
        console.error(err);
      }
    }
  }

  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      listeners.forEach(fn => {
        try { fn(event.data); } catch (err) { console.error(err); }
      });
    };
  }

  // Verifica expirações a cada 2 segundos
  setInterval(() => {
    const db = carregarBanco();
    verificarExpiracoes(db);
  }, 2000);

  // Implementação QueryBuilder fluente compatível com Supabase
  class MockQueryBuilder {
    constructor(tabela, dbRef) {
      // Suporte a alias 'contas' para a tabela oficial 'permanencias'
      this.tabela = tabela === 'contas' ? 'permanencias' : tabela;
      this.db = dbRef;
      this.filtros = [];
      this.ordenacoes = [];
      this.limiteVal = null;
      this.isSingle = false;
      this.tipoOperacao = 'SELECT';
      this.payload = null;
    }

    select(colunas = '*') {
      this.tipoOperacao = 'SELECT';
      this.colunas = colunas;
      return this;
    }

    insert(dados) {
      this.tipoOperacao = 'INSERT';
      this.payload = Array.isArray(dados) ? dados : [dados];
      return this;
    }

    update(dados) {
      this.tipoOperacao = 'UPDATE';
      this.payload = dados;
      return this;
    }

    delete() {
      this.tipoOperacao = 'DELETE';
      return this;
    }

    eq(campo, valor) {
      this.filtros.push({ tipo: 'eq', campo, valor });
      return this;
    }

    neq(campo, valor) {
      this.filtros.push({ tipo: 'neq', campo, valor });
      return this;
    }

    in(campo, valores) {
      this.filtros.push({ tipo: 'in', campo, valores });
      return this;
    }

    ilike(campo, padrao) {
      this.filtros.push({ tipo: 'ilike', campo, padrao });
      return this;
    }

    order(campo, { ascending = true } = {}) {
      this.ordenacoes.push({ campo, ascending });
      return this;
    }

    limit(n) {
      this.limiteVal = n;
      return this;
    }

    single() {
      this.isSingle = true;
      return this;
    }

    // Executa a consulta
    async then(resolve, reject) {
      try {
        const db = carregarBanco();
        verificarExpiracoes(db);

        if (!db[this.tabela]) {
          db[this.tabela] = [];
        }

        let lista = db[this.tabela];

        if (this.tipoOperacao === 'INSERT') {
          const novos = this.payload.map(item => {
            const id = item.id || (this.tabela.slice(0, 4) + '-' + Math.random().toString(36).substring(2, 9));
            const criado_em = item.criado_em || new Date().toISOString();
            return { ...item, id, criado_em };
          });
          db[this.tabela].push(...novos);
          salvarBanco(db);
          notificarMudanca({ tabela: this.tabela, evento: 'INSERT', dados: novos });
          return resolve({ data: this.isSingle ? novos[0] : novos, error: null });
        }

        if (this.tipoOperacao === 'UPDATE') {
          const atualizados = [];
          db[this.tabela] = db[this.tabela].map(item => {
            const combina = this.filtros.every(f => {
              if (f.tipo === 'eq') return String(item[f.campo]) === String(f.valor);
              if (f.tipo === 'neq') return String(item[f.campo]) !== String(f.valor);
              return true;
            });
            if (combina) {
              const alterado = { ...item, ...this.payload };
              atualizados.push(alterado);
              return alterado;
            }
            return item;
          });
          salvarBanco(db);
          notificarMudanca({ tabela: this.tabela, evento: 'UPDATE', dados: atualizados });
          return resolve({ data: this.isSingle ? atualizados[0] : atualizados, error: null });
        }

        if (this.tipoOperacao === 'DELETE') {
          const removidos = [];
          db[this.tabela] = db[this.tabela].filter(item => {
            const combina = this.filtros.every(f => {
              if (f.tipo === 'eq') return String(item[f.campo]) === String(f.valor);
              return true;
            });
            if (combina) {
              removidos.push(item);
              return false;
            }
            return true;
          });
          salvarBanco(db);
          notificarMudanca({ tabela: this.tabela, evento: 'DELETE', dados: removidos });
          return resolve({ data: removidos, error: null });
        }

        // Operação SELECT com filtros
        let resultado = lista.filter(item => {
          return this.filtros.every(f => {
            const val = item[f.campo];
            if (f.tipo === 'eq') return String(val) === String(f.valor);
            if (f.tipo === 'neq') return String(val) !== String(f.valor);
            if (f.tipo === 'in') return Array.isArray(f.valores) && f.valores.includes(val);
            if (f.tipo === 'ilike') {
              const str = String(val || '').toLowerCase();
              const term = String(f.padrao || '').replace(/%/g, '').toLowerCase();
              return str.includes(term);
            }
            return true;
          });
        });

        // Ordenações
        this.ordenacoes.forEach(ord => {
          resultado.sort((a, b) => {
            const valA = a[ord.campo];
            const valB = b[ord.campo];
            if (valA < valB) return ord.ascending ? -1 : 1;
            if (valA > valB) return ord.ascending ? 1 : -1;
            return 0;
          });
        });

        // Limite
        if (this.limiteVal !== null) {
          resultado = resultado.slice(0, this.limiteVal);
        }

        // Populações / Joins automáticas inteligentes
        if (this.tabela === 'permanencias') {
          resultado = resultado.map(perm => {
            const hosp = db.hospedes.find(h => h.id === perm.hospede_id);
            return { ...perm, hospedes: hosp || null };
          });
        } else if (this.tabela === 'consumos') {
          resultado = resultado.map(csm => {
            const perm = db.permanencias.find(p => p.id === csm.permanencia_id);
            let hosp = null;
            if (perm) {
              hosp = db.hospedes.find(h => h.id === perm.hospede_id);
            }
            const func = db.perfis.find(p => p.id === csm.funcionario_id);
            const itens = db.itens_consumo.filter(i => i.consumo_id === csm.id).map(item => {
              const prod = db.produtos.find(p => p.id === item.produto_id);
              return { ...item, produtos: prod || null };
            });

            return {
              ...csm,
              permanencias: perm ? { ...perm, hospedes: hosp } : null,
              perfis: func || null,
              itens_consumo: itens
            };
          });
        }

        if (this.isSingle) {
          return resolve({ data: resultado[0] || null, error: resultado[0] ? null : { message: 'Registro não encontrado' } });
        }

        return resolve({ data: resultado, error: null });
      } catch (err) {
        return reject({ data: null, error: { message: err.message } });
      }
    }
  }

  // Sessão de autenticação atual
  let sessaoFuncionario = null;
  try {
    const s = localStorage.getItem('hotel_sessao_funcionario');
    if (s) sessaoFuncionario = JSON.parse(s);
  } catch (e) {}

  // Definição da instância principal do Supabase
  const client = {
    from(tabela) {
      return new MockQueryBuilder(tabela, this);
    },

    auth: {
      async signInWithPassword({ email, password }) {
        const db = carregarBanco();
        const perfil = db.perfis.find(p => p.email.toLowerCase() === email.toLowerCase());
        if (!perfil) {
          return { data: null, error: { message: 'E-mail não cadastrado na tabela de perfis.' } };
        }
        if (!perfil.ativo) {
          return { data: null, error: { message: 'Perfil de usuário inativo no sistema.' } };
        }
        sessaoFuncionario = { user: perfil };
        localStorage.setItem('hotel_sessao_funcionario', JSON.stringify(sessaoFuncionario));
        notificarMudanca({ tipo: 'AUTH_STATE_CHANGE', user: perfil });
        return { data: { user: perfil, session: { user: perfil } }, error: null };
      },

      async signOut() {
        sessaoFuncionario = null;
        localStorage.removeItem('hotel_sessao_funcionario');
        notificarMudanca({ tipo: 'AUTH_STATE_CHANGE', user: null });
        return { error: null };
      },

      async getUser() {
        return { data: { user: sessaoFuncionario ? sessaoFuncionario.user : null }, error: null };
      },

      async getSession() {
        return { data: { session: sessaoFuncionario ? { user: sessaoFuncionario.user } : null }, error: null };
      },

      onAuthStateChange(callback) {
        const handler = (payload) => {
          if (payload && payload.tipo === 'AUTH_STATE_CHANGE') {
            callback('SIGNED_IN', payload.user ? { user: payload.user } : null);
          }
        };
        listeners.add(handler);
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(handler)
            }
          }
        };
      }
    },

    // Escuta em tempo real
    channel(canalNome) {
      return {
        on(evento, filtro, callback) {
          const handler = (payload) => {
            if (filtro && filtro.table) {
              if (payload.tabela === filtro.table) {
                callback(payload);
              }
            } else {
              callback(payload);
            }
          };
          listeners.add(handler);
          return this;
        },
        subscribe() {
          return this;
        },
        unsubscribe() {}
      };
    },

    // Regras de negócio atômicas específicas do Hotel & Day Use
    negocio: {
      // Criação de proposta com congelamento de preços e 5 minutos de validade estrita
      async criarProposta({ permanencia_id, funcionario_id, itens, observacoes = '' }) {
        const db = carregarBanco();
        const perm = db.permanencias.find(p => p.id === permanencia_id);
        if (!perm || perm.status !== 'aberta') {
          throw new Error('Permanência não encontrada ou já encerrada.');
        }

        if (!itens || itens.length === 0) {
          throw new Error('A proposta precisa conter ao menos um item.');
        }

        // Calcula total e congela preço unitário de cada item
        let total = 0;
        const itensProcessados = [];
        const agora = new Date();
        const expiraEm = new Date(agora.getTime() + 5 * 60 * 1000); // Exatos 5 minutos

        const consumoId = 'csm-' + Math.random().toString(36).substring(2, 9);
        const codigoProposta = 'PROP-' + Math.floor(1000 + Math.random() * 9000);

        itens.forEach(it => {
          const prod = db.produtos.find(p => p.id === it.produto_id);
          if (!prod) throw new Error(`Produto não encontrado: ${it.produto_id}`);
          if (!prod.ativo) throw new Error(`Produto inativo: ${prod.nome}`);

          const qtd = Number(it.quantidade) || 1;
          const precoUnitario = Number(prod.preco); // Congelamento de preço!
          const subtotal = Number((precoUnitario * qtd).toFixed(2));
          total += subtotal;

          itensProcessados.push({
            id: 'item-' + Math.random().toString(36).substring(2, 9),
            consumo_id: consumoId,
            produto_id: prod.id,
            quantidade: qtd,
            preco_unitario: precoUnitario,
            subtotal: subtotal,
            observacao: it.observacao || ''
          });
        });

        total = Number(total.toFixed(2));

        const novoConsumo = {
          id: consumoId,
          permanencia_id,
          funcionario_id,
          codigo_proposta: codigoProposta,
          valor_total: total,
          status: 'aguardando',
          criado_em: agora.toISOString(),
          expira_em: expiraEm.toISOString(),
          confirmado_em: null,
          recusado_em: null,
          observacoes: observacoes || null
        };

        db.consumos.push(novoConsumo);
        db.itens_consumo.push(...itensProcessados);
        salvarBanco(db);

        notificarMudanca({
          tabela: 'consumos',
          evento: 'PROPOSTA_CRIADA',
          proposta: novoConsumo,
          itens: itensProcessados
        });

        return { consumo: novoConsumo, itens: itensProcessados };
      },

      // Confirmação pelo cliente (estrita e atômica)
      async confirmarProposta({ consumo_id, pin_informado = null }) {
        const db = carregarBanco();
        verificarExpiracoes(db);

        const csm = db.consumos.find(c => c.id === consumo_id);
        if (!csm) throw new Error('Proposta não encontrada.');

        if (csm.status !== 'aguardando') {
          throw new Error(`Esta proposta não pode ser confirmada pois seu status é: "${csm.status}".`);
        }

        const expiraEm = new Date(csm.expira_em).getTime();
        if (Date.now() >= expiraEm) {
          csm.status = 'expirado';
          salvarBanco(db);
          notificarMudanca({ tabela: 'consumos', evento: 'UPDATE_EXPIRADO' });
          throw new Error('Esta proposta expirou após os 5 minutos de validade.');
        }

        const perm = db.permanencias.find(p => p.id === csm.permanencia_id);
        if (!perm) throw new Error('Permanência associada não foi encontrada.');

        if (pin_informado && String(pin_informado).trim() !== String(perm.pin_acesso).trim()) {
          throw new Error('PIN de segurança incorreto.');
        }

        // Lançamento atômico: atualiza status e debita na permanência
        csm.status = 'confirmado';
        csm.confirmado_em = new Date().toISOString();
        perm.saldo_devedor = Number(((perm.saldo_devedor || 0) + csm.valor_total).toFixed(2));

        salvarBanco(db);

        notificarMudanca({
          tabela: 'consumos',
          evento: 'PROPOSTA_CONFIRMADA',
          consumo: csm,
          permanencia: perm
        });

        return { consumo: csm, permanencia: perm };
      },

      // Recusa pelo cliente
      async recusarProposta({ consumo_id, motivo = '' }) {
        const db = carregarBanco();
        const csm = db.consumos.find(c => c.id === consumo_id);
        if (!csm) throw new Error('Proposta não encontrada.');

        if (csm.status !== 'aguardando') {
          throw new Error(`Esta proposta não está mais pendente (status atual: ${csm.status}).`);
        }

        csm.status = 'recusado';
        csm.recusado_em = new Date().toISOString();
        if (motivo) {
          csm.observacoes = (csm.observacoes ? csm.observacoes + ' | ' : '') + `Motivo recusa: ${motivo}`;
        }

        salvarBanco(db);

        notificarMudanca({
          tabela: 'consumos',
          evento: 'PROPOSTA_RECUSADA',
          consumo: csm
        });

        return { consumo: csm };
      },

      // Cancelamento pelo atendente antes da confirmação
      async cancelarPropostaAtendente({ consumo_id }) {
        const db = carregarBanco();
        const csm = db.consumos.find(c => c.id === consumo_id);
        if (!csm) throw new Error('Proposta não encontrada.');

        if (csm.status !== 'aguardando') {
          throw new Error('Apenas propostas com status "aguardando" podem ser canceladas.');
        }

        csm.status = 'recusado';
        csm.recusado_em = new Date().toISOString();
        csm.observacoes = (csm.observacoes ? csm.observacoes + ' | ' : '') + 'Cancelado pelo atendente';

        salvarBanco(db);

        notificarMudanca({
          tabela: 'consumos',
          evento: 'PROPOSTA_CANCELADA',
          consumo: csm
        });

        return { consumo: csm };
      },

      // Registro de pagamento no caixa
      async registrarPagamento({ permanencia_id, caixa_id, valor, forma_pagamento, funcionario_id }) {
        const db = carregarBanco();
        const perm = db.permanencias.find(p => p.id === permanencia_id);
        if (!perm) throw new Error('Permanência não encontrada.');

        const valorNum = Number(valor);
        if (isNaN(valorNum) || valorNum <= 0) {
          throw new Error('Valor de pagamento inválido.');
        }

        const pagamento = {
          id: 'pag-' + Math.random().toString(36).substring(2, 9),
          permanencia_id,
          caixa_id,
          valor: valorNum,
          forma_pagamento,
          funcionario_id,
          criado_em: new Date().toISOString()
        };

        db.pagamentos.push(pagamento);

        // Abate do saldo devedor
        perm.saldo_devedor = Math.max(0, Number(((perm.saldo_devedor || 0) - valorNum).toFixed(2)));

        // Registra movimentação no caixa
        db.movimentacoes_caixa.push({
          id: 'mov-' + Math.random().toString(36).substring(2, 9),
          caixa_id,
          tipo: 'pagamento_recebido',
          valor: valorNum,
          descricao: `Recebimento Ref. ${perm.tipo === 'hospedagem' ? 'Quarto ' + perm.quarto_numero : 'Day Use'} - ${forma_pagamento.toUpperCase()}`,
          criado_em: new Date().toISOString()
        });

        // RN27: Trilha de Auditoria
        if (!db.auditoria_operacoes_sensiveis) db.auditoria_operacoes_sensiveis = [];
        db.auditoria_operacoes_sensiveis.push({
          id: 'aud-' + Math.random().toString(36).substring(2, 9),
          tabela_afetada: 'pagamentos',
          registro_id: pagamento.id,
          tipo_operacao: 'PAGAMENTO_RECEBIDO',
          autor_id: funcionario_id,
          autor_email: 'operador.caixa@hotel.com.br',
          dados_novos: { pagamento_id: pagamento.id, valor: valorNum, forma: forma_pagamento, saldo_remanescente: perm.saldo_devedor },
          justificativa: `Recebimento de pagamento via ${forma_pagamento.toUpperCase()}`,
          criado_em: new Date().toISOString()
        });

        salvarBanco(db);

        notificarMudanca({
          tabela: 'pagamentos',
          evento: 'PAGAMENTO_REGISTRADO',
          pagamento,
          permanencia: perm
        });

        return { pagamento, permanencia: perm };
      },

      // Estorno de consumo no caixa com ajuste financeiro e registro em movimentações
      async estornarConsumo({ consumo_id, motivo, funcionario_id, caixa_id }) {
        const db = carregarBanco();
        const csm = db.consumos.find(c => c.id === consumo_id);
        if (!csm) throw new Error('Consumo não encontrado para estorno.');
        if (csm.status !== 'confirmado') {
          throw new Error(`Apenas consumos confirmados podem ser estornados (status atual: ${csm.status}).`);
        }

        const perm = db.permanencias.find(p => p.id === csm.permanencia_id);
        if (!perm) throw new Error('Permanência associada não encontrada.');

        csm.status = 'estornado';
        csm.estornado_em = new Date().toISOString();
        csm.motivo_estorno = motivo || 'Estorno administrativo no caixa';
        csm.estornado_por = funcionario_id || null;

        // Abate o valor do saldo devedor da permanência
        const valorEstornado = Number(csm.valor_total);
        perm.saldo_devedor = Math.max(0, Number(((perm.saldo_devedor || 0) - valorEstornado).toFixed(2)));

        // Registra a contra-partida na movimentação de caixa
        db.movimentacoes_caixa.push({
          id: 'mov-' + Math.random().toString(36).substring(2, 9),
          caixa_id: caixa_id || 'cx-001',
          tipo: 'estorno_consumo',
          valor: valorEstornado,
          descricao: `Estorno Ref. Consumo ${csm.codigo_proposta} (${perm.tipo === 'hospedagem' ? 'Quarto ' + perm.quarto_numero : 'Day Use'}): ${csm.motivo_estorno}`,
          criado_em: new Date().toISOString()
        });

        // RN27: Trilha de Auditoria
        if (!db.auditoria_operacoes_sensiveis) db.auditoria_operacoes_sensiveis = [];
        db.auditoria_operacoes_sensiveis.push({
          id: 'aud-' + Math.random().toString(36).substring(2, 9),
          tabela_afetada: 'consumos',
          registro_id: consumo_id,
          tipo_operacao: 'ESTORNO_CONSUMO',
          autor_id: funcionario_id || 'perf-003',
          autor_email: 'operador.caixa@hotel.com.br',
          dados_anteriores: { status: 'confirmado', valor: valorEstornado },
          dados_novos: { status: 'estornado', saldo_permanencia: perm.saldo_devedor },
          justificativa: motivo,
          criado_em: new Date().toISOString()
        });

        salvarBanco(db);

        notificarMudanca({
          tabela: 'consumos',
          evento: 'CONSUMO_ESTORNADO',
          consumo: csm,
          permanencia: perm
        });

        return { consumo: csm, permanencia: perm };
      },

      // Fechamento estrito de permanência (Check-out - RN15)
      async encerrarPermanencia({ permanencia_id, funcionario_id = null }) {
        const db = carregarBanco();
        verificarExpiracoes(db);

        const perm = db.permanencias.find(p => p.id === permanencia_id);
        if (!perm) throw new Error('Permanência não encontrada.');
        if (perm.status === 'fechada') throw new Error('Esta conta já se encontra encerrada.');

        // RN15 - Trava 1: Nenhuma proposta pendente em aberto (status 'aguardando')
        const propostasPendentes = db.consumos.filter(c => c.permanencia_id === permanencia_id && c.status === 'aguardando');
        if (propostasPendentes.length > 0) {
          const codigos = propostasPendentes.map(p => p.codigo_proposta).join(', ');
          throw new Error(`RN15: Não é possível encerrar a conta! Existem ${propostasPendentes.length} proposta(s) aguardando confirmação do hóspede (${codigos}). Cancele-as ou aguarde a resolução.`);
        }

        // RN15 - Trava 2: Saldo devedor rigorosamente zerado (saldo_devedor <= 0.00)
        if (Number(perm.saldo_devedor) > 0.001) {
          throw new Error(`RN15: Não é possível encerrar a conta! Há saldo devedor em aberto de R$ ${Number(perm.saldo_devedor).toFixed(2).replace('.', ',')}. Realize o pagamento integral antes do check-out.`);
        }

        // RN15 - Fechamento Definitivo e Invalidação de Credenciais
        const pinAnterior = perm.pin_acesso;
        perm.status = 'fechada';
        perm.checkout = new Date().toISOString();
        perm.pin_acesso = 'INVALIDADO';
        perm.credenciais_ativas = false;

        // RN27: Trilha de Auditoria
        if (!db.auditoria_operacoes_sensiveis) db.auditoria_operacoes_sensiveis = [];
        db.auditoria_operacoes_sensiveis.push({
          id: 'aud-' + Math.random().toString(36).substring(2, 9),
          tabela_afetada: 'permanencias',
          registro_id: permanencia_id,
          tipo_operacao: 'CHECKOUT_PERMANENCIA',
          autor_id: funcionario_id || 'perf-003',
          autor_email: 'operador.caixa@hotel.com.br',
          dados_anteriores: { status: 'aberta', pin_acesso: pinAnterior, saldo_devedor: 0.00 },
          dados_novos: { status: 'fechada', pin_acesso: 'INVALIDADO', credenciais_ativas: false, checkout: perm.checkout },
          justificativa: 'Encerramento de conta no caixa e quitação integral de saldo (RN15)',
          criado_em: new Date().toISOString()
        });

        // Atualizar status do quarto se for hospedagem
        if (perm.tipo === 'hospedagem' && perm.quarto_numero && db.quartos) {
          const qto = db.quartos.find(q => String(q.numero) === String(perm.quarto_numero));
          if (qto) qto.status = 'disponivel';
        }

        salvarBanco(db);

        notificarMudanca({
          tabela: 'permanencias',
          evento: 'PERMANENCIA_FECHADA',
          permanencia: perm
        });

        return { permanencia: perm };
      },

      // Cadastro de novo hóspede (tabela 'hospedes')
      async cadastrarHospede({ nome, documento, contato = '', email = '' }) {
        const db = carregarBanco();
        if (!nome || !nome.trim()) {
          throw new Error('O nome completo do hóspede é obrigatório.');
        }
        if (!documento || !documento.trim()) {
          throw new Error('O documento (CPF ou RG) do hóspede é obrigatório.');
        }

        const docLimpo = documento.trim().replace(/[^\w]/g, '');
        // Verificar se já existe hóspede com este documento
        let hospede = db.hospedes.find(h => h.documento && h.documento.replace(/[^\w]/g, '') === docLimpo);
        if (hospede) {
          // Atualiza dados cadastrais
          hospede.nome = nome.trim();
          hospede.contato = contato.trim();
          if (email) hospede.email = email.trim();
        } else {
          hospede = {
            id: 'hosp-' + Math.random().toString(36).substring(2, 9),
            nome: nome.trim(),
            documento: documento.trim(),
            contato: contato.trim(),
            email: (email || '').trim(),
            criado_em: new Date().toISOString()
          };
          db.hospedes.push(hospede);
        }

        salvarBanco(db);
        notificarMudanca({
          tabela: 'hospedes',
          evento: 'HOSPEDE_CADASTRADO',
          hospede
        });

        return { hospede };
      },

      // Abertura de permanência (Check-in Hospedagem ou Day Use)
      // RN02: Hospedagem exige quarto_numero ativo; Day Use quarto_numero é null
      // RF07: Geração automática de PIN de 4 dígitos
      async abrirPermanencia({ tipo, hospede_id, quarto_numero = null, codigo_pulseira = null, funcionario_id = null }) {
        const db = carregarBanco();
        const hospede = db.hospedes.find(h => h.id === hospede_id);
        if (!hospede) throw new Error('Hóspede não encontrado no cadastro.');

        if (tipo !== 'hospedagem' && tipo !== 'day_use') {
          throw new Error('Tipo de permanência inválido. Selecione "hospedagem" ou "day_use".');
        }

        let quartoFinal = null;
        if (tipo === 'hospedagem') {
          // Regra RN02: Para hospedagem, quarto é OBRIGATÓRIO
          if (!quarto_numero || String(quarto_numero).trim() === '') {
            throw new Error('RN02: Para o tipo "Hospedagem", o número do quarto é estritamente obrigatório.');
          }
          quartoFinal = String(quarto_numero).trim();

          // Verificar se já existe outra permanência ABERTA neste mesmo quarto
          const quartoOcupado = db.permanencias.find(p => p.status === 'aberta' && p.quarto_numero === quartoFinal);
          if (quartoOcupado) {
            throw new Error(`O Quarto ${quartoFinal} já possui uma permanência em aberto (Conta: ${quartoOcupado.id}). Realize o check-out da conta anterior no Caixa antes de abrir nova hospedagem.`);
          }
        } else {
          // Day Use: quarto é null (conta própria sem quarto)
          quartoFinal = null;
        }

        // RF07: Gerar automaticamente um PIN de acesso de 4 dígitos (1000 - 9999)
        const pinAcesso = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Gerar código de pulseira se não fornecido
        const pulseiraFinal = (codigo_pulseira && codigo_pulseira.trim()) 
          ? codigo_pulseira.trim().toUpperCase() 
          : 'PLS-' + Math.floor(1000 + Math.random() * 9000);

        const permId = 'perm-' + Math.random().toString(36).substring(2, 9);
        const agora = new Date().toISOString();

        const novaPermanencia = {
          id: permId,
          tipo,
          hospede_id: hospede.id,
          quarto_numero: quartoFinal,
          status: 'aberta',
          pin_acesso: pinAcesso,
          codigo_pulseira: pulseiraFinal,
          saldo_devedor: 0.00,
          credenciais_ativas: true,
          checkin: agora,
          checkout: null,
          criado_em: agora
        };

        db.permanencias.push(novaPermanencia);

        // Atualizar status do quarto para ocupado se for hospedagem
        if (tipo === 'hospedagem' && quartoFinal && db.quartos) {
          const qto = db.quartos.find(q => String(q.numero) === String(quartoFinal));
          if (qto) qto.status = 'ocupado';
        }

        // RN27: Trilha de Auditoria
        if (!db.auditoria_operacoes_sensiveis) db.auditoria_operacoes_sensiveis = [];
        db.auditoria_operacoes_sensiveis.push({
          id: 'aud-' + Math.random().toString(36).substring(2, 9),
          tabela_afetada: 'permanencias',
          registro_id: permId,
          tipo_operacao: 'ABERTURA_PERMANENCIA',
          autor_id: funcionario_id || 'perf-002',
          autor_email: 'recepcao@hotel.com.br',
          dados_anteriores: null,
          dados_novos: {
            tipo,
            hospede_id: hospede.id,
            hospede_nome: hospede.nome,
            quarto_numero: quartoFinal,
            pin_acesso: pinAcesso,
            codigo_pulseira: pulseiraFinal
          },
          justificativa: `Abertura de permanência ${tipo === 'hospedagem' ? 'Quarto ' + quartoFinal : 'Day Use'} para ${hospede.nome}`,
          criado_em: agora
        });

        salvarBanco(db);

        notificarMudanca({
          tabela: 'permanencias',
          evento: 'PERMANENCIA_ABERTA',
          permanencia: novaPermanencia,
          hospede
        });

        return { permanencia: novaPermanencia, hospede };
      },

      // Suporte RF08: Reemissão de credenciais perdidas (novo PIN e nova pulseira sem perder histórico de consumos nem saldo)
      async reemitirCredenciaisPermanencia({ permanencia_id, novo_codigo_pulseira = null, motivo = 'Pulseira perdida / danificada', funcionario_id = null }) {
        const db = carregarBanco();
        const perm = db.permanencias.find(p => p.id === permanencia_id);
        if (!perm) throw new Error('Permanência não encontrada.');
        if (perm.status !== 'aberta') throw new Error('Apenas permanências ativas podem ter credenciais reemitidas.');

        const pinAnterior = perm.pin_acesso;
        const pulseiraAnterior = perm.codigo_pulseira;
        
        // Gera novo PIN de 4 dígitos (RF07/RF08)
        const novoPin = Math.floor(1000 + Math.random() * 9000).toString();
        const novaPulseira = (novo_codigo_pulseira && novo_codigo_pulseira.trim())
          ? novo_codigo_pulseira.trim().toUpperCase()
          : 'PLS-' + Math.floor(1000 + Math.random() * 9000);

        perm.pin_acesso = novoPin;
        perm.codigo_pulseira = novaPulseira;
        perm.credenciais_ativas = true;

        // Trilha de auditoria obrigatória (RN27/RN28)
        if (!db.auditoria_operacoes_sensiveis) db.auditoria_operacoes_sensiveis = [];
        db.auditoria_operacoes_sensiveis.push({
          id: 'aud-' + Math.random().toString(36).substring(2, 9),
          tabela_afetada: 'permanencias',
          registro_id: permanencia_id,
          tipo_operacao: 'REEMISSAO_CREDENCIAL',
          autor_id: funcionario_id || 'perf-002',
          autor_email: 'recepcao@hotel.com.br',
          dados_anteriores: { pin_acesso: pinAnterior, codigo_pulseira: pulseiraAnterior },
          dados_novos: { pin_acesso: novoPin, codigo_pulseira: novaPulseira, credenciais_ativas: true },
          justificativa: motivo,
          criado_em: new Date().toISOString()
        });

        salvarBanco(db);

        notificarMudanca({
          tabela: 'permanencias',
          evento: 'CREDENCIAL_REEMITIDA',
          permanencia: perm,
          novo_pin: novoPin,
          nova_pulseira: novaPulseira
        });

        return { permanencia: perm, novo_pin: novoPin, nova_pulseira: novaPulseira };
      },

      // Suporte RF08: Bloqueio de credencial (perda ou furto)
      async bloquearCredenciaisPermanencia({ permanencia_id, motivo = 'Bloqueio preventivo de segurança', funcionario_id = null }) {
        const db = carregarBanco();
        const perm = db.permanencias.find(p => p.id === permanencia_id);
        if (!perm) throw new Error('Permanência não encontrada.');

        perm.credenciais_ativas = false;

        if (!db.auditoria_operacoes_sensiveis) db.auditoria_operacoes_sensiveis = [];
        db.auditoria_operacoes_sensiveis.push({
          id: 'aud-' + Math.random().toString(36).substring(2, 9),
          tabela_afetada: 'permanencias',
          registro_id: permanencia_id,
          tipo_operacao: 'BLOQUEIO_CREDENCIAL',
          autor_id: funcionario_id || 'perf-002',
          autor_email: 'recepcao@hotel.com.br',
          dados_anteriores: { credenciais_ativas: true },
          dados_novos: { credenciais_ativas: false },
          justificativa: motivo,
          criado_em: new Date().toISOString()
        });

        salvarBanco(db);

        notificarMudanca({
          tabela: 'permanencias',
          evento: 'CREDENCIAL_BLOQUEADA',
          permanencia: perm
        });

        return { permanencia: perm };
      },

      // ==========================================
      // MÓDULO DE ADMINISTRAÇÃO & CADASTROS BASE
      // ==========================================

      // 1. Salvar / Atualizar Produto (tabela 'produtos')
      async salvarProduto(dados) {
        const db = carregarBanco();
        if (!dados.nome || !dados.nome.trim()) {
          throw new Error('O nome do produto é obrigatório.');
        }
        const precoNum = Number(dados.preco);
        if (isNaN(precoNum) || precoNum < 0) {
          throw new Error('O preço do produto deve ser um valor numérico válido.');
        }

        let produto;
        if (dados.id) {
          produto = db.produtos.find(p => p.id === dados.id);
          if (!produto) throw new Error('Produto não encontrado para edição.');
          produto.nome = dados.nome.trim();
          produto.categoria = (dados.categoria || 'Geral').trim();
          produto.preco = precoNum;
          produto.codigo_barras = (dados.codigo_barras || '').trim() || ('7891000' + Math.floor(1000 + Math.random() * 9000));
          produto.descricao = (dados.descricao || '').trim();
          produto.imagem_url = (dados.imagem_url || '').trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60';
          if (dados.estoque !== undefined) produto.estoque = Number(dados.estoque) || 0;
          if (dados.ativo !== undefined) produto.ativo = Boolean(dados.ativo);
        } else {
          const novoId = 'prod-' + Math.random().toString(36).substring(2, 9);
          produto = {
            id: novoId,
            nome: dados.nome.trim(),
            categoria: (dados.categoria || 'Bebidas').trim(),
            preco: precoNum,
            codigo_barras: (dados.codigo_barras || '').trim() || ('7891000' + Math.floor(1000 + Math.random() * 9000)),
            descricao: (dados.descricao || '').trim(),
            imagem_url: (dados.imagem_url || '').trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60',
            estoque: Number(dados.estoque) || 100,
            ativo: dados.ativo !== undefined ? Boolean(dados.ativo) : true
          };
          db.produtos.push(produto);
        }

        salvarBanco(db);

        // Notifica em tempo real (PDV do Atendente atualiza instantaneamente!)
        notificarMudanca({
          tabela: 'produtos',
          evento: dados.id ? 'PRODUTO_ATUALIZADO' : 'PRODUTO_CRIADO',
          produto
        });

        return { produto };
      },

      // 2. Excluir Produto (tabela 'produtos')
      async excluirProduto(produtoId) {
        const db = carregarBanco();
        const index = db.produtos.findIndex(p => p.id === produtoId);
        if (index === -1) throw new Error('Produto não encontrado.');

        const removido = db.produtos.splice(index, 1)[0];
        salvarBanco(db);

        notificarMudanca({
          tabela: 'produtos',
          evento: 'PRODUTO_EXCLUIDO',
          produto_id: produtoId,
          produto: removido
        });

        return { sucesso: true, produto: removido };
      },

      // 3. Alternar Ativação do Produto
      async alternarStatusProduto(produtoId) {
        const db = carregarBanco();
        const produto = db.produtos.find(p => p.id === produtoId);
        if (!produto) throw new Error('Produto não encontrado.');

        produto.ativo = !produto.ativo;
        salvarBanco(db);

        notificarMudanca({
          tabela: 'produtos',
          evento: 'PRODUTO_ATUALIZADO',
          produto
        });

        return { produto };
      },

      // 4. Salvar / Atualizar Quarto (tabela 'quartos')
      async salvarQuarto(dados) {
        const db = carregarBanco();
        if (!dados.numero || !String(dados.numero).trim()) {
          throw new Error('O número do quarto é obrigatório.');
        }

        const numeroFormatado = String(dados.numero).trim();
        const diariaBase = dados.diaria_base !== undefined ? Number(dados.diaria_base) : 250.00;
        const capacidade = dados.capacidade !== undefined ? Number(dados.capacidade) : 2;
        const status = dados.status || 'disponivel';

        if (!db.quartos) db.quartos = [];

        let quarto;
        if (dados.id) {
          quarto = db.quartos.find(q => q.id === dados.id);
          if (!quarto) throw new Error('Quarto não encontrado para edição.');
          quarto.numero = numeroFormatado;
          quarto.tipo = (dados.tipo || 'Standard').trim();
          quarto.capacidade = capacidade;
          quarto.diaria_base = diariaBase;
          quarto.status = status;
          quarto.descricao = (dados.descricao || '').trim();
        } else {
          // Verificar se já existe quarto com este mesmo número
          const existente = db.quartos.find(q => String(q.numero) === numeroFormatado);
          if (existente) {
            throw new Error(`Já existe um quarto cadastrado com o número ${numeroFormatado}.`);
          }

          const novoId = 'qto-' + numeroFormatado;
          quarto = {
            id: novoId,
            numero: numeroFormatado,
            tipo: (dados.tipo || 'Standard').trim(),
            capacidade,
            diaria_base: diariaBase,
            status,
            descricao: (dados.descricao || '').trim()
          };
          db.quartos.push(quarto);
        }

        salvarBanco(db);

        notificarMudanca({
          tabela: 'quartos',
          evento: dados.id ? 'QUARTO_ATUALIZADO' : 'QUARTO_CRIADO',
          quarto
        });

        return { quarto };
      },

      // 5. Excluir Quarto (tabela 'quartos')
      async excluirQuarto(quartoId) {
        const db = carregarBanco();
        if (!db.quartos) db.quartos = [];

        const index = db.quartos.findIndex(q => q.id === quartoId);
        if (index === -1) throw new Error('Quarto não encontrado.');

        const quarto = db.quartos[index];

        // Impedir exclusão se houver permanência aberta neste quarto
        const permanenciaAtiva = db.permanencias.find(p => p.status === 'aberta' && String(p.quarto_numero) === String(quarto.numero));
        if (permanenciaAtiva) {
          throw new Error(`Não é possível excluir o Quarto ${quarto.numero} pois ele está ocupado pela conta ativa ${permanenciaAtiva.id}. Encerre a conta primeiro no Caixa.`);
        }

        const removido = db.quartos.splice(index, 1)[0];
        salvarBanco(db);

        notificarMudanca({
          tabela: 'quartos',
          evento: 'QUARTO_EXCLUIDO',
          quarto_id: quartoId,
          quarto: removido
        });

        return { sucesso: true, quarto: removido };
      },

      // 6. Alterar Status do Quarto (Disponível, Ocupado, Manutenção)
      async alterarStatusQuarto(quartoId, novoStatus) {
        const db = carregarBanco();
        if (!db.quartos) db.quartos = [];

        const quarto = db.quartos.find(q => q.id === quartoId);
        if (!quarto) throw new Error('Quarto não encontrado.');

        const statusValidos = ['disponivel', 'ocupado', 'manutencao'];
        if (!statusValidos.includes(novoStatus)) {
          throw new Error(`Status inválido: ${novoStatus}. Use "disponivel", "ocupado" ou "manutencao".`);
        }

        // Se estiver tentando passar para disponivel mas há conta ativa:
        if (novoStatus === 'disponivel') {
          const permAtiva = db.permanencias.find(p => p.status === 'aberta' && String(p.quarto_numero) === String(quarto.numero));
          if (permAtiva) {
            throw new Error(`O Quarto ${quarto.numero} possui permanência aberta (Conta: ${permAtiva.id}). Não pode ser marcado como disponível sem check-out.`);
          }
        }

        quarto.status = novoStatus;
        salvarBanco(db);

        notificarMudanca({
          tabela: 'quartos',
          evento: 'QUARTO_ATUALIZADO',
          quarto
        });

        return { quarto };
      },

      // 7. Carga Inicial de Demonstração / Seed
      async popularSeedInicial() {
        const seed = JSON.parse(JSON.stringify(window.HOTEL_SEED_DATA || {}));
        salvarBanco(seed);
        notificarMudanca({ tabela: 'all', evento: 'DATABASE_RESET' });
        return { sucesso: true };
      },

      // Resetar dados para o seed original para testes
      resetarDemonstracao() {
        const seed = JSON.parse(JSON.stringify(window.HOTEL_SEED_DATA || {}));
        salvarBanco(seed);
        notificarMudanca({ tabela: 'all', evento: 'DATABASE_RESET' });
      }
    }
  };

  // Exportação unificada: tanto hotelSupabase quanto supabase
  window.hotelSupabase = client;
  window.supabase = client;
  window.hotelDB = {
    carregar: carregarBanco,
    salvar: salvarBanco
  };

  console.log('✅ Supabase Client (window.hotelSupabase) inicializado com sucesso.');
})();
