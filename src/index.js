// --- src/index.js ---
// (Processo Principal do Electron)

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Carrega variáveis de ambiente do arquivo .env
require('dotenv').config();

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs'); // <-- Adicione esta linha no topo
const PDFDocument = require('pdfkit'); // Para gerar PDFs
const csvParse = require('csv-parse/sync'); // Certifique-se de já ter instalado: npm install csv-parse
const { execFile, exec, chmod } = require('child_process');
const os = require('os');
const https = require('https');
const { getCurrentDate, getCurrentDateTime } = require('./utils/dateUtils');
const DesktopApiServer = require('./api-server'); // Nova importação
const QRCodeUtils = require('./utils/qrcode');
const { getCacheManager } = require('./cache-manager'); // Sistema de cache

// Importações do Supabase
const { initSupabase } = require('./supabase-config');
const supabaseFunctions = require('./supabase-functions');

// Inicializa o cache manager
const cache = getCacheManager();

// --- Hot reload para desenvolvimento ---
try {
  if (process.env.NODE_ENV !== 'production') {
    require('electron-reload')(__dirname, {
      electron: require('electron'),
      // Assista arquivos .js, .html, .css na pasta src
      // Você pode ajustar os paths conforme sua estrutura
      watch: [
        __dirname,
        // Se quiser incluir arquivos fora de src, adicione paths aqui
      ]
    });
    console.log('[DEV] electron-reload ativado.');
  }
} catch (e) {
  console.warn('[DEV] electron-reload não instalado ou erro ao carregar:', e.message);
}

// --- Configuração do Supabase ---
let supabaseInitialized = false;

// Inicializa Supabase ao iniciar app
function initializeSupabase() {
  console.log('[index.js] Iniciando processo de inicialização do Supabase...');
  console.log('[index.js] Diretório atual:', __dirname);
  console.log('[index.js] App empacotado:', app.isPackaged);
  
  // Verifica diferentes locais possíveis do arquivo .env
  const envPaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '../.env'),
    path.join(process.cwd(), '.env'),
    // Para aplicativo empacotado, o .env estará na pasta de recursos
    app.isPackaged ? path.join(process.resourcesPath, '.env') : null
  ].filter(Boolean);
  
  console.log('[index.js] Verificando arquivos .env:');
  envPaths.forEach((envPath, index) => {
    const exists = fs.existsSync(envPath);
    console.log(`[index.js] ${index + 1}. ${envPath} - ${exists ? '✅ EXISTE' : '❌ NÃO EXISTE'}`);
  });
  
  // Procura o arquivo .env em ordem de prioridade
  let envLoaded = false;
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      console.log('[index.js] Carregando .env de:', envPath);
      require('dotenv').config({ path: envPath });
      envLoaded = true;
      break;
    }
  }
  
  if (!envLoaded) {
    console.error('[index.js] Arquivo .env não encontrado em nenhum local!');
  }
  
  try {
    console.log('[index.js] Chamando initSupabase()...');
    initSupabase();
    supabaseInitialized = true;
    console.log('[index.js] ✅ Supabase inicializado com sucesso');
    return true;
  } catch (error) {
    console.error('[index.js] ❌ Erro ao inicializar Supabase:', error.message);
    console.error('[index.js] Stack trace:', error.stack);
    supabaseInitialized = false;
    return false;
  }
}

// Inicializa Supabase ao iniciar app
console.log('[index.js] Executando inicialização do Supabase...');
const supabaseResult = initializeSupabase();
console.log('[index.js] Resultado da inicialização:', supabaseResult);

// Variável para guardar a referência da janela principal
let mainWindow;
let apiServer = null; // Nova variável para o servidor da API

// --- Função para criar a Janela Principal ---
const createWindow = () => {
  // Cria a janela do navegador.
  mainWindow = new BrowserWindow({
    width: 1000, // Largura inicial
    height: 700, // Altura inicial
    webPreferences: {
      // Anexa o script de preload à janela
      preload: path.join(__dirname, 'preload.js'),
      // Medidas de segurança recomendadas:
      contextIsolation: true, // Isola o contexto do preload do renderer
      nodeIntegration: false // Desabilita acesso direto ao Node.js no renderer
    },
    frame: true, // Remove a barra padrão do sistema
     });

  // Carrega o arquivo index.html da aplicação.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Maximiza a janela para tela cheia
  mainWindow.maximize();

  // Remover o menu padrão do Electron
  mainWindow.setMenu(null);

  // Adiciona atalho para abrir/fechar DevTools (F12 ou Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || 
        (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // Limpa a referência da janela quando ela é fechada
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};
// -------------------------------------------

// --- Funções de Acesso ao Banco de Dados (Supabase) ---

// Busca encomendas com status 'Recebida na portaria' (com cache)
async function getPendingPackages() {
  if (!supabaseInitialized) {
    console.warn('[index.js] Supabase não inicializado');
    return [];
  }
  return await supabaseFunctions.getPendingPackages();
}

// Busca otimizada de encomendas pendentes com cache
async function searchPendingPackages(searchTerm) {
  if (!supabaseInitialized) {
    console.warn('[index.js] Supabase não inicializado');
    return { success: false, message: 'Sistema não inicializado', data: [] };
  }
  return await supabaseFunctions.searchPendingPackages(searchTerm);
}

// Busca moradores por nome (para autocomplete) - com cache
async function searchResidents(searchTerm) {
  if (!supabaseInitialized) {
    console.warn('[index.js] Supabase não inicializado');
    return [];
  }
  return await supabaseFunctions.searchResidents(searchTerm);
}

// Salva um novo morador no banco
async function saveResident(residentData) {
  if (!supabaseInitialized) {
    console.warn('[index.js] Supabase não inicializado');
    return { success: false, message: 'Sistema não inicializado' };
  }
  return await supabaseFunctions.saveResident(residentData);
}

// Busca todos os moradores cadastrados (com cache)
async function getResidents() {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return [];
    }
    return await supabaseFunctions.getResidents();
}

// Nova função otimizada para buscar todos os moradores (com cache)
async function getAllResidents() {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return [];
    }
    return await supabaseFunctions.getResidents();
}

// Exclui um morador pelo ID
async function deleteResident(residentId) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    return await supabaseFunctions.deleteResident(residentId);
}

// Busca dados de um morador específico por ID
async function getResidentById(residentId) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return null;
    }
    return await supabaseFunctions.getResidentById(residentId);
}

// Atualiza os dados de um morador existente
async function updateResident(residentId, residentData) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    return await supabaseFunctions.updateResident(residentId, residentData);
}

// Busca usuários ATIVOS com nivel_acesso 'porteiro' (para autocomplete no modal de encomenda)
async function searchActivePorters(searchTerm) {
  if (!supabaseInitialized) {
    console.warn('[index.js] Supabase não inicializado');
    return [];
  }
  return await supabaseFunctions.searchActivePorters(searchTerm);
}

// Nova função para buscar todos os usuários ativos (para API mobile) - com cache
async function getActiveUsers(nivel = null) {
  if (!supabaseInitialized) {
    console.warn('[index.js] Supabase não inicializado');
    return [];
  }
  return await supabaseFunctions.getActiveUsers(nivel);
}

// Salva uma nova encomenda (agora usando usuarios.id corretamente)
async function savePackage(packageData) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    return await supabaseFunctions.savePackage(packageData);
}

// Função de Login (Usa tabela Usuarios, agora verifica status)
async function loginUser(username, password) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    return await supabaseFunctions.loginUser(username, password);
}

// Busca todos os Usuários da tabela Usuarios (agora com status)
async function getUsers() {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return [];
    }
    return await supabaseFunctions.getUsers();
}

// Busca dados de um usuário por ID (Tabela Usuarios, agora com status)
async function getUserById(userId) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return null;
    }
    return await supabaseFunctions.getUserById(userId);
}

// Atualiza dados de um usuário (Tabela Usuarios, agora com status)
async function updateUser(userId, userData) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    return await supabaseFunctions.updateUser(userId, userData);
}

// Exclui Usuário (Tabela Usuarios)
async function deleteUser(userId) {
    console.log(`[index.js] DELETE User ID: ${userId}`);
    
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    
    return await supabaseFunctions.deleteUser(userId);
}

// Salva um novo usuário (Tabela Usuarios, agora com status padrão 'Ativo')
async function saveUser(userData) {
    console.log('[index.js] SAVE User:', userData);
    
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    
    return await supabaseFunctions.saveUser(userData);
}

// Função auxiliar para garantir pool inicializado e tratar erro de conexão
function getPoolOrError() {
  if (!pool) {
    throw new Error('Banco de dados não configurado. Configure o banco antes de usar o app.');
  }
  return pool;
}

// Wrappers para handlers IPC (com modo master para configuração inicial)
async function handleGetPendingPackages(event) {
  try {
    return await getPendingPackages();
  } catch (error) {
    console.log('[DEBUG] Erro de banco:', error.message);
    return [];
  }
}

async function handleGetResidents(event) {
  try {
    return await getResidents();
  } catch (error) {
    console.log('[DEBUG] Erro de banco:', error.message);
    return [];
  }
}

async function handleGetUsers(event) {
  try {
    return await getUsers();
  } catch (error) {
    console.log('[DEBUG] Erro de banco:', error.message);
    return [];
  }
}

async function handleGetDashboardStats(event) {
  try {
    return await getDashboardStats();
  } catch (error) {
    console.log('[DEBUG] Erro de banco:', error.message);
    return {};
  }
}

async function handleSearchResidents(event, searchTerm) {
  try {
    return await searchResidents(searchTerm);
  } catch (error) {
    console.log('[DEBUG] Erro de banco:', error.message);
    return [];
  }
}

async function handleSearchActivePorters(event, searchTerm) {
  try {
    return await searchActivePorters(searchTerm);
  } catch (error) {
    console.log('[DEBUG] Erro de banco:', error.message);
    return [];
  }
}

// -------------------------------------------
async function getPackageById(packageId) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado', data: null };
    }
    return await supabaseFunctions.getPackageById(packageId);
}

async function updatePackage(packageId, packageData) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    return await supabaseFunctions.updatePackage(packageId, packageData);
}

async function deliverPackage(packageId, deliveryData) {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado' };
    }
    return await supabaseFunctions.deliverPackage(packageId, deliveryData);
}

// Função para obter estatísticas do dashboard
async function getDashboardStats() {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return {
            totalMoradores: 0,
            encomendasPendentes: 0,
            encomendasAntigas: 0,
            encomendasCriticas: 0
        };
    }
    return await supabaseFunctions.getDashboardStats();
}

// Função para obter dados dos gráficos do dashboard
async function getDashboardChartData() {
    if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return {
            encomendasPorDia: [],
            encomendasPorMes: []
        };
    }
    return await supabaseFunctions.getDashboardChartData();
}



// --- Configuração do Ciclo de Vida do Electron ---
app.whenReady().then(() => {
  console.log('[index.js] App pronto. Configurando IPC e criando janela...');

  // --- REGISTRO DOS HANDLERS IPC (COM CORREÇÃO) ---
  console.log('[index.js] Registrando handlers IPC...');
  ipcMain.handle('get-pending-packages', handleGetPendingPackages);
  ipcMain.handle('search-pending-packages', (event, searchTerm) => searchPendingPackages(searchTerm));
  ipcMain.handle('search-porters', (event, searchTerm) => searchActivePorters(searchTerm));
  ipcMain.handle('search-residents', (event, searchTerm) => searchResidents(searchTerm));
  ipcMain.handle('save-resident', (event, residentData) => saveResident(residentData));
  ipcMain.handle('get-residents', handleGetResidents);
  ipcMain.handle('delete-resident', (event, residentId) => deleteResident(residentId));
  ipcMain.handle('get-resident-by-id', (event, residentId) => getResidentById(residentId));
  ipcMain.handle('update-resident', (event, { residentId, residentData }) => updateResident(residentId, residentData));
  ipcMain.handle('login-user', async (event, credentials) => {
    const result = await loginUser(credentials.username, credentials.password);
    
    // Define o global.currentUser se o login foi bem-sucedido
    if (result.success && result.user) {
      global.currentUser = result.user;
      console.log('[index.js] Global currentUser definido:', global.currentUser);
    } else {
      global.currentUser = null;
    }
    
    return result;
  });
  ipcMain.handle('save-package', (event, packageData) => savePackage(packageData));
  ipcMain.handle('save-user', (event, userData) => saveUser(userData));
  ipcMain.handle('get-users', handleGetUsers);
  ipcMain.handle('delete-user', (event, userId) => deleteUser(userId));
  ipcMain.handle('get-user-by-id', (event, userId) => getUserById(userId));
  ipcMain.handle('update-user', (event, { userId, userData }) => updateUser(userId, userData));
  ipcMain.handle('get-package-by-id', (event, packageId) => getPackageById(packageId));
  ipcMain.handle('update-package', (event, { packageId, packageData }) => updatePackage(packageId, packageData));
  ipcMain.handle('deliver-package', (event, { packageId, deliveryData }) => deliverPackage(packageId, deliveryData));
  ipcMain.handle('get-dashboard-stats', handleGetDashboardStats);
  ipcMain.handle('get-dashboard-chart-data', getDashboardChartData);
  ipcMain.handle('get-dashboard-chart-raw-data', getDashboardChartData);

  // Handler para buscar usuários ativos (para API)
  ipcMain.handle('get-active-users', (event, nivel) => getActiveUsers(nivel));

  // Handler para buscar relatório
  ipcMain.handle('buscar-relatorio', async (event, filtros) => {
    if (!supabaseInitialized) {
      console.warn('[index.js] Supabase não inicializado');
      return [];
    }
    return await supabaseFunctions.buscarRelatorio(filtros);
  });

  // Handler para exportar PDF
  ipcMain.handle('exportar-relatorio-pdf', async (event, filtros) => {
    // Buscar dados usando Supabase
    let resultados = [];
    try {
      if (!supabaseInitialized) {
        console.warn('[index.js] Supabase não inicializado');
        return { success: false, message: 'Supabase não inicializado.' };
      }
      resultados = await supabaseFunctions.buscarRelatorio(filtros);
      console.log('[exportar-relatorio-pdf] Resultados:', resultados.length);
    } catch (error) {
      console.error('[index.js] Erro buscar-relatorio (PDF):', error);
      return { success: false, message: 'Erro ao buscar dados para PDF.' };
    }

    // Solicita ao usuário onde salvar o PDF
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Salvar relatório como PDF',
      defaultPath: 'Relatório de encomendas.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Exportação cancelada pelo usuário.' };
    }

    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Função para formatar data/hora
    const formatarData = (data) => {
      if (!data) return '';
      try {
        const d = new Date(data);
        if (isNaN(d.getTime())) return '';
        return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      } catch {
        return '';
      }
    };

    // Função para adicionar nova página se necessário
    const verificarNovaPagina = (yAtual, alturaMinima = 80) => {
      if (yAtual + alturaMinima > doc.page.height - 60) {
        doc.addPage();
        return 60; // Nova posição Y
      }
      return yAtual;
    };

    // Cabeçalho do documento
    doc.fontSize(20).font('Helvetica-Bold').text('RELATÓRIO DE ENCOMENDAS', { align: 'center' });
    doc.moveDown(0.5);

    // Informações do filtro aplicado
    doc.fontSize(10).font('Helvetica');
    let filtroTexto = 'Filtros aplicados: ';
    if (filtros.dataInicial) filtroTexto += `Data inicial: ${filtros.dataInicial} `;
    if (filtros.dataFinal) filtroTexto += `Data final: ${filtros.dataFinal} `;
    if (filtros.morador) filtroTexto += `Morador: ${filtros.morador} `;
    if (filtros.porteiro) filtroTexto += `Porteiro: ${filtros.porteiro} `;
    if (filtros.status) filtroTexto += `Status: ${filtros.status} `;

    doc.text(filtroTexto || 'Filtros aplicados: Nenhum', { align: 'left' });
    doc.text(`Total de registros: ${resultados.length}`, { align: 'left' });
    doc.moveDown(1);

    let y = doc.y;

    // Processar cada encomenda como um bloco completo
    resultados.forEach((encomenda, index) => {
      y = verificarNovaPagina(y, 120);

      // Linha separadora entre encomendas
      if (index > 0) {
        doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
        y += 10;
      }

      // ID da encomenda e status
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`ENCOMENDA #${encomenda.id}`, 40, y);

      // Status com cor diferente baseado no status
      const statusColor = encomenda.status === 'Entregue' ? 'green' :
                         encomenda.status === 'Recebida na portaria' ? 'orange' : 'black';
      doc.fillColor(statusColor).text(`Status: ${encomenda.status}`, 300, y);
      doc.fillColor('black');
      y += 20;

      // Informações do morador
      doc.fontSize(10).font('Helvetica-Bold').text('DADOS DO MORADOR:', 40, y);
      y += 15;
      doc.font('Helvetica');
      doc.text(`Nome: ${encomenda.morador || 'N/A'}`, 50, y);
      y += 12;

      let endereco = '';
      if (encomenda.rua) endereco += `${encomenda.rua}`;
      if (encomenda.numero) endereco += `, ${encomenda.numero}`;
      if (encomenda.apartamento) endereco += ` - AP: ${encomenda.apartamento}`;
      if (encomenda.bloco) endereco += ` - Bloco: ${encomenda.bloco}`;

      doc.text(`Endereço: ${endereco || 'N/A'}`, 50, y);
      y += 12;
      doc.text(`Telefone: ${encomenda.telefone || 'N/A'}`, 50, y);
      y += 20;

      // Informações da encomenda
      doc.font('Helvetica-Bold').text('DADOS DA ENCOMENDA:', 40, y);
      y += 15;
      doc.font('Helvetica');
      doc.text(`Data de Recebimento: ${formatarData(encomenda.data)}`, 50, y);
      y += 12;
      doc.text(`Quantidade: ${encomenda.quantidade || 'N/A'}`, 50, y);
      y += 12;
      doc.text(`Porteiro que Recebeu: ${encomenda.porteiro || 'N/A'}`, 50, y);
      y += 12;

      if (encomenda.codigo_rastreio) {
        doc.text(`Código de Rastreio: ${encomenda.codigo_rastreio}`, 50, y);
        y += 12;
      }

      // Informações de entrega (se aplicável)
      if (encomenda.status === 'Entregue') {
        y += 8;
        doc.font('Helvetica-Bold').text('DADOS DA ENTREGA:', 40, y);
        y += 15;
        doc.font('Helvetica');
        doc.text(`Data de Entrega: ${formatarData(encomenda.data_entrega)}`, 50, y);
        y += 12;
        doc.text(`Porteiro que Entregou: ${encomenda.porteiro_entregou || 'N/A'}`, 50, y);
        y += 12;
        if (encomenda.retirado_por_nome) {
          doc.text(`Retirado por: ${encomenda.retirado_por_nome}`, 50, y);
          y += 12;
        }
      }

      // Observações
      if (encomenda.observacoes) {
        y += 8;
        doc.font('Helvetica-Bold').text('OBSERVAÇÕES:', 40, y);
        y += 15;
        doc.font('Helvetica');
        // Quebra texto longo em múltiplas linhas
        const obs = encomenda.observacoes;
        const obsLines = [];
        let line = '';
        for (let i = 0; i < obs.length; i++) {
          line += obs[i];
          if (line.length >= 80 || obs[i] === '\n') {
            obsLines.push(line);
            line = '';
          }
        }
        if (line) obsLines.push(line);
        obsLines.forEach(linha => {
          doc.text(linha, 50, y);
          y += 12;
        });
      }

      y += 20; // Espaço entre encomendas
    });

    // Rodapé em todas as páginas
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const dataHora = new Date();
      const textoRodape = `Relatório gerado em: ${dataHora.toLocaleDateString('pt-BR')} às ${dataHora.toLocaleTimeString('pt-BR')}`;
      doc.fontSize(8).fillColor('gray')
         .text(textoRodape, 40, doc.page.height - 40, { align: 'left' })
         .text(`Página ${i + 1}`, 0, doc.page.height - 40, { align: 'right', width: doc.page.width - 80 });
    }

    doc.end();

    // Aguarda o término da escrita do PDF
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({ success: true, message: 'PDF exportado com sucesso!', path: filePath });
      });
      stream.on('error', (err) => {
        reject({ success: false, message: 'Erro ao salvar PDF: ' + err.message });
      });
    });
  });

  // Handler para importação de moradores via CSV
  ipcMain.handle('importar-moradores-csv', async (event, csvContent) => {
    try {
      // Verifica se o Supabase está inicializado
      if (!supabaseInitialized) {
        console.warn('[importar-moradores-csv] Supabase não inicializado');
        return { success: false, message: 'Sistema não inicializado' };
      }

      // Parse do CSV
      const records = csvParse.parse(csvContent, {
        columns: true, // Usa cabeçalho
        skip_empty_lines: true,
        trim: true
      });

      let inseridos = 0;
      let erros = 0;
      
      for (const row of records) {
        // Ajuste os nomes dos campos conforme o cabeçalho do seu CSV
        const { nome, telefone, rua, numero, bloco, apartamento, observacoes } = row;
        
        // Campos obrigatórios - pula se não tiver
        if (!nome || !rua || !numero || !apartamento) {
          console.warn('[importar-moradores-csv] Linha ignorada - campos obrigatórios faltando:', row);
          erros++;
          continue;
        }
        
        // Usa a função saveResident do Supabase que já inclui o condominio_id automaticamente
        const resultado = await supabaseFunctions.saveResident({
          nome,
          telefone: telefone || null,
          rua,
          numero,
          bloco: bloco || null,
          apartamento,
          observacoes: observacoes || null
        });
        
        if (resultado.success) {
          inseridos++;
        } else {
          console.error('[importar-moradores-csv] Erro ao salvar morador:', resultado.message);
          erros++;
        }
      }
      
      const mensagem = `Importação concluída! ${inseridos} moradores inseridos.${erros > 0 ? ` ${erros} registros com erro foram ignorados.` : ''}`;
      return { success: true, message: mensagem };
    } catch (error) {
      console.error('[importar-moradores-csv] Erro:', error);
      return { success: false, message: 'Erro ao importar moradores: ' + error.message };
    }
  });

  // Listener para focar a janela principal
  ipcMain.on('focus-main-window', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          mainWindow.webContents.focus();
          console.log('[Main Process] Foco aplicado.');
      } else {
           console.error('[Main Process] mainWindow não encontrada para aplicar foco.');
      }
  });

  // --- IPC para configuração do banco ---
  ipcMain.handle('get-db-config', () => {
    return readDbConfig();
  });
  ipcMain.handle('save-db-config', (event, config) => {
    const ok = saveDbConfig(config);
    if (ok) {
      // Recria o pool com a nova config
      initDbPool();
      return { success: true };
    }
    return { success: false, message: 'Erro ao salvar configuração.' };
  });

  // Handler para criar tabelas do banco (executa o SQL do esquema)
  ipcMain.handle('criar-tabelas-banco', async () => {
    try {
      const client = await getPoolOrError().connect();
      // Use o SQL do seu esquema (ajuste se necessário)
      const sql = `
        CREATE TABLE IF NOT EXISTS public.moradores (
          id serial PRIMARY KEY,
          nome varchar(255) NOT NULL,
          telefone varchar(50),
          rua varchar(255) NOT NULL,
          numero varchar(50) NOT NULL,
          bloco varchar(100),
          apartamento varchar(100) NOT NULL,
          observacoes text
        );
        CREATE TABLE IF NOT EXISTS public.usuarios (
          id serial PRIMARY KEY,
          nome_usuario varchar(50) NOT NULL UNIQUE,
          senha_hash text NOT NULL,
          nome_completo varchar(100),
          nivel_acesso varchar(20) NOT NULL CHECK (nivel_acesso IN ('admin', 'supervisor', 'porteiro')),
          data_criacao timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
          email varchar(100) UNIQUE,
          status varchar(50) NOT NULL DEFAULT 'Ativo'
        );
        CREATE TABLE IF NOT EXISTS public.encomendas (
          id serial PRIMARY KEY,
          morador_id integer NOT NULL REFERENCES public.moradores(id),
          porteiro_recebeu_id integer NOT NULL REFERENCES public.usuarios(id),
          data_recebimento timestamp with time zone NOT NULL,
          quantidade integer NOT NULL DEFAULT 1,
          observacoes text,
          status varchar(50) NOT NULL DEFAULT 'Recebida na portaria',
          data_entrega timestamp with time zone,
          porteiro_entregou_id integer REFERENCES public.usuarios(id),
          codigo_rastreio varchar(100),
          retirado_por_nome text
        );
        CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
        CREATE INDEX IF NOT EXISTS idx_usuarios_nome_usuario ON public.usuarios(nome_usuario);
      `;
      await client.query(sql);
      client.release();
      return { success: true, message: 'Tabelas criadas/verificadas com sucesso!' };
    } catch (err) {
      return { success: false, message: 'Erro ao criar tabelas: ' + err.message };
    }
  });

  // Handler para verificar se existe usuário admin
  ipcMain.handle('existe-usuario-admin', async () => {
    try {
      const client = await getPoolOrError().connect();
      const res = await client.query('SELECT COUNT(*) FROM usuarios');
      client.release();
      return { existe: parseInt(res.rows[0].count, 10) > 0 };
    } catch (err) {
      return { existe: false, error: err.message };
    }
  });

  // Handler para criar admin inicial
  ipcMain.handle('criar-admin-inicial', async (event, { nome_usuario, senha }) => {
    try {
      const client = await getPoolOrError().connect();
      // Verifica se já existe algum usuário
      const res = await client.query('SELECT COUNT(*) FROM usuarios');
      if (parseInt(res.rows[0].count, 10) > 0) {
        client.release();
        return { success: false, message: 'Já existe usuário cadastrado.' };
      }
      const { hashPassword } = require('./utils/passwordUtils');
      const senhaHash = hashPassword(senha);
      await client.query(
        `INSERT INTO usuarios (nome_usuario, senha_hash, nivel_acesso, status) VALUES ($1, $2, 'admin', 'Ativo')`,
        [nome_usuario, senhaHash]
      );
      client.release();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // Handler para testar conexão com o banco
  ipcMain.handle('testar-conexao-banco', async (event, config) => {
  console.log('[IPC] testar-conexao-banco chamado com config:', config);
  try {
    const testPool = new Pool({
      user: config.user,
      host: config.host,
      database: config.database,
      password: config.password,
      port: parseInt(config.port || '5432'),
      connectionTimeoutMillis: 4000,
    });
    const client = await testPool.connect();
    await client.query('SELECT 1');
    client.release();
    await testPool.end();
    console.log('[IPC] testar-conexao-banco: conexão OK');
    return { success: true, message: 'Conexão bem-sucedida!' };
  } catch (err) {
    console.error('[IPC] testar-conexao-banco: erro ao conectar:', err);
    return { success: false, message: 'Erro ao conectar: ' + (err.message || err) };
  }
});

  // Handler para criar backup
  ipcMain.handle('criar-backup-banco', criarBackupBanco);

  // Handler para importar backup
  ipcMain.handle('importar-backup-banco', importarBackupBanco);

  // Handler para gerar QR Code da API
  ipcMain.handle('generate-api-qrcode', async (event, port) => {
    try {
      console.log(`[IPC] Gerando QR Code para porta: ${port || 3001}`);
      const result = await QRCodeUtils.generateAPIQRCode(port || 3001);
      console.log(`[IPC] Resultado QR Code:`, result);
      return result;
    } catch (error) {
      console.error('[IPC] Erro ao gerar QR Code:', error);
      return { success: false, message: error.message };
    }
  });

  createWindow();
  
  // Iniciar API Server após a janela estar pronta
  setTimeout(async () => {
    try {
      // Cria instância do servidor API com as funções do desktop
      apiServer = new DesktopApiServer({
        getPendingPackages,
        searchResidents,
        getAllResidents, // Adiciona nova função
        saveResident,
        searchActivePorters,
        getActiveUsers, // Nova função adicionada
        savePackage,
        deliverPackage
      });
      
      await apiServer.start(3001);
    } catch (error) {
      console.error('[API] Erro ao iniciar servidor:', error);
    }
  }, 2000);
  
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// --- Função para criar backup do banco de dados ---
async function criarBackupBanco() {
  console.log('[index.js] Iniciando backup do banco...');
  
  try {
    const dbConfig = readDbConfig();
    if (!dbConfig) {
      return { success: false, message: 'Configuração do banco não encontrada.' };
    }

    // Solicita ao usuário onde salvar o backup
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Salvar backup do banco de dados',
      defaultPath: `backup_encomendas_${getCurrentDate()}.sql`,
      filters: [{ name: 'SQL', extensions: ['sql'] }]
    });

   

    if (canceled || !filePath) {
      return { success: false, message: 'Backup cancelado pelo usuário.' };
    }

    // Determina o caminho do pg_dump baseado no sistema operacional
    let pgDumpPath = 'pg_dump'; // Padrão se estiver no PATH
    
    // Caminhos comuns do PostgreSQL no Windows
    const possiblePaths = [
      'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump.exe',
      'C:\\Program Files (x86)\\PostgreSQL\\16\\bin\\pg_dump.exe',
      'C:\\Program Files (x86)\\PostgreSQL\\15\\bin\\pg_dump.exe',
    ];

    if (os.platform() === 'win32') {
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          pgDumpPath = possiblePath;
          break;
        }
      }
    }

    // Configura as variáveis de ambiente para autenticação
    const env = {
      ...process.env,
           PGPASSWORD: dbConfig.password
    };

    const args = [
      '-h', dbConfig.host,
      '-p', dbConfig.port || '5432',
      '-U', dbConfig.user,
      '-d', dbConfig.database,
      '--no-password',
      '--verbose',
      '--clean',
      '--create',
      '--format=custom',
      '--file', filePath
    ];

    console.log(`[backup] Executando: ${pgDumpPath} ${args.join(' ')}`);

    return new Promise((resolve) => {
      const child = execFile(pgDumpPath, args, { env }, (error, stdout, stderr) => {
        if (error) {
          console.error('[backup] Erro ao executar pg_dump:', error);
          console.error('[backup] stderr:', stderr);
          
          // Tenta backup alternativo com SQL plano se falhar
          criarBackupAlternativo(filePath, dbConfig)
            .then(resolve)
            .catch(() => resolve({ 
              success: false, 
              message: `Erro ao criar backup: ${error.message}\n\nDetalhes: ${stderr}` 
            }));
          return;
        }

        console.log('[backup] pg_dump executado com sucesso');
        console.log('[backup] stdout:', stdout);
        
        resolve({ 
          success: true, 
          message: 'Backup criado com sucesso!', 
          path: filePath 
 
        });
      });

      // Timeout de 5 minutos
      setTimeout(() => {
        child.kill();
        resolve({ 
          success: false, 
          message: 'Timeout: Backup demorou mais de 5 minutos para ser concluído.' 
        });
      }, 5 * 60 * 1000);
    });

  } catch (error) {
    console.error('[backup] Erro geral:', error);
    return { success: false, message: `Erro interno: ${error.message}` };
  }
}

// --- Função para importar backup do banco de dados ---
async function importarBackupBanco() {
  console.log('[index.js] Iniciando importação de backup...');
  
  try {
    const dbConfig = readDbConfig();
    if (!dbConfig) {
      return { success: false, message: 'Configuração do banco não encontrada.' };
    }

    // Solicita ao usuário qual arquivo importar
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Selecionar arquivo de backup para importar',
      filters: [{ name: 'SQL', extensions: ['sql'] }],
      properties: ['openFile']
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: 'Importação cancelada pelo usuário.' };
    }

    const filePath = filePaths[0];
    
    // Verifica se o arquivo existe
    if (!fs.existsSync(filePath)) {
      return { success: false, message: 'Arquivo de backup não encontrado.' };
    }

    // Confirma a operação (pois é destrutiva)
    const confirmResult = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancelar', 'Continuar'],
      defaultId: 0,
      title: 'Confirmar Importação',
      message: 'ATENÇÃO: Esta operação irá SUBSTITUIR todos os dados atuais do banco!',
      detail: 'Todos os dados existentes (moradores, usuários, encomendas) serão perdidos e substituídos pelos dados do backup. Esta ação não pode ser desfeita.\n\nDeseja continuar?'
    });

    if (confirmResult.response === 0) { // Cancelar
      return { success: false, message: 'Importação cancelada pelo usuário.' };
    }

    // Lê o conteúdo do arquivo
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    // Verifica se é um backup válido
    if (!sqlContent.includes('-- Backup do banco de dados') && 
        
       
 
        
        !sqlContent.includes('-- Backup tabela moradores')) {
      return { success: false, message: 'Arquivo não parece ser um backup válido do sistema.' };
    }

    // Executa o SQL de restauração
    const client = await getPoolOrError().connect();
    
    try {
      console.log('[importar] Iniciando transação...');
      await client.query('BEGIN');
      
      // Desabilita verificações de chave estrangeira temporariamente
      await client.query('SET session_replication_role = replica');
      
      console.log('[importar] Executando SQL do backup...');
      await client.query(sqlContent);
      
      // Reabilita verificações de chave estrangeira
      await client.query('SET session_replication_role = DEFAULT');
      
      await client.query('COMMIT');
      console.log('[importar] Backup importado com sucesso!');
      
      return { 
        success: true, 
        message: 'Backup importado com sucesso! Todos os dados foram restaurados.' 
      };
      
    } catch (error) {
      console.error('[importar] Erro durante importação:', error);
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[importar] Erro geral:', error);
    
    // Mensagens de erro mais específicas
    let errorMessage = 'Erro ao importar backup: ';
    
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      errorMessage += 'Estrutura do banco não encontrada. Execute a criação das tabelas primeiro.';
    } else if (error.message.includes('syntax error')) {
      errorMessage += 'Arquivo de backup com formato inválido ou corrompido.';
    } else if (error.message.includes('permission')) {
      errorMessage += 'Permissão negada para executar a operação no banco.';
    } else {
      errorMessage += error.message;
    }
    
    return { success: false, message: errorMessage };
  }
}

// Função de backup alternativo usando consultas SQL diretas
async function criarBackupAlternativo(filePath, dbConfig) {
  console.log('[backup] Tentando backup alternativo...');
  
  try {
    const client = await getPoolOrError().connect();
    
    // Gera script SQL com os dados
    let sqlScript = `-- Backup do banco de dados - ${getCurrentDateTime()}\n\n`;
    
    // Backup da tabela moradores
    const moradores = await client.query('SELECT * FROM moradores ORDER BY id');
       sqlScript += `-- Backup tabela moradores\n`;
    sqlScript += `DELETE FROM moradores;\n`;
    for (const row of moradores.rows) {
      const values = [
        row.id,
        `'${(row.nome || '').replace(/'/g, "''")}'`,
        row.telefone ? `'${row.telefone.replace(/'/g, "''")}'` : 'NULL',
        `'${(row.rua || '').replace(/'/g, "''")}'`,
        `'${(row.numero || '').replace(/'/g, "''")}'`,
        row.bloco ? `'${row.bloco.replace(/'/g, "''")}'` : 'NULL',
        `'${(row.apartamento || '').replace(/'/g, "''")}'`,
        row.observacoes ? `'${row.observacoes.replace(/'/g, "''")}'` : 'NULL'
      ];
      sqlScript += `INSERT INTO moradores (id, nome, telefone, rua, numero, bloco, apartamento, observacoes) VALUES (${values.join(', ')});\n`;
    }
    
    // Backup da tabela usuarios
    const usuarios = await client.query('SELECT * FROM usuarios ORDER BY id');
    sqlScript += `\n-- Backup tabela usuarios\n`;
    sqlScript += `DELETE FROM usuarios;\n`;
    for (const row of usuarios.rows) {
      const values = [
        row.id,
        `'${(row.nome_usuario || '').replace(/'/g, "''")}'`,
        `'${(row.senha_hash || '').replace(/'/g, "''")}'`,
        row.nome_completo ? `'${row.nome_completo.replace(/'/g, "''")}'` : 'NULL',
        `'${row.nivel_acesso}'`,
        `'${row.data_criacao.toISOString()}'`,
        row.email ? `'${row.email.replace(/'/g, "''")}'` : 'NULL',
        `'${row.status || 'Ativo'}'`
      ];
      sqlScript += `INSERT INTO usuarios (id, nome_usuario, senha_hash, nome_completo, nivel_acesso, data_criacao, email, status) VALUES (${values.join(', ')});\n`;
    }
    
    // Backup da tabela encomendas
    const encomendas = await client.query('SELECT * FROM encomendas ORDER BY id');
    sqlScript += `\n-- Backup tabela encomendas\n`;
    sqlScript += `DELETE FROM encomendas;\n`;
    for (const row of encomendas.rows) {
      const values = [
        row.id,
        row.morador_id,
        row.porteiro_recebeu_id,
        `'${row.data_recebimento.toISOString()}'`,
        row.quantidade,
        row.observacoes ? `'${row.observacoes.replace(/'/g, "''")}'` : 'NULL',
        `'${row.status}'`,
        row.data_entrega ? `'${row.data_entrega.toISOString()}'` : 'NULL',
        row.porteiro_entregou_id || 'NULL',
        row.codigo_rastreio ? `'${row.codigo_rastreio.replace(/'/g, "''")}'` : 'NULL',
        row.retirado_por_nome ? `'${row.retirado_por_nome.replace(/'/g, "''")}'` : 'NULL'
      ];
      sqlScript += `INSERT INTO encomendas (id, morador_id, porteiro_recebeu_id, data_recebimento, quantidade, observacoes, status, data_entrega, porteiro_entregou_id, codigo_rastreio, retirado_por_nome) VALUES (${values.join(', ')});\n`;
    }
    
    // Atualiza sequences
    sqlScript += `\n-- Atualizar sequences\n`;
    sqlScript += `SELECT setval('moradores_id_seq', (SELECT MAX(id) FROM moradores));\n`;
    sqlScript += `SELECT setval('usuarios_id_seq', (SELECT MAX(id) FROM usuarios));\n`;
    sqlScript += `SELECT setval('encomendas_id_seq', (SELECT MAX(id) FROM encomendas));\n`;
    
    client.release();
    
    // Salva o arquivo
    fs.writeFileSync(filePath, sqlScript, 'utf8');
    
    return { 
      success: true, 
      message: 'Backup alternativo criado com sucesso!', 
      path: filePath 
    };
    
  } catch (error) {
    console.error('[backup alternativo] Erro:', error);
    return { 
      success: false, 
      message: `Erro no backup alternativo: ${error.message}` 
    };
  }
}

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') { 
    // Encerra API server antes de fechar o app
    if (apiServer) {
      apiServer.stop().then(() => {
        console.log('[index.js] App encerrado.'); 
        app.quit();
      });
    } else {
      console.log('[index.js] App encerrado.'); 
      app.quit();
    }
  } 
});

console.log('[index.js] Script principal carregado.');
