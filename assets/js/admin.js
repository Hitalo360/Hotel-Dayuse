/**
 * Hotel & Day Use - Módulo de Administração & Cadastros Base
 * assets/js/admin.js
 * Gerenciamento de Produtos (tabela 'produtos'), Quartos (tabela 'quartos')
 * e Carga Inicial de Testes / Seed do Banco Supabase.
 */

(function () {
  'use strict';

  // Estado da Aplicação
  const state = {
    produtos: [],
    quartos: [],
    permanencias: [],
    abaAtiva: 'produtos', // 'produtos', 'quartos'
    buscaProduto: '',
    filtroCategoria: 'todas',
    buscaQuarto: '',
    filtroStatusQuarto: 'todos',
    produtoEmEdicaoId: null,
    quartoEmEdicaoId: null,
    operadorAtual: {
      id: 'perf-004',
      nome_completo: 'Roberto Albuquerque (Gerente Geral)',
      funcao: 'gerente'
    }
  };

  // Funções Utilitárias
  function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function gerarCodigoBarrasEAN() {
    return '7891000' + Math.floor(1000 + Math.random() * 9000);
  }

  function mostrarNotificacao(mensagem, tipo = 'sucesso') {
    const toast = document.getElementById('notificacao-toast');
    if (!toast) return;

    const texto = document.getElementById('notificacao-texto');
    const icone = document.getElementById('notificacao-icone');

    if (texto) texto.textContent = mensagem;

    toast.classList.remove('hidden', 'border-emerald-500', 'border-rose-500', 'border-amber-500', 'bg-emerald-950/95', 'bg-rose-950/95', 'bg-amber-950/95');

    if (tipo === 'sucesso') {
      toast.classList.add('border-emerald-500', 'bg-emerald-950/95');
      if (icone) icone.innerHTML = '✓';
    } else if (tipo === 'erro') {
      toast.classList.add('border-rose-500', 'bg-rose-950/95');
      if (icone) icone.innerHTML = '✕';
    } else {
      toast.classList.add('border-amber-500', 'bg-amber-950/95');
      if (icone) icone.innerHTML = 'ℹ';
    }

    toast.classList.remove('opacity-0', 'translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 4500);
  }

  // Carga Geral de Dados do Supabase
  async function carregarDados() {
    try {
      const client = window.hotelSupabase;
      if (!client) throw new Error('Cliente Supabase não disponível.');

      const resProdutos = await client.from('produtos').select('*').order('nome', { ascending: true });
      const resQuartos = await client.from('quartos').select('*').order('numero', { ascending: true });
      const resPerms = await client.from('permanencias').select('*').order('checkin', { ascending: false });

      state.produtos = resProdutos.data || [];
      state.quartos = resQuartos.data || [];
      state.permanencias = resPerms.data || [];

      atualizarMetricasGerais();
      renderizarProdutos();
      renderizarQuartos();
      atualizarFiltrosCategorias();
    } catch (err) {
      console.error('Erro ao carregar dados do admin:', err);
      mostrarNotificacao('Erro ao carregar banco: ' + (err.message || err), 'erro');
    }
  }

  // Atualiza cartões de métricas no topo
  function atualizarMetricasGerais() {
    const elTotalProdutos = document.getElementById('stat-total-produtos');
    const elProdutosAtivos = document.getElementById('stat-produtos-ativos');
    const elTotalQuartos = document.getElementById('stat-total-quartos');
    const elQuartosDisponiveis = document.getElementById('stat-quartos-disponiveis');
    const elQuartosOcupados = document.getElementById('stat-quartos-ocupados');

    const totalProd = state.produtos.length;
    const ativosProd = state.produtos.filter(p => p.ativo).length;
    const totalQto = state.quartos.length;
    const dispQto = state.quartos.filter(q => q.status === 'disponivel').length;
    const ocupQto = state.quartos.filter(q => q.status === 'ocupado').length;

    if (elTotalProdutos) elTotalProdutos.textContent = totalProd;
    if (elProdutosAtivos) elProdutosAtivos.textContent = `${ativosProd} no PDV`;
    if (elTotalQuartos) elTotalQuartos.textContent = totalQto;
    if (elQuartosDisponiveis) elQuartosDisponiveis.textContent = `${dispQto} livres`;
    if (elQuartosOcupados) elQuartosOcupados.textContent = `${ocupQto} com hóspede`;
  }

  // ==========================================
  // SEÇÃO DE PRODUTOS
  // ==========================================

  function atualizarFiltrosCategorias() {
    const container = document.getElementById('container-filtros-categorias');
    if (!container) return;

    const categorias = ['todas', ...new Set(state.produtos.map(p => p.categoria || 'Geral'))];

    container.innerHTML = categorias.map(cat => {
      const isAtiva = state.filtroCategoria === cat;
      const label = cat === 'todas' ? 'Todas as Categorias' : cat;
      return `
        <button
          type="button"
          class="btn-categoria-filtro px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            isAtiva ? 'bg-amber-600 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }"
          data-categoria="${cat}"
        >
          ${label}
        </button>
      `;
    }).join('');

    container.querySelectorAll('.btn-categoria-filtro').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.filtroCategoria = e.currentTarget.dataset.categoria;
        atualizarFiltrosCategorias();
        renderizarProdutos();
      });
    });
  }

  function renderizarProdutos() {
    const tbody = document.getElementById('tabela-produtos-body');
    const emptyState = document.getElementById('produtos-vazio');
    if (!tbody) return;

    let lista = [...state.produtos];

    // Filtro por categoria
    if (state.filtroCategoria !== 'todas') {
      lista = lista.filter(p => (p.categoria || 'Geral').toLowerCase() === state.filtroCategoria.toLowerCase());
    }

    // Filtro por busca
    if (state.buscaProduto.trim()) {
      const termo = state.buscaProduto.toLowerCase().trim();
      lista = lista.filter(p => {
        const nome = (p.nome || '').toLowerCase();
        const cat = (p.categoria || '').toLowerCase();
        const cod = (p.codigo_barras || '').toLowerCase();
        const desc = (p.descricao || '').toLowerCase();
        return nome.includes(termo) || cat.includes(termo) || cod.includes(termo) || desc.includes(termo);
      });
    }

    if (lista.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    tbody.innerHTML = lista.map(p => {
      const isAtivo = p.ativo !== false;
      return `
        <tr class="border-b border-stone-200/70 hover:bg-stone-50/80 transition-colors text-xs ${!isAtivo ? 'opacity-60 bg-stone-50/40' : ''}">
          
          <!-- Imagem e Identificação -->
          <td class="p-3">
            <div class="flex items-center gap-3">
              <img
                src="${p.imagem_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop&q=60'}"
                alt="${p.nome}"
                class="w-11 h-11 rounded-lg object-cover bg-stone-100 border border-stone-200 shrink-0"
                onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop&q=60'"
              />
              <div>
                <div class="font-bold text-stone-900">${p.nome}</div>
                <div class="text-[11px] text-stone-500 line-clamp-1 max-w-xs">${p.descricao || 'Sem descrição'}</div>
              </div>
            </div>
          </td>

          <!-- Categoria -->
          <td class="p-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
              ${p.categoria || 'Geral'}
            </span>
          </td>

          <!-- Preço -->
          <td class="p-3 font-mono font-bold text-stone-900 text-sm">
            ${formatarMoeda(p.preco)}
          </td>

          <!-- Código de Barras -->
          <td class="p-3 font-mono text-[11px] text-stone-600">
            <span class="bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
              ${p.codigo_barras || '—'}
            </span>
          </td>

          <!-- Estoque -->
          <td class="p-3 text-stone-700 font-mono text-center">
            ${p.estoque !== undefined ? p.estoque : '—'}
          </td>

          <!-- Status no PDV -->
          <td class="p-3">
            <button
              type="button"
              class="btn-toggle-ativo-produto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                isAtivo
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-stone-200 text-stone-600 border border-stone-300 hover:bg-stone-300'
              }"
              data-id="${p.id}"
              title="Clique para alternar ativação no PDV"
            >
              <span class="w-1.5 h-1.5 rounded-full ${isAtivo ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}"></span>
              <span>${isAtivo ? 'Ativo no PDV' : 'Inativo'}</span>
            </button>
          </td>

          <!-- Ações -->
          <td class="p-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button
                type="button"
                class="btn-editar-produto p-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-200 transition"
                data-id="${p.id}"
                title="Editar este produto"
              >
                ✏️
              </button>
              <button
                type="button"
                class="btn-excluir-produto p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-100 transition"
                data-id="${p.id}"
                data-nome="${p.nome}"
                title="Excluir este produto"
              >
                🗑️
              </button>
            </div>
          </td>

        </tr>
      `;
    }).join('');

    // Vincula eventos dos botões da tabela
    configurarEventosTabelaProdutos();
  }

  function configurarEventosTabelaProdutos() {
    // Alternar status ativo
    document.querySelectorAll('.btn-toggle-ativo-produto').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        try {
          const client = window.hotelSupabase;
          const { produto } = await client.negocio.alternarStatusProduto(id);
          mostrarNotificacao(`Produto "${produto.nome}" agora está ${produto.ativo ? 'ATIVO' : 'INATIVO'} no PDV.`, 'sucesso');
          await carregarDados();
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao alterar status.', 'erro');
        }
      });
    });

    // Editar produto
    document.querySelectorAll('.btn-editar-produto').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const prod = state.produtos.find(p => p.id === id);
        if (!prod) return;

        state.produtoEmEdicaoId = id;

        document.getElementById('form-produto-titulo').textContent = `Editando: ${prod.nome}`;
        document.getElementById('btn-cancelar-edicao-produto').classList.remove('hidden');

        document.getElementById('prod-nome').value = prod.nome || '';
        document.getElementById('prod-categoria').value = prod.categoria || 'Bebidas';
        document.getElementById('prod-preco').value = prod.preco !== undefined ? prod.preco : '';
        document.getElementById('prod-codigo-barras').value = prod.codigo_barras || '';
        document.getElementById('prod-estoque').value = prod.estoque !== undefined ? prod.estoque : 100;
        document.getElementById('prod-descricao').value = prod.descricao || '';
        document.getElementById('prod-imagem-url').value = prod.imagem_url || '';
        document.getElementById('prod-ativo').checked = prod.ativo !== false;

        atualizarPreviewImagemProduto(prod.imagem_url);

        // Rola até o formulário de produtos
        document.getElementById('card-formulario-produto')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Excluir produto
    document.querySelectorAll('.btn-excluir-produto').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const nome = e.currentTarget.dataset.nome;
        if (!confirm(`Tem certeza que deseja excluir permanentemente o produto "${nome}"?`)) return;

        try {
          const client = window.hotelSupabase;
          await client.negocio.excluirProduto(id);
          mostrarNotificacao(`Produto "${nome}" excluído com sucesso.`, 'sucesso');
          if (state.produtoEmEdicaoId === id) resetarFormularioProduto();
          await carregarDados();
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao excluir produto.', 'erro');
        }
      });
    });
  }

  function resetarFormularioProduto() {
    state.produtoEmEdicaoId = null;
    const form = document.getElementById('form-cadastro-produto');
    if (form) form.reset();

    const titulo = document.getElementById('form-produto-titulo');
    if (titulo) titulo.textContent = 'Novo Produto';

    const btnCancelar = document.getElementById('btn-cancelar-edicao-produto');
    if (btnCancelar) btnCancelar.classList.add('hidden');

    const inputCodigo = document.getElementById('prod-codigo-barras');
    if (inputCodigo) inputCodigo.value = gerarCodigoBarrasEAN();

    const inputEstoque = document.getElementById('prod-estoque');
    if (inputEstoque) inputEstoque.value = '100';

    const checkAtivo = document.getElementById('prod-ativo');
    if (checkAtivo) checkAtivo.checked = true;

    atualizarPreviewImagemProduto('');
  }

  function atualizarPreviewImagemProduto(url) {
    const img = document.getElementById('preview-imagem-produto');
    if (!img) return;
    img.src = url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop&q=60';
  }

  // ==========================================
  // SEÇÃO DE QUARTOS
  // ==========================================

  function renderizarQuartos() {
    const container = document.getElementById('grid-quartos-container');
    const emptyState = document.getElementById('quartos-vazio');
    if (!container) return;

    let lista = [...state.quartos];

    // Filtro de status
    if (state.filtroStatusQuarto !== 'todos') {
      lista = lista.filter(q => q.status === state.filtroStatusQuarto);
    }

    // Busca textual
    if (state.buscaQuarto.trim()) {
      const termo = state.buscaQuarto.toLowerCase().trim();
      lista = lista.filter(q => {
        const num = String(q.numero || '').toLowerCase();
        const tipo = String(q.tipo || '').toLowerCase();
        const desc = String(q.descricao || '').toLowerCase();
        return num.includes(termo) || tipo.includes(termo) || desc.includes(termo);
      });
    }

    if (lista.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = lista.map(q => {
      // Verifica permanência ativa vinculada a este quarto
      const permAtiva = state.permanencias.find(p => p.status === 'aberta' && String(p.quarto_numero) === String(q.numero));
      const estaOcupado = q.status === 'ocupado' || !!permAtiva;
      const emManutencao = q.status === 'manutencao';

      let corBorda = 'border-emerald-200 bg-white';
      let badgeStatus = `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Disponível
        </span>
      `;

      if (estaOcupado) {
        corBorda = 'border-rose-200 bg-rose-50/30';
        badgeStatus = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            Ocupado ${permAtiva ? `(Conta: ${permAtiva.id})` : ''}
          </span>
        `;
      } else if (emManutencao) {
        corBorda = 'border-amber-200 bg-amber-50/30';
        badgeStatus = `
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Em Manutenção
          </span>
        `;
      }

      return `
        <div class="rounded-xl border ${corBorda} p-4 shadow-xs transition-all hover:shadow-md flex flex-col justify-between gap-3">
          
          <!-- Cabeçalho do Quarto -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xl font-mono font-extrabold text-stone-900">🚪 ${q.numero}</span>
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                  ${q.tipo || 'Standard'}
                </span>
              </div>
              <div class="text-[11px] text-stone-500 mt-1 line-clamp-2">
                ${q.descricao || 'Sem observações cadastradas'}
              </div>
            </div>
            <div>
              ${badgeStatus}
            </div>
          </div>

          <!-- Informações de Capacidade e Diária -->
          <div class="grid grid-cols-2 gap-2 text-xs py-2 border-y border-stone-100">
            <div class="bg-stone-50 p-2 rounded-lg border border-stone-100">
              <span class="text-[10px] text-stone-400 uppercase font-semibold block">Capacidade</span>
              <span class="font-bold text-stone-800">👥 ${q.capacidade || 2} pessoas</span>
            </div>
            <div class="bg-stone-50 p-2 rounded-lg border border-stone-100">
              <span class="text-[10px] text-stone-400 uppercase font-semibold block">Diária Base</span>
              <span class="font-bold text-stone-800 font-mono">${formatarMoeda(q.diaria_base)}</span>
            </div>
          </div>

          <!-- Ações do Quarto -->
          <div class="flex items-center justify-between gap-2 pt-1">
            
            <!-- Seletor Rápido de Status -->
            <div class="flex items-center gap-1.5">
              <label class="text-[10px] uppercase font-bold text-stone-400">Status:</label>
              <select
                class="select-mudar-status-quarto bg-stone-50 border border-stone-300 text-stone-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                data-id="${q.id}"
                ${permAtiva ? 'title="Quarto possui permanência ativa. Realize o check-out no Caixa para liberar."' : ''}
              >
                <option value="disponivel" ${q.status === 'disponivel' ? 'selected' : ''}>Disponível</option>
                <option value="ocupado" ${q.status === 'ocupado' ? 'selected' : ''}>Ocupado</option>
                <option value="manutencao" ${q.status === 'manutencao' ? 'selected' : ''}>Manutenção</option>
              </select>
            </div>

            <!-- Botões Editar / Excluir -->
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="btn-editar-quarto p-1.5 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition"
                data-id="${q.id}"
                title="Editar quarto"
              >
                ✏️
              </button>
              <button
                type="button"
                class="btn-excluir-quarto p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-100 transition"
                data-id="${q.id}"
                data-numero="${q.numero}"
                title="Excluir quarto"
              >
                🗑️
              </button>
            </div>

          </div>

        </div>
      `;
    }).join('');

    configurarEventosQuartos();
  }

  function configurarEventosQuartos() {
    // Alteração rápida de status
    document.querySelectorAll('.select-mudar-status-quarto').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const id = e.currentTarget.dataset.id;
        const novoStatus = e.currentTarget.value;
        try {
          const client = window.hotelSupabase;
          const { quarto } = await client.negocio.alterarStatusQuarto(id, novoStatus);
          mostrarNotificacao(`Status do Quarto ${quarto.numero} alterado para "${novoStatus.toUpperCase()}".`, 'sucesso');
          await carregarDados();
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao alterar status do quarto.', 'erro');
          await carregarDados(); // Reverte visual
        }
      });
    });

    // Editar quarto
    document.querySelectorAll('.btn-editar-quarto').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const qto = state.quartos.find(q => q.id === id);
        if (!qto) return;

        state.quartoEmEdicaoId = id;

        document.getElementById('form-quarto-titulo').textContent = `Editando: Quarto ${qto.numero}`;
        document.getElementById('btn-cancelar-edicao-quarto').classList.remove('hidden');

        document.getElementById('qto-numero').value = qto.numero || '';
        document.getElementById('qto-tipo').value = qto.tipo || 'Standard';
        document.getElementById('qto-capacidade').value = qto.capacidade || 2;
        document.getElementById('qto-diaria').value = qto.diaria_base || 220;
        document.getElementById('qto-status').value = qto.status || 'disponivel';
        document.getElementById('qto-descricao').value = qto.descricao || '';

        document.getElementById('card-formulario-quarto')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Excluir quarto
    document.querySelectorAll('.btn-excluir-quarto').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const numero = e.currentTarget.dataset.numero;
        if (!confirm(`Deseja realmente remover o Quarto ${numero} do cadastro?`)) return;

        try {
          const client = window.hotelSupabase;
          await client.negocio.excluirQuarto(id);
          mostrarNotificacao(`Quarto ${numero} removido com sucesso.`, 'sucesso');
          if (state.quartoEmEdicaoId === id) resetarFormularioQuarto();
          await carregarDados();
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao remover quarto.', 'erro');
        }
      });
    });
  }

  function resetarFormularioQuarto() {
    state.quartoEmEdicaoId = null;
    const form = document.getElementById('form-cadastro-quarto');
    if (form) form.reset();

    const titulo = document.getElementById('form-quarto-titulo');
    if (titulo) titulo.textContent = 'Novo Quarto';

    const btnCancelar = document.getElementById('btn-cancelar-edicao-quarto');
    if (btnCancelar) btnCancelar.classList.add('hidden');

    const inputCap = document.getElementById('qto-capacidade');
    if (inputCap) inputCap.value = '2';

    const inputDiaria = document.getElementById('qto-diaria');
    if (inputDiaria) inputDiaria.value = '220.00';

    const selectStatus = document.getElementById('qto-status');
    if (selectStatus) selectStatus.value = 'disponivel';
  }

  // ==========================================
  // CONFIGURAÇÃO DOS FORMULÁRIOS & SEED
  // ==========================================

  function configurarFormularios() {
    // 1. Submissão do Formulário de Produto
    const formProduto = document.getElementById('form-cadastro-produto');
    if (formProduto) {
      formProduto.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nome = document.getElementById('prod-nome').value.trim();
        const categoria = document.getElementById('prod-categoria').value.trim();
        const preco = document.getElementById('prod-preco').value;
        const codigo_barras = document.getElementById('prod-codigo-barras').value.trim();
        const estoque = document.getElementById('prod-estoque').value;
        const descricao = document.getElementById('prod-descricao').value.trim();
        const imagem_url = document.getElementById('prod-imagem-url').value.trim();
        const ativo = document.getElementById('prod-ativo').checked;

        try {
          const client = window.hotelSupabase;
          const { produto } = await client.negocio.salvarProduto({
            id: state.produtoEmEdicaoId,
            nome,
            categoria,
            preco,
            codigo_barras,
            estoque,
            descricao,
            imagem_url,
            ativo
          });

          mostrarNotificacao(`Produto "${produto.nome}" salvo com sucesso! Catálogo do PDV atualizado.`, 'sucesso');
          resetarFormularioProduto();
          await carregarDados();
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao salvar produto.', 'erro');
        }
      });
    }

    // Botão Cancelar Edição de Produto
    const btnCancelarProd = document.getElementById('btn-cancelar-edicao-produto');
    if (btnCancelarProd) {
      btnCancelarProd.addEventListener('click', resetarFormularioProduto);
    }

    // Botão Gerar Código de Barras
    const btnGerarEan = document.getElementById('btn-gerar-codigo-barras');
    if (btnGerarEan) {
      btnGerarEan.addEventListener('click', () => {
        const input = document.getElementById('prod-codigo-barras');
        if (input) input.value = gerarCodigoBarrasEAN();
      });
    }

    // Preview de Imagem de Produto ao digitar URL
    const inputImgUrl = document.getElementById('prod-imagem-url');
    if (inputImgUrl) {
      inputImgUrl.addEventListener('input', (e) => {
        atualizarPreviewImagemProduto(e.target.value.trim());
      });
    }

    // 2. Submissão do Formulário de Quarto
    const formQuarto = document.getElementById('form-cadastro-quarto');
    if (formQuarto) {
      formQuarto.addEventListener('submit', async (e) => {
        e.preventDefault();

        const numero = document.getElementById('qto-numero').value.trim();
        const tipo = document.getElementById('qto-tipo').value.trim();
        const capacidade = document.getElementById('qto-capacidade').value;
        const diaria_base = document.getElementById('qto-diaria').value;
        const status = document.getElementById('qto-status').value;
        const descricao = document.getElementById('qto-descricao').value.trim();

        try {
          const client = window.hotelSupabase;
          const { quarto } = await client.negocio.salvarQuarto({
            id: state.quartoEmEdicaoId,
            numero,
            tipo,
            capacidade,
            diaria_base,
            status,
            descricao
          });

          mostrarNotificacao(`Quarto ${quarto.numero} salvo com sucesso! Disponível para a Recepção.`, 'sucesso');
          resetarFormularioQuarto();
          await carregarDados();
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao salvar quarto.', 'erro');
        }
      });
    }

    // Botão Cancelar Edição de Quarto
    const btnCancelarQto = document.getElementById('btn-cancelar-edicao-quarto');
    if (btnCancelarQto) {
      btnCancelarQto.addEventListener('click', resetarFormularioQuarto);
    }

    // 3. Busca de Produtos e Quartos
    const inputBuscaProd = document.getElementById('input-busca-produtos');
    if (inputBuscaProd) {
      inputBuscaProd.addEventListener('input', (e) => {
        state.buscaProduto = e.target.value;
        renderizarProdutos();
      });
    }

    const inputBuscaQto = document.getElementById('input-busca-quartos');
    if (inputBuscaQto) {
      inputBuscaQto.addEventListener('input', (e) => {
        state.buscaQuarto = e.target.value;
        renderizarQuartos();
      });
    }

    // Filtros de Status do Quarto
    document.querySelectorAll('.btn-filtro-quarto-status').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-filtro-quarto-status').forEach(b => {
          b.classList.remove('bg-stone-900', 'text-white', 'shadow-xs');
          b.classList.add('bg-stone-100', 'text-stone-600', 'hover:bg-stone-200');
        });
        const botao = e.currentTarget;
        botao.classList.remove('bg-stone-100', 'text-stone-600', 'hover:bg-stone-200');
        botao.classList.add('bg-stone-900', 'text-white', 'shadow-xs');

        state.filtroStatusQuarto = botao.dataset.status;
        renderizarQuartos();
      });
    });

    // 4. Alternador de Abas Principais (Produtos vs Quartos)
    const btnAbaProdutos = document.getElementById('btn-aba-produtos');
    const btnAbaQuartos = document.getElementById('btn-aba-quartos');
    const secProdutos = document.getElementById('secao-produtos');
    const secQuartos = document.getElementById('secao-quartos');

    if (btnAbaProdutos && btnAbaQuartos && secProdutos && secQuartos) {
      btnAbaProdutos.addEventListener('click', () => {
        state.abaAtiva = 'produtos';
        btnAbaProdutos.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white shadow-sm transition flex items-center gap-1.5';
        btnAbaQuartos.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-stone-100 text-stone-600 hover:bg-stone-200 transition flex items-center gap-1.5';
        secProdutos.classList.remove('hidden');
        secQuartos.classList.add('hidden');
      });

      btnAbaQuartos.addEventListener('click', () => {
        state.abaAtiva = 'quartos';
        btnAbaQuartos.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white shadow-sm transition flex items-center gap-1.5';
        btnAbaProdutos.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-stone-100 text-stone-600 hover:bg-stone-200 transition flex items-center gap-1.5';
        secQuartos.classList.remove('hidden');
        secProdutos.classList.add('hidden');
      });
    }

    // 5. Botão Carga Inicial de Demonstração / Seed
    const btnPopularSeed = document.getElementById('btn-popular-seed-demo');
    if (btnPopularSeed) {
      btnPopularSeed.addEventListener('click', async () => {
        if (!confirm('Deseja carregar o catálogo de demonstração inicial no banco de dados (Água de Coco R$ 12, Cerveja R$ 15, Porção de Fritas R$ 35, e Quartos 101 a 205)?')) {
          return;
        }

        try {
          const client = window.hotelSupabase;
          await client.negocio.popularSeedInicial();
          mostrarNotificacao('Catálogo inicial e quartos de demonstração carregados com sucesso!', 'sucesso');
          await carregarDados();
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao carregar seed.', 'erro');
        }
      });
    }

    // Inicializa código de barras automático no form
    const inputCodigoBarras = document.getElementById('prod-codigo-barras');
    if (inputCodigoBarras && !inputCodigoBarras.value) {
      inputCodigoBarras.value = gerarCodigoBarrasEAN();
    }
  }

  // Escuta de mudanças em tempo real via Supabase Channel
  function configurarRealtime() {
    const client = window.hotelSupabase;
    if (!client) return;

    client
      .channel('admin-mudancas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quartos' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permanencias' }, () => carregarDados())
      .subscribe();
  }

  // Inicialização
  document.addEventListener('DOMContentLoaded', async () => {
    configurarFormularios();
    await carregarDados();
    configurarRealtime();

    // Suporte a hash na URL (#quartos)
    if (window.location.hash === '#quartos') {
      const btnAbaQuartos = document.getElementById('btn-aba-quartos');
      if (btnAbaQuartos) btnAbaQuartos.click();
    }

    console.log('✅ Módulo de Administração & Cadastros inicializado.');
  });

})();
