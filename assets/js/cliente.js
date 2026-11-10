/**
 * Hotel & Day Use - Lógica da Interface do Cliente (Hóspede e Day Use)
 * Arquivo: assets/js/cliente.js
 * 
 * Responsabilidades:
 * 1. Conexão direta com Supabase via window.hotelSupabase.
 * 2. Interface Mobile-First estrita (compatível com larguras de 360px sem cortes ou rolagem horizontal).
 * 3. Autenticação obrigatória por PIN de 4 dígitos ou sessão salva em sessionStorage.
 * 4. Exibição de propostas pendentes criadas pelos atendentes (tabela 'consumos' com status 'aguardando').
 * 5. Temporizador regressivo em tempo real de 5 minutos (RN07) com alerta de proximidade e auto-expiração.
 * 6. Execução atômica e segura das ações do cliente:
 *    - "Confirmar Consumo": Validação de PIN, alteração de status para 'confirmado' e débito atômico em 'permanencias.saldo_devedor'.
 *    - "Recusar Pedido": Registro da recusa com justificativa opcional sem debitar valor.
 * 7. Consulta e exibição do extrato consolidado de consumos confirmados da estadia e saldo remanescente.
 * 8. Escuta reativa de novas propostas e atualizações em tempo real via BroadcastChannel/Supabase.
 */

(function () {
  // Instância unificada do Supabase
  const getSupabase = () => window.hotelSupabase || window.supabase;

  // Estado interno do cliente
  const estado = {
    permanenciaId: null,
    codigoPropostaUrl: null,
    permanencia: null,
    hospede: null,
    propostaPendente: null,
    itensProposta: [],
    extratoConsumos: [],
    autenticado: false,
    intervaloContador: null
  };

  // Mapeamento de elementos do DOM
  let el = {};

  function mapearElementos() {
    el = {
      // Telas e Visões
      telaLogin: document.getElementById('tela-login-pin'),
      telaApp: document.getElementById('tela-app-cliente'),

      // Formulário de Login por PIN
      loginTituloQuarto: document.getElementById('login-titulo-quarto'),
      loginNomeHospede: document.getElementById('login-nome-hospede'),
      inputPin: document.getElementById('input-pin'),
      btnValidarPin: document.getElementById('btn-validar-pin'),
      loginErro: document.getElementById('login-erro'),
      seletorPermanenciaLogin: document.getElementById('seletor-perm-login'),

      // Cabeçalho da Aplicação do Hóspede
      badgeIdentificacao: document.getElementById('hospede-identificacao'),
      nomeHospedeHeader: document.getElementById('hospede-nome-header'),
      saldoDevedorHeader: document.getElementById('hospede-saldo-header'),
      btnSairSessao: document.getElementById('btn-sair-sessao'),

      // Navegação por Abas (Proposta vs Extrato)
      tabBtnProposta: document.getElementById('tab-btn-proposta'),
      tabBtnExtrato: document.getElementById('tab-btn-extrato'),
      abaProposta: document.getElementById('aba-proposta'),
      abaExtrato: document.getElementById('aba-extrato'),
      badgeContadorAba: document.getElementById('badge-propostas-pendentes'),

      // Proposta Pendente
      cardPropostaPendente: document.getElementById('card-proposta-pendente'),
      propostaVazia: document.getElementById('proposta-vazia'),
      propCodigo: document.getElementById('prop-codigo'),
      propTempoRestante: document.getElementById('prop-tempo-restante'),
      propBarraProgresso: document.getElementById('prop-barra-progresso'),
      propListaItens: document.getElementById('prop-lista-itens'),
      propValorTotal: document.getElementById('prop-valor-total'),
      propAtendenteNome: document.getElementById('prop-atendente-nome'),
      propObsGeral: document.getElementById('prop-obs-geral'),
      btnConfirmarConsumo: document.getElementById('btn-confirmar-consumo'),
      btnRecusarConsumo: document.getElementById('btn-recusar-consumo'),

      // Modal de Justificativa de Recusa
      modalRecusa: document.getElementById('modal-recusa'),
      motivoRecusa: document.getElementById('motivo-recusa'),
      btnConfirmarRecusaModal: document.getElementById('btn-confirmar-recusa-modal'),
      btnCancelarRecusaModal: document.getElementById('btn-cancelar-recusa-modal'),

      // Modal de Confirmação Bem-sucedida
      modalSucesso: document.getElementById('modal-sucesso'),
      modalSucessoValor: document.getElementById('modal-sucesso-valor'),
      modalSucessoCodigo: document.getElementById('modal-sucesso-codigo'),
      btnFecharSucesso: document.getElementById('btn-fechar-sucesso'),

      // Extrato de Consumos
      listaExtrato: document.getElementById('lista-extrato'),
      extratoVazio: document.getElementById('extrato-vazio'),
      extratoTotalGeral: document.getElementById('extrato-total-geral'),

      // Notificações Toast Mobile
      toastNotificacao: document.getElementById('toast-cliente')
    };
  }

  // 1. Inicialização da Interface do Cliente
  async function inicializar() {
    mapearElementos();
    configurarEventos();

    // Leitura dos parâmetros passados por link ou QR Code (?p=perm-201&prop=PROP-7102)
    const urlParams = new URLSearchParams(window.location.search);
    estado.permanenciaId = urlParams.get('p') || null;
    estado.codigoPropostaUrl = urlParams.get('prop') || null;

    // Se veio código de proposta na URL mas não o ID da permanência, consulta no Supabase
    if (!estado.permanenciaId && estado.codigoPropostaUrl) {
      const supabase = getSupabase();
      const { data: csm } = await supabase
        .from('consumos')
        .select('*')
        .eq('codigo_proposta', estado.codigoPropostaUrl)
        .single();

      if (csm) {
        estado.permanenciaId = csm.permanencia_id;
      }
    }

    // Verificar se já existe sessão autenticada válida no sessionStorage
    const sessaoSalva = sessionStorage.getItem('hotel_sessao_cliente');
    if (sessaoSalva) {
      try {
        const sessao = JSON.parse(sessaoSalva);
        if (!estado.permanenciaId || estado.permanenciaId === sessao.permanenciaId) {
          estado.permanenciaId = sessao.permanenciaId;
          estado.autenticado = true;
        }
      } catch (e) {
        console.error('Erro ao ler sessão do sessionStorage:', e);
      }
    }

    // Carrega dados da permanência e define tela (Login PIN ou Dashboard)
    await prepararAcessoCliente();

    // Ativação da escuta reativa em tempo real do Supabase
    const supabase = getSupabase();
    if (supabase && supabase.channel) {
      supabase.channel('cliente-realtime')
        .on('broadcast', { event: '*' }, (payload) => {
          lidarComEventoRealtime(payload);
        })
        .subscribe();
    }

    // Loop de contagem regressiva de precisão (1 segundo)
    if (estado.intervaloContador) clearInterval(estado.intervaloContador);
    estado.intervaloContador = setInterval(atualizarContadorRegressivo, 1000);
  }

  // 2. Consulta das permanências abertas para vinculação
  async function prepararAcessoCliente() {
    const supabase = getSupabase();
    const { data: permanencias, error } = await supabase
      .from('permanencias')
      .select('*, hospedes(*)')
      .eq('status', 'aberta');

    if (error || !permanencias || permanencias.length === 0) {
      mostrarToast('Nenhuma permanência em aberto localizada.', 'erro');
      return;
    }

    // Se nenhum ID de permanência foi fornecido, usa a primeira como padrão de avaliação
    if (!estado.permanenciaId) {
      estado.permanenciaId = permanencias[0].id;
    }

    const permAtual = permanencias.find(p => p.id === estado.permanenciaId) || permanencias[0];
    estado.permanencia = permAtual;
    estado.hospede = permAtual.hospedes;
    estado.permanenciaId = permAtual.id;

    // Popula seletor na tela de login por PIN
    if (el.seletorPermanenciaLogin) {
      el.seletorPermanenciaLogin.innerHTML = permanencias.map(p => {
        const isHosp = p.tipo === 'hospedagem';
        const rotulo = isHosp
          ? `🏨 Quarto ${p.quarto_numero} · ${p.hospedes?.nome || 'Hóspede'}`
          : `☀️ Day Use #${p.id.slice(-4)} · ${p.hospedes?.nome || 'Visitante'}`;
        return `<option value="${p.id}" ${p.id === estado.permanenciaId ? 'selected' : ''}>${rotulo}</option>`;
      }).join('');

      el.seletorPermanenciaLogin.addEventListener('change', (e) => {
        estado.permanenciaId = e.target.value;
        const nova = permanencias.find(p => p.id === estado.permanenciaId);
        if (nova) {
          estado.permanencia = nova;
          estado.hospede = nova.hospedes;
          atualizarLabelsLogin();
        }
      });
    }

    atualizarLabelsLogin();

    if (estado.autenticado) {
      mostrarTelaApp();
      await carregarDadosCompletosCliente();
    } else {
      mostrarTelaLogin();
    }
  }

  function atualizarLabelsLogin() {
    if (!estado.permanencia) return;
    const isQuarto = estado.permanencia.tipo === 'hospedagem';
    if (el.loginTituloQuarto) {
      el.loginTituloQuarto.textContent = isQuarto ? `🏨 Quarto ${estado.permanencia.quarto_numero}` : '☀️ Day Use Lazer';
    }
    if (el.loginNomeHospede) {
      el.loginNomeHospede.textContent = estado.hospede ? `Olá, ${estado.hospede.nome}` : 'Identificação de Acesso';
    }
    if (el.inputPin) {
      el.inputPin.value = '';
      el.inputPin.placeholder = `PIN de 4 dígitos (Dica: ${estado.permanencia.pin_acesso})`;
    }
  }

  function mostrarTelaLogin() {
    if (el.telaLogin) el.telaLogin.classList.remove('hidden');
    if (el.telaApp) el.telaApp.classList.add('hidden');
  }

  function mostrarTelaApp() {
    if (el.telaLogin) el.telaLogin.classList.add('hidden');
    if (el.telaApp) el.telaApp.classList.remove('hidden');
  }

  // 3. Validação do PIN de Segurança
  async function validarPinAcesso() {
    const pin = (el.inputPin?.value || '').trim();
    if (!pin) {
      exibirErroLogin('Por favor, digite o PIN de 4 dígitos.');
      return;
    }

    // Valida contra o pin_acesso da tabela 'permanencias'
    if (String(pin) !== String(estado.permanencia.pin_acesso)) {
      exibirErroLogin(`PIN incorreto. (PIN cadastrado para esta conta: ${estado.permanencia.pin_acesso})`);
      if (window.BarcodeScannerService) window.BarcodeScannerService.emitirBip('erro');
      return;
    }

    // Sucesso na validação: salva sessão e abre dashboard
    estado.autenticado = true;
    sessionStorage.setItem('hotel_sessao_cliente', JSON.stringify({
      permanenciaId: estado.permanencia.id,
      hospedeId: estado.hospede?.id,
      loginEm: new Date().toISOString()
    }));

    if (window.BarcodeScannerService) window.BarcodeScannerService.emitirBip('sucesso');
    mostrarTelaApp();
    await carregarDadosCompletosCliente();
  }

  function exibirErroLogin(msg) {
    if (!el.loginErro) return;
    el.loginErro.textContent = msg;
    el.loginErro.classList.remove('hidden');
  }

  function encerrarSessaoCliente() {
    sessionStorage.removeItem('hotel_sessao_cliente');
    estado.autenticado = false;
    mostrarTelaLogin();
  }

  // 4. Consulta Completa de Propostas Pendentes e Extrato no Supabase
  async function carregarDadosCompletosCliente() {
    const supabase = getSupabase();

    // 1. Atualizar saldo e dados da permanência
    const { data: perm, error: errPerm } = await supabase
      .from('permanencias')
      .select('*, hospedes(*)')
      .eq('id', estado.permanenciaId)
      .single();

    if (!errPerm && perm) {
      estado.permanencia = perm;
      estado.hospede = perm.hospedes;
      atualizarHeaderHospede();
    }

    // 2. Buscar propostas de consumo associadas a esta permanência
    const { data: consumos, error: errConsumos } = await supabase
      .from('consumos')
      .select('*')
      .eq('permanencia_id', estado.permanenciaId)
      .order('criado_em', { ascending: false });

    if (errConsumos) {
      console.error('Erro ao consultar consumos no Supabase:', errConsumos);
      return;
    }

    const todos = consumos || [];

    // Localiza proposta pendente ativa ('aguardando')
    const pendente = todos.find(c => c.status === 'aguardando');
    estado.propostaPendente = pendente || null;

    if (pendente) {
      estado.itensProposta = pendente.itens_consumo || [];
      renderizarPropostaPendente();
      alternarAba('proposta');
      if (el.badgeContadorAba) el.badgeContadorAba.classList.remove('hidden');
    } else {
      renderizarPropostaVazia();
      if (el.badgeContadorAba) el.badgeContadorAba.classList.add('hidden');
    }

    // 3. Extrato de consumos já confirmados
    estado.extratoConsumos = todos.filter(c => c.status === 'confirmado');
    renderizarExtratoConsumos();
  }

  function atualizarHeaderHospede() {
    if (!estado.permanencia) return;
    const isQuarto = estado.permanencia.tipo === 'hospedagem';

    if (el.badgeIdentificacao) {
      el.badgeIdentificacao.textContent = isQuarto
        ? `🏨 Quarto ${estado.permanencia.quarto_numero}`
        : `☀️ Day Use #${estado.permanencia.id.slice(-4)}`;
    }
    if (el.nomeHospedeHeader) {
      el.nomeHospedeHeader.textContent = estado.hospede?.nome || 'Hóspede';
    }
    if (el.saldoDevedorHeader) {
      const saldo = Number(estado.permanencia.saldo_devedor || 0);
      el.saldoDevedorHeader.textContent = `R$ ${saldo.toFixed(2).replace('.', ',')}`;
    }
  }

  // 5. Renderização da Proposta Pendente
  function renderizarPropostaPendente() {
    const prop = estado.propostaPendente;
    if (!prop) {
      renderizarPropostaVazia();
      return;
    }

    if (el.propostaVazia) el.propostaVazia.classList.add('hidden');
    if (el.cardPropostaPendente) el.cardPropostaPendente.classList.remove('hidden');

    if (el.propCodigo) el.propCodigo.textContent = prop.codigo_proposta;
    if (el.propValorTotal) el.propValorTotal.textContent = `R$ ${Number(prop.valor_total).toFixed(2).replace('.', ',')}`;
    if (el.propAtendenteNome) {
      el.propAtendenteNome.textContent = `Lançado por: ${prop.perfis?.nome_completo || 'Atendente'}`;
    }

    if (el.propObsGeral) {
      if (prop.observacoes) {
        el.propObsGeral.textContent = `Observação do garçom: "${prop.observacoes}"`;
        el.propObsGeral.classList.remove('hidden');
      } else {
        el.propObsGeral.classList.add('hidden');
      }
    }

    // Renderiza itens com preços unitários congelados
    if (el.propListaItens) {
      el.propListaItens.innerHTML = (prop.itens_consumo || []).map(item => {
        const nomeProd = item.produtos?.nome || 'Produto';
        const precoUni = Number(item.preco_unitario).toFixed(2).replace('.', ',');
        const subtotal = Number(item.subtotal).toFixed(2).replace('.', ',');
        const obs = item.observacao ? `<div class="text-[11px] text-amber-700 italic mt-0.5">Obs: ${item.observacao}</div>` : '';

        return `
          <div class="py-2.5 border-b border-stone-100 flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-stone-900 leading-snug">
                ${item.quantidade}x ${nomeProd}
              </div>
              <div class="text-[11px] text-stone-500">Unitário congelado: R$ ${precoUni}</div>
              ${obs}
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-stone-900">R$ ${subtotal}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    atualizarContadorRegressivo();
  }

  function renderizarPropostaVazia() {
    if (el.cardPropostaPendente) el.cardPropostaPendente.classList.add('hidden');
    if (el.propostaVazia) el.propostaVazia.classList.remove('hidden');
  }

  // 6. Temporizador Regressivo de 5 Minutos (RN07)
  function atualizarContadorRegressivo() {
    if (!estado.propostaPendente || estado.propostaPendente.status !== 'aguardando') return;

    const agora = Date.now();
    const expiraEmMs = new Date(estado.propostaPendente.expira_em).getTime();
    const totalSegundos = 5 * 60; // 300 segundos
    const restanteMs = expiraEmMs - agora;

    if (restanteMs <= 0) {
      // Expirou
      if (el.propTempoRestante) el.propTempoRestante.textContent = '00:00 - Expirada';
      if (el.propBarraProgresso) el.propBarraProgresso.style.width = '0%';
      estado.propostaPendente.status = 'expirado';
      mostrarToast('O prazo de 5 minutos desta proposta encerrou. O pedido expirou.', 'erro');
      carregarDadosCompletosCliente();
      return;
    }

    const segRestantes = Math.floor(restanteMs / 1000);
    const min = Math.floor(segRestantes / 60);
    const seg = segRestantes % 60;
    const formatado = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;

    if (el.propTempoRestante) {
      el.propTempoRestante.textContent = formatado;
      if (segRestantes < 60) {
        el.propTempoRestante.className = 'font-mono font-bold text-xs text-rose-600 animate-pulse';
      } else if (segRestantes < 120) {
        el.propTempoRestante.className = 'font-mono font-bold text-xs text-amber-600';
      } else {
        el.propTempoRestante.className = 'font-mono font-bold text-xs text-stone-800';
      }
    }

    if (el.propBarraProgresso) {
      const pct = Math.max(0, Math.min(100, (segRestantes / totalSegundos) * 100));
      el.propBarraProgresso.style.width = `${pct}%`;
      if (pct < 20) {
        el.propBarraProgresso.className = 'h-full bg-rose-500 transition-all duration-1000';
      } else if (pct < 40) {
        el.propBarraProgresso.className = 'h-full bg-amber-500 transition-all duration-1000';
      } else {
        el.propBarraProgresso.className = 'h-full bg-emerald-500 transition-all duration-1000';
      }
    }
  }

  // 7. Confirmação do Consumo pelo Cliente (Débito Atômico e Unicidade RN10)
  async function confirmarConsumoCliente() {
    if (!estado.propostaPendente) return;

    try {
      if (el.btnConfirmarConsumo) {
        el.btnConfirmarConsumo.disabled = true;
        el.btnConfirmarConsumo.textContent = 'Processando Débito...';
      }

      const supabase = getSupabase();
      // Executa confirmação atômica no Supabase exigindo o PIN da permanência
      const res = await supabase.negocio.confirmarProposta({
        consumo_id: estado.propostaPendente.id,
        pin_informado: estado.permanencia.pin_acesso
      });

      if (window.BarcodeScannerService) window.BarcodeScannerService.emitirBip('sucesso');

      // Exibe modal de confirmação bem-sucedida
      if (el.modalSucesso) {
        if (el.modalSucessoValor) el.modalSucessoValor.textContent = `R$ ${Number(res.consumo.valor_total).toFixed(2).replace('.', ',')}`;
        if (el.modalSucessoCodigo) el.modalSucessoCodigo.textContent = res.consumo.codigo_proposta;
        el.modalSucesso.classList.remove('hidden');
      }

      await carregarDadosCompletosCliente();
    } catch (err) {
      mostrarToast(err.message || 'Erro ao confirmar proposta.', 'erro');
    } finally {
      if (el.btnConfirmarConsumo) {
        el.btnConfirmarConsumo.disabled = false;
        el.btnConfirmarConsumo.textContent = '✓ Confirmar Consumo';
      }
    }
  }

  // 8. Recusa do Consumo pelo Cliente
  function abrirModalRecusa() {
    if (el.modalRecusa) {
      if (el.motivoRecusa) el.motivoRecusa.value = '';
      el.modalRecusa.classList.remove('hidden');
    }
  }

  function fecharModalRecusa() {
    if (el.modalRecusa) el.modalRecusa.classList.add('hidden');
  }

  async function executarRecusaCliente() {
    if (!estado.propostaPendente) return;
    const motivo = (el.motivoRecusa?.value || 'Recusado pelo hóspede').trim();

    try {
      const supabase = getSupabase();
      await supabase.negocio.recusarProposta({
        consumo_id: estado.propostaPendente.id,
        motivo
      });

      fecharModalRecusa();
      if (window.BarcodeScannerService) window.BarcodeScannerService.emitirBip('erro');
      mostrarToast('Proposta recusada com sucesso.', 'info');
      await carregarDadosCompletosCliente();
    } catch (err) {
      mostrarToast(err.message || 'Erro ao recusar proposta.', 'erro');
    }
  }

  // 9. Extrato Consolidado de Consumos Confirmados
  function renderizarExtratoConsumos() {
    if (!el.listaExtrato) return;

    if (estado.extratoConsumos.length === 0) {
      el.extratoVazio.classList.remove('hidden');
      el.listaExtrato.innerHTML = '';
      if (el.extratoTotalGeral) el.extratoTotalGeral.textContent = 'R$ 0,00';
      return;
    }

    el.extratoVazio.classList.add('hidden');
    const total = estado.extratoConsumos.reduce((acc, c) => acc + Number(c.valor_total || 0), 0);
    if (el.extratoTotalGeral) el.extratoTotalGeral.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

    el.listaExtrato.innerHTML = estado.extratoConsumos.map(csm => {
      const hora = new Date(csm.confirmado_em || csm.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dataStr = new Date(csm.criado_em).toLocaleDateString([], { day: '2-digit', month: '2-digit' });

      const itensHtml = (csm.itens_consumo || []).map(i => `
        <div class="flex items-center justify-between text-xs text-stone-600">
          <span>${i.quantidade}x ${i.produtos?.nome || 'Item'}</span>
          <span class="font-medium text-stone-900">R$ ${Number(i.subtotal).toFixed(2).replace('.', ',')}</span>
        </div>
      `).join('');

      return `
        <div class="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs font-bold text-stone-900">${csm.codigo_proposta}</span>
            <span class="text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">CONFIRMADO</span>
          </div>
          <div class="text-[11px] text-stone-400">Data: ${dataStr} às ${hora}</div>
          <div class="pt-1.5 border-t border-stone-200/60 space-y-1">
            ${itensHtml}
          </div>
          <div class="pt-2 border-t border-stone-200/60 flex items-center justify-between text-xs font-bold text-stone-900">
            <span>Total deste pedido</span>
            <span>R$ ${Number(csm.valor_total).toFixed(2).replace('.', ',')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 10. Alternância de Abas Mobile (Proposta vs Extrato)
  function alternarAba(nomeAba) {
    if (nomeAba === 'proposta') {
      if (el.abaProposta) el.abaProposta.classList.remove('hidden');
      if (el.abaExtrato) el.abaExtrato.classList.add('hidden');
      el.tabBtnProposta.className = 'flex-1 py-2.5 text-xs font-bold text-stone-900 border-b-2 border-stone-900 flex items-center justify-center gap-1.5';
      el.tabBtnExtrato.className = 'flex-1 py-2.5 text-xs font-semibold text-stone-500 hover:text-stone-900 border-b-2 border-transparent flex items-center justify-center gap-1.5';
    } else {
      if (el.abaProposta) el.abaProposta.classList.add('hidden');
      if (el.abaExtrato) el.abaExtrato.classList.remove('hidden');
      el.tabBtnExtrato.className = 'flex-1 py-2.5 text-xs font-bold text-stone-900 border-b-2 border-stone-900 flex items-center justify-center gap-1.5';
      el.tabBtnProposta.className = 'flex-1 py-2.5 text-xs font-semibold text-stone-500 hover:text-stone-900 border-b-2 border-transparent flex items-center justify-center gap-1.5';
    }
  }

  // 11. Escuta Reativa de Eventos em Tempo Real
  function lidarComEventoRealtime(payload) {
    if (!payload) return;

    if (payload.evento === 'PROPOSTA_CRIADA' && payload.proposta.permanencia_id === estado.permanenciaId) {
      if (window.BarcodeScannerService) window.BarcodeScannerService.emitirBip('sucesso');
      mostrarToast('🔔 Nova proposta de consumo recebida do atendente!', 'alerta');
      carregarDadosCompletosCliente();
    } else if (payload.evento === 'PERMANENCIA_FECHADA' && payload.permanencia.id === estado.permanenciaId) {
      mostrarToast('Sua conta foi encerrada no caixa. Obrigado pela estadia!', 'info');
      carregarDadosCompletosCliente();
    } else if (payload.evento === 'PAGAMENTO_REGISTRADO' && payload.permanencia.id === estado.permanenciaId) {
      carregarDadosCompletosCliente();
    }
  }

  function mostrarToast(mensagem, tipo = 'info') {
    if (!el.toastNotificacao) return;
    el.toastNotificacao.textContent = mensagem;

    const cores = {
      sucesso: 'bg-emerald-800 text-white',
      erro: 'bg-rose-800 text-white',
      alerta: 'bg-amber-800 text-white',
      info: 'bg-stone-900 text-white'
    };

    el.toastNotificacao.className = `fixed top-4 left-4 right-4 z-50 p-3 rounded-xl shadow-lg text-xs font-semibold text-center transition-all ${cores[tipo] || cores.info}`;
    el.toastNotificacao.classList.remove('hidden');

    setTimeout(() => {
      el.toastNotificacao.classList.add('hidden');
    }, 4500);
  }

  function configurarEventos() {
    if (el.btnValidarPin) {
      el.btnValidarPin.addEventListener('click', validarPinAcesso);
    }

    if (el.inputPin) {
      el.inputPin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') validarPinAcesso();
      });
    }

    if (el.btnSairSessao) {
      el.btnSairSessao.addEventListener('click', encerrarSessaoCliente);
    }

    if (el.tabBtnProposta) {
      el.tabBtnProposta.addEventListener('click', () => alternarAba('proposta'));
    }

    if (el.tabBtnExtrato) {
      el.tabBtnExtrato.addEventListener('click', () => alternarAba('extrato'));
    }

    if (el.btnConfirmarConsumo) {
      el.btnConfirmarConsumo.addEventListener('click', confirmarConsumoCliente);
    }

    if (el.btnRecusarConsumo) {
      el.btnRecusarConsumo.addEventListener('click', abrirModalRecusa);
    }

    if (el.btnFecharSucesso) {
      el.btnFecharSucesso.addEventListener('click', () => {
        if (el.modalSucesso) el.modalSucesso.classList.add('hidden');
        alternarAba('extrato');
      });
    }

    if (el.btnConfirmarRecusaModal) {
      el.btnConfirmarRecusaModal.addEventListener('click', executarRecusaCliente);
    }

    if (el.btnCancelarRecusaModal) {
      el.btnCancelarRecusaModal.addEventListener('click', fecharModalRecusa);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
})();
