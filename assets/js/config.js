/**
 * Hotel & Day Use - Configurações Globais do Supabase
 * Permite conexão com instância remota do Supabase ou execução em modo local/demo sincronizado.
 */

window.SUPABASE_CONFIG = {
  // Substitua com a URL e chave anônima do seu projeto Supabase no painel
  url: window.__ENV__?.SUPABASE_URL || 'https://sua-instancia.supabase.co',
  anonKey: window.__ENV__?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_for_hotel_day_use',
  // Modo de sincronização automática entre abas via BroadcastChannel
  enableRealtimeBroadcast: true,
  // Validade de proposta em minutos (conforme regra de negócio estrita)
  proposalExpiryMinutes: 5
};
