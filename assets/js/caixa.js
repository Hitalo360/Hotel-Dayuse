/**
 * Hotel & Day Use - Módulo de Caixa e Encerramento de Contas (RN15)
 * 
 * Implementação modularizada integrada com o cliente Supabase global (window.hotelSupabase).
 * 
 * Atende aos requisitos:
 * 1. Listagem de contas ativas e em fase de fechamento (Hospedagem com quarto vs Day Use sem quarto).
 * 2. Extrato financeiro detalhado (consumos confirmados, estornos e histórico de pagamentos).
 * 3. Registro de pagamentos com valor, forma (Dinheiro, Cartão, PIX), horário e operador
 *    vinculando às tabelas 'pagamentos' e 'movimentacoes_caixa'.
 * 4. Validação estrita para encerramento (RN15): propostas pendentes resolvidas + saldo zerado +
 *    invalidação definitiva de credenciais e emissão de comprovante oficial.
 */

(function () {
  // Cliente Supabase unificado
  const getSupabase = () => window.hotelSupabase || window.supabase;

  // Estado interno do módulo
  const estado = {
    operadorAtual: null,
    caixaAtivo: null,
    permanencias: [],
    permanenciaSelecionada: null,
    extratoConsumos: [],
    extratoEstornos: [],
    extratoPagamentos: [],
    propostasPendentes: [],
    filtroStatus: 'aberta', // 'aberta' | 'fechamento' | 'todas'
    filtroTipo: 'todos',    // 'todos' | 'hospedagem' | 'day_use'
    termoBusca: '',
    consumoParaEstorno: null
  };

  // Mapeamento dos elementos da UI
  let el = {};

  function mapearElementos() {
    el = {
      // Cabeçalho e Operador
      operadorNome: document.getElementById('caixa-operador-nome'),
      seletorOperador: document.getElementById('seletor-operador'),
      caixaStatus: document.getElementById('caixa-status'),

      // Cards de Resumo Operacional Superior
      cardTotalAbertas: document.getElementById('card-total-abertas'),
      cardTotalHospedagem: document.getElementById('card-total-hospedagem'),
      cardTotalDayUse: document.getElementById('card-total-dayuse'),
      cardSaldoTotalReceber: document.getElementById('card-saldo-total-receber'),
      badgeContadorFiltradas: document.getElementById('badge-contador-filtradas'),

      // Filtros da Coluna Esquerda
      buscaConta: document.getElementById('busca-conta'),
      botoesFiltroStatus: document.querySelectorAll('.btn-filtro-status'),
      botoesFiltroTipo: document.querySelectorAll('.btn-filtro-tipo'),
      listaContasPermanencia: document.getElementById('lista-contas-permanencia'),

      // Painel de Detalhes da Conta (Coluna Direita)
      painelContaVazio: document.getElementById('painel-conta-vazio'),
      painelContaDetalhes: document.getElementById('painel-conta-detalhes'),

      contaTipoBadge: document.getElementById('conta-tipo-badge'),
      contaIdentificacaoTitulo: document.getElementById('conta-identificacao-titulo'),
      contaStatusBadge: document.getElementById('conta-status-badge'),
      contaHospedeNome: document.getElementById('conta-hospede-nome'),
      contaDocumento: document.getElementById('conta-documento'),
      contaPinValor: document.getElementById('conta-pin-valor'),
      contaCheckinData: document.getElementById('conta-checkin-data'),
      contaCheckoutData: document.getElementById('conta-checkout-data'),

      // Cards de Balanço Financeiro da Conta
      resumoTotalConsumo: document.getElementById('resumo-total-consumo'),
      resumoTotalEstorno: document.getElementById('resumo-total-estorno'),
      resumoTotalPago: document.getElementById('resumo-total-pago'),
      resumoSaldoDevedor: document.getElementById('resumo-saldo-devedor'),

      // Trava de Propostas Pendentes (RN15)
      alertaPropostasPendentesRN15: document.getElementById('alerta-propostas-pendentes-rn15'),
      listaPropostasPendentesTravadas: document.getElementById('lista-propostas-pendentes-travadas'),

      // Extrato Cronológico
      containerExtratoDetalhado: document.getElementById('container-extrato-detalhado'),

      // Formulário de Pagamento
      inputValorPagamento: document.getElementById('input-valor-pagamento'),
      selectFormaPagamento: document.getElementById('select-forma-pagamento'),
      btnPreencherSaldoTotal: document.getElementById('btn-preencher-saldo-total'),
      campoCalculoTroco: document.getElementById('campo-calculo-troco'),
      inputDinheiroRecebido: document.getElementById('input-dinheiro-recebido'),
      displayTrocoDevolver: document.getElementById('display-troco-devolver'),
      btnLancarPagamento: document.getElementById('btn-lancar-pagamento'),

      // Encerramento RN15
      badgeCriterioPropostas: document.getElementById('badge-criterio-propostas'),
      badgeCriterioSaldo: document.getElementById('badge-criterio-saldo'),
      criterioPropostasPendentes: document.getElementById('criterio-propostas-pendentes'),
      criterioSaldoZerado: document.getElementById('criterio-saldo-zerado'),
      btnEncerrarPermanenciaRN15: document.getElementById('btn-encerrar-permanencia-rn15'),
      msgStatusEncerramento: document.getElementById('msg-status-encerramento'),

      // Modal de Estorno
      modalEstornoConsumo: document.getElementById('modal-estorno-consumo'),
      estornoPropCodigo: document.getElementById('estorno-prop-codigo'),
      estornoPropValor: document.getElementById('estorno-prop-valor'),
      estornoMotivoInput: document.getElementById('estorno-motivo-input'),
      btnFecharModalEstorno: document.getElementById('btn-fechar-modal-estorno'),
      btnCancelarEstorno: document.getElementById('btn-cancelar-estorno'),
      btnConfirmarEstorno: document.getElementById('btn-confirmar-estorno'),

      // Modal de Recibo Oficial (Check-out)
      modalReciboCheckout: document.getElementById('modal-recibo-checkout'),
      reciboHospedeNome: document.getElementById('recibo-hospede-nome'),
      reciboDocumento: document.getElementById('recibo-documento'),
      reciboIdentificacao: document.getElementById('recibo-identificacao'),
      reciboCheckin: document.getElementById('recibo-checkin'),
      reciboCheckout: document.getElementById('recibo-checkout'),
      reciboOperador: document.getElementById('recibo-operador'),
      reciboTotalConsumido: document.getElementById('recibo-total-consumido'),
      reciboTotalPago: document.getElementById('recibo-total-pago'),
      btnImprimirRecibo: document.getElementById('btn-imprimir-recibo'),
      btnConcluirRecibo: document.getElementById('btn-concluir-recibo'),

      toast: document.getElementById('toast-caixa')
    };
  }

  // Inicialização assíncrona do módulo
  async function inicializar() {
    mapearElementos();
    configurarEventos();

    await carregarOperadores();
    await carregarCaixaAtivo();
    await carregarContasPermanencia();

    // Iniciar escuta de sincronização em tempo real via Supabase
    const db = getSupabase();
    if (db && db.channel) {
      db.channel('caixa-realtime-sub')
        .on('broadcast', { event: '*' }, (payload) => {
          lidarComEventoRealtime(payload);
        })
        .subscribe();
    }
  }

  // 1. Carrega operadores de caixa e gerentes
  async function carregarOperadores() {
    const db = getSupabase();
    const { data: perfis } = await db
      .from('perfis')
      .select('*')
      .in('funcao', ['caixa', 'gerente', 'admin'])
      .eq('ativo', true);

    if (perfis && perfis.length > 0) {
      if (el.seletorOperador) {
        el.seletorOperador.innerHTML = perfis.map(p =>
          `<option value="${p.id}">${p.nome_completo} (${p.funcao.toUpperCase()})</option>`
        ).join('');
      }
      estado.operadorAtual = perfis[0];
      if (el.operadorNome) el.operadorNome.textContent = estado.operadorAtual.nome_completo;
    }
  }

  // Carrega caixa aberto
  async function carregarCaixaAtivo() {
    const db = getSupabase();
    const { data: caixas } = await db
      .from('caixas')
      .select('*')
      .eq('status', 'aberto')
      .order('data_abertura', { ascending: false })
      .limit(1);

    if (caixas && caixas.length > 0) {
      estado.caixaAtivo = caixas[0];
      if (el.caixaStatus) el.caixaStatus.textContent = `Caixa #01 Aberto`;
    }
  }

  // 2. Carrega todas as contas de permanência
  async function carregarContasPermanencia() {
    const db = getSupabase();
    const { data: perms } = await db
      .from('permanencias')
      .select('*, hospedes(*)')
      .order('criado_em', { ascending: false });

    estado.permanencias = perms || [];

    atualizarCardsResumoSuperior();
    renderizarListaContas();

    // Se houver uma permanência já selecionada, re-seleciona para atualizar dados
    if (estado.permanenciaSelecionada) {
      selecionarPermanencia(estado.permanenciaSelecionada.id, false);
    } else if (estado.permanencias.length > 0) {
      // Seleciona a primeira conta aberta por padrão
      const primeiraAberta = estado.permanencias.find(p => p.status === 'aberta') || estado.permanencias[0];
      selecionarPermanencia(primeiraAberta.id, false);
    }
  }

  // Atualiza indicadores superiores do módulo
  function atualizarCardsResumoSuperior() {
    const abertas = estado.permanencias.filter(p => p.status === 'aberta');
    const hospedagens = abertas.filter(p => p.tipo === 'hospedagem');
    const dayUses = abertas.filter(p => p.tipo === 'day_use');
    const saldoTotal = abertas.reduce((acc, p) => acc + Number(p.saldo_devedor || 0), 0);

    if (el.cardTotalAbertas) el.cardTotalAbertas.textContent = abertas.length;
    if (el.cardTotalHospedagem) el.cardTotalHospedagem.textContent = hospedagens.length;
    if (el.cardTotalDayUse) el.cardTotalDayUse.textContent = dayUses.length;
    if (el.cardSaldoTotalReceber) {
      el.cardSaldoTotalReceber.textContent = `R$ ${saldoTotal.toFixed(2).replace('.', ',')}`;
    }
  }

  // 3. Renderiza a lista de contas na coluna esquerda com diferenciação Hospedagem vs Day Use
  function renderizarListaContas() {
    if (!el.listaContasPermanencia) return;

    const termo = estado.termoBusca.toLowerCase().trim();

    const filtradas = estado.permanencias.filter(p => {
      // Filtro por Status
      if (estado.filtroStatus === 'aberta' && p.status !== 'aberta') return false;
      if (estado.filtroStatus === 'fechamento') {
        // Em fase de fechamento: aberta e com saldo > 0 ou já solicitada
        if (p.status !== 'aberta' || Number(p.saldo_devedor || 0) <= 0) return false;
      }

      // Filtro por Tipo (Hospedagem vs Day Use)
      if (estado.filtroTipo !== 'todos' && p.tipo !== estado.filtroTipo) return false;

      // Filtro por Busca de Texto
      if (termo) {
        const nome = (p.hospedes?.nome || '').toLowerCase();
        const doc = (p.hospedes?.documento || '').toLowerCase();
        const quarto = (p.quarto_numero || '').toLowerCase();
        const idPerm = (p.id || '').toLowerCase();
        const pin = (p.pin_acesso || '').toLowerCase();
        if (!nome.includes(termo) && !doc.includes(termo) && !quarto.includes(termo) && !idPerm.includes(termo) && !pin.includes(termo)) {
          return false;
        }
      }

      return true;
    });

    if (el.badgeContadorFiltradas) {
      el.badgeContadorFiltradas.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'conta' : 'contas'}`;
    }

    if (filtradas.length === 0) {
      el.listaContasPermanencia.innerHTML = `
        <div class="py-10 text-center text-stone-400">
          <p class="text-xs">Nenhuma conta encontrada com os filtros aplicados.</p>
        </div>
      `;
      return;
    }

    el.listaContasPermanencia.innerHTML = filtradas.map(p => {
      const isSel = estado.permanenciaSelecionada?.id === p.id;
      const isHosp = p.tipo === 'hospedagem';
      const saldo = Number(p.saldo_devedor || 0);

      // Distinção visual marcante: Quarto vs Day Use
      const identificacao = isHosp
        ? `<div class="flex items-center gap-1.5"><span class="text-xs font-extrabold text-amber-700">🏨 Quarto ${p.quarto_numero}</span></div>`
        : `<div class="flex items-center gap-1.5"><span class="text-xs font-extrabold text-sky-700">☀️ Day Use #${p.id.slice(-4)}</span></div>`;

      const subtituloTipo = isHosp ? 'Hospedagem com Apartamento' : 'Day Use Sem Quarto (Lazer/Piscina)';

      const badgeStatus = p.status === 'aberta'
        ? (saldo > 0
            ? `<span class="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">A QUITAR</span>`
            : `<span class="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">SALDO ZERADO</span>`)
        : `<span class="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded">ENCERRADA</span>`;

      return `
        <div data-id="${p.id}" class="item-conta-row p-3.5 cursor-pointer transition-all ${
          isSel
            ? 'bg-amber-50/90 border-l-4 border-amber-600 shadow-2xs'
            : 'hover:bg-stone-50 bg-white'
        }">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              ${identificacao}
              <div class="text-xs font-semibold text-stone-900 truncate mt-0.5">${p.hospedes?.nome || 'Hóspede não identificado'}</div>
              <div class="text-[11px] text-stone-400 truncate">${subtituloTipo} · Doc: ${p.hospedes?.documento || '---'}</div>
            </div>

            <div class="text-right shrink-0">
              ${badgeStatus}
              <div class="text-xs font-extrabold mt-1 ${saldo > 0 ? 'text-amber-900' : 'text-emerald-700'}">
                R$ ${saldo.toFixed(2).replace('.', ',')}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Evento de clique para selecionar conta
    el.listaContasPermanencia.querySelectorAll('.item-conta-row').forEach(row => {
      row.addEventListener('click', () => {
        selecionarPermanencia(row.dataset.id, true);
      });
    });
  }

  // 4. Seleciona e carrega extrato financeiro detalhado de uma conta
  async function selecionarPermanencia(permId, rolarPainel = false) {
    const perm = estado.permanencias.find(p => p.id === permId);
    if (!perm) return;

    estado.permanenciaSelecionada = perm;
    renderizarListaContas();

    if (el.painelContaVazio) el.painelContaVazio.classList.add('hidden');
    if (el.painelContaDetalhes) el.painelContaDetalhes.classList.remove('hidden');

    const isHosp = perm.tipo === 'hospedagem';

    // Atualiza cabeçalho da conta selecionada
    if (el.contaTipoBadge) {
      el.contaTipoBadge.textContent = isHosp ? 'HOSPEDAGEM (QUARTO)' : 'DAY USE (SEM QUARTO)';
      el.contaTipoBadge.className = isHosp
        ? 'px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900'
        : 'px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-sky-100 text-sky-900';
    }

    if (el.contaIdentificacaoTitulo) {
      el.contaIdentificacaoTitulo.textContent = isHosp ? `Apartamento ${perm.quarto_numero}` : `Passaporte Day Use #${perm.id.slice(-4)}`;
    }

    if (el.contaStatusBadge) {
      el.contaStatusBadge.textContent = perm.status === 'aberta' ? 'CONTA ABERTA' : 'ENCERRADA (CHECK-OUT)';
      el.contaStatusBadge.className = perm.status === 'aberta'
        ? 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800'
        : 'text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-700';
    }

    if (el.contaHospedeNome) el.contaHospedeNome.textContent = perm.hospedes?.nome || 'Hóspede';
    if (el.contaDocumento) el.contaDocumento.textContent = `CPF/Doc: ${perm.hospedes?.documento || '---'} · Tel: ${perm.hospedes?.telefone || '---'}`;
    
    if (el.contaPinValor) {
      if (perm.status === 'fechada') {
        el.contaPinValor.textContent = 'INVALIDADO (Check-out Concluído)';
        el.contaPinValor.className = 'font-mono font-bold text-rose-600 line-through';
      } else {
        el.contaPinValor.textContent = perm.pin_acesso || '----';
        el.contaPinValor.className = 'font-mono font-bold text-stone-800';
      }
    }

    if (el.contaCheckinData) {
      const dataIn = new Date(perm.checkin);
      el.contaCheckinData.textContent = `Check-in: ${dataIn.toLocaleDateString()} às ${dataIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    if (el.contaCheckoutData) {
      if (perm.checkout) {
        const dataOut = new Date(perm.checkout);
        el.contaCheckoutData.textContent = `Check-out: ${dataOut.toLocaleDateString()} às ${dataOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        el.contaCheckoutData.textContent = 'Check-out: Em aberto';
      }
    }

    // Carregar consumos, estornos e pagamentos vinculados
    await carregarExtratoFinanceiro(perm.id);

    // Pré-preenche valor no campo de pagamento caso haja saldo devedor
    if (el.inputValorPagamento && Number(perm.saldo_devedor || 0) > 0) {
      el.inputValorPagamento.value = Number(perm.saldo_devedor).toFixed(2);
    } else if (el.inputValorPagamento) {
      el.inputValorPagamento.value = '';
    }

    // Verificar requisitos RN15
    verificarCriteriosRN15();

    if (rolarPainel && window.innerWidth < 1024 && el.painelContaDetalhes) {
      el.painelContaDetalhes.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // 5. Consulta Detalhada do Extrato Financeiro
  async function carregarExtratoFinanceiro(permId) {
    const db = getSupabase();

    // 1. Busca todos os consumos
    const { data: consumos } = await db
      .from('consumos')
      .select('*')
      .eq('permanencia_id', permId)
      .order('criado_em', { ascending: false });

    const todosConsumos = consumos || [];
    estado.extratoConsumos = todosConsumos.filter(c => c.status === 'confirmado');
    estado.extratoEstornos = todosConsumos.filter(c => c.status === 'estornado');
    estado.propostasPendentes = todosConsumos.filter(c => c.status === 'aguardando');

    // 2. Busca pagamentos efetuados
    const { data: pags } = await db
      .from('pagamentos')
      .select('*')
      .eq('permanencia_id', permId)
      .order('criado_em', { ascending: false });

    estado.extratoPagamentos = pags || [];

    // Calcular Totais
    const totalConsumo = estado.extratoConsumos.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);
    const totalEstorno = estado.extratoEstornos.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);
    const totalPago = estado.extratoPagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
    const saldo = Number(estado.permanenciaSelecionada?.saldo_devedor || 0);

    if (el.resumoTotalConsumo) el.resumoTotalConsumo.textContent = `R$ ${totalConsumo.toFixed(2).replace('.', ',')}`;
    if (el.resumoTotalEstorno) el.resumoTotalEstorno.textContent = `R$ ${totalEstorno.toFixed(2).replace('.', ',')}`;
    if (el.resumoTotalPago) el.resumoTotalPago.textContent = `R$ ${totalPago.toFixed(2).replace('.', ',')}`;
    if (el.resumoSaldoDevedor) el.resumoSaldoDevedor.textContent = `R$ ${saldo.toFixed(2).replace('.', ',')}`;

    // Renderizar Lançamentos Cronológicos
    renderizarLancamentosExtrato();

    // Renderizar Trava de Propostas Pendentes
    renderizarAlertaPropostasPendentes();
  }

  // Renderiza a lista cronológica de movimentações no extrato
  function renderizarLancamentosExtrato() {
    if (!el.containerExtratoDetalhado) return;

    const itens = [];

    // Adiciona Consumos Confirmados
    estado.extratoConsumos.forEach(csm => {
      itens.push({
        tipo: 'consumo',
        dataHora: new Date(csm.confirmado_em || csm.criado_em),
        titulo: `Consumo Autorizado (${csm.codigo_proposta})`,
        atendente: csm.perfis?.nome_completo || 'Atendente',
        itensList: (csm.itens_consumo || []).map(i => `${i.quantidade}x ${i.produtos?.nome || 'Item'} (R$ ${Number(i.preco_unitario).toFixed(2).replace('.', ',')})`),
        observacao: csm.observacoes || '',
        valor: Number(csm.valor_total),
        operacao: 'debito',
        consumoOriginal: csm
      });
    });

    // Adiciona Estornos Realizados
    estado.extratoEstornos.forEach(csm => {
      itens.push({
        tipo: 'estorno',
        dataHora: new Date(csm.estornado_em || csm.criado_em),
        titulo: `Estorno de Pedido (${csm.codigo_proposta})`,
        atendente: 'Caixa / Gerência',
        itensList: [`Motivo do estorno: ${csm.motivo_estorno || 'Cancelamento autorizado'}`],
        observacao: '',
        valor: Number(csm.valor_total),
        operacao: 'credito'
      });
    });

    // Adiciona Histórico de Pagamentos
    estado.extratoPagamentos.forEach(pag => {
      const formaDesc = {
        pix: 'PIX Instantâneo',
        cartao_debito: 'Cartão de Débito',
        cartao_credito: 'Cartão de Crédito',
        dinheiro: 'Dinheiro em Espécie'
      }[pag.forma_pagamento] || pag.forma_pagamento.toUpperCase();

      itens.push({
        tipo: 'pagamento',
        dataHora: new Date(pag.criado_em),
        titulo: `Pagamento Recebido (${formaDesc})`,
        atendente: 'Caixa Oficial',
        itensList: [`Comprovante ID: ${pag.id}`],
        observacao: '',
        valor: Number(pag.valor),
        operacao: 'pagamento'
      });
    });

    // Ordenar do mais recente para o mais antigo
    itens.sort((a, b) => b.dataHora - a.dataHora);

    if (itens.length === 0) {
      el.containerExtratoDetalhado.innerHTML = `
        <div class="py-8 text-center text-stone-400 text-xs">
          Nenhum consumo ou pagamento registrado nesta conta até o momento.
        </div>
      `;
      return;
    }

    el.containerExtratoDetalhado.innerHTML = itens.map((it, idx) => {
      const horaFormatada = it.dataHora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dataFormatada = it.dataHora.toLocaleDateString([], { day: '2-digit', month: '2-digit' });

      let cardEstilo = 'bg-stone-50 border-stone-200';
      let valorCor = 'text-stone-900';
      let badgeTag = '';
      let sinal = '+ R$ ';

      if (it.operacao === 'debito') {
        cardEstilo = 'bg-white border-stone-200';
        valorCor = 'text-stone-900';
        sinal = '+ R$ ';
        badgeTag = `<span class="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">CONSUMO</span>`;
      } else if (it.operacao === 'credito') {
        cardEstilo = 'bg-rose-50/50 border-rose-200';
        valorCor = 'text-rose-700';
        sinal = '- R$ ';
        badgeTag = `<span class="text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded">ESTORNADO</span>`;
      } else if (it.operacao === 'pagamento') {
        cardEstilo = 'bg-emerald-50/50 border-emerald-200';
        valorCor = 'text-emerald-700';
        sinal = '- R$ ';
        badgeTag = `<span class="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">QUITADO</span>`;
      }

      // Botão de estorno para consumos ativos
      const botaoEstorno = (it.tipo === 'consumo' && estado.permanenciaSelecionada?.status === 'aberta')
        ? `<button type="button" data-csm-id="${it.consumoOriginal.id}" class="btn-abrir-estorno text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline">Estornar</button>`
        : '';

      const itensSubHtml = it.itensList.map(li => `<div class="text-[11px] text-stone-600">• ${li}</div>`).join('');

      return `
        <div class="p-3 rounded-xl border ${cardEstilo} flex flex-col gap-1.5 transition-all">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-stone-900">${it.titulo}</span>
                ${badgeTag}
              </div>
              <div class="text-[11px] text-stone-400">${dataFormatada} às ${horaFormatada} · ${it.atendente}</div>
            </div>

            <div class="text-right">
              <div class="text-xs font-extrabold ${valorCor}">
                ${sinal}${it.valor.toFixed(2).replace('.', ',')}
              </div>
              ${botaoEstorno}
            </div>
          </div>

          <div class="pt-1 border-t border-stone-100/80 space-y-0.5">
            ${itensSubHtml}
            ${it.observacao ? `<div class="text-[10px] text-amber-700 italic">Obs: "${it.observacao}"</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Eventos do botão estorno
    el.containerExtratoDetalhado.querySelectorAll('.btn-abrir-estorno').forEach(btn => {
      btn.addEventListener('click', () => {
        abrirModalEstorno(btn.dataset.csmId);
      });
    });
  }

  // 6. Alerta e listagem de Propostas Pendentes (Trava RN15)
  function renderizarAlertaPropostasPendentes() {
    if (!el.alertaPropostasPendentesRN15 || !el.listaPropostasPendentesTravadas) return;

    if (estado.propostasPendentes.length === 0) {
      el.alertaPropostasPendentesRN15.classList.add('hidden');
      el.listaPropostasPendentesTravadas.innerHTML = '';
      return;
    }

    el.alertaPropostasPendentesRN15.classList.remove('hidden');

    el.listaPropostasPendentesTravadas.innerHTML = estado.propostasPendentes.map(prop => {
      const itensResumo = (prop.itens_consumo || []).map(i => `${i.quantidade}x ${i.produtos?.nome || 'Item'}`).join(', ');
      return `
        <div class="bg-white p-2.5 rounded-lg border border-amber-200 flex items-center justify-between text-xs">
          <div>
            <span class="font-mono font-bold text-stone-900">${prop.codigo_proposta}</span>
            <span class="text-stone-500">· Valor: R$ ${Number(prop.valor_total).toFixed(2).replace('.', ',')}</span>
            <div class="text-[10px] text-stone-400 truncate max-w-xs">${itensResumo}</div>
          </div>
          <button type="button" data-prop-id="${prop.id}" class="btn-cancelar-prop-caixa px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-xs font-bold transition-colors">
            Cancelar Proposta
          </button>
        </div>
      `;
    }).join('');

    el.listaPropostasPendentesTravadas.querySelectorAll('.btn-cancelar-prop-caixa').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deseja cancelar esta proposta pendente para desimpedir o fechamento da conta?')) return;
        try {
          const db = getSupabase();
          await db.negocio.cancelarPropostaAtendente({ consumo_id: btn.dataset.propId });
          mostrarToast('Proposta cancelada no caixa com sucesso.', 'info');
          await carregarContasPermanencia();
        } catch (e) {
          mostrarToast(e.message, 'erro');
        }
      });
    });
  }

  // 7. Validação Estrita para Encerramento da Permanência (RN15)
  function verificarCriteriosRN15() {
    const perm = estado.permanenciaSelecionada;
    if (!perm) return;

    const saldo = Number(perm.saldo_devedor || 0);
    const temPendencias = estado.propostasPendentes.length > 0;
    const jaFechada = perm.status === 'fechada';

    // Critério 1: Propostas Pendentes
    if (el.badgeCriterioPropostas && el.criterioPropostasPendentes) {
      if (temPendencias) {
        el.badgeCriterioPropostas.textContent = `BLOQUEADO: ${estado.propostasPendentes.length} pendente(s)`;
        el.badgeCriterioPropostas.className = 'font-bold text-[11px] text-rose-600';
        el.criterioPropostasPendentes.firstElementChild.className = 'w-2 h-2 rounded-full bg-rose-500';
      } else {
        el.badgeCriterioPropostas.textContent = 'ATENDIDO (Nenhuma pendente)';
        el.badgeCriterioPropostas.className = 'font-bold text-[11px] text-emerald-600';
        el.criterioPropostasPendentes.firstElementChild.className = 'w-2 h-2 rounded-full bg-emerald-500';
      }
    }

    // Critério 2: Saldo Zerado
    if (el.badgeCriterioSaldo && el.criterioSaldoZerado) {
      if (saldo > 0.001) {
        el.badgeCriterioSaldo.textContent = `BLOQUEADO: Saldo R$ ${saldo.toFixed(2).replace('.', ',')}`;
        el.badgeCriterioSaldo.className = 'font-bold text-[11px] text-rose-600';
        el.criterioSaldoZerado.firstElementChild.className = 'w-2 h-2 rounded-full bg-rose-500';
      } else {
        el.badgeCriterioSaldo.textContent = 'ATENDIDO (R$ 0,00 Quitado)';
        el.badgeCriterioSaldo.className = 'font-bold text-[11px] text-emerald-600';
        el.criterioSaldoZerado.firstElementChild.className = 'w-2 h-2 rounded-full bg-emerald-500';
      }
    }

    // Habilitação ou Bloqueio do Botão Principal RN15
    if (el.btnEncerrarPermanenciaRN15) {
      if (jaFechada) {
        el.btnEncerrarPermanenciaRN15.disabled = true;
        el.btnEncerrarPermanenciaRN15.textContent = 'Permanência Já Encerrada (Check-out Concluído)';
        if (el.msgStatusEncerramento) el.msgStatusEncerramento.textContent = 'Conta arquivada com sucesso.';
      } else if (temPendencias) {
        el.btnEncerrarPermanenciaRN15.disabled = true;
        el.btnEncerrarPermanenciaRN15.textContent = 'Bloqueado por Propostas Pendentes (RN15)';
        if (el.msgStatusEncerramento) el.msgStatusEncerramento.textContent = 'Resolva ou cancele todas as propostas aguardando confirmação.';
      } else if (saldo > 0.001) {
        el.btnEncerrarPermanenciaRN15.disabled = true;
        el.btnEncerrarPermanenciaRN15.textContent = `Bloqueado: Saldo Devedor de R$ ${saldo.toFixed(2).replace('.', ',')} (RN15)`;
        if (el.msgStatusEncerramento) el.msgStatusEncerramento.textContent = 'Registre o pagamento integral antes de fechar a conta.';
      } else {
        // TUDO ATENDIDO: HABILITA O FECHAMENTO
        el.btnEncerrarPermanenciaRN15.disabled = false;
        el.btnEncerrarPermanenciaRN15.textContent = '✓ Encerrar Permanência & Invalidar Credenciais (RN15)';
        if (el.msgStatusEncerramento) {
          el.msgStatusEncerramento.innerHTML = `<span class="text-emerald-700 font-semibold">✓ Critérios RN15 atendidos. Clique para efetivar o check-out definitivo.</span>`;
        }
      }
    }
  }

  // 8. Registro de Pagamentos (Vinculando a pagamentos e movimentacoes_caixa)
  async function registrarPagamento() {
    const perm = estado.permanenciaSelecionada;
    if (!perm) return;

    if (perm.status === 'fechada') {
      mostrarToast('Esta conta já se encontra encerrada.', 'alerta');
      return;
    }

    const valor = parseFloat(el.inputValorPagamento?.value || 0);
    const forma = el.selectFormaPagamento?.value || 'pix';
    const operadorId = estado.operadorAtual ? estado.operadorAtual.id : 'perf-003';
    const caixaId = estado.caixaAtivo ? estado.caixaAtivo.id : 'cx-001';

    if (isNaN(valor) || valor <= 0) {
      mostrarToast('Informe um valor de pagamento válido superior a R$ 0,00.', 'erro');
      return;
    }

    try {
      el.btnLancarPagamento.disabled = true;
      el.btnLancarPagamento.textContent = 'Registrando no Caixa...';

      const db = getSupabase();
      const res = await db.negocio.registrarPagamento({
        permanencia_id: perm.id,
        caixa_id: caixaId,
        valor: valor,
        forma_pagamento: forma,
        funcionario_id: operadorId
      });

      mostrarToast(`Pagamento de R$ ${valor.toFixed(2).replace('.', ',')} registrado com sucesso no Caixa!`, 'sucesso');
      
      // Limpa formulário
      if (el.inputValorPagamento) el.inputValorPagamento.value = '';
      if (el.inputDinheiroRecebido) el.inputDinheiroRecebido.value = '';
      if (el.displayTrocoDevolver) el.displayTrocoDevolver.textContent = 'R$ 0,00';

      // Atualiza banco e extrato
      await carregarContasPermanencia();
    } catch (err) {
      mostrarToast(err.message || 'Erro ao registrar pagamento.', 'erro');
    } finally {
      if (el.btnLancarPagamento) {
        el.btnLancarPagamento.disabled = false;
        el.btnLancarPagamento.textContent = 'Confirmar Recebimento & Registrar Caixa';
      }
    }
  }

  // 9. Encerramento Definitivo com Invalidação de Credenciais (RN15)
  async function executarEncerramentoRN15() {
    const perm = estado.permanenciaSelecionada;
    if (!perm) return;

    const isHosp = perm.tipo === 'hospedagem';
    const descConta = isHosp ? `Quarto ${perm.quarto_numero}` : `Day Use #${perm.id.slice(-4)}`;

    if (!confirm(`CONFIRMAÇÃO DE CHECK-OUT DEFINITIVO (RN15):\n\nDeseja realmente encerrar a permanência de ${perm.hospedes?.nome || 'Hóspede'} (${descConta})?\n\n• O saldo devedor será verificado como zerado.\n• As credenciais de acesso (PIN) serão definitivamente invalidadas.`)) {
      return;
    }

    try {
      el.btnEncerrarPermanenciaRN15.disabled = true;
      el.btnEncerrarPermanenciaRN15.textContent = 'Efetivando Check-out...';

      const db = getSupabase();
      const res = await db.negocio.encerrarPermanencia({
        permanencia_id: perm.id
      });

      mostrarToast('Permanência encerrada com sucesso! Credenciais invalidadas.', 'sucesso');

      // Emite o recibo oficial de encerramento
      abrirReciboCheckout(res.permanencia);

      // Recarrega listagens
      await carregarContasPermanencia();
    } catch (err) {
      mostrarToast(err.message || 'Erro ao encerrar permanência.', 'erro');
    } finally {
      verificarCriteriosRN15();
    }
  }

  // 10. Emissão de Recibo Oficial de Check-out e Quitação
  function abrirReciboCheckout(perm) {
    if (!el.modalReciboCheckout) return;

    const totalConsumo = estado.extratoConsumos.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);
    const totalPago = estado.extratoPagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
    const isHosp = perm.tipo === 'hospedagem';

    if (el.reciboHospedeNome) el.reciboHospedeNome.textContent = perm.hospedes?.nome || 'Hóspede';
    if (el.reciboDocumento) el.reciboDocumento.textContent = perm.hospedes?.documento || '---';
    if (el.reciboIdentificacao) {
      el.reciboIdentificacao.textContent = isHosp ? `Apartamento ${perm.quarto_numero}` : `Day Use #${perm.id.slice(-4)}`;
    }

    if (el.reciboCheckin) {
      const dIn = new Date(perm.checkin);
      el.reciboCheckin.textContent = `${dIn.toLocaleDateString()} ${dIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    if (el.reciboCheckout) {
      const dOut = new Date(perm.checkout || Date.now());
      el.reciboCheckout.textContent = `${dOut.toLocaleDateString()} ${dOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    if (el.reciboOperador) {
      el.reciboOperador.textContent = estado.operadorAtual ? estado.operadorAtual.nome_completo : 'Operador do Caixa';
    }

    if (el.reciboTotalConsumido) {
      el.reciboTotalConsumido.textContent = `R$ ${totalConsumo.toFixed(2).replace('.', ',')}`;
    }

    if (el.reciboTotalPago) {
      el.reciboTotalPago.textContent = `R$ ${totalPago.toFixed(2).replace('.', ',')}`;
    }

    el.modalReciboCheckout.classList.remove('hidden');
  }

  function fecharReciboCheckout() {
    if (el.modalReciboCheckout) el.modalReciboCheckout.classList.add('hidden');
  }

  // 11. Modal de Estorno de Consumo
  function abrirModalEstorno(consumoId) {
    const csm = estado.extratoConsumos.find(c => c.id === consumoId);
    if (!csm || !el.modalEstornoConsumo) return;

    estado.consumoParaEstorno = csm;
    if (el.estornoPropCodigo) el.estornoPropCodigo.textContent = csm.codigo_proposta;
    if (el.estornoPropValor) el.estornoPropValor.textContent = `R$ ${Number(csm.valor_total).toFixed(2).replace('.', ',')}`;
    if (el.estornoMotivoInput) el.estornoMotivoInput.value = '';

    el.modalEstornoConsumo.classList.remove('hidden');
  }

  function fecharModalEstorno() {
    if (el.modalEstornoConsumo) el.modalEstornoConsumo.classList.add('hidden');
    estado.consumoParaEstorno = null;
  }

  async function confirmarEstornoConsumo() {
    if (!estado.consumoParaEstorno) return;
    const motivo = (el.estornoMotivoInput?.value || '').trim();

    if (!motivo) {
      mostrarToast('Por favor, informe a justificativa obrigatória do estorno.', 'erro');
      return;
    }

    try {
      el.btnConfirmarEstorno.disabled = true;
      el.btnConfirmarEstorno.textContent = 'Processando...';

      const db = getSupabase();
      await db.negocio.estornarConsumo({
        consumo_id: estado.consumoParaEstorno.id,
        motivo: motivo,
        funcionario_id: estado.operadorAtual ? estado.operadorAtual.id : 'perf-003',
        caixa_id: estado.caixaAtivo ? estado.caixaAtivo.id : 'cx-001'
      });

      mostrarToast(`Estorno do pedido ${estado.consumoParaEstorno.codigo_proposta} realizado com sucesso!`, 'sucesso');
      fecharModalEstorno();
      await carregarContasPermanencia();
    } catch (err) {
      mostrarToast(err.message || 'Erro ao processar estorno.', 'erro');
    } finally {
      if (el.btnConfirmarEstorno) {
        el.btnConfirmarEstorno.disabled = false;
        el.btnConfirmarEstorno.textContent = 'Confirmar Estorno';
      }
    }
  }

  // 12. Cálculo dinâmico de troco para dinheiro em espécie
  function atualizarCalculoTroco() {
    const forma = el.selectFormaPagamento?.value;
    if (forma === 'dinheiro') {
      el.campoCalculoTroco.classList.remove('hidden');
      const aPagar = parseFloat(el.inputValorPagamento?.value || 0);
      const recebido = parseFloat(el.inputDinheiroRecebido?.value || 0);
      const troco = Math.max(0, recebido - aPagar);
      if (el.displayTrocoDevolver) {
        el.displayTrocoDevolver.textContent = `R$ ${troco.toFixed(2).replace('.', ',')}`;
      }
    } else {
      el.campoCalculoTroco.classList.add('hidden');
    }
  }

  // Sincronização em tempo real de eventos recebidos
  function lidarComEventoRealtime(payload) {
    if (!payload) return;
    // Recarrega listagens para manter sincronismo instantâneo com Atendente e Cliente
    carregarContasPermanencia();
  }

  // Notificações Toast Flutuantes
  function mostrarToast(mensagem, tipo = 'info') {
    if (!el.toast) return;
    el.toast.textContent = mensagem;

    const cores = {
      sucesso: 'bg-emerald-800 text-white',
      erro: 'bg-rose-800 text-white',
      alerta: 'bg-amber-800 text-white',
      info: 'bg-stone-900 text-white'
    };

    el.toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 transition-all duration-200 ${cores[tipo] || cores.info}`;
    el.toast.classList.remove('hidden');

    setTimeout(() => {
      el.toast.classList.add('hidden');
    }, 4500);
  }

  // Configuração dos ouvintes de eventos da UI
  function configurarEventos() {
    // Busca instantânea
    if (el.buscaConta) {
      el.buscaConta.addEventListener('input', (e) => {
        estado.termoBusca = e.target.value;
        renderizarListaContas();
      });
    }

    // Filtros de status (Abertas, A Quitar, Todas)
    el.botoesFiltroStatus.forEach(btn => {
      btn.addEventListener('click', () => {
        el.botoesFiltroStatus.forEach(b => {
          b.className = 'btn-filtro-status py-1.5 text-xs font-medium rounded-lg text-stone-600 hover:text-stone-900 transition-all';
        });
        btn.className = 'btn-filtro-status py-1.5 text-xs font-semibold rounded-lg bg-white text-stone-900 shadow-2xs transition-all';
        estado.filtroStatus = btn.dataset.filtro;
        renderizarListaContas();
      });
    });

    // Filtros de tipo (Todos, Hospedagem, Day Use)
    el.botoesFiltroTipo.forEach(btn => {
      btn.addEventListener('click', () => {
        el.botoesFiltroTipo.forEach(b => {
          b.className = 'btn-filtro-tipo px-2.5 py-1 text-[11px] font-medium rounded-md bg-stone-100 text-stone-600 hover:bg-stone-200';
        });
        btn.className = 'btn-filtro-tipo px-2.5 py-1 text-[11px] font-semibold rounded-md bg-stone-900 text-white';
        estado.filtroTipo = btn.dataset.tipo;
        renderizarListaContas();
      });
    });

    // Seletor de Operador
    if (el.seletorOperador) {
      el.seletorOperador.addEventListener('change', async (e) => {
        const db = getSupabase();
        const { data: perfil } = await db.from('perfis').select('*').eq('id', e.target.value).single();
        if (perfil) {
          estado.operadorAtual = perfil;
          if (el.operadorNome) el.operadorNome.textContent = perfil.nome_completo;
          mostrarToast(`Operador alterado para: ${perfil.nome_completo}`, 'info');
        }
      });
    }

    // Atalho: Quitar Saldo Total
    if (el.btnPreencherSaldoTotal) {
      el.btnPreencherSaldoTotal.addEventListener('click', () => {
        if (estado.permanenciaSelecionada && el.inputValorPagamento) {
          const saldo = Number(estado.permanenciaSelecionada.saldo_devedor || 0);
          el.inputValorPagamento.value = saldo.toFixed(2);
          atualizarCalculoTroco();
        }
      });
    }

    // Mudança de forma de pagamento e cálculo de troco
    if (el.selectFormaPagamento) {
      el.selectFormaPagamento.addEventListener('change', atualizarCalculoTroco);
    }
    if (el.inputValorPagamento) {
      el.inputValorPagamento.addEventListener('input', atualizarCalculoTroco);
    }
    if (el.inputDinheiroRecebido) {
      el.inputDinheiroRecebido.addEventListener('input', atualizarCalculoTroco);
    }

    // Registro de Pagamento
    if (el.btnLancarPagamento) {
      el.btnLancarPagamento.addEventListener('click', registrarPagamento);
    }

    // Encerramento RN15
    if (el.btnEncerrarPermanenciaRN15) {
      el.btnEncerrarPermanenciaRN15.addEventListener('click', executarEncerramentoRN15);
    }

    // Modal de Estorno
    if (el.btnFecharModalEstorno) {
      el.btnFecharModalEstorno.addEventListener('click', fecharModalEstorno);
    }
    if (el.btnCancelarEstorno) {
      el.btnCancelarEstorno.addEventListener('click', fecharModalEstorno);
    }
    if (el.btnConfirmarEstorno) {
      el.btnConfirmarEstorno.addEventListener('click', confirmarEstornoConsumo);
    }

    // Modal de Recibo Oficial
    if (el.btnConcluirRecibo) {
      el.btnConcluirRecibo.addEventListener('click', fecharReciboCheckout);
    }
    if (el.btnImprimirRecibo) {
      el.btnImprimirRecibo.addEventListener('click', () => {
        window.print();
      });
    }
  }

  // Inicialização quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
})();
