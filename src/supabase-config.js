// Configuração do Supabase
const { createClient } = require('@supabase/supabase-js');
const { getCurrentDateTime } = require('./utils/dateUtils');
require('dotenv').config();

// Função para ler credenciais das variáveis de ambiente
function readSupabaseCredentials() {
  try {
    console.log('[Supabase Config] Carregando variáveis de ambiente...');
    console.log('[Supabase Config] NODE_ENV:', process.env.NODE_ENV);
    console.log('[Supabase Config] Arquivo .env carregado:', !!process.env.SUPABASE_URL);
    
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('[Supabase Config] URL presente:', !!url);
    console.log('[Supabase Config] ANON_KEY presente:', !!anonKey);
    console.log('[Supabase Config] SERVICE_ROLE_KEY presente:', !!serviceRoleKey);
    
    if (url) {
      console.log('[Supabase Config] URL (primeiros 30 chars):', url.substring(0, 30) + '...');
    }
    
    if (!url || !anonKey || !serviceRoleKey) {
      console.error('[Supabase Config] Variáveis faltando:');
      console.error('- SUPABASE_URL:', !!url);
      console.error('- SUPABASE_ANON_KEY:', !!anonKey);
      console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!serviceRoleKey);
      throw new Error('Variáveis de ambiente do Supabase não configuradas. Verifique o arquivo .env');
    }
    
    // Validação básica da URL
    if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
      throw new Error('URL do Supabase inválida');
    }
    
    // Validação básica das chaves (devem ser JWT)
    if (!anonKey.startsWith('eyJ') || !serviceRoleKey.startsWith('eyJ')) {
      throw new Error('Chaves do Supabase inválidas');
    }
    
    return { url, anonKey, serviceRoleKey };
  } catch (error) {
    console.error('[Supabase] Erro ao carregar credenciais:', error);
    throw error;
  }
}

// Inicializa o cliente Supabase
let supabaseClient = null;
let currentCondominioId = null;
let currentUserSession = null;

function initSupabase() {
  try {
    const { url, anonKey } = readSupabaseCredentials();
    
    supabaseClient = createClient(url, anonKey, {
      auth: {
        persistSession: false // Para aplicação desktop
      }
    });
    
    console.log('[Supabase] Cliente inicializado com sucesso');
    return supabaseClient;
  } catch (error) {
    console.error('[Supabase] Erro ao inicializar cliente:', error);
    throw error;
  }
}

// Função para obter o cliente Supabase
function getSupabaseClient() {
  if (!supabaseClient) {
    throw new Error('Cliente Supabase não inicializado. Chame initSupabase() primeiro.');
  }
  return supabaseClient;
}

// =====================================================
// FUNÇÕES DE GERENCIAMENTO DE SESSÃO POR CONDOMÍNIO
// =====================================================

// Define o condomínio da sessão atual
function setCurrentCondominio(condominioId) {
  console.log('[SESSAO] Definindo condomínio da sessão...');
  console.log('[SESSAO] Parâmetros recebidos:', {
    condominioId
  });
  
  if (!condominioId) {
    console.error('[SESSAO] Erro: condominioId não pode ser nulo');
    throw new Error('condominioId é obrigatório');
  }
  
  // Armazenar localmente usando arquitetura de sessão JavaScript
  currentCondominioId = condominioId;
  console.log('[SESSAO] Condomínio definido com sucesso na sessão:', condominioId);
  
  return true;
}

// Obtém o condomínio da sessão atual
function getCurrentCondominio() {
  console.log('[SESSAO] Obtendo condomínio atual...');
  console.log('[SESSAO] Condomínio atual obtido:', currentCondominioId);
  return currentCondominioId;
}

// Define a sessão completa do usuário
function setUserSession(userData) {
  console.log(`[Session] Definindo sessão do usuário: ${userData.username}`);
  
  currentUserSession = {
    id: userData.id,
    username: userData.username,
    name: userData.name,
    role: userData.role,
    status: userData.status,
    condominio_id: userData.condominio_id,
    condominio_nome: userData.condominio_nome,
    loginTime: getCurrentDateTime()
  };
  
  // Define automaticamente o condomínio da sessão
  if (userData.condominio_id) {
    currentCondominioId = userData.condominio_id;
    console.log('[SESSAO] Condomínio definido automaticamente:', userData.condominio_id);
  }
  
  console.log('[Session] Sessão do usuário definida com sucesso');
}

// Obtém a sessão atual do usuário
function getUserSession() {
  console.log('[SESSAO] Obtendo sessão do usuário...');
  console.log('[SESSAO] Sessão atual:', {
    hasSession: !!currentUserSession,
    condominioId: currentUserSession?.condominio_id,
    userId: currentUserSession?.id,
    userName: currentUserSession?.name
  });
  return currentUserSession;
}

// Limpa a sessão atual
function clearSession() {
  console.log('[Session] Limpando sessão atual');
  currentCondominioId = null;
  currentUserSession = null;
}

// Verifica se há uma sessão ativa
function hasActiveSession() {
  return currentUserSession !== null && currentCondominioId !== null;
}

// Aplica filtro de condomínio em uma query (helper function)
function applyCondominioFilter(query, tableName = null) {
  if (!currentCondominioId) {
    console.warn('[Session] Nenhum condomínio definido na sessão. Query sem filtro.');
    return query;
  }
  
  // Se tableName for especificado, usa join
  if (tableName) {
    return query.eq(`${tableName}.condominio_id`, currentCondominioId);
  } else {
    // Aplica filtro direto na tabela principal
    return query.eq('condominio_id', currentCondominioId);
  }
}

// Valida se o usuário tem acesso ao condomínio especificado
function validateCondominioAccess(condominioId) {
  console.log('[SESSAO] Validando acesso ao condomínio...');
  console.log('[SESSAO] Sessão obtida:', { 
    hasSession: !!currentUserSession, 
    condominioId: currentCondominioId,
    userId: currentUserSession?.id 
  });
  
  if (!currentUserSession) {
    console.error('[SESSAO] Erro: Nenhuma sessão ativa');
    return { valid: false, message: 'Nenhuma sessão ativa' };
  }
  
  if (!currentCondominioId) {
    console.error('[SESSAO] Erro: Nenhum condomínio definido na sessão');
    return { valid: false, message: 'Nenhum condomínio definido na sessão' };
  }
  
  if (condominioId && condominioId !== currentCondominioId) {
    console.error('[SESSAO] Erro: Acesso negado ao condomínio');
    return { 
      valid: false, 
      message: 'Acesso negado: usuário não tem permissão para este condomínio' 
    };
  }
  
  console.log('[SESSAO] Validação bem-sucedida para condomínio:', currentCondominioId);
  return { valid: true };
}

module.exports = {
  initSupabase,
  getSupabaseClient,
  readSupabaseCredentials,
  // Funções de sessão
  setCurrentCondominio,
  getCurrentCondominio,
  setUserSession,
  getUserSession,
  clearSession,
  hasActiveSession,
  applyCondominioFilter,
  validateCondominioAccess
};