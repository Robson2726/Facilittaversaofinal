// --- Cache Manager para otimização de consultas ao banco ---
// Sistema de cache em memória com TTL (Time To Live)

class CacheManager {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutos padrão
    
    // Configurações específicas de TTL por tipo de dados
    this.ttlConfig = {
      'moradores': 10 * 60 * 1000,      // 10 minutos - dados que mudam pouco
      'usuarios': 15 * 60 * 1000,       // 15 minutos - dados que mudam pouco
      'encomendas_pendentes': 2 * 60 * 1000,  // 2 minutos - dados que mudam frequentemente
      'dashboard_stats': 3 * 60 * 1000,  // 3 minutos - estatísticas
      'dashboard_chart': 5 * 60 * 1000,  // 5 minutos - dados de gráficos
      'search_results': 1 * 60 * 1000,   // 1 minuto - resultados de busca
    };
    
    // Limpa cache expirado a cada 2 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 2 * 60 * 1000);
    
    console.log('[CacheManager] Inicializado com sucesso');
  }
  
  // Gera chave única para o cache baseada no tipo e parâmetros
  generateKey(type, params = {}) {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${type}:${paramString}`;
  }
  
  // Armazena dados no cache
  set(type, data, params = {}, customTTL = null) {
    const key = this.generateKey(type, params);
    const ttl = customTTL || this.ttlConfig[type] || this.defaultTTL;
    const expiry = Date.now() + ttl;
    
    this.cache.set(key, {
      data,
      expiry,
      type,
      createdAt: Date.now()
    });
    
    console.log(`[CacheManager] Dados armazenados: ${key} (TTL: ${ttl}ms)`);
  }
  
  // Recupera dados do cache
  get(type, params = {}) {
    const key = this.generateKey(type, params);
    const cached = this.cache.get(key);
    
    if (!cached) {
      console.log(`[CacheManager] Cache miss: ${key}`);
      return null;
    }
    
    if (Date.now() > cached.expiry) {
      console.log(`[CacheManager] Cache expirado: ${key}`);
      this.cache.delete(key);
      return null;
    }
    
    console.log(`[CacheManager] Cache hit: ${key}`);
    return cached.data;
  }
  
  // Invalida cache por tipo ou chave específica
  invalidate(type, params = null) {
    if (params) {
      // Invalida chave específica
      const key = this.generateKey(type, params);
      const deleted = this.cache.delete(key);
      console.log(`[CacheManager] Cache invalidado: ${key} (${deleted ? 'sucesso' : 'não encontrado'})`);
    } else {
      // Invalida todos os caches do tipo
      let deletedCount = 0;
      for (const [key, value] of this.cache.entries()) {
        if (value.type === type) {
          this.cache.delete(key);
          deletedCount++;
        }
      }
      console.log(`[CacheManager] Invalidados ${deletedCount} caches do tipo: ${type}`);
    }
  }
  
  // Invalida múltiplos tipos de cache (útil para operações que afetam vários dados)
  invalidateMultiple(types) {
    types.forEach(type => this.invalidate(type));
  }
  
  // Remove entradas expiradas
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expiry) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[CacheManager] Limpeza automática: ${cleanedCount} entradas removidas`);
    }
  }
  
  // Limpa todo o cache
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[CacheManager] Cache limpo: ${size} entradas removidas`);
  }
  
  // Estatísticas do cache
  getStats() {
    const stats = {
      totalEntries: this.cache.size,
      byType: {},
      oldestEntry: null,
      newestEntry: null
    };
    
    let oldest = Date.now();
    let newest = 0;
    
    for (const [key, value] of this.cache.entries()) {
      // Conta por tipo
      stats.byType[value.type] = (stats.byType[value.type] || 0) + 1;
      
      // Encontra mais antigo e mais novo
      if (value.createdAt < oldest) {
        oldest = value.createdAt;
        stats.oldestEntry = key;
      }
      if (value.createdAt > newest) {
        newest = value.createdAt;
        stats.newestEntry = key;
      }
    }
    
    return stats;
  }
  
  // Destrói o cache manager
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
    console.log('[CacheManager] Destruído');
  }
}

// Instância singleton do cache manager
let cacheManagerInstance = null;

function getCacheManager() {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager();
  }
  return cacheManagerInstance;
}

module.exports = {
  CacheManager,
  getCacheManager
};