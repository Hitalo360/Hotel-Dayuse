/**
 * Hotel & Day Use - Lógica da Interface do Atendente (PDV)
 * Arquivo: assets/js/atendente.js
 * 
 * Responsabilidades:
 * 1. Conexão direta com Supabase via window.hotelSupabase.
 * 2. Consulta de produtos ativos da tabela 'produtos' com filtro de categorias e busca textual.
 * 3. Gestão dinâmica do carrinho de consumo (quantidades, subtotais, observações por item).
 * 4. Geração e envio de proposta criando registro em 'consumos' (status 'aguardando')
 *    e 'itens_consumo' com preços congelados e validade estrita de 5 minutos (RN07).
 * 5. Bloqueio incondicional de segurança: O atendente NÃO possui botão nem permissão
 *    para confirmar a proposta em nome do cliente (RN09). Apenas monitora e pode cancelar.
 * 6. Leitura integrada de códigos de comanda/produtos via Leitor USB e Câmera WebRTC.
 * 7. Monitoramento em tempo real do status das propostas (Aguardando, Confirmado, Recusado, Expirado).
 */

(function () {
  // Instância unificada do Supabase
  const getSupabase = () => window.hotelSupabase || window.supabase;

  // Estado interno da aplicação do Atendente
  const estado = {
    atendenteAtual: null,
    permanenciaSelecionada: null,
    permanenciasAtivas: [],
    produtos: [],
    categoriaAtiva: 'Todos',
    termoBusca: '',
    carrinho: [], // { produto_id, produto, quantidade, preco_unitario, observacao }
    propostasRecentes: [],
    observacaoGeral: '',
    intervaloCronometro: null
  };

  // Mapeamento dos elementos da interface
  let el = {};

  function mapearElementos() {
    el = {
      // Cabeçalho e Operador Atendente
      atendenteNome: document.getElementById('atendente-nome'),
      atendenteFuncao: document.getElementById('atendente-funcao'),
      seletorAtendente: document.getElementById('seletor-atendente'),

      // Seleção de Quarto / Day Use
      buscaPermanencia: document.getElementById('busca-permanencia'),
      chipsPermanencias: document.getElementById('chips-permanencias'),
      cardPermanencia: document.getElementById('card-permanencia-selecionada'),
      permHospedeNome: document.getElementById('perm-hospede-nome'),
      permTipoIdentificacao: document.getElementById('perm-tipo-identificacao'),
      permDocumento: document.getElementById('perm-documento'),
      permSaldo: document.getElementById('perm-saldo'),

      // Catálogo de Produtos
      buscaProduto: document.getElementById('busca-produto'),
      filtrosCategoria: document.getElementById('filtros-categoria'),
      gridProdutos: document.getElementById('grid-produtos'),

      // Carrinho de Consumo
      listaCarrinho: document.getElementById('lista-carrinho'),
      carrinhoVazio: document.getElementById('carrinho-vazio'),
      carrinhoTotal: document.getElementById('carrinho-total'),
      carrinhoQtdItens: document.getElementById('carrinho-qtd-itens'),
      btnEnviarProposta: document.getElementById('btn-enviar-proposta'),
      obsGeral: document.getElementById('obs-geral'),

      // Monitor de Propostas em Tempo Real
      listaPropostas: document.getElementById('lista-propostas-monitor'),
      propostasVazio: document.getElementById('propostas-vazio'),

      // Modais e Leitores
      modalCamera: document.getElementById('modal-camera'),
      videoCamera: document.getElementById('video-camera'),
      btnFecharCamera: document.getElementById('btn-fechar-camera'),
      btnAbrirCamera: document.getElementById('btn-abrir-camera'),

      modalQrProposta: document.getElementById('modal-qr-proposta'),
      qrPropostaCodigo: document.getElementById('qr-proposta-codigo'),
      qrPropostaLink: document.getElementById('qr-proposta-link'),
      qrPropostaValor: document.getElementById('qr-proposta-valor'),
      qrPropostaQuarto: document.getElementById('qr-proposta-quarto'),
      qrPropostaImg: document.getElementById('qr-proposta-img'),
      btnFecharQrProposta: document.getElementById('btn-fechar-qr-proposta'),
      btnCopiarLinkProposta: document.getElementById('btn-copiar-link-proposta'),

      // Feedback
      toastNotificacao: document.getElementById('toast-notificacao')
    };
  }

  // 1. Inicialização do Terminal do Atendente
  async function inicializar() {
    mapearElementos();
    configurarEventos();

    await carregarPerfisAtendentes();
    await carregarPermanenciasAbertas();
    await carregarCatalogoProdutos();
    await carregarMonitorPropostas();

    // Integração com Leitor Físico USB (captura de rajada de teclado)
    if (window.BarcodeScannerService) {
      window.BarcodeScannerService.aoLerCodigoFisico(processarCodigoBarras);
    }

    // Canal de Escuta em Tempo Real do Supabase
    const supabase = getSupabase();
    if (supabase && supabase.channel) {
      supabase.channel('atendente-realtime')
        .on('broadcast', { event: '*' }, (payload) => {
          lidarComEventoRealtime(payload);
        })
        .subscribe();
    }

    // Temporizador de atualização da contagem de 5 minutos nas propostas exibidas
    if (estado.intervaloCronometro) clearInterval(estado.intervaloCronometro);
    estado.intervaloCronometro = setInterval(atualizarContadoresMonitor, 1000);
  }

  // 2. Consulta da tabela 'perfis' para carregar o funcionário logado
  async function carregarPerfisAtendentes() {
    const supabase = getSupabase();
    const { data: perfis, error } = await supabase
      .from('perfis')
      .select('*')
      .eq('funcao', 'atendente')
      .eq('ativo', true);

    if (error) {
      console.error('Erro ao consultar perfis de atendentes no Supabase:', error);
      return;
    }

    if (perfis && perfis.length > 0) {
      if (el.seletorAtendente) {
        el.seletorAtendente.innerHTML = perfis.map(p =>
          `<option value="${p.id}">${p.nome_completo} (${p.funcao.toUpperCase()})</option>`
        ).join('');
      }
      estado.atendenteAtual = perfis[0];
      atualizarBadgeAtendente();
    }
  }

  function atualizarBadgeAtendente() {
    if (estado.atendenteAtual) {
      if (el.atendenteNome) el.atendenteNome.textContent = estado.atendenteAtual.nome_completo;
      if (el.atendenteFuncao) el.atendenteFuncao.textContent = 'Atendente Conectado';
    }
  }

  // 3. Consulta da tabela 'permanencias' e 'hospedes' para comanda ativa
  async function carregarPermanenciasAbertas() {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('permanencias')
      .select('*, hospedes(*)')
      .eq('status', 'aberta')
      .order('criado_em', { ascending: false });

    if (error) {
      console.error('Erro ao consultar permanências abertas:', error);
      return;
    }

    estado.permanenciasAtivas = data || [];
    renderizarChipsPermanencias();

    // Se nenhuma estiver selecionada, seleciona a primeira por padrão
    if (!estado.permanenciaSelecionada && estado.permanenciasAtivas.length > 0) {
      selecionarPermanencia(estado.permanenciasAtivas[0].id);
    }
  }

  function renderizarChipsPermanencias() {
    if (!el.chipsPermanencias) return;
    const termo = (el.buscaPermanencia?.value || '').toLowerCase().trim();

    const filtradas = estado.permanenciasAtivas.filter(p => {
      if (!termo) return true;
      const nomeHosp = (p.hospedes?.nome || '').toLowerCase();
      const quarto = (p.quarto_numero || '').toLowerCase();
      const doc = (p.hospedes?.documento || '').toLowerCase();
      const idPerm = (p.id || '').toLowerCase();
      return nomeHosp.includes(termo) || quarto.includes(termo) || doc.includes(termo) || idPerm.includes(termo);
    });

    if (filtradas.length === 0) {
      el.chipsPermanencias.innerHTML = `
        <div class="text-xs text-stone-400 py-1 px-2">Nenhum quarto ou Day Use encontrado.</div>
      `;
      return;
    }

    el.chipsPermanencias.innerHTML = filtradas.map(p => {
      const isSel = estado.permanenciaSelecionada?.id === p.id;
      const isHosp = p.tipo === 'hospedagem';
      const label = isHosp ? `🏨 Quarto ${p.quarto_numero}` : `☀️ Day Use #${p.id.slice(-4)}`;
      return `
        <button type="button" data-id="${p.id}" class="btn-chip-perm px-3 py-2 rounded-lg text-xs font-medium text-left transition-all border shrink-0 ${
          isSel
            ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
            : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
        }">
          <div class="font-bold">${label}</div>
          <div class="text-[11px] truncate opacity-80 max-w-[130px]">${p.hospedes?.nome || 'Hóspede'}</div>
        </button>
      `;
    }).join('');

    el.chipsPermanencias.querySelectorAll('.btn-chip-perm').forEach(btn => {
      btn.addEventListener('click', () => {
        selecionarPermanencia(btn.dataset.id);
      });
    });
  }

  function selecionarPermanencia(permId) {
    const perm = estado.permanenciasAtivas.find(p => p.id === permId);
    if (!perm) return;
    estado.permanenciaSelecionada = perm;

    if (el.cardPermanencia) {
      el.cardPermanencia.classList.remove('hidden');
      el.permHospedeNome.textContent = perm.hospedes?.nome || 'Hóspede não identificado';
      el.permTipoIdentificacao.textContent = perm.tipo === 'hospedagem'
        ? `Apartamento / Quarto ${perm.quarto_numero}`
        : `Day Use (Área de Lazer / Piscina)`;
      el.permDocumento.textContent = `CPF/Doc: ${perm.hospedes?.documento || '---'} · PIN: ${perm.pin_acesso}`;
      el.permSaldo.textContent = `R$ ${Number(perm.saldo_devedor || 0).toFixed(2).replace('.', ',')}`;
    }

    renderizarChipsPermanencias();
    atualizarBotaoEnvio();
  }

  // 4. Consulta da tabela 'produtos' (apenas produtos ativos)
  async function carregarCatalogoProdutos() {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (error) {
      console.error('Erro ao consultar produtos ativos no Supabase:', error);
      return;
    }

    estado.produtos = data || [];
    renderizarCategorias();
    renderizarProdutos();
  }

  function renderizarCategorias() {
    if (!el.filtrosCategoria) return;
    const categorias = ['Todos', ...new Set(estado.produtos.map(p => p.categoria))];

    el.filtrosCategoria.innerHTML = categorias.map(cat => {
      const ativa = estado.categoriaAtiva === cat;
      return `
        <button type="button" data-cat="${cat}" class="btn-categoria px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${
          ativa
            ? 'bg-stone-900 text-white shadow-xs font-semibold'
            : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
        }">
          ${cat}
        </button>
      `;
    }).join('');

    el.filtrosCategoria.querySelectorAll('.btn-categoria').forEach(b => {
      b.addEventListener('click', () => {
        estado.categoriaAtiva = b.dataset.cat;
        renderizarCategorias();
        renderizarProdutos();
      });
    });
  }

  function renderizarProdutos() {
    if (!el.gridProdutos) return;
    const termo = estado.termoBusca.toLowerCase().trim();

    const produtosFiltrados = estado.produtos.filter(p => {
      const matchCat = estado.categoriaAtiva === 'Todos' || p.categoria === estado.categoriaAtiva;
      const matchBusca = !termo ||
        p.nome.toLowerCase().includes(termo) ||
        p.codigo_barras.toLowerCase().includes(termo) ||
        (p.descricao && p.descricao.toLowerCase().includes(termo));
      return matchCat && matchBusca;
    });

    if (produtosFiltrados.length === 0) {
      el.gridProdutos.innerHTML = `
        <div class="col-span-full py-12 text-center text-stone-400">
          <p class="text-xs">Nenhum produto encontrado para o filtro selecionado.</p>
        </div>
      `;
      return;
    }

    el.gridProdutos.innerHTML = produtosFiltrados.map(prod => {
      return `
        <div class="bg-white rounded-xl border border-stone-200 p-3 flex flex-col justify-between hover:border-amber-500/50 hover:shadow-xs transition-all group">
          <div>
            <div class="relative h-28 w-full rounded-lg overflow-hidden mb-2 bg-stone-100">
              <img src="${prod.imagem_url}" alt="${prod.nome}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='https://images.unsplash.com/photo-1544003484-3cd181d17917?w=300'"/>
              <span class="absolute bottom-1 right-1 bg-stone-900/80 backdrop-blur-2xs text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                ${prod.codigo_barras}
              </span>
            </div>
            <div class="text-[11px] text-amber-700 font-bold mb-0.5">${prod.categoria}</div>
            <h4 class="text-xs font-semibold text-stone-900 line-clamp-1 leading-snug">${prod.nome}</h4>
            <p class="text-[11px] text-stone-500 line-clamp-2 mt-0.5 leading-tight">${prod.descricao || ''}</p>
          </div>

          <div class="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between">
            <div>
              <span class="text-[10px] uppercase font-bold text-stone-400">Preço</span>
              <div class="text-sm font-bold text-stone-900">R$ ${Number(prod.preco).toFixed(2).replace('.', ',')}</div>
            </div>
            <button type="button" data-prod-id="${prod.id}" class="btn-adicionar-prod touch-target px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors">
              <span>+ Adicionar</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    el.gridProdutos.querySelectorAll('.btn-adicionar-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        adicionarAoCarrinho(btn.dataset.prodId);
      });
    });
  }

  // 5. Gerenciamento do Carrinho Dinâmico
  function adicionarAoCarrinho(prodId, qtd = 1) {
    const prod = estado.produtos.find(p => p.id === prodId);
    if (!prod) return;

    const itemExistente = estado.carrinho.find(i => i.produto_id === prodId);
    if (itemExistente) {
      itemExistente.quantidade += qtd;
    } else {
      estado.carrinho.push({
        produto_id: prod.id,
        produto: prod,
        quantidade: qtd,
        preco_unitario: Number(prod.preco), // Preço congelado no momento da adição
        observacao: ''
      });
    }

    if (window.BarcodeScannerService) {
      window.BarcodeScannerService.emitirBip('sucesso');
    }

    renderizarCarrinho();
  }

  function alterarQtdCarrinho(index, delta) {
    const item = estado.carrinho[index];
    if (!item) return;

    item.quantidade += delta;
    if (item.quantidade <= 0) {
      estado.carrinho.splice(index, 1);
    }
    renderizarCarrinho();
  }

  function alterarObsCarrinho(index, obs) {
    if (estado.carrinho[index]) {
      estado.carrinho[index].observacao = obs;
    }
  }

  function removerDoCarrinho(index) {
    estado.carrinho.splice(index, 1);
    renderizarCarrinho();
  }

  function calcularTotalCarrinho() {
    return estado.carrinho.reduce((acc, it) => acc + (it.preco_unitario * it.quantidade), 0);
  }

  function renderizarCarrinho() {
    if (!el.listaCarrinho) return;

    if (estado.carrinho.length === 0) {
      el.carrinhoVazio.classList.remove('hidden');
      el.listaCarrinho.innerHTML = '';
      el.carrinhoTotal.textContent = 'R$ 0,00';
      el.carrinhoQtdItens.textContent = '0 itens adicionados';
      atualizarBotaoEnvio();
      return;
    }

    el.carrinhoVazio.classList.add('hidden');
    const total = calcularTotalCarrinho();
    const qtdTotal = estado.carrinho.reduce((acc, it) => acc + it.quantidade, 0);

    el.carrinhoTotal.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    el.carrinhoQtdItens.textContent = `${qtdTotal} ${qtdTotal === 1 ? 'item' : 'itens'}`;

    el.listaCarrinho.innerHTML = estado.carrinho.map((it, idx) => {
      const subtotal = it.preco_unitario * it.quantidade;
      return `
        <div class="p-3 bg-stone-50 rounded-xl border border-stone-200/80 flex flex-col gap-2">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <h5 class="text-xs font-semibold text-stone-900 truncate">${it.produto.nome}</h5>
              <div class="text-[11px] text-stone-500">Preço unitário: R$ ${it.preco_unitario.toFixed(2).replace('.', ',')}</div>
            </div>
            <div class="text-right">
              <div class="text-xs font-bold text-stone-900">R$ ${subtotal.toFixed(2).replace('.', ',')}</div>
              <button type="button" data-idx="${idx}" class="btn-del-item text-[11px] text-rose-600 hover:text-rose-800 font-medium">Excluir</button>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center border border-stone-300 rounded-lg bg-white overflow-hidden">
              <button type="button" data-idx="${idx}" data-delta="-1" class="btn-qtd px-2.5 py-1 text-xs hover:bg-stone-100 font-bold text-stone-700">-</button>
              <span class="px-2.5 py-1 text-xs font-semibold text-stone-900 border-x border-stone-200 min-w-7 text-center">${it.quantidade}</span>
              <button type="button" data-idx="${idx}" data-delta="1" class="btn-qtd px-2.5 py-1 text-xs hover:bg-stone-100 font-bold text-stone-700">+</button>
            </div>
            <input type="text" data-idx="${idx}" value="${it.observacao}" placeholder="Observação (ex: sem gelo)" class="input-obs-item flex-1 text-xs px-2.5 py-1 bg-white border border-stone-200 rounded-lg placeholder-stone-400 focus:outline-none focus:border-stone-900"/>
          </div>
        </div>
      `;
    }).join('');

    el.listaCarrinho.querySelectorAll('.btn-qtd').forEach(b => {
      b.addEventListener('click', () => {
        alterarQtdCarrinho(Number(b.dataset.idx), Number(b.dataset.delta));
      });
    });

    el.listaCarrinho.querySelectorAll('.btn-del-item').forEach(b => {
      b.addEventListener('click', () => {
        removerDoCarrinho(Number(b.dataset.idx));
      });
    });

    el.listaCarrinho.querySelectorAll('.input-obs-item').forEach(inp => {
      inp.addEventListener('input', () => {
        alterarObsCarrinho(Number(inp.dataset.idx), inp.value);
      });
    });

    atualizarBotaoEnvio();
  }

  function atualizarBotaoEnvio() {
    if (!el.btnEnviarProposta) return;
    const valido = estado.permanenciaSelecionada && estado.carrinho.length > 0;
    el.btnEnviarProposta.disabled = !valido;
  }

  // 6. Envio da Proposta (Gravação em 'consumos' e 'itens_consumo' com RN07 - 5 Minutos)
  async function enviarPropostaParaCliente() {
    if (!estado.permanenciaSelecionada) {
      mostrarToast('Selecione uma comanda (Quarto ou Day Use) para vincular a proposta.', 'erro');
      return;
    }
    if (estado.carrinho.length === 0) {
      mostrarToast('O carrinho está vazio.', 'erro');
      return;
    }

    try {
      el.btnEnviarProposta.disabled = true;
      el.btnEnviarProposta.textContent = 'Enviando Proposta ao Hóspede...';

      const supabase = getSupabase();
      const payloadItens = estado.carrinho.map(it => ({
        produto_id: it.produto_id,
        quantidade: it.quantidade,
        observacao: it.observacao
      }));

      // Cria proposta através da camada de negócio do Supabase garantindo expiração de 5 minutos (RN07)
      const res = await supabase.negocio.criarProposta({
        permanencia_id: estado.permanenciaSelecionada.id,
        funcionario_id: estado.atendenteAtual ? estado.atendenteAtual.id : 'perf-001',
        itens: payloadItens,
        observacoes: el.obsGeral ? el.obsGeral.value : ''
      });

      mostrarToast(`Proposta ${res.consumo.codigo_proposta} enviada! Aguardando confirmação do hóspede.`, 'sucesso');

      // Limpar carrinho
      estado.carrinho = [];
      if (el.obsGeral) el.obsGeral.value = '';
      renderizarCarrinho();

      // Atualiza monitor e abre modal com QR Code para o hóspede
      await carregarMonitorPropostas();
      abrirModalQrProposta(res.consumo);
    } catch (err) {
      mostrarToast(err.message || 'Erro ao gerar proposta de consumo.', 'erro');
    } finally {
      if (el.btnEnviarProposta) {
        el.btnEnviarProposta.textContent = 'Gerar e Enviar Proposta ao Hóspede';
        atualizarBotaoEnvio();
      }
    }
  }

  // 7. Monitor em Tempo Real das Propostas e Bloqueio RN09
  async function carregarMonitorPropostas() {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('consumos')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(25);

    if (error) {
      console.error('Erro ao consultar monitor de propostas:', error);
      return;
    }

    estado.propostasRecentes = data || [];
    renderizarMonitorPropostas();
  }

  function renderizarMonitorPropostas() {
    if (!el.listaPropostas) return;

    if (estado.propostasRecentes.length === 0) {
      el.propostasVazio.classList.remove('hidden');
      el.listaPropostas.innerHTML = '';
      return;
    }

    el.propostasVazio.classList.add('hidden');

    el.listaPropostas.innerHTML = estado.propostasRecentes.map(prop => {
      const perm = prop.permanencias;
      const hospedeNome = perm?.hospedes?.nome || 'Hóspede';
      const identificacao = perm?.tipo === 'hospedagem' ? `🏨 Quarto ${perm.quarto_numero}` : `☀️ Day Use #${perm?.id ? perm.id.slice(-4) : 'Lazer'}`;
      const itensResumo = (prop.itens_consumo || []).map(i => `${i.quantidade}x ${i.produtos?.nome || 'Item'}`).join(', ');

      const status = prop.status; // 'aguardando' | 'confirmado' | 'recusado' | 'expirado' | 'estornado'
      let statusBadge = '';
      let acoesAtendente = '';

      if (status === 'aguardando') {
        // Cálculo estrito dos 5 minutos restantes
        const agora = Date.now();
        const expiraEmMs = new Date(prop.expira_em).getTime();
        const segRestantes = Math.max(0, Math.floor((expiraEmMs - agora) / 1000));
        const min = Math.floor(segRestantes / 60);
        const seg = segRestantes % 60;
        const tempoFmt = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;

        statusBadge = `
          <div class="flex items-center gap-1.5 text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded text-xs font-bold border border-amber-200">
            <span class="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            <span>Aguardando Hóspede (${tempoFmt})</span>
          </div>
        `;

        // RN09: O atendente NÃO TEM BOTÃO DE CONFIRMAR. Apenas opções de suporte ou cancelamento:
        acoesAtendente = `
          <div class="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-stone-100">
            <span class="text-[10px] text-stone-400 italic">Confirmação exclusiva pelo cliente</span>
            <div class="flex items-center gap-1.5">
              <button type="button" data-id="${prop.id}" class="btn-ver-link px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded text-xs font-semibold transition-colors">
                Ver QR / Link
              </button>
              <button type="button" data-id="${prop.id}" class="btn-cancelar-prop px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-xs font-semibold transition-colors">
                Cancelar Proposta
              </button>
            </div>
          </div>
        `;
      } else if (status === 'confirmado') {
        statusBadge = `
          <div class="flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded text-xs font-bold border border-emerald-200">
            <span>✓ Confirmado pelo Cliente</span>
          </div>
        `;
      } else if (status === 'recusado') {
        statusBadge = `
          <div class="flex items-center gap-1 text-rose-800 bg-rose-50 px-2 py-0.5 rounded text-xs font-bold border border-rose-200">
            <span>✕ Recusado pelo Cliente</span>
          </div>
        `;
      } else if (status === 'estornado') {
        statusBadge = `
          <div class="flex items-center gap-1 text-stone-600 bg-stone-100 px-2 py-0.5 rounded text-xs font-medium">
            <span>↩ Estornado no Caixa</span>
          </div>
        `;
      } else {
        statusBadge = `
          <div class="flex items-center gap-1 text-stone-500 bg-stone-100 px-2 py-0.5 rounded text-xs font-medium">
            <span>⏱️ Expirado (5 min)</span>
          </div>
        `;
      }

      return `
        <div class="p-3 bg-white rounded-xl border border-stone-200 flex flex-col justify-between transition-all">
          <div>
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-mono text-xs font-bold text-stone-900">${prop.codigo_proposta}</span>
              ${statusBadge}
            </div>
            <div class="text-xs font-semibold text-stone-900">${identificacao} · <span class="font-normal text-stone-600">${hospedeNome}</span></div>
            <div class="text-[11px] text-stone-500 truncate mt-0.5">${itensResumo || 'Sem itens discriminados'}</div>
            ${prop.observacoes ? `<div class="text-[11px] text-stone-400 italic mt-0.5">${prop.observacoes}</div>` : ''}
          </div>

          <div class="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between">
            <span class="text-xs font-bold text-stone-900">R$ ${Number(prop.valor_total).toFixed(2).replace('.', ',')}</span>
            <span class="text-[10px] text-stone-400">${new Date(prop.criado_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          ${acoesAtendente}
        </div>
      `;
    }).join('');

    // Eventos dos botões do monitor
    el.listaPropostas.querySelectorAll('.btn-cancelar-prop').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deseja realmente cancelar esta proposta pendente?')) return;
        try {
          const supabase = getSupabase();
          await supabase.negocio.cancelarPropostaAtendente({ consumo_id: btn.dataset.id });
          mostrarToast('Proposta cancelada.', 'info');
          await carregarMonitorPropostas();
        } catch (e) {
          mostrarToast(e.message, 'erro');
        }
      });
    });

    el.listaPropostas.querySelectorAll('.btn-ver-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const prop = estado.propostasRecentes.find(p => p.id === btn.dataset.id);
        if (prop) abrirModalQrProposta(prop);
      });
    });
  }

  function atualizarContadoresMonitor() {
    if (!el.listaPropostas) return;
    const temAguardando = estado.propostasRecentes.some(p => p.status === 'aguardando');
    if (temAguardando) {
      renderizarMonitorPropostas();
    }
  }

  // 8. Modal do QR Code e Link Direto para o Smartphone do Cliente
  function abrirModalQrProposta(prop) {
    if (!el.modalQrProposta) return;
    const perm = prop.permanencias || estado.permanenciaSelecionada;
    const permId = prop.permanencia_id;
    const urlCliente = `${window.location.origin}/cliente.html?p=${permId}&prop=${prop.codigo_proposta}`;

    el.qrPropostaCodigo.textContent = prop.codigo_proposta;
    el.qrPropostaValor.textContent = `R$ ${Number(prop.valor_total).toFixed(2).replace('.', ',')}`;
    el.qrPropostaQuarto.textContent = perm?.tipo === 'hospedagem' ? `Quarto ${perm.quarto_numero}` : 'Day Use Lazer';
    el.qrPropostaLink.value = urlCliente;

    if (el.qrPropostaImg) {
      el.qrPropostaImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(urlCliente)}`;
    }

    el.modalQrProposta.classList.remove('hidden');
  }

  function fecharModalQrProposta() {
    if (el.modalQrProposta) el.modalQrProposta.classList.add('hidden');
  }

  // 9. Leitor de Câmera (WebRTC + BarcodeDetector)
  function abrirCameraScanner() {
    if (!el.modalCamera) return;
    el.modalCamera.classList.remove('hidden');
    if (window.BarcodeScannerService) {
      window.BarcodeScannerService.iniciarCamera({
        videoElement: el.videoCamera,
        onCodigoLido: (codigo) => {
          fecharCameraScanner();
          processarCodigoBarras(codigo);
        },
        onError: (err) => {
          mostrarToast(err, 'erro');
          fecharCameraScanner();
        }
      });
    }
  }

  function fecharCameraScanner() {
    if (el.modalCamera) el.modalCamera.classList.add('hidden');
    if (window.BarcodeScannerService) {
      window.BarcodeScannerService.pararCamera();
    }
  }

  // Processamento de Código de Barras (Câmera ou USB Keyboard-wedge)
  function processarCodigoBarras(codigo) {
    const limpo = String(codigo).trim();
    if (!limpo) return;

    // 1. Tentar encontrar produto no catálogo
    const prod = estado.produtos.find(p => p.codigo_barras === limpo);
    if (prod) {
      adicionarAoCarrinho(prod.id, 1);
      mostrarToast(`Produto bipado: ${prod.nome}`, 'sucesso');
      return;
    }

    // 2. Tentar encontrar quarto ou pulseira de Day Use
    const perm = estado.permanenciasAtivas.find(p =>
      p.quarto_numero === limpo ||
      p.hospedes?.documento === limpo ||
      p.id === limpo ||
      p.id.slice(-4) === limpo
    );

    if (perm) {
      selecionarPermanencia(perm.id);
      mostrarToast(`Comanda identificada: ${perm.tipo === 'hospedagem' ? 'Quarto ' + perm.quarto_numero : 'Day Use'}`, 'sucesso');
      return;
    }

    mostrarToast(`Código não reconhecido: ${limpo}`, 'erro');
  }

  // 10. Tratamento de Notificações em Tempo Real
  function lidarComEventoRealtime(payload) {
    if (!payload) return;

    if (payload.evento === 'PROPOSTA_CONFIRMADA') {
      if (window.BarcodeScannerService) window.BarcodeScannerService.emitirBip('sucesso');
      mostrarToast(`🎉 Proposta ${payload.consumo.codigo_proposta} foi CONFIRMADA pelo cliente!`, 'sucesso');
      carregarMonitorPropostas();
      carregarPermanenciasAbertas();
    } else if (payload.evento === 'PROPOSTA_RECUSADA') {
      if (window.BarcodeScannerService) window.BarcodeScannerService.emitirBip('erro');
      mostrarToast(`⚠️ Proposta ${payload.consumo.codigo_proposta} foi RECUSADA pelo cliente.`, 'alerta');
      carregarMonitorPropostas();
    } else if (payload.evento === 'UPDATE_EXPIRADO' || payload.evento === 'PROPOSTA_CANCELADA') {
      carregarMonitorPropostas();
    } else if (payload.tabela === 'produtos' || payload.evento === 'PRODUTOS_ATUALIZADOS' || payload.evento === 'DATABASE_RESET') {
      carregarCatalogoProdutos();
      mostrarToast('📦 Catálogo de produtos sincronizado!', 'info');
    } else if (payload.tabela === 'permanencias') {
      carregarPermanenciasAbertas();
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

    el.toastNotificacao.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 transition-all transform duration-200 ${cores[tipo] || cores.info}`;
    el.toastNotificacao.classList.remove('hidden');

    setTimeout(() => {
      el.toastNotificacao.classList.add('hidden');
    }, 4000);
  }

  function configurarEventos() {
    if (el.buscaProduto) {
      el.buscaProduto.addEventListener('input', (e) => {
        estado.termoBusca = e.target.value;
        renderizarProdutos();
      });
    }

    if (el.buscaPermanencia) {
      el.buscaPermanencia.addEventListener('input', () => {
        renderizarChipsPermanencias();
      });
    }

    if (el.seletorAtendente) {
      el.seletorAtendente.addEventListener('change', async (e) => {
        const supabase = getSupabase();
        const { data: perfil } = await supabase.from('perfis').select('*').eq('id', e.target.value).single();
        if (perfil) {
          estado.atendenteAtual = perfil;
          atualizarBadgeAtendente();
          mostrarToast(`Atendente alterado para: ${perfil.nome_completo}`, 'info');
        }
      });
    }

    if (el.btnEnviarProposta) {
      el.btnEnviarProposta.addEventListener('click', enviarPropostaParaCliente);
    }

    if (el.btnAbrirCamera) {
      el.btnAbrirCamera.addEventListener('click', abrirCameraScanner);
    }

    if (el.btnFecharCamera) {
      el.btnFecharCamera.addEventListener('click', fecharCameraScanner);
    }

    if (el.btnFecharQrProposta) {
      el.btnFecharQrProposta.addEventListener('click', fecharModalQrProposta);
    }

    if (el.btnCopiarLinkProposta) {
      el.btnCopiarLinkProposta.addEventListener('click', () => {
        if (el.qrPropostaLink) {
          navigator.clipboard.writeText(el.qrPropostaLink.value);
          mostrarToast('Link copiado para a área de transferência!', 'sucesso');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
})();
