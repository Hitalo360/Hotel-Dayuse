import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Monitor,
  Receipt,
  Database,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  UserCheck,
  Settings
} from 'lucide-react';

export default function App() {
  const [modoAtivo, setModoAtivo] = useState<'simulador' | 'recepcao' | 'atendente' | 'cliente' | 'caixa' | 'admin' | 'banco'>('simulador');
  const [timestampReload, setTimestampReload] = useState(Date.now());
  const [bancoDados, setBancoDados] = useState<any>(null);
  const [tabelaSelecionada, setTabelaSelecionada] = useState<string>('consumos');

  // Carrega estado do banco do localStorage
  const recarregarBanco = () => {
    try {
      const salvo = localStorage.getItem('hotel_day_use_db_v2');
      if (salvo) {
        setBancoDados(JSON.parse(salvo));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    recarregarBanco();
    const interval = setInterval(recarregarBanco, 2000);
    return () => clearInterval(interval);
  }, []);

  const resetarDemonstracao = () => {
    if (confirm('Deseja restaurar os dados de demonstração iniciais para o padrão de fábrica?')) {
      if ((window as any).supabase?.negocio?.resetarDemonstracao) {
        (window as any).supabase.negocio.resetarDemonstracao();
      } else {
        localStorage.removeItem('hotel_day_use_db_v2');
      }
      setTimestampReload(Date.now());
      setTimeout(recarregarBanco, 200);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col font-sans">
      
      {/* Barra Superior de Comando e Navegação dos Módulos */}
      <header className="bg-stone-950 border-b border-stone-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50">
        
        {/* Identidade */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-sm">
            H
          </div>
          <div>
            <div className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>Hotel &amp; Day Use</span>
              <span className="text-[9px] font-mono uppercase bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded">
                Consumo Digital MVP
              </span>
            </div>
            <div className="text-[10px] text-stone-400">Ambiente Integrado de Demonstração e Testes</div>
          </div>
        </div>

        {/* Seletor de Modo / Abas */}
        <div className="flex items-center gap-1 bg-stone-900 p-1 rounded-xl border border-stone-800">
          <button
            onClick={() => setModoAtivo('simulador')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              modoAtivo === 'simulador' ? 'bg-amber-600 text-white shadow-xs' : 'text-stone-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Simulador Split-Screen</span>
          </button>

          <button
            onClick={() => setModoAtivo('recepcao')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              modoAtivo === 'recepcao' ? 'bg-sky-700 text-white shadow-xs' : 'text-stone-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Recepção</span>
          </button>

          <button
            onClick={() => setModoAtivo('atendente')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              modoAtivo === 'atendente' ? 'bg-stone-800 text-white shadow-xs' : 'text-stone-400 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>PDV Atendente</span>
          </button>

          <button
            onClick={() => setModoAtivo('cliente')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              modoAtivo === 'cliente' ? 'bg-stone-800 text-white shadow-xs' : 'text-stone-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Cliente (Mobile 360px)</span>
          </button>

          <button
            onClick={() => setModoAtivo('caixa')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              modoAtivo === 'caixa' ? 'bg-stone-800 text-white shadow-xs' : 'text-stone-400 hover:text-white'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Caixa &amp; Fechamento</span>
          </button>

          <button
            onClick={() => setModoAtivo('admin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              modoAtivo === 'admin' ? 'bg-amber-600 text-white shadow-xs' : 'text-stone-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Admin / Cadastros</span>
          </button>

          <button
            onClick={() => setModoAtivo('banco')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              modoAtivo === 'banco' ? 'bg-stone-800 text-white shadow-xs' : 'text-stone-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Tabelas Supabase</span>
          </button>
        </div>

        {/* Ações de Suporte */}
        <div className="flex items-center gap-2">
          <button
            onClick={resetarDemonstracao}
            title="Resetar dados para o seed original"
            className="px-2.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-xs text-stone-300 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline text-[11px]">Reset Seed</span>
          </button>

          <a
            href="/atendente.html"
            target="_blank"
            rel="noreferrer"
            title="Abrir PDV Atendente em aba independente"
            className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-white"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

      </header>

      {/* ÁREA DE EXIBIÇÃO CONFORME MODO */}
      <main className="flex-1 flex flex-col min-h-0 bg-stone-950/50">

        {/* 1. MODO SIMULADOR SPLIT-SCREEN (Atendente na esquerda + Celular 360px na direita) */}
        {modoAtivo === 'simulador' && (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 p-3 gap-3">
            
            {/* Lado Esquerdo: Terminal do Atendente */}
            <div className="flex-1 bg-white rounded-2xl overflow-hidden border border-stone-800 flex flex-col shadow-xl">
              <div className="bg-stone-900 px-3 py-1.5 border-b border-stone-800 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 text-stone-300">
                  <Monitor className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold">Terminal do Atendente (PDV)</span>
                  <span className="text-stone-500">·</span>
                  <span className="text-stone-400">Monte itens e envie propostas com validade de 5 min</span>
                </div>
                <a href="/atendente.html" target="_blank" className="text-amber-400 hover:underline flex items-center gap-1 text-[10px]">
                  <span>Tela cheia</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <iframe
                src={`/atendente.html?t=${timestampReload}`}
                className="w-full flex-1 border-0"
                title="PDV Atendente"
              />
            </div>

            {/* Lado Direito: Celular do Cliente (360px estrito) */}
            <div className="w-full lg:w-[420px] flex flex-col items-center justify-center p-2">
              <div className="w-full max-w-[390px] flex flex-col items-center">
                
                {/* Header informativo do Celular */}
                <div className="w-full bg-stone-900 px-3 py-1.5 rounded-t-2xl border border-b-0 border-stone-800 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-stone-300 font-semibold">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Hóspede (Mobile 360px)</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Sync Tempo Real</span>
                  </div>
                </div>

                {/* Moldura física do smartphone */}
                <div className="w-full h-[680px] bg-stone-900 p-2.5 rounded-b-3xl border border-stone-800 shadow-2xl flex flex-col">
                  {/* Notch superior simulado */}
                  <div className="h-4 w-28 bg-stone-950 rounded-b-xl mx-auto mb-1 flex items-center justify-center">
                    <div className="w-8 h-1 bg-stone-800 rounded-full"></div>
                  </div>
                  
                  {/* Tela interna iframe cliente.html */}
                  <div className="flex-1 rounded-2xl overflow-hidden bg-white border border-stone-800/50">
                    <iframe
                      src={`/cliente.html?t=${timestampReload}`}
                      className="w-full h-full border-0"
                      title="Interface do Cliente"
                    />
                  </div>
                </div>

                {/* Dica do fluxo */}
                <div className="mt-2 text-[11px] text-stone-400 text-center">
                  💡 <strong>Fluxo:</strong> Adicione produtos no PDV à esquerda → Clique em <em>"Gerar e Enviar Proposta"</em> → A proposta aparece instantaneamente na tela do celular para conferência e confirmação!
                </div>

              </div>
            </div>

          </div>
        )}

        {/* 2. MODO RECEPÇÃO & CHECK-IN */}
        {modoAtivo === 'recepcao' && (
          <div className="flex-1 flex flex-col">
            <iframe
              src={`/recepcao.html?t=${timestampReload}`}
              className="w-full flex-1 border-0"
              title="Recepção e Check-in"
            />
          </div>
        )}

        {/* 3. MODO ATENDENTE COMPLETO */}
        {modoAtivo === 'atendente' && (
          <div className="flex-1 flex flex-col">
            <iframe
              src={`/atendente.html?t=${timestampReload}`}
              className="w-full flex-1 border-0"
              title="PDV Atendente Tela Cheia"
            />
          </div>
        )}

        {/* 3. MODO CLIENTE MOBILE */}
        {modoAtivo === 'cliente' && (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full max-w-[420px] h-[750px] bg-stone-900 p-3 rounded-3xl border border-stone-800 shadow-2xl flex flex-col">
              <div className="h-4 w-28 bg-stone-950 rounded-b-xl mx-auto mb-1 flex items-center justify-center">
                <div className="w-8 h-1 bg-stone-800 rounded-full"></div>
              </div>
              <div className="flex-1 rounded-2xl overflow-hidden bg-white">
                <iframe
                  src={`/cliente.html?t=${timestampReload}`}
                  className="w-full h-full border-0"
                  title="Cliente Mobile"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. MODO CAIXA & FECHAMENTO */}
        {modoAtivo === 'caixa' && (
          <div className="flex-1 flex flex-col">
            <iframe
              src={`/caixa.html?t=${timestampReload}`}
              className="w-full flex-1 border-0"
              title="Caixa & Fechamento de Contas"
            />
          </div>
        )}

        {/* 5. MODO ADMIN & CADASTROS BASE */}
        {modoAtivo === 'admin' && (
          <div className="flex-1 flex flex-col">
            <iframe
              src={`/admin.html?t=${timestampReload}`}
              className="w-full flex-1 border-0"
              title="Admin & Cadastros Base"
            />
          </div>
        )}

        {/* 6. MODO INSPEÇÃO DAS TABELAS SUPABASE */}
        {modoAtivo === 'banco' && (
          <div className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-500" />
                  <span>Esquema Oficial do Banco de Dados (Supabase / PostgreSQL)</span>
                </h2>
                <p className="text-xs text-stone-400 mt-0.5">
                  Tabelas em português estrito conforme análise de requisitos. Sincronizadas reativamente em tempo real.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={resetarDemonstracao}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                  <span>Restaurar Banco para Seed Original</span>
                </button>
              </div>
            </div>

            {/* Seletor de Tabelas */}
            <div className="flex flex-wrap gap-1.5 border-b border-stone-800 pb-2">
              {[
                'consumos',
                'itens_consumo',
                'permanencias',
                'hospedes',
                'produtos',
                'quartos',
                'perfis',
                'pagamentos',
                'movimentacoes_caixa',
                'caixas',
                'auditoria_operacoes_sensiveis'
              ].map(tab => (
                <button
                  key={tab}
                  onClick={() => setTabelaSelecionada(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors ${
                    tabelaSelecionada === tab
                      ? 'bg-amber-600 text-white shadow-xs font-bold'
                      : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                  }`}
                >
                  {tab} ({bancoDados?.[tab]?.length || 0})
                </button>
              ))}
            </div>

            {/* Visualização de Registros */}
            <div className="flex-1 bg-stone-900 border border-stone-800 rounded-xl overflow-hidden flex flex-col">
              <div className="p-3 bg-stone-950 border-b border-stone-800 text-xs font-mono text-stone-400 flex items-center justify-between">
                <span>SELECT * FROM {tabelaSelecionada};</span>
                <span className="text-[11px] text-stone-500">
                  {bancoDados?.[tabelaSelecionada]?.length || 0} linha(s) retornada(s)
                </span>
              </div>

              <div className="flex-1 overflow-auto max-h-[500px] p-3 font-mono text-xs text-stone-300">
                {bancoDados?.[tabelaSelecionada] && bancoDados[tabelaSelecionada].length > 0 ? (
                  <pre className="whitespace-pre-wrap leading-relaxed text-[11px]">
                    {JSON.stringify(bancoDados[tabelaSelecionada], null, 2)}
                  </pre>
                ) : (
                  <div className="text-center py-12 text-stone-500">
                    Tabela vazia no momento.
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </main>

    </div>
  );
}
