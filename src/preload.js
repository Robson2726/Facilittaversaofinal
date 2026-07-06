// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Objeto que será exposto para o renderer process de forma segura
const electronAPI = {
  // Encomendas
  getPendingPackages: (condominioId = null) => ipcRenderer.invoke('get-pending-packages', condominioId),
  searchPendingPackages: (searchTerm) => ipcRenderer.invoke('search-pending-packages', searchTerm),
  savePackage: (packageData) => ipcRenderer.invoke('save-package', packageData),
  cadastrarEncomenda: (packageData) => ipcRenderer.invoke('save-package', packageData),
  getPackageById: (packageId) => ipcRenderer.invoke('get-package-by-id', packageId),
  updatePackage: (packageId, packageData) => ipcRenderer.invoke('update-package', { packageId, packageData }),
  deliverPackage: (packageId, deliveryData) => ipcRenderer.invoke('deliver-package', { packageId, deliveryData }),

  // Moradores
  searchResidents: (term) => ipcRenderer.invoke('search-residents', term),
  saveResident: (data) => ipcRenderer.invoke('save-resident', data),
  getResidents: (condominioId = null) => ipcRenderer.invoke('get-residents', condominioId),
  buscarMoradores: () => ipcRenderer.invoke('get-residents'),
  deleteResident: (residentId) => ipcRenderer.invoke('delete-resident', residentId),
  getResidentById: (residentId) => ipcRenderer.invoke('get-resident-by-id', residentId),
  updateResident: (residentId, residentData) => ipcRenderer.invoke('update-resident', { residentId, residentData }),

  // Usuários (Admin/Porteiro) - Tabela Usuarios
  loginUser: (credentials) => ipcRenderer.invoke('login-user', credentials),
  searchActivePorters: (term, condominioId = null) => ipcRenderer.invoke('search-porters', term, condominioId),
  saveUser: (userData) => ipcRenderer.invoke('save-user', userData),
  getUsers: (condominioId = null) => ipcRenderer.invoke('get-users', condominioId),
  deleteUser: (userId) => ipcRenderer.invoke('delete-user', userId),
  getUserById: (userId) => ipcRenderer.invoke('get-user-by-id', userId),
  updateUser: (userId, userData) => ipcRenderer.invoke('update-user', { userId, userData }),
  existeUsuarioAdmin: () => ipcRenderer.invoke('existe-usuario-admin'),
  criarAdminInicial: (dados) => ipcRenderer.invoke('criar-admin-inicial', dados),

  // Relatórios
  buscarRelatorio: (filtros) => ipcRenderer.invoke('buscar-relatorio', filtros),
  exportarRelatorioPDF: (filtros) => ipcRenderer.invoke('exportar-relatorio-pdf', filtros),

  // Importação de moradores via CSV
  importarMoradoresCSV: (csvContent) => ipcRenderer.invoke('importar-moradores-csv', csvContent),

  // Configuração do banco
  getDbConfig: () => ipcRenderer.invoke('get-db-config'),
  saveDbConfig: (config) => ipcRenderer.invoke('save-db-config', config),
  criarTabelasBanco: () => ipcRenderer.invoke('criar-tabelas-banco'),
  testarConexaoBanco: (config) => ipcRenderer.invoke('testar-conexao-banco', config),

  // Backup do banco
  criarBackupBanco: () => ipcRenderer.invoke('criar-backup-banco'),

  // Controle de Janela
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Outros
  focusMainWindow: () => ipcRenderer.send('focus-main-window'),

  // Dashboard
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  getDashboardChartData: () => ipcRenderer.invoke('get-dashboard-chart-data'),
  getDashboardChartRawData: () => ipcRenderer.invoke('get-dashboard-chart-raw-data'),

  // QR Code API
  generateAPIQRCode: (port) => ipcRenderer.invoke('generate-api-qrcode', port || 3001)
};

// Expõe o objeto 'electronAPI' de forma segura para o renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('[Preload] Script carregado e API exposta (Tabela Usuarios Unificada).');

// Log de verificação (opcional, mas útil para debug)
if (electronAPI.saveUser && electronAPI.getUsers && electronAPI.deleteUser && electronAPI.getUserById && electronAPI.updateUser) {
    console.log('[Preload] Funções CRUD de Usuário expostas.');
} else {
    console.error('[Preload] ERRO: Falha ao expor uma ou mais funções CRUD de Usuário!');
}