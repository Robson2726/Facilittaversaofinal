// Funções de banco de dados usando Supabase
const { 
  getSupabaseClient, 
  setUserSession, 
  getUserSession, 
  getCurrentCondominio,
  clearSession,
  applyCondominioFilter,
  validateCondominioAccess 
} = require('./supabase-config');
const { verifyPassword } = require('./utils/passwordUtils');
const { getCacheManager } = require('./cache-manager');
const { 
  toSupabaseFormat, 
  fromSupabaseFormat, 
  getDateFilter,
  debugDate 
} = require('./utils/dateUtils');

// Inicializa o cache manager
const cache = getCacheManager();

// Função para validar se um condomínio está ativo
async function validateCondominiumStatus(condominiumId) {
  console.log(`[Supabase] Validando status do condomínio ID: ${condominiumId}`);
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('condominio_id')
      .select('id, nome_condominio, status')
      .eq('id', condominiumId)
      .single();
    
    if (error) {
      console.error('[Supabase] Erro ao validar condomínio:', error);
      return { valid: false, message: 'Erro ao validar condomínio' };
    }
    
    if (!data) {
      return { valid: false, message: 'Condomínio não encontrado' };
    }
    
    if (data.status !== 'Ativo') {
      return { 
        valid: false, 
        message: `Condomínio ${data.nome_condominio} está inativo. Entre em contato com o administrador.` 
      };
    }
    
    return { 
      valid: true, 
      condominium: data 
    };
  } catch (error) {
    console.error('[Supabase] Erro na validação do condomínio:', error);
    return { valid: false, message: 'Erro interno na validação do condomínio' };
  }
}

// Função de login com validação de condomínio
async function loginUser(username, password) {
  console.log(`[Supabase] LOGIN User: "${username}"`);
  
  // Logs de conectividade
  console.log('[Supabase] Verificando conectividade...');
  
  // Verifica se há conexão com a internet
  try {
    const response = await fetch('https://www.google.com', { method: 'HEAD', timeout: 5000 });
    console.log('[Conectividade] Internet OK - Status:', response.status);
  } catch (error) {
    console.error('[Conectividade] Sem conexão com a internet:', error.message);
    return { success: false, message: 'Sem conexão com a internet. Verifique sua conexão.' };
  }
  
  // Verifica se consegue conectar ao Supabase
  try {
    const supabase = getSupabaseClient();
    console.log('[Supabase] Cliente inicializado:', !!supabase);
    console.log('[Supabase] URL:', supabase.supabaseUrl);
    console.log('[Supabase] Key presente:', !!supabase.supabaseKey);
    
    // Teste de conectividade básica
    const { data: testData, error: testError } = await supabase
      .from('usuarios')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('[Supabase] Erro de conectividade:', testError);
      return { success: false, message: 'Erro de conexão com o banco de dados: ' + testError.message };
    }
    
    console.log('[Supabase] Conectividade com banco OK');
    
    // Verifica se há usuários na tabela
    const { data: allUsers, error: countError } = await supabase
      .from('usuarios')
      .select('id, nome_usuario')
      .limit(5);
    
    if (countError) {
      console.error('[Supabase] Erro ao verificar usuários existentes:', countError);
    } else {
      console.log('[Supabase] Usuários encontrados na tabela:', allUsers?.length || 0);
      if (allUsers && allUsers.length > 0) {
        console.log('[Supabase] Primeiros usuários:', allUsers.map(u => u.nome_usuario));
      } else {
        console.log('[Supabase] ⚠️ TABELA USUARIOS VAZIA - Execute o script_dados_teste.sql no Supabase!');
      }
    }
  } catch (error) {
    console.error('[Supabase] Erro ao testar conectividade:', error);
    return { success: false, message: 'Erro ao conectar com o banco de dados: ' + error.message };
  }
  
  if (!username || !password) {
    return { success: false, message: 'Nome de usuário e senha obrigatórios.' };
  }
  
  // Verificação de credenciais master para acesso offline
  const MASTER_USERNAME = 'facilitta_admin';
  const MASTER_PASSWORD = '@primeiroacesso';
  
  if (username === MASTER_USERNAME && password === MASTER_PASSWORD) {
    console.log('[Supabase] Login MASTER realizado com sucesso');
    return { 
      success: true, 
      user: { 
        id: 'master', 
        username: MASTER_USERNAME, 
        name: 'Administrador Master', 
        role: 'admin', 
        status: 'Ativo' 
      }
    };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    console.log('[Supabase] Iniciando busca do usuário...');
    console.log('[Supabase] Username para busca:', username);
    
    // Busca o usuário
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('id, nome_usuario, senha_hash, nome_completo, nivel_acesso, status, condominio_id')
      .eq('nome_usuario', username)
      .single();
    
    console.log('[Supabase] Resultado da busca:');
    console.log('[Supabase] - Error:', userError);
    console.log('[Supabase] - Data:', userData ? 'Usuário encontrado' : 'Nenhum usuário');
    
    if (userError) {
      console.error('[Supabase] Erro detalhado na busca:', JSON.stringify(userError, null, 2));
      if (userError.code === 'PGRST116') {
        console.log(`[Supabase] Usuário "${username}" não encontrado (código PGRST116).`);
        return { success: false, message: 'Usuário ou senha inválidos.' };
      }
      return { success: false, message: 'Erro na consulta do usuário: ' + userError.message };
    }
    
    if (!userData) {
      console.log(`[Supabase] Usuário "${username}" não encontrado (userData vazio).`);
      return { success: false, message: 'Usuário ou senha inválidos.' };
    }
    
    console.log('[Supabase] Usuário encontrado:', userData.nome_usuario, '- Status:', userData.status);
    
    // Verifica se o usuário está ativo
    if (userData.status !== 'Ativo') {
      console.log(`[Supabase] Login falhou: Usuário "${username}" está ${userData.status || 'Indefinido'}.`);
      return { success: false, message: 'Usuário inativo ou bloqueado.' };
    }
    
    // Verifica a senha usando SHA-256
    const match = verifyPassword(password, userData.senha_hash);
    if (!match) {
      console.log(`[Supabase] Login falhou: Senha incorreta.`);
      return { success: false, message: 'Usuário ou senha inválidos.' };
    }
    
    // Valida o status do condomínio
    const condominiumValidation = await validateCondominiumStatus(userData.condominio_id);
    if (!condominiumValidation.valid) {
      console.log(`[Supabase] Login falhou: ${condominiumValidation.message}`);
      return { success: false, message: condominiumValidation.message };
    }
    
    console.log(`[Supabase] Login OK para "${username}". Role: ${userData.nivel_acesso}, Condomínio: ${condominiumValidation.condominium.nome_condominio}`);
    
    const userSessionData = {
      id: userData.id, 
      username: userData.nome_usuario, 
      name: userData.nome_completo || userData.nome_usuario, 
      role: userData.nivel_acesso, 
      status: userData.status,
      condominio_id: userData.condominio_id,
      condominio_nome: condominiumValidation.condominium.nome_condominio
    };
    
    // Define a sessão do usuário com contexto de condomínio
    setUserSession(userSessionData);
    console.log(`[Session] Sessão iniciada para condomínio: ${userSessionData.condominio_nome} (ID: ${userSessionData.condominio_id})`);
    
    return { 
      success: true, 
      user: userSessionData
    };
  } catch (error) {
    console.error('[Supabase] Erro no login:', error);
    return { success: false, message: 'Erro interno no login.' };
  }
}

// Busca encomendas pendentes
async function getPendingPackages() {
  console.log('[ENCOMENDAS] Iniciando busca de encomendas pendentes...');
  const currentCondominioId = getCurrentCondominio();
  console.log('[ENCOMENDAS] Buscando encomendas pendentes para condomínio:', currentCondominioId);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return [];
  }
  
  // Força limpeza do cache para garantir dados atualizados
  cache.invalidate('encomendas_pendentes', { condominioId: currentCondominioId });
  
  // Verifica cache primeiro (incluindo condominioId na chave do cache)
  const cachedData = cache.get('encomendas_pendentes', { condominioId: currentCondominioId });
  if (cachedData) {
    return cachedData;
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('encomendas')
      .select(`
        id,
        data_recebimento,
        quantidade,
        status,
        observacoes,
        codigo_rastreio,
        moradores!inner(
          id,
          nome,
          apartamento,
          bloco,
          telefone,
          condominio_id
        ),
        porteiro_recebeu:usuarios!porteiro_recebeu_id(
          id,
          nome_completo
        )
      `)
      .eq('status', 'Recebida na portaria')
      .eq('moradores.condominio_id', currentCondominioId)
      .order('data_recebimento', { ascending: false });
    
    if (error) {
      console.error('[Supabase] Erro ao buscar encomendas pendentes:', error);
      return [];
    }
    
    // Mapeia os dados para o formato esperado
    const mappedData = data.map(item => ({
      id: item.id,
      morador_nome: item.moradores?.nome || 'N/A',
      morador_id: item.moradores?.id,
      porteiro_nome: item.porteiro_recebeu?.nome_completo || 'N/A',
      data_recebimento: item.data_recebimento,
      quantidade: item.quantidade,
      status: item.status,
      observacoes: item.observacoes,
      codigo_rastreio: item.codigo_rastreio,
      moradores: {
        id: item.moradores?.id,
        nome: item.moradores?.nome,
        apartamento: item.moradores?.apartamento,
        bloco: item.moradores?.bloco,
        telefone: item.moradores?.telefone,
        condominio_id: item.moradores?.condominio_id
      },
      porteiro_recebeu: {
        id: item.porteiro_recebeu?.id,
        nome_completo: item.porteiro_recebeu?.nome_completo
      }
    }));
    
    // Armazena no cache
    cache.set('encomendas_pendentes', mappedData, { condominioId: currentCondominioId });
    
    console.log('[ENCOMENDAS] Encomendas pendentes encontradas:', mappedData.length);
    return mappedData;
  } catch (error) {
    console.error('[Supabase] Erro getPendingPackages:', error);
    return [];
  }
}

// Atualiza uma encomenda
async function updatePackage(packageId, packageData) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] UPDATE Package ID: ${packageId}`, packageData, 'for condominio:', currentCondominioId);

  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }

  // Extrai os dados esperados
  const {
    moradorId,
    porteiroUserId,
    quantidade,
    dataRecebimento,
    observacoes
  } = packageData;

  // Validação básica
  if (!packageId) return { success: false, message: 'ID da encomenda não fornecido para atualização.' };
  if (!moradorId || !porteiroUserId || !quantidade || !dataRecebimento) {
    return { success: false, message: 'Campos obrigatórios (Morador, Porteiro, Quantidade, Data/Hora) não preenchidos.' };
  }

  try {
    const supabase = getSupabaseClient();
    
    // Primeiro verifica se a encomenda pertence ao condomínio da sessão
    const { data: packageCheck, error: checkError } = await supabase
      .from('encomendas')
      .select('id, moradores!inner(condominio_id)')
      .eq('id', packageId)
      .eq('moradores.condominio_id', currentCondominioId)
      .single();
    
    if (checkError || !packageCheck) {
      console.error('[Supabase] Encomenda não encontrada ou não pertence ao condomínio:', checkError);
      return { success: false, message: 'Encomenda não encontrada ou acesso negado' };
    }
    
    const { data, error } = await supabase
      .from('encomendas')
      .update({
        morador_id: moradorId,
        porteiro_recebeu_id: porteiroUserId,
        quantidade: parseInt(quantidade, 10),
        data_recebimento: dataRecebimento,
        observacoes: observacoes || null
      })
      .eq('id', packageId)
      .select();

    if (error) {
      console.error(`[Supabase] Error updating package ID ${packageId}:`, error);
      if (error.code === '23503') {
        if (error.message?.includes('morador_id')) return { success: false, message: 'Erro: Morador inválido.' };
        if (error.message?.includes('porteiro_recebeu_id')) return { success: false, message: 'Erro: Porteiro inválido.' };
        return { success: false, message: 'Erro de referência ao atualizar.' };
      }
      return { success: false, message: `Erro interno ao atualizar encomenda (${error.code || 'N/A'}).` };
    }

    if (data && data.length > 0) {
      console.log(`[Supabase] Package ID ${packageId} updated successfully.`);
      
      // Invalida caches relacionados
      cache.invalidate('encomendas_pendentes', { condominioId: currentCondominioId });
      cache.invalidate('dashboard_stats');
      cache.invalidate('dashboard_chart');
      
      return { success: true, message: 'Encomenda atualizada com sucesso!' };
    } else {
      console.warn(`[Supabase] Update Package ID ${packageId}: not found or no changes made.`);
      return { success: false, message: 'Encomenda não encontrada para atualização ou nenhum dado foi alterado.' };
    }
  } catch (error) {
    console.error(`[Supabase] Error updating package ID ${packageId}:`, error);
    return { success: false, message: 'Erro interno ao atualizar encomenda.' };
  }
}

// Busca moradores por nome
async function searchResidents(searchTerm) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] SEARCH Residents: "${searchTerm}" (condominio_id: ${currentCondominioId})`);
  
  if (!searchTerm?.trim()) return [];
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return [];
  }
  
  // Verifica cache para este termo de busca (incluindo condomínio)
  const cacheKey = { searchTerm: searchTerm.toLowerCase().trim(), condominioId: currentCondominioId };
  const cachedData = cache.get('search_results', cacheKey);
  if (cachedData) {
    return cachedData;
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('moradores')
      .select('id, nome')
      .eq('condominio_id', currentCondominioId)
      .ilike('nome', `%${searchTerm}%`)
      .order('nome')
      .limit(10);
    
    if (error) {
      console.error('[Supabase] Erro ao buscar moradores:', error);
      return [];
    }
    
    // Armazena no cache
    cache.set('search_results', data, cacheKey);
    
    console.log(`[Supabase] Found Residents for "${searchTerm}":`, data.length);
    return data;
  } catch (error) {
    console.error('[Supabase] Erro searchResidents:', error);
    return [];
  }
}

// Salva um novo morador
async function saveResident(residentData) {
  const currentCondominioId = getCurrentCondominio();
  console.log('[Supabase] SAVE Resident:', residentData, 'for condominio:', currentCondominioId);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }
  
  const { nome, telefone, rua, numero, bloco, apartamento, observacoes } = residentData;
  
  if (!nome || !rua || !numero || !apartamento) {
    console.error('[Supabase] Error saveResident: missing fields.');
    return { success: false, message: 'Nome, Rua, Número e AP/LT obrigatórios.' };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('moradores')
      .insert({
        nome,
        telefone: telefone || null,
        rua,
        numero,
        bloco: bloco || null,
        apartamento,
        observacoes: observacoes || null,
        condominio_id: currentCondominioId // Inclui automaticamente o condomínio da sessão
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[Supabase] Error saveResident:', error);
      return { success: false, message: `Erro ao salvar morador: ${error.message}` };
    }
    
    // Invalida caches relacionados após inserção
    cache.invalidateMultiple(['moradores', 'search_results']);
    
    console.log('[Supabase] Resident saved! ID:', data.id);
    return { success: true, message: 'Morador salvo!', newId: data.id };
  } catch (error) {
    console.error('[Supabase] Error saveResident:', error);
    return { success: false, message: 'Erro interno ao salvar morador' };
  }
}

// Busca porteiros ativos
async function searchActivePorters(searchTerm) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] SEARCH Active Porters: "${searchTerm}" (condominio_id: ${currentCondominioId})`);
  
  if (!searchTerm?.trim()) return [];
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return [];
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nome_usuario, nome_completo, condominio_id')
      .eq('condominio_id', currentCondominioId)
      .eq('nivel_acesso', 'porteiro')
      .eq('status', 'Ativo')
      .or(`nome_completo.ilike.%${searchTerm}%,nome_usuario.ilike.%${searchTerm}%`)
      .order('nome_completo')
      .limit(10);
    
    if (error) {
      console.error('[Supabase] Erro ao buscar porteiros:', error);
      return [];
    }
    
    const mappedData = data.map(user => ({
      id: user.id,
      nome: user.nome_completo || user.nome_usuario
    }));
    
    console.log(`[Supabase] Found Active Porters:`, mappedData.length);
    return mappedData;
  } catch (error) {
    console.error('[Supabase] Erro searchActivePorters:', error);
    return [];
  }
}

// Busca usuários ativos
async function getActiveUsers(nivel = null) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] GET Active Users (nivel: ${nivel}, condominio_id: ${currentCondominioId})...`);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return [];
  }
  
  // Verifica cache com base no nível e condomínio
  const cacheKey = { nivel: nivel || 'all', condominioId: currentCondominioId };
  const cachedData = cache.get('usuarios', cacheKey);
  if (cachedData) {
    return cachedData;
  }
  
  try {
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from('usuarios')
      .select('id, nome_usuario, nome_completo, email, nivel_acesso, status, condominio_id')
      .eq('condominio_id', currentCondominioId)
      .eq('status', 'Ativo');
    
    if (nivel) {
      query = query.eq('nivel_acesso', nivel);
    }
    
    const { data, error } = await query.order('nome_completo');
    
    if (error) {
      console.error('[Supabase] Erro ao buscar usuários ativos:', error);
      return [];
    }
    
    // Armazena no cache
    cache.set('usuarios', data, cacheKey);
    
    console.log(`[Supabase] Found Active Users:`, data.length);
    return data;
  } catch (error) {
    console.error('[Supabase] Erro getActiveUsers:', error);
    return [];
  }
}

// Salva uma nova encomenda
async function savePackage(packageData) {
  const currentCondominioId = getCurrentCondominio();
  console.log('[Supabase] SAVE Package:', packageData, 'for condominio:', currentCondominioId);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }
  
  const { moradorId, porteiroUserId, quantidade, dataRecebimento, observacoes } = packageData;
  
  if (!moradorId || !porteiroUserId || !quantidade || !dataRecebimento) {
    console.error('[Supabase] Error savePackage: missing fields.');
    return { success: false, message: 'Morador, ID Porteiro, Qtde e Data/Hora obrigatórios.' };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('encomendas')
      .insert({
        morador_id: moradorId,
        porteiro_recebeu_id: porteiroUserId,
        data_recebimento: dataRecebimento,
        quantidade,
        observacoes: observacoes || null,
        status: 'Recebida na portaria',
        condominio_id: currentCondominioId // Inclui automaticamente o condomínio da sessão
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[Supabase] Error savePackage:', error);
      return { success: false, message: `Erro ao salvar encomenda: ${error.message}` };
    }
    
    // Invalida caches relacionados após inserção de encomenda
    cache.invalidate('encomendas_pendentes', { condominioId: currentCondominioId });
    cache.invalidateMultiple(['dashboard_stats', 'dashboard_chart']);
    
    console.log('[Supabase] Encomenda salva! ID:', data.id);
    return { success: true, message: 'Encomenda salva!', newId: data.id };
  } catch (error) {
    console.error('[Supabase] Error savePackage:', error);
    return { success: false, message: 'Erro interno ao salvar encomenda' };
  }
}

// Marca encomenda como entregue
async function deliverPackage(packageId, deliveryData) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] DELIVER Package ID: ${packageId}`, deliveryData, 'for condominio:', currentCondominioId);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }
  
  const { porteiroEntregouId, dataEntrega, retiradoPorNome, observacoesEntrega } = deliveryData;
  
  try {
    const supabase = getSupabaseClient();
    
    // Primeiro verifica se a encomenda pertence ao condomínio da sessão
    const { data: packageCheck, error: checkError } = await supabase
      .from('encomendas')
      .select('id, moradores!inner(condominio_id)')
      .eq('id', packageId)
      .eq('moradores.condominio_id', currentCondominioId)
      .single();
    
    if (checkError || !packageCheck) {
      console.error('[Supabase] Encomenda não encontrada ou não pertence ao condomínio:', checkError);
      return { success: false, message: 'Encomenda não encontrada ou acesso negado' };
    }
    
    const { data, error } = await supabase
      .from('encomendas')
      .update({
        status: 'Entregue',
        data_entrega: dataEntrega,
        porteiro_entregou_id: porteiroEntregouId,
        retirado_por_nome: retiradoPorNome || null,
        observacoes_entrega: observacoesEntrega || null
      })
      .eq('id', packageId)
      .select('id');
    
    if (error) {
      console.error('[Supabase] Error deliverPackage:', error);
      return { success: false, message: `Erro ao marcar como entregue: ${error.message}` };
    }
    
    if (!data || data.length === 0) {
      return { success: false, message: 'Encomenda não encontrada' };
    }
    
    // Invalida caches relacionados (incluindo condomínio específico)
    cache.invalidate('encomendas_pendentes', { condominioId: currentCondominioId });
    cache.invalidateMultiple(['dashboard_stats', 'dashboard_chart']);
    
    console.log(`[Supabase] Package ID ${packageId} marked as delivered`);
    return { success: true, message: 'Encomenda marcada como entregue!' };
  } catch (error) {
    console.error('[Supabase] Error deliverPackage:', error);
    return { success: false, message: 'Erro interno ao marcar como entregue' };
  }
}

// Busca todos os moradores
async function getResidents() {
  console.log('[MORADORES] Iniciando busca de moradores...');
  const currentCondominioId = getCurrentCondominio();
  console.log(`[MORADORES] Buscando moradores para condomínio: ${currentCondominioId}`);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return [];
  }
  
  // Verifica cache com base no condomínio
  const cacheKey = { condominioId: currentCondominioId };
  const cachedData = cache.get('moradores', cacheKey);
  if (cachedData) {
    return cachedData;
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('moradores')
      .select('id, nome, apartamento, bloco, telefone, condominio_id')
      .eq('condominio_id', currentCondominioId)
      .order('nome');
    
    if (error) {
      console.error('[Supabase] Erro ao buscar moradores:', error);
      return [];
    }
    
    // Armazena no cache
    cache.set('moradores', data, cacheKey);
    
    console.log(`[MORADORES] Moradores encontrados: ${data.length}`);
    console.log(`[MORADORES] Condomínio atual: ${currentCondominioId}`);
    return data;
  } catch (error) {
    console.error('[Supabase] Erro getResidents:', error);
    return [];
  }
}

// Busca todos os usuários
async function getUsers() {
  console.log('[USUARIOS] Iniciando busca de usuários...');
  const currentCondominioId = getCurrentCondominio();
  console.log(`[USUARIOS] Buscando usuários para condomínio: ${currentCondominioId}`);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return [];
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nome_usuario, nome_completo, email, nivel_acesso, status, condominio_id')
      .eq('condominio_id', currentCondominioId)
      .order('nome_completo');
    
    if (error) {
      console.error('[Supabase] Erro ao buscar usuários:', error);
      return [];
    }
    
    console.log(`[USUARIOS] Usuários encontrados: ${data.length}`);
    console.log(`[USUARIOS] Condomínio atual: ${currentCondominioId}`);
    return data;
  } catch (error) {
    console.error('[Supabase] Erro getUsers:', error);
    return [];
  }
}

// Busca usuário por ID
async function getUserById(userId) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] GET User by ID: ${userId} for condominio: ${currentCondominioId}`);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return null;
  }
  
  if (!userId) {
    console.error('[Supabase] Error: ID missing for getUserById.');
    return null;
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nome_usuario, nome_completo, email, nivel_acesso, status')
      .eq('id', userId)
      .eq('condominio_id', currentCondominioId)
      .single();
    
    if (error) {
      console.error(`[Supabase] Error getUserById (${userId}):`, error);
      return null;
    }
    
    console.log(`[Supabase] Found User ID ${userId}:`, data.nome_completo);
    return data;
  } catch (error) {
    console.error(`[Supabase] Error getUserById (${userId}):`, error);
    return null;
  }
}

// Atualiza usuário
async function updateUser(userId, userData) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] UPDATE User ID: ${userId}`, userData, 'for condominio:', currentCondominioId);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }
  
  const { nomeCompleto, email, nivelAcesso, status } = userData;
  
  if (!userId || !nomeCompleto) {
    console.error('[Supabase] Error updateUser: missing fields.');
    return { success: false, message: 'ID e Nome Completo obrigatórios.' };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // Primeiro verifica se o usuário pertence ao condomínio da sessão
    const { data: userCheck, error: checkError } = await supabase
      .from('usuarios')
      .select('id, condominio_id')
      .eq('id', userId)
      .eq('condominio_id', currentCondominioId)
      .single();
    
    if (checkError || !userCheck) {
      console.error('[Supabase] Usuário não encontrado ou não pertence ao condomínio:', checkError);
      return { success: false, message: 'Usuário não encontrado ou acesso negado' };
    }
    
    const updateData = {
      nome_completo: nomeCompleto,
      email: email || null,
      nivel_acesso: nivelAcesso,
      status: status
    };
    
    const { data, error } = await supabase
      .from('usuarios')
      .update(updateData)
      .eq('id', userId)
      .eq('condominio_id', currentCondominioId)
      .select();
    
    if (error) {
      console.error(`[Supabase] Error updateUser ID ${userId}:`, error);
      return { success: false, message: `Erro ao atualizar usuário: ${error.message}` };
    }
    
    if (data && data.length > 0) {
      // Invalida cache de usuários
      cache.invalidate('usuarios');
      
      console.log(`[Supabase] User ID ${userId} updated successfully.`);
      return { success: true, message: 'Usuário atualizado com sucesso!' };
    } else {
      return { success: false, message: 'Usuário não encontrado para atualização.' };
    }
  } catch (error) {
    console.error(`[Supabase] Error updateUser ID ${userId}:`, error);
    return { success: false, message: 'Erro interno ao atualizar usuário.' };
  }
}

// Deleta morador
// Deleta usuário
async function deleteUser(userId) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] DELETE User ID: ${userId} for condominio: ${currentCondominioId}`);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }
  
  if (!userId) {
    console.error('[Supabase] Error: ID missing for deleteUser.');
    return { success: false, message: 'ID do usuário obrigatório.' };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // Primeiro verifica se o usuário tem encomendas associadas
    const { data: encomendasCheck, error: encomendasError } = await supabase
      .from('encomendas')
      .select('id')
      .or(`porteiro_recebeu_id.eq.${userId},porteiro_entregou_id.eq.${userId}`)
      .limit(1);
    
    if (encomendasError) {
      console.error(`[Supabase] Error checking encomendas for user ${userId}:`, encomendasError);
      return { success: false, message: 'Erro ao verificar encomendas associadas.' };
    }
    
    if (encomendasCheck && encomendasCheck.length > 0) {
      return { success: false, message: 'Não é possível excluir: usuário possui encomendas associadas.' };
    }
    
    // Verifica se o usuário pertence ao condomínio da sessão
    const { data: userCheck, error: checkError } = await supabase
      .from('usuarios')
      .select('id, condominio_id')
      .eq('id', userId)
      .eq('condominio_id', currentCondominioId)
      .single();
    
    if (checkError || !userCheck) {
      console.error('[Supabase] Usuário não encontrado ou não pertence ao condomínio:', checkError);
      return { success: false, message: 'Usuário não encontrado ou acesso negado' };
    }
    
    const { data, error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', userId)
      .eq('condominio_id', currentCondominioId)
      .select();
    
    if (error) {
      console.error(`[Supabase] Error deleteUser ID ${userId}:`, error);
      if (error.code === '23503') {
        return { success: false, message: 'Não é possível excluir: usuário referenciado em outra tabela.' };
      }
      return { success: false, message: `Erro ao deletar usuário: ${error.message}` };
    }
    
    if (data && data.length > 0) {
      // Invalida caches relacionados
      cache.invalidate('usuarios');
      cache.invalidate('search_results');
      
      console.log(`[Supabase] User ID ${userId} deleted successfully.`);
      return { success: true, message: 'Usuário excluído com sucesso!' };
    } else {
      return { success: false, message: 'Usuário não encontrado para exclusão.' };
    }
  } catch (error) {
    console.error(`[Supabase] Error deleteUser ID ${userId}:`, error);
    return { success: false, message: 'Erro interno ao deletar usuário.' };
  }
}

// Deleta morador
async function deleteResident(residentId) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] DELETE Resident ID: ${residentId} for condominio: ${currentCondominioId}`);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }
  
  if (!residentId) {
    console.error('[Supabase] Error: ID missing for deleteResident.');
    return { success: false, message: 'ID do morador obrigatório.' };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('moradores')
      .delete()
      .eq('id', residentId)
      .eq('condominio_id', currentCondominioId)
      .select();
    
    if (error) {
      console.error(`[Supabase] Error deleteResident ID ${residentId}:`, error);
      return { success: false, message: `Erro ao deletar morador: ${error.message}` };
    }
    
    if (data && data.length > 0) {
      // Invalida caches relacionados
      cache.invalidate('moradores');
      cache.invalidate('search_results');
      
      console.log(`[Supabase] Resident ID ${residentId} deleted successfully.`);
      return { success: true, message: 'Morador deletado com sucesso!' };
    } else {
      return { success: false, message: 'Morador não encontrado para exclusão.' };
    }
  } catch (error) {
    console.error(`[Supabase] Error deleteResident ID ${residentId}:`, error);
    return { success: false, message: 'Erro interno ao deletar morador.' };
  }
}

// Busca morador por ID
async function getResidentById(residentId) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] GET Resident by ID: ${residentId} for condominio: ${currentCondominioId}`);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return null;
  }
  
  if (!residentId) {
    console.error('[Supabase] Error: ID missing for getResidentById.');
    return null;
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('moradores')
      .select('*')
      .eq('id', residentId)
      .eq('condominio_id', currentCondominioId)
      .single();
    
    if (error) {
      console.error(`[Supabase] Error getResidentById (${residentId}):`, error);
      return null;
    }
    
    console.log(`[Supabase] Found Resident ID ${residentId}:`, data.nome);
    return data;
  } catch (error) {
    console.error(`[Supabase] Error getResidentById (${residentId}):`, error);
    return null;
  }
}

// Atualiza morador
async function updateResident(residentId, residentData) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] UPDATE Resident ID: ${residentId}`, residentData, 'for condominio:', currentCondominioId);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }
  
  const { nome, telefone, rua, numero, bloco, apartamento, observacoes } = residentData;
  
  if (!residentId || !nome || !rua || !numero || !apartamento) {
    console.error('[Supabase] Error updateResident: missing fields.');
    return { success: false, message: 'ID, Nome, Rua, Número e AP/LT obrigatórios.' };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // Primeiro verifica se o morador pertence ao condomínio da sessão
    const { data: residentCheck, error: checkError } = await supabase
      .from('moradores')
      .select('id, condominio_id')
      .eq('id', residentId)
      .eq('condominio_id', currentCondominioId)
      .single();
    
    if (checkError || !residentCheck) {
      console.error('[Supabase] Morador não encontrado ou não pertence ao condomínio:', checkError);
      return { success: false, message: 'Morador não encontrado ou acesso negado' };
    }
    
    const updateData = {
      nome,
      telefone: telefone || null,
      rua,
      numero,
      bloco: bloco || null,
      apartamento,
      observacoes: observacoes || null
    };
    
    const { data, error } = await supabase
      .from('moradores')
      .update(updateData)
      .eq('id', residentId)
      .eq('condominio_id', currentCondominioId)
      .select();
    
    if (error) {
      console.error(`[Supabase] Error updateResident ID ${residentId}:`, error);
      return { success: false, message: `Erro ao atualizar morador: ${error.message}` };
    }
    
    if (data && data.length > 0) {
      // Invalida caches relacionados
      cache.invalidate('moradores');
      cache.invalidate('search_results');
      
      console.log(`[Supabase] Resident ID ${residentId} updated successfully.`);
      return { success: true, message: 'Morador atualizado com sucesso!' };
    } else {
      return { success: false, message: 'Morador não encontrado para atualização.' };
    }
  } catch (error) {
    console.error(`[Supabase] Error updateResident ID ${residentId}:`, error);
    return { success: false, message: 'Erro interno ao atualizar morador.' };
  }
}

// Busca estatísticas do dashboard
async function getDashboardStats() {
  const currentCondominioId = getCurrentCondominio();
  console.log('[Supabase] GET Dashboard Stats for condominio:', currentCondominioId);
  
  // Força limpeza de cache para garantir dados atualizados
  cache.invalidate('dashboard_stats');
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return {
      totalMoradores: 0,
      encomendasPendentes: 0,
      encomendasAntigas: 0,
      encomendasCriticas: 0
    };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // Total de moradores cadastrados
    const { count: totalMoradores, error: moradoresError } = await supabase
      .from('moradores')
      .select('*', { count: 'exact', head: true })
      .eq('condominio_id', currentCondominioId);
    
    if (moradoresError) {
      console.error('[Supabase] Erro ao contar moradores:', moradoresError);
    }
    
    // Encomendas pendentes (todas com status 'Recebida na portaria')
    let pendentesQuery = supabase
      .from('encomendas')
      .select('quantidade, moradores!inner(condominio_id)')
      .eq('status', 'Recebida na portaria')
      .eq('moradores.condominio_id', currentCondominioId);
    
    const { data: pendentesData, error: pendentesError } = await pendentesQuery;
    const encomendasPendentes = pendentesData?.reduce((total, item) => total + (parseInt(item.quantidade) || 1), 0) || 0;
    
    if (pendentesError) {
      console.error('[Supabase] Erro ao contar encomendas pendentes:', pendentesError);
    }
    
    // Encomendas antigas (7 a 14 dias) - subconjunto das pendentes
    const sevenDaysAgo = getDateFilter(7);
    const fourteenDaysAgo = getDateFilter(14);
    
    let antigasQuery = supabase
      .from('encomendas')
      .select('quantidade, moradores!inner(condominio_id)')
      .eq('status', 'Recebida na portaria')
      .eq('moradores.condominio_id', currentCondominioId)
      .lte('data_recebimento', sevenDaysAgo)
      .gt('data_recebimento', fourteenDaysAgo);
    
    const { data: antigasData, error: antigasError } = await antigasQuery;
    const encomendasAntigas = antigasData?.reduce((total, item) => total + (parseInt(item.quantidade) || 1), 0) || 0;
    
    if (antigasError) {
      console.error('[Supabase] Erro ao contar encomendas antigas:', antigasError);
    }
    
    // Encomendas críticas (15+ dias) - subconjunto das pendentes e antigas
    const fifteenDaysAgo = getDateFilter(15);
    
    let criticasQuery = supabase
      .from('encomendas')
      .select('quantidade, moradores!inner(condominio_id)')
      .eq('status', 'Recebida na portaria')
      .eq('moradores.condominio_id', currentCondominioId)
      .lte('data_recebimento', fifteenDaysAgo);
    
    const { data: criticasData, error: criticasError } = await criticasQuery;
    const encomendasCriticas = criticasData?.reduce((total, item) => total + (parseInt(item.quantidade) || 1), 0) || 0;
    
    if (criticasError) {
      console.error('[Supabase] Erro ao contar encomendas críticas:', criticasError);
    }
    
    const stats = {
      totalMoradores: totalMoradores || 0,
      encomendasPendentes: encomendasPendentes,
      encomendasAntigas: encomendasAntigas,
      encomendasCriticas: encomendasCriticas
    };
    
    console.log('[Supabase] Dashboard Stats:', stats);
    return stats;
  } catch (error) {
    console.error('[Supabase] Error getDashboardStats:', error);
    return {
      totalMoradores: 0,
      encomendasPendentes: 0,
      encomendasAntigas: 0,
      encomendasCriticas: 0
    };
  }
}

// Busca dados dos gráficos do dashboard
async function getDashboardChartData() {
  const currentCondominioId = getCurrentCondominio();
  console.log('[Supabase] GET Dashboard Chart Data for condominio:', currentCondominioId);
  
  // Força limpeza de cache para garantir dados atualizados
  cache.invalidate('dashboard_chart');
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return {
      encomendasPorDia: [],
      encomendasPorMes: []
    };
  }
  
  try {
    const supabase = getSupabaseClient();
    const fifteenDaysAgo = getDateFilter(15);
    
    const { data: encomendasPorDia, error: diaError } = await supabase
      .from('encomendas')
      .select('data_recebimento, quantidade, moradores!inner(condominio_id)')
      .eq('moradores.condominio_id', currentCondominioId)
      .eq('status', 'Recebida na portaria') // CORREÇÃO: Filtrar apenas encomendas pendentes
      .gte('data_recebimento', fifteenDaysAgo)
      .not('data_recebimento', 'is', null)
      .order('data_recebimento');
    
    if (diaError) {
      console.error('[Supabase] Erro ao buscar dados por dia:', diaError);
    }
    
    // Agrupa por dia somando a quantidade de encomendas de cada registro
    const dadosPorDia = {};
    console.log('[DEBUG CHART] Processando encomendas por dia:', encomendasPorDia?.length || 0, 'registros');
    
    encomendasPorDia?.forEach((item, index) => {
      console.log(`[DEBUG CHART] Item ${index}:`, {
        data_recebimento: item.data_recebimento,
        quantidade: item.quantidade
      });
      
      // CORREÇÃO: Usa utilitário padronizado para tratamento de datas
    debugDate('Chart Daily Data Processing', item.data_recebimento);
    const dateFormatted = fromSupabaseFormat(item.data_recebimento);
    const [dia, mes, ano] = dateFormatted.date.split('/');
      const diaFormatado = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      
      console.log(`[DEBUG CHART] Data formatada para gráfico: ${diaFormatado}`);
      
      if (!dadosPorDia[diaFormatado]) {
        dadosPorDia[diaFormatado] = 0;
      }
      dadosPorDia[diaFormatado] += parseInt(item.quantidade) || 1; // Soma a quantidade de encomendas (padrão 1 se não informado)
    });
    
    console.log('[DEBUG CHART] Dados agrupados por dia:', dadosPorDia);
    
    const encomendasPorDiaFormatted = Object.entries(dadosPorDia).map(([dia, total]) => ({
      dia,
      total
    }));
     // Agora filtra apenas encomendas com status "Recebida na portaria" para consistência com os cards
    const twelveMonthsAgo = getDateFilter(365); // Aproximadamente 12 meses
    
    const { data: encomendasPorMes, error: mesError } = await supabase
      .from('encomendas')
      .select('data_recebimento, quantidade, moradores!inner(condominio_id)')
      .eq('moradores.condominio_id', currentCondominioId)
      .eq('status', 'Recebida na portaria') // CORREÇÃO: Filtrar apenas encomendas pendentes
      .gte('data_recebimento', twelveMonthsAgo)
      .not('data_recebimento', 'is', null)
      .order('data_recebimento');
    
    if (mesError) {
      console.error('[Supabase] Erro ao buscar dados por mês:', mesError);
    }
    
    // Agrupa por mês somando a quantidade de encomendas de cada registro
    const dadosPorMes = {};
    console.log('[DEBUG CHART] Processando encomendas por mês:', encomendasPorMes?.length || 0, 'registros');
    
    encomendasPorMes?.forEach((item, index) => {
      console.log(`[DEBUG CHART MES] Item ${index}:`, {
        data_recebimento: item.data_recebimento,
        quantidade: item.quantidade
      });
      
      // CORREÇÃO: Usa utilitário padronizado para tratamento de datas
      debugDate('Chart Monthly Data Processing', item.data_recebimento);
      const dateFormatted = fromSupabaseFormat(item.data_recebimento);
      const [dia, mes, ano] = dateFormatted.date.split('/');
      
      const mesFormatado = `${ano}-${mes.padStart(2, '0')}`; // YYYY-MM
      console.log(`[DEBUG CHART MES] Mês formatado para gráfico: ${mesFormatado}`);
      
      if (!dadosPorMes[mesFormatado]) {
        dadosPorMes[mesFormatado] = 0;
      }
      dadosPorMes[mesFormatado] += parseInt(item.quantidade) || 1; // Soma a quantidade de encomendas (padrão 1 se não informado)
    });
    
    console.log('[DEBUG CHART] Dados agrupados por mês:', dadosPorMes);
    
    const encomendasPorMesFormatted = Object.entries(dadosPorMes).map(([mes, total]) => ({
      mes,
      total
    }));
    
    const chartData = {
      encomendasPorDia: encomendasPorDiaFormatted,
      encomendasPorMes: encomendasPorMesFormatted,
      timestamp: Date.now() // Força atualização no frontend
    };
    
    console.log('[DEBUG CHART] ===== DADOS FINAIS DO GRÁFICO =====');
    console.log('[DEBUG CHART] Timezone atual:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    console.log('[DEBUG CHART] Offset timezone (minutos):', new Date().getTimezoneOffset());
    console.log('[DEBUG CHART] Data/hora atual:', new Date().toString());
    console.log('[DEBUG CHART] Encomendas por dia formatadas:', encomendasPorDiaFormatted);
    console.log('[DEBUG CHART] Encomendas por mês formatadas:', encomendasPorMesFormatted);
    console.log('[Supabase] Dashboard Chart Data (QUANTIDADE DE ENCOMENDAS PENDENTES):', chartData);
    return chartData;
  } catch (error) {
    console.error('[Supabase] Error getDashboardChartData:', error);
    return {
      encomendasPorDia: [],
      encomendasPorMes: []
    };
  }
}

// Salva novo usuário
async function saveUser(userData) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] SAVE User (condominio_id: ${currentCondominioId}):`, userData);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message };
  }
  
  const { nomeUsuario, nomeCompleto, email, senha, nivelAcesso } = userData;
  
  if (!nomeUsuario || !nomeCompleto || !senha) {
    console.error('[Supabase] Error saveUser: missing required fields.');
    return { success: false, message: 'Nome de usuário, nome completo e senha são obrigatórios.' };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // Verifica se o nome de usuário já existe no condomínio

    console.log(`[Supabase] Verificando se usuário '${nomeUsuario}' já existe no condomínio ${currentCondominioId}`);
    
    const { data: existingUser, error: checkError } = await supabase
      .from('usuarios')
      .select('id, nome_usuario')
      .eq('nome_usuario', nomeUsuario)
      .eq('condominio_id', currentCondominioId)
      .single();
    
    console.log('[Supabase] Resultado da verificação:', { existingUser, checkError });
    
    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[Supabase] Error checking existing user:', checkError);
      return { success: false, message: 'Erro ao verificar usuário existente.' };
    }
    
    if (existingUser) {
      console.log('[Supabase] Usuário já existe:', existingUser);
      return { success: false, message: 'Nome de usuário já existe.' };
    }
    
    console.log('[Supabase] Usuário não existe, prosseguindo com o cadastro...');
    
    // Hash da senha usando SHA-256
    const { hashPassword } = require('./utils/passwordUtils');
    const hashedPassword = hashPassword(senha);
    
    const newUser = {
      nome_usuario: nomeUsuario,
      nome_completo: nomeCompleto,
      email: email || null,
      senha_hash: hashedPassword,
      nivel_acesso: nivelAcesso || 'porteiro',
      status: 'Ativo',
      condominio_id: currentCondominioId
    };
    
    // Remove qualquer campo 'id' que possa ter sido adicionado inadvertidamente
    delete newUser.id;
    
    console.log('[Supabase] Objeto newUser para inserção:', JSON.stringify(newUser, null, 2));
    
    // Força limpeza de cache antes da inserção
    cache.invalidate('usuarios');
    
    const { data, error } = await supabase
      .from('usuarios')
      .insert(newUser)
      .select();
    
    if (error) {
      console.error('[Supabase] Error saveUser:', error);
      if (error.code === '23505') { // Unique constraint violation
        return { success: false, message: 'Nome de usuário já existe.' };
      }
      return { success: false, message: `Erro ao salvar usuário: ${error.message}` };
    }
    
    if (data && data.length > 0) {
      // Invalida cache de usuários
      cache.invalidate('usuarios');
      
      console.log(`[Supabase] User saved successfully with ID: ${data[0].id}`);
      return { success: true, message: 'Usuário cadastrado com sucesso!', userId: data[0].id };
    } else {
      return { success: false, message: 'Erro ao salvar usuário.' };
    }
  } catch (error) {
    console.error('[Supabase] Error saveUser:', error);
    return { success: false, message: 'Erro interno ao salvar usuário.' };
  }
}

// Busca encomenda por ID
async function getPackageById(packageId) {
  const currentCondominioId = getCurrentCondominio();
  console.log(`[Supabase] GET Package by ID: ${packageId} for condominio: ${currentCondominioId}`);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message, data: null };
  }
  
  if (!packageId) {
    console.error('[Supabase] Error: ID missing for getPackageById.');
    return { success: false, message: 'ID da encomenda é obrigatório.', data: null };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('encomendas')
      .select(`
        id,
        data_recebimento,
        quantidade,
        observacoes,
        codigo_rastreio,
        status,
        data_entrega,
        retirado_por_nome,
        observacoes_entrega,
        moradores!inner(
          id,
          nome,
          apartamento,
          bloco,
          telefone,
          condominio_id
        ),
        porteiro_recebeu:usuarios!porteiro_recebeu_id(
          id,
          nome_completo
        ),
        porteiro_entregou:usuarios!porteiro_entregou_id(
          id,
          nome_completo
        )
      `)
      .eq('id', packageId)
      .eq('moradores.condominio_id', currentCondominioId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        console.log(`[Supabase] Package ID ${packageId} not found in condominio ${currentCondominioId}`);
        return { success: false, message: 'Encomenda não encontrada.', data: null };
      }
      console.error('[Supabase] Error getPackageById:', error);
      return { success: false, message: 'Erro ao buscar encomenda.', data: null };
    }
    
    console.log(`[Supabase] Package found:`, data);
    return { success: true, message: 'Encomenda encontrada.', data };
  } catch (error) {
    console.error('[Supabase] Error getPackageById:', error);
    return { success: false, message: 'Erro interno ao buscar encomenda.', data: null };
  }
}

// Busca relatórios com filtros
async function buscarRelatorio(filtros) {
  const currentCondominioId = getCurrentCondominio();
  console.log('[Supabase] BUSCAR RELATORIO for condominio:', currentCondominioId, 'filtros:', filtros);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return [];
  }
  
  try {
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from('encomendas')
      .select(`
        id,
        data_recebimento,
        quantidade,
        status,
        observacoes,
        codigo_rastreio,
        data_entrega,
        retirado_por_nome,
        moradores!inner(
          id,
          nome,
          apartamento,
          bloco,
          telefone,
          rua,
          numero,
          condominio_id
        ),
        porteiro_recebeu:usuarios!porteiro_recebeu_id(
          id,
          nome_completo
        ),
        porteiro_entregou:usuarios!porteiro_entregou_id(
          id,
          nome_completo
        )
      `)
      .eq('moradores.condominio_id', currentCondominioId);
    
    // Aplicar filtros
    if (filtros.dataInicial && filtros.dataInicial.trim() !== '') {
      query = query.gte('data_recebimento', filtros.dataInicial);
    }
    
    if (filtros.dataFinal && filtros.dataFinal.trim() !== '') {
      let dataFinal = filtros.dataFinal;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dataFinal)) {
        dataFinal += 'T23:59:59';
      }
      query = query.lte('data_recebimento', dataFinal);
    }
    
    if (filtros.morador && filtros.morador.trim() !== '') {
      query = query.ilike('moradores.nome', `%${filtros.morador}%`);
    }
    
    if (filtros.porteiro && filtros.porteiro.trim() !== '') {
      query = query.or(`porteiro_recebeu.nome_completo.ilike.%${filtros.porteiro}%,porteiro_entregou.nome_completo.ilike.%${filtros.porteiro}%`);
    }
    
    if (filtros.status && filtros.status.trim() !== '') {
      query = query.eq('status', filtros.status);
    }
    
    // Ordenar por data de recebimento (mais recente primeiro)
    query = query.order('data_recebimento', { ascending: false });
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[Supabase] Error buscarRelatorio:', error);
      return [];
    }
    
    // Transformar dados para o formato esperado pelo frontend
    const resultados = data.map(item => ({
      id: item.id,
      data: item.data_recebimento,
      morador: item.moradores?.nome || '',
      apartamento: item.moradores?.apartamento || '',
      bloco: item.moradores?.bloco || '',
      telefone: item.moradores?.telefone || '',
      rua: item.moradores?.rua || '',
      numero: item.moradores?.numero || '',
      porteiro: item.porteiro_recebeu?.nome_completo || '',
      quantidade: item.quantidade,
      status: item.status,
      observacoes: item.observacoes || '',
      codigo_rastreio: item.codigo_rastreio || '',
      data_entrega: item.data_entrega,
      porteiro_entregou: item.porteiro_entregou?.nome_completo || '',
      retirado_por_nome: item.retirado_por_nome || ''
    }));
    
    console.log('[Supabase] Relatório encontrado:', resultados.length, 'registros');
    return resultados;
    
  } catch (error) {
    console.error('[Supabase] Error buscarRelatorio:', error);
    return [];
  }
}

// Busca otimizada de encomendas pendentes com cache
async function searchPendingPackages(searchTerm) {
  const currentCondominioId = getCurrentCondominio();
  console.log('[Supabase] SEARCH PENDING PACKAGES for condominio:', currentCondominioId, 'term:', searchTerm);
  
  // Validação de sessão
  const sessionValidation = validateCondominioAccess();
  if (!sessionValidation.valid) {
    console.error('[Session] Acesso negado:', sessionValidation.message);
    return { success: false, message: sessionValidation.message, data: [] };
  }

  if (!searchTerm || searchTerm.trim() === '') {
    console.log('[Debug] Termo de busca vazio');
    return { success: true, message: 'Termo de busca vazio.', data: [] };
  }

  const searchTermLower = searchTerm.trim().toLowerCase();
  console.log('[Debug] Termo de busca processado:', searchTermLower);
  
  try {
    // Primeiro, tenta buscar no cache de encomendas pendentes
    let cachedPackages = cache.get('encomendas_pendentes', { condominioId: currentCondominioId });
    
    // Se não há cache, inicializa chamando getPendingPackages primeiro
    if (!cachedPackages) {
      console.log('[Debug] Cache não encontrado, inicializando com getPendingPackages...');
      const initResult = await getPendingPackages();
      if (Array.isArray(initResult)) {
        cachedPackages = initResult;
      } else {
        console.log('[Debug] Falha na inicialização do cache, continuando com busca direta no banco');
      }
    }
    console.log('[Debug] Cache encontrado:', cachedPackages ? cachedPackages.length : 0, 'encomendas');
    
    if (cachedPackages && cachedPackages.length > 0) {
      console.log('[Cache] Usando dados em cache para busca');
      console.log('[Debug] Primeira encomenda do cache:', JSON.stringify(cachedPackages[0], null, 2));
      
      // Filtra os dados do cache usando a mesma lógica da tela de encomendas
      const filteredResults = cachedPackages.filter(item => {
        const moradorNome = (item.moradores?.nome || item.morador_nome || '').toLowerCase();
        const apartamento = (item.moradores?.apartamento || '').toLowerCase();
        const bloco = (item.moradores?.bloco || '').toLowerCase();
        const codigoRastreio = (item.codigo_rastreio || '').toLowerCase();
        
        const match = moradorNome.includes(searchTermLower) ||
               apartamento.includes(searchTermLower) ||
               bloco.includes(searchTermLower) ||
               codigoRastreio.includes(searchTermLower);
               
        if (match) {
          console.log('[Debug] Match encontrado:', { moradorNome, apartamento, bloco, codigoRastreio });
        }
        
        return match;
      });
      
      console.log('[Debug] Resultados filtrados do cache:', filteredResults.length);
      return { 
        success: true, 
        message: `${filteredResults.length} encomenda(s) encontrada(s).`, 
        data: filteredResults 
      };
    }
    
    // Se não há cache, busca diretamente no banco usando a mesma estrutura de getPendingPackages
    console.log('[Database] Buscando diretamente no banco de dados');
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('encomendas')
      .select(`
        id,
        data_recebimento,
        quantidade,
        status,
        observacoes,
        codigo_rastreio,
        moradores!inner(
          id,
          nome,
          apartamento,
          bloco,
          telefone,
          condominio_id
        ),
        porteiro_recebeu:usuarios!porteiro_recebeu_id(
          id,
          nome_completo
        )
      `)
      .eq('status', 'Recebida na portaria')
      .eq('moradores.condominio_id', currentCondominioId)
      .or(`moradores.nome.ilike.*${searchTerm}*,moradores.apartamento.ilike.*${searchTerm}*,moradores.bloco.ilike.*${searchTerm}*,codigo_rastreio.ilike.*${searchTerm}*`)
      .order('data_recebimento', { ascending: false });

    if (error) {
      console.error('[Supabase] Error searchPendingPackages:', error);
      return { success: false, message: 'Erro ao buscar encomendas: ' + error.message, data: [] };
    }

    console.log(`[Supabase] Search found ${data ? data.length : 0} packages`);
    
    // Mapeia os dados para o mesmo formato usado em getPendingPackages
    const mappedData = (data || []).map(item => ({
      id: item.id,
      morador_nome: item.moradores?.nome || 'N/A',
      morador_id: item.moradores?.id,
      porteiro_nome: item.porteiro_recebeu?.nome_completo || 'N/A',
      data_recebimento: item.data_recebimento,
      quantidade: item.quantidade,
      status: item.status,
      observacoes: item.observacoes,
      codigo_rastreio: item.codigo_rastreio,
      moradores: {
        id: item.moradores?.id,
        nome: item.moradores?.nome,
        apartamento: item.moradores?.apartamento,
        bloco: item.moradores?.bloco,
        telefone: item.moradores?.telefone,
        condominio_id: item.moradores?.condominio_id
      },
      porteiro_recebeu: {
        id: item.porteiro_recebeu?.id,
        nome_completo: item.porteiro_recebeu?.nome_completo
      }
    }));
    
    if (mappedData.length > 0) {
      console.log('[Debug] Primeira encomenda mapeada:', JSON.stringify(mappedData[0], null, 2));
    }
    
    return { 
      success: true, 
      message: `${mappedData.length} encomenda(s) encontrada(s).`, 
      data: mappedData 
    };
    
  } catch (error) {
    console.error('[Supabase] Error searchPendingPackages:', error);
    return { success: false, message: 'Erro interno ao buscar encomendas: ' + error.message, data: [] };
  }
}

module.exports = {
  validateCondominiumStatus,
  loginUser,
  getPendingPackages,
  searchPendingPackages,
  searchResidents,
  saveResident,
  searchActivePorters,
  getActiveUsers,
  savePackage,
  updatePackage,
  deliverPackage,
  getResidents,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  saveUser,
  deleteResident,
  getResidentById,
  updateResident,
  getDashboardStats,
  getDashboardChartData,
  getPackageById,
  buscarRelatorio
};