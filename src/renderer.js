// --- src/renderer.js ---

// Verificar se Chart.js foi carregado
window.addEventListener('load', function() {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js não foi carregado do CDN!');
        // Tentar carregar versão alternativa
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
        script.addEventListener('load', function() {
            console.log('Chart.js carregado da versão alternativa');
        });
        script.addEventListener('error', function() {
            console.error('Falha ao carregar Chart.js de ambas as fontes');
        });
        document.head.appendChild(script);
    }
    else {
        console.log('Chart.js carregado com sucesso, versão:', Chart.version || 'desconhecida');
    }
});

// --- Funções para Seleção Múltipla de Encomendas (Escopo Global) ---
let selectedPackages = [];
let currentSelectedResident = null;

function handlePackageSelection(event) {
    const checkbox = event.target;
    const packageId = checkbox.dataset.packageId;
    const residentId = checkbox.dataset.residentId;
    const residentName = checkbox.dataset.residentName;

    if (checkbox.checked) {
        // Verifica se é o primeiro item selecionado ou se é do mesmo morador
        if (selectedPackages.length === 0) {
            currentSelectedResident = { id: residentId, name: residentName };
            selectedPackages.push({ id: packageId, residentId, residentName });
            updateBatchDeliveryUI();
        } else if (currentSelectedResident.id === residentId) {
            // Mesmo morador, pode adicionar
            selectedPackages.push({ id: packageId, residentId, residentName });
            updateBatchDeliveryUI();
        } else {
            // Morador diferente, não permite seleção
            checkbox.checked = false;
            showStatusMessage(`Só é possível selecionar encomendas do mesmo morador (${currentSelectedResident.name}).`, 'error');
        }
    } else {
        // Remove da seleção
        selectedPackages = selectedPackages.filter(pkg => pkg.id !== packageId);
        if (selectedPackages.length === 0) {
            currentSelectedResident = null;
        }
        updateBatchDeliveryUI();
    }
}

function updateBatchDeliveryUI() {
    const batchContainer = document.getElementById('batch-delivery-container');
    const selectedCount = document.getElementById('selected-count');
    const selectedResidentName = document.getElementById('selected-resident-name');

    if (!batchContainer || !selectedCount || !selectedResidentName) return;

    if (selectedPackages.length > 0) {
        batchContainer.style.display = 'flex';
        selectedCount.textContent = selectedPackages.length;
        selectedResidentName.textContent = `Morador: ${currentSelectedResident.name}`;
    } else {
        batchContainer.style.display = 'none';
        selectedCount.textContent = '0';
        selectedResidentName.textContent = '';
    }
}

function abrirModalEntregaLote() {
    if (selectedPackages.length === 0) {
        showStatusMessage('Nenhuma encomenda selecionada.', 'error');
        return;
    }

    const packageIds = selectedPackages.map(pkg => pkg.id);
    abrirModalEntrega(packageIds, currentSelectedResident.name);
}

function clearPackageSelection() {
    selectedPackages = [];
    currentSelectedResident = null;
    
    // Desmarca todos os checkboxes
    const checkboxes = document.querySelectorAll('.package-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    updateBatchDeliveryUI();
}

// Função para iniciar edição de encomenda
async function iniciarEdicaoEncomenda(packageId) {
    console.log(`[Renderer] Iniciando edição para encomenda ID: ${packageId}`);
    console.log(`[Renderer] Tipo do packageId: ${typeof packageId}`);
    
    try {
        if (!window.electronAPI?.getPackageById) {
            console.error('[Renderer] window.electronAPI.getPackageById não disponível');
            showStatusMessage('Funcionalidade de edição indisponível.', 'error');
            return;
        }
        
        console.log('[Renderer] Chamando window.electronAPI.getPackageById...');
        const response = await window.electronAPI.getPackageById(packageId);
        console.log('[Renderer] Resposta recebida:', response);
        
        if (response.success && response.data) {
            console.log('[Renderer] Dados da encomenda recebidos, abrindo modal...');
            abrirModalEncomenda(packageId, response.data); // Passa ID e dados para popular
        } else {
            console.error('[Renderer] Erro na resposta:', response);
            showStatusMessage(response.message || 'Erro ao buscar dados da encomenda.', 'error');
        }
    } catch (error) {
        console.error('Erro ao chamar getPackageById:', error);
        showStatusMessage('Erro de comunicação ao buscar encomenda.', 'error');
    }
}

// Função para exibir mensagens de status
function showStatusMessage(message, type = 'info', stickyError = false) {
    const el = document.getElementById('status-message');
    if (el) {
        el.textContent = message;
        el.className = `status-message status-${type}`;
        el.style.display = 'block';
        if (type === 'success' || (type === 'error' && !stickyError)) { // Só some se for sucesso ou erro não-fixo
            const delay = type === 'success' ? 3500 : 6000;
            setTimeout(() => { if (el.textContent === message) { el.style.display = 'none'; } }, delay);
        }
    } else { /* ... */ }
}

// Variáveis globais dos modais - movidas para o escopo global
let modalCadastroEncomenda = null;
let modalCadastroMorador = null;
let modalCadastroUsuario = null;
let modalEntregaEncomenda = null;
let formCadastroEncomenda = null;
let formCadastroMorador = null;
let formCadastroUsuario = null;
let formEntregaEncomenda = null;
let inputMorador = null;
let inputPorteiro = null;
let suggestionsMoradorDiv = null;
let suggestionsPorteiroDiv = null;
let selectedPorteiroUserId = null;
let selectedMoradorId = null;
let entregaEncomendaIdInput = null;
let entregaMoradorInfoInput = null;
let entregaDataInput = null;
let entregaHoraInput = null;
let inputEntregaPorteiro = null;
let suggestionsEntregaPorteiroDiv = null;
let selectedEntregaPorteiroId = null;

// Função auxiliar para preencher data e hora atual
function preencherDataHoraAtual() {
    const currentDateTime = window.DateUtilsClient.getCurrentDateTime();
    const d = document.getElementById('data');
    const h = document.getElementById('hora');
    if (d) d.value = currentDateTime.date;
    if (h) h.value = currentDateTime.time;
}

// Função para abrir modal de encomenda
function abrirModalEncomenda(encomendaId = null, packageDataToEdit = null) { // Novo parâmetro
    console.log(`Abrindo Modal Encomenda. ID: ${encomendaId || 'N/A'}`);
    // ... (lógica para fechar outros modais - mantenha) ...
    if (modalCadastroMorador?.classList.contains('active')) fecharModalMorador();
    if (modalCadastroUsuario?.classList.contains('active')) fecharModalCadastroUsuario();
    if (modalCadastroMorador) { modalCadastroMorador.style.display = 'none'; /*...*/ }
    if (modalCadastroUsuario) { modalCadastroUsuario.style.display = 'none'; /*...*/ }

    if (modalCadastroEncomenda) {
        formCadastroEncomenda.reset(); // Limpa o formulário primeiro
        selectedMoradorId = null;
        selectedPorteiroUserId = null;
        if (inputMorador) inputMorador.value = '';
        if (inputPorteiro) inputPorteiro.value = '';
        if (suggestionsMoradorDiv) suggestionsMoradorDiv.classList.remove('visible');
        if (suggestionsPorteiroDiv) suggestionsPorteiroDiv.classList.remove('visible');
        
        // Remove ícones de validação
        const formGroups = modalCadastroEncomenda.querySelectorAll('.form-group.has-validation');
        formGroups.forEach(group => {
            group.classList.remove('has-validation');
            const validationIcon = group.querySelector('.validation-icon');
            if (validationIcon) {
                validationIcon.classList.remove('show');
            }
        });

        const hiddenEncomendaIdInput = document.getElementById('encomenda-id');
        const title = document.getElementById('modal-encomenda-title');
        const btn = document.getElementById('btn-salvar-encomenda');
        const qtdInput = document.getElementById('quantidade');
        const dataInput = document.getElementById('data');
        const horaInput = document.getElementById('hora');
        const obsInput = document.getElementById('observacoes');
        // const codigoRastreioInput = document.getElementById('codigo-rastreio'); // Se você tiver esse campo no modal

        if (packageDataToEdit && encomendaId) { // Se estamos editando
            console.log("Populando modal para edição:", packageDataToEdit);
            if (title) title.textContent = 'Editar Encomenda';
            if (btn) btn.textContent = 'Salvar Alterações';
            if (hiddenEncomendaIdInput) hiddenEncomendaIdInput.value = encomendaId;

            // Popular campos
            if (inputMorador && packageDataToEdit.morador_nome) inputMorador.value = packageDataToEdit.morador_nome;
            selectedMoradorId = packageDataToEdit.morador_id; // Importante setar o ID

            if (inputPorteiro && packageDataToEdit.porteiro_nome) inputPorteiro.value = packageDataToEdit.porteiro_nome;
            selectedPorteiroUserId = packageDataToEdit.porteiro_recebeu_id; // Importante setar o ID

            if (qtdInput) qtdInput.value = packageDataToEdit.quantidade || 1;
            if (obsInput) obsInput.value = packageDataToEdit.observacoes || '';
            // if (codigoRastreioInput) codigoRastreioInput.value = packageDataToEdit.codigo_rastreio || '';

            // Popular data e hora
            if (dataInput && horaInput) {
                if (packageDataToEdit.data_recebimento_date && packageDataToEdit.data_recebimento_time) {
                    // Usar campos formatados se disponíveis
                    dataInput.value = packageDataToEdit.data_recebimento_date;
                    horaInput.value = packageDataToEdit.data_recebimento_time;
                } else if (packageDataToEdit.data_recebimento) {
                    // Converter data ISO para formato local
                    try {
                        const date = new Date(packageDataToEdit.data_recebimento);
                        if (!isNaN(date.getTime())) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const hours = String(date.getHours()).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            
                            dataInput.value = `${year}-${month}-${day}`;
                            horaInput.value = `${hours}:${minutes}`;
                        }
                    } catch (error) {
                        console.error('Erro ao converter data:', error);
                        preencherDataHoraAtual();
                    }
                } else {
                    preencherDataHoraAtual();
                }
            }

        } else { // Se estamos cadastrando uma nova
            if (title) title.textContent = ' Encomenda';
            if (btn) btn.textContent = 'Salvar Encomenda';
            if (hiddenEncomendaIdInput) hiddenEncomendaIdInput.value = ''; // Limpa ID
            preencherDataHoraAtual(); // Preenche data/hora atuais
        }

        modalCadastroEncomenda.style.display = 'flex';
        modalCadastroEncomenda.classList.add('active');
        setTimeout(() => inputMorador?.focus(), 200);
    } else {
        console.error('Falha abrir Modal Encomenda!');
    }
}

// Função para abrir modal de entrega
function abrirModalEntrega(packageId, moradorNome) {
    // Verifica se é entrega em lote (packageId é array) ou individual
    const isMultiple = Array.isArray(packageId);
    const packageIds = isMultiple ? packageId : [packageId];
    
    console.log(`[Renderer] Abrindo modal de entrega para ${isMultiple ? 'múltiplas' : 'única'} encomenda(s):`, packageIds, `Morador: ${moradorNome}`);
    
    // As variáveis do modal de entrega agora são globais
    
    if (!modalEntregaEncomenda || !formEntregaEncomenda || !entregaEncomendaIdInput || !entregaMoradorInfoInput || !entregaDataInput || !entregaHoraInput || !inputEntregaPorteiro) {
        console.error("Elementos do modal de entrega não encontrados!");
        showStatusMessage("Erro ao abrir modal de entrega.", "error");
        return;
    }

    // Garante que outros modais estejam fechados
    
    if (modalCadastroEncomenda?.classList.contains('active')) fecharModalEncomenda();
    if (modalCadastroMorador?.classList.contains('active')) fecharModalMorador();
    if (modalCadastroUsuario?.classList.contains('active')) fecharModalCadastroUsuario();
    if (modalCadastroEncomenda) modalCadastroEncomenda.style.display = 'none';
    if (modalCadastroMorador) modalCadastroMorador.style.display = 'none';
    if (modalCadastroUsuario) modalCadastroUsuario.style.display = 'none';
    
    formEntregaEncomenda.reset();
    selectedEntregaPorteiroId = null;
    if (suggestionsEntregaPorteiroDiv) suggestionsEntregaPorteiroDiv.classList.remove('visible');
    
    // Remove ícones de validação
    const validationGroups = modalEntregaEncomenda.querySelectorAll('.form-group.has-validation');
    validationGroups.forEach(group => {
        group.classList.remove('has-validation');
        const validationIcon = group.querySelector('.validation-icon');
        if (validationIcon) {
            validationIcon.classList.remove('show');
        }
    });
    
    // Armazena os IDs das encomendas (array JSON ou ID único)
    if (isMultiple) {
        const numericIds = packageIds.map(id => parseInt(id, 10));
        entregaEncomendaIdInput.value = JSON.stringify(numericIds);
    } else {
        const numericId = parseInt(packageId, 10);
        entregaEncomendaIdInput.value = numericId.toString();
    }
    
    // Atualiza o título do modal
    const modalTitle = document.getElementById('modal-entrega-title');
    if (modalTitle) {
        modalTitle.textContent = isMultiple 
            ? `Registrar entrega em lote (${packageIds.length} encomendas)`
            : 'Registrar entrega de encomenda';
    }
    
    entregaMoradorInfoInput.value = isMultiple 
        ? `${moradorNome} (${packageIds.length} encomendas)`
        : moradorNome || 'N/A';

    // Usa utilitário padronizado para data/hora atual
    const currentDateTime = window.DateUtilsClient.getCurrentDateTime();
    entregaDataInput.value = currentDateTime.date;
    entregaHoraInput.value = currentDateTime.time;

    // Preenche o porteiro atual se disponível
    const currentUser = window.currentUser;
    if (currentUser && inputEntregaPorteiro) {
        inputEntregaPorteiro.value = currentUser.nome_completo || currentUser.name || '';
        selectedEntregaPorteiroId = currentUser.id;
    } else if (inputEntregaPorteiro) {
        inputEntregaPorteiro.value = '';
    }
    
    modalEntregaEncomenda.style.display = 'flex';
    modalEntregaEncomenda.classList.add('active');

    // Força o reflow do navegador
    void modalEntregaEncomenda.offsetWidth;
    
    // Foca no campo de input após um pequeno delay
    setTimeout(() => {
        if (window.electronAPI?.focusMainWindow) {
            window.electronAPI.focusMainWindow();
        }
        
        setTimeout(() => {
            if (inputEntregaPorteiro) {
                inputEntregaPorteiro.focus();
                inputEntregaPorteiro.click();
                console.log("[Renderer] Foco aplicado no inputEntregaPorteiro");
            }
        }, 100);
    }, 150);
}



document.addEventListener('DOMContentLoaded', async () => {
    console.log('Renderer: DOM Carregado.');

    // --- Seletores Globais ---
    const menuEncomendas = document.getElementById('menu-encomendas');
    const menuMoradores = document.getElementById('menu-moradores');
    const menuUsuarios = document.getElementById('menu-usuarios');
    const menuRelatorios = document.getElementById('menu-relatorios');
    const menuAjustes = document.getElementById('menu-ajustes');
    const mainContent = document.querySelector('.main-content');
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('toggle-password');

    // Inicializar variáveis globais dos modais
    modalCadastroEncomenda = document.getElementById('modal-cadastro-encomenda');
    modalCadastroMorador = document.getElementById('modal-cadastro-morador');
    modalCadastroUsuario = document.getElementById('modal-cadastro-usuario');
    modalEntregaEncomenda = document.getElementById('modal-entrega-encomenda');
    formCadastroEncomenda = document.getElementById('form-cadastro-encomenda');
    formCadastroMorador = document.getElementById('form-cadastro-morador');
    formCadastroUsuario = document.getElementById('form-cadastro-usuario');
    formEntregaEncomenda = document.getElementById('form-entrega-encomenda');
    inputMorador = document.getElementById('morador');
    inputPorteiro = document.getElementById('porteiro');
    suggestionsMoradorDiv = document.getElementById('morador-suggestions');
    suggestionsPorteiroDiv = document.getElementById('porteiro-suggestions');
    entregaEncomendaIdInput = document.getElementById('entrega-encomenda-id');
    entregaMoradorInfoInput = document.getElementById('entrega-morador-info');
    entregaDataInput = document.getElementById('entrega-data');
    entregaHoraInput = document.getElementById('entrega-hora');
    inputEntregaPorteiro = document.getElementById('entrega-porteiro');
    suggestionsEntregaPorteiroDiv = document.getElementById('entrega-porteiro-suggestions');
const passwordToggleIcon = document.getElementById('password-toggle-icon');

// Funcionalidade de mostrar/ocultar senha
if (togglePasswordBtn && passwordInput && passwordToggleIcon) {
    togglePasswordBtn.addEventListener('click', () => {
        const isPasswordVisible = passwordInput.type === 'text';
        
        if (isPasswordVisible) {
            // Ocultar senha
            passwordInput.type = 'password';
            passwordToggleIcon.src = './assets/versenha.svg';
            passwordToggleIcon.alt = 'Mostrar senha';
            togglePasswordBtn.title = 'Mostrar senha';
        } else {
            // Mostrar senha
            passwordInput.type = 'text';
            passwordToggleIcon.src = './assets/ocultarsenha.svg';
            passwordToggleIcon.alt = 'Ocultar senha';
            togglePasswordBtn.title = 'Ocultar senha';
        }
    });
}

// Funcionalidade de encolhimento da sidebar
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const sidebar = document.querySelector('.sidebar');

if (sidebarToggleBtn && sidebar) {
    sidebarToggleBtn.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
    });
}

// Funcionalidade do toggle do modo escuro
const themeToggle = document.getElementById('theme-toggle');
const sunIcons = document.querySelectorAll('.sun-icon');
const moonIcon = document.querySelector('.moon-icon');

// Inicializar tema (sempre modo claro por padrão)
let isDarkMode = false;
document.documentElement.removeAttribute('data-theme');

if (themeToggle) {
    themeToggle.addEventListener('click', function() {
        isDarkMode = !isDarkMode;
        
        if (isDarkMode) {
            // Ativar modo escuro
            document.documentElement.setAttribute('data-theme', 'dark');
            console.log('Modo escuro ativado');
        } else {
            // Ativar modo claro
            document.documentElement.removeAttribute('data-theme');
            console.log('Modo claro ativado');
        }
    });
}
    const loginErrorMessage = document.getElementById('login-error-message');
    const loggedUserInfo = document.getElementById('logged-user-info');
    const logoutButton = document.getElementById('logout-button');
    // Modais - elementos locais
    const btnCancelarEncomendaModal = document.getElementById('btn-cancelar-encomenda-modal');
    const modalMoradorTitle = document.getElementById('modal-morador-title');
    const btnSalvarMorador = document.getElementById('btn-salvar-morador');
    const btnCancelarMoradorModal = document.getElementById('btn-cancelar-morador-modal');
    const modalUsuarioTitle = document.getElementById('modal-usuario-title');
    const btnSalvarUsuario = document.getElementById('btn-salvar-usuario');
    const btnCancelarUsuarioModal = document.getElementById('btn-cancelar-usuario-modal');
    const usuarioStatusSelect = document.getElementById('usuario-status');
    const grupoStatusUsuario = document.getElementById('grupo-status');
    const entregaRetiradoPorInput = document.getElementById('entrega-retirado-por');
    const entregaObservacoesTextarea = document.getElementById('entrega-observacoes');
    const btnCancelarEntregaModal = document.getElementById('btn-cancelar-entrega-modal');
    //const btnConfirmarEntrega = document.getElementById('btn-confirmar-entrega');

    console.log('DEBUG Autocomplete: inputMorador element:', inputMorador);
    console.log('DEBUG Autocomplete: suggestionsMoradorDiv element:', suggestionsMoradorDiv);
    console.log('DEBUG Autocomplete: inputPorteiro element:', inputPorteiro);
    console.log('DEBUG Autocomplete: suggestionsPorteiroDiv element:', suggestionsPorteiroDiv);

    // Estado
    let currentUser = null;

    // Variáveis globais para armazenar instâncias dos gráficos
    let chartEncomendasPorDiaInstance = null;
    let chartEncomendasPorMesInstance = null;

    // Função para atualizar automaticamente a lista de encomendas
    function atualizarListaEncomendas() {
        console.log('[Renderer] atualizarListaEncomendas() chamada');
        
        // Verifica se estamos na tela de encomendas
        const encomendasContent = document.getElementById('encomendas-content');
        
        // Verifica se a aba de encomendas está ativa de múltiplas formas
        const isEncomendasTabActive = encomendasContent && (
            encomendasContent.style.display === 'block' || 
            encomendasContent.style.display === '' || 
            !encomendasContent.style.display ||
            !encomendasContent.hasAttribute('style') ||
            encomendasContent.offsetParent !== null
        );
        
        console.log('[Renderer] Debug - isEncomendasTabActive:', isEncomendasTabActive);
        
        if (isEncomendasTabActive) {
            const sectionContent = encomendasContent.querySelector('.section-content');
            
            if (sectionContent) {
                console.log('[Renderer] Atualizando lista de encomendas automaticamente...');
                buscarEExibirEncomendas(sectionContent);
            } else {
                console.log('[Renderer] sectionContent não encontrado');
            }
        } else {
            console.log('[Renderer] Aba de encomendas não está ativa, não atualizando lista');
        }
        
        // Como fallback, sempre marca que a lista precisa ser atualizada
        // quando a aba de encomendas for aberta novamente
        window.needsEncomendaListUpdate = true;
        console.log('[Renderer] Marcado para atualização quando aba de encomendas for aberta');
    }

    // --- Implementação da Barra de Busca ---
    const topbarSearchInput = document.getElementById('topbar-search-input');
    let searchTimeout = null;
    
    if (topbarSearchInput) {
        console.log('[Renderer] Campo de pesquisa encontrado, configurando eventos...');
        
        // Event listener para input na barra de busca
        topbarSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            console.log(`[Renderer] Termo de busca digitado: "${searchTerm}"`);
            
            // Remove popup existente
            document.getElementById('popup-encomendas')?.remove();
            
            // Cancela busca anterior se ainda pendente
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // Se termo muito curto, não busca
            if (searchTerm.length < 2) {
                return;
            }
            
            // Debounce da busca (aguarda 300ms após parar de digitar)
            searchTimeout = setTimeout(async () => {
                await realizarBuscaEncomendas(searchTerm);
            }, 300);
        });
        
        // Event listener para tecla Enter
        topbarSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const searchTerm = e.target.value.trim();
                if (searchTerm.length >= 2) {
                    realizarBuscaEncomendas(searchTerm);
                }
            }
        });
        
        // Event listener para limpar busca quando campo perde foco
        topbarSearchInput.addEventListener('blur', () => {
            // Aguarda um pouco antes de fechar para permitir cliques nos resultados
            setTimeout(() => {
                const popup = document.getElementById('popup-encomendas');
                if (popup && !popup.matches(':hover')) {
                    popup.remove();
                }
            }, 200);
        });
        
        console.log('[Renderer] Event listeners da pesquisa configurados');
    } else {
        console.warn('[Renderer] Campo de pesquisa não encontrado');
    }
    
    // Função para realizar a busca de encomendas
    async function realizarBuscaEncomendas(searchTerm) {
        console.log(`[Renderer] Realizando busca para: "${searchTerm}"`);
        
        try {
            // Remove popup anterior
            document.getElementById('popup-encomendas')?.remove();
            
            // Usa a nova API otimizada de busca
            const resultado = await window.electronAPI.searchPendingPackages(searchTerm);
            
            if (!resultado || !resultado.success) {
                console.error('[Renderer] Erro na busca:', resultado?.message || 'Resposta inválida');
                exibirErroPopup(resultado?.message || 'Erro ao buscar encomendas');
                return;
            }
            
            const encomendas = resultado.data || [];
            console.log(`[Renderer] Encomendas encontradas: ${encomendas.length}`);
            
            if (encomendas.length > 0) {
                exibirPopupEncomendas(encomendas);
            } else {
                exibirMensagemNenhumResultado(searchTerm);
            }
            
        } catch (error) {
            console.error('[Renderer] Erro ao buscar encomendas:', error);
            exibirErroPopup('Erro ao buscar encomendas: ' + error.message);
        }
    }
    
    // Função para exibir popup com resultados
    function exibirPopupEncomendas(encomendas) {
        console.log(`[Renderer] Exibindo popup com ${encomendas.length} encomendas`);
        
        // Remove popup anterior
        document.getElementById('popup-encomendas')?.remove();
        
        // Cria popup
        const popup = document.createElement('div');
        popup.id = 'popup-encomendas';
        popup.className = 'search-popup';
        
        // Header do popup
        const header = document.createElement('div');
        header.className = 'popup-header';
        header.innerHTML = `
            <h3>Encomendas Encontradas (${encomendas.length})</h3>
            <button class="popup-close">×</button>
        `;
        
        // Adicionar event listener para o botão de fechar
        const closeButton = header.querySelector('.popup-close');
        closeButton.addEventListener('click', () => {
            document.getElementById('popup-encomendas')?.remove();
        });
        popup.appendChild(header);
        
        // Lista de encomendas
        const lista = document.createElement('div');
        lista.className = 'popup-encomendas-lista';
        
        encomendas.forEach(encomenda => {
            const item = document.createElement('div');
            item.className = 'popup-encomenda-item';
            
            // Formatar data usando utilitário padronizado
            let dataFormatada = 'Data inválida';
            try {
                if (encomenda.data_recebimento) {
                    const dateFormatted = window.DateUtilsClient.fromSupabaseFormat(encomenda.data_recebimento);
                    dataFormatada = dateFormatted.display || 'Data inválida';
                }
            } catch (e) {
                console.error('[Renderer] Erro ao formatar data:', e);
            }
            
            item.innerHTML = `
                <div class="encomenda-info">
                    <div class="encomenda-morador">${encomenda.moradores?.nome || encomenda.morador_nome || 'N/A'}</div>
                    <div class="encomenda-detalhes">
                        <span class="data-recebimento">Recebida: ${dataFormatada}</span>
                        <span class="quantidade">Qtd: ${encomenda.quantidade || 1}</span>
                        <span class="porteiro">Por: ${encomenda.porteiro_recebeu?.nome_completo || encomenda.porteiro_nome || 'N/A'}</span>
                    </div>
                    ${encomenda.observacoes ? `<div class="encomenda-obs">${encomenda.observacoes}</div>` : ''}
                </div>
                <div class="encomenda-acoes">
                    <button class="btn-entregar-popup" data-id="${encomenda.id}" data-morador="${encomenda.moradores?.nome || encomenda.morador_nome || 'N/A'}">
                        Entregar
                    </button>
                </div>
            `;
            
            lista.appendChild(item);
        });
        
        popup.appendChild(lista);
        
        // Adiciona popup ao DOM
        document.body.appendChild(popup);
        
        // Event listeners para botões de entrega
        const botoesEntregar = popup.querySelectorAll('.btn-entregar-popup');
        botoesEntregar.forEach(botao => {
            botao.addEventListener('click', (e) => {
                const encomendaId = e.target.dataset.id;
                const moradorNome = e.target.dataset.morador;
                
                console.log(`[Renderer] Clicado entregar para encomenda ID: ${encomendaId}, morador: ${moradorNome}`);
                
                // Remove popup
                document.getElementById('popup-encomendas')?.remove();
                
                // Limpa campo de busca
                if (topbarSearchInput) {
                    topbarSearchInput.value = '';
                }
                
                // Abre modal de entrega
                abrirModalEntrega(encomendaId, moradorNome);
            });
        });
    }
    
    // Função para exibir mensagem quando não há resultados
    function exibirMensagemNenhumResultado(searchTerm) {
        console.log(`[Renderer] Nenhum resultado encontrado para: "${searchTerm}"`);
        
        const popup = document.createElement('div');
        popup.id = 'popup-encomendas';
        popup.className = 'search-popup';
        
        popup.innerHTML = `
            <div class="popup-no-results">
                <p>Nenhuma encomenda pendente encontrada para "${searchTerm}"</p>
                <p>Verifique se:</p>
                <ul>
                    <li>O nome está correto</li>
                    <li>A encomenda ainda está pendente</li>
                    <li>A encomenda foi cadastrada no sistema</li>
                </ul>
            </div>
        `;
        
        // Adicionar event listener para o botão de fechar
        const closeButton = popup.querySelector('.popup-close');
        closeButton.addEventListener('click', () => {
            document.getElementById('popup-encomendas')?.remove();
        });
        
        document.body.appendChild(popup);
    }
    
    // Função para exibir erro no popup
    function exibirErroPopup(mensagem) {
        console.error(`[Renderer] Exibindo erro no popup: ${mensagem}`);
        
        const popup = document.createElement('div');
        popup.id = 'popup-encomendas';
        popup.className = 'search-popup error';
        
        popup.innerHTML = `
            <div class="popup-header">
                <h3>Erro na Busca</h3>
                <button class="popup-close">×</button>
            </div>
            <div class="popup-error">
                <p>${mensagem}</p>
                <p>Tente novamente ou verifique a conexão com o banco de dados.</p>
            </div>
        `;
        
        // Adicionar event listener para o botão de fechar
        const closeButton = popup.querySelector('.popup-close');
        closeButton.addEventListener('click', () => {
            document.getElementById('popup-encomendas')?.remove();
        });
        
        document.body.appendChild(popup);
    }

    // --- Event Listeners para Navegação do Menu ---
    if (menuEncomendas) menuEncomendas.addEventListener('click', () => carregarConteudo('Dashboard Encomendas', true));
    if (menuMoradores) menuMoradores.addEventListener('click', () => carregarConteudo('Moradores', true));
    if (menuUsuarios) menuUsuarios.addEventListener('click', () => carregarConteudo('Usuários', true));
    if (menuRelatorios) menuRelatorios.addEventListener('click', () => carregarConteudo('Relatórios', true));
    if (menuAjustes) menuAjustes.addEventListener('click', () => carregarConteudo('Ajustes', true));

    // Event listener para o botão de logout
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            console.log('Logout button clicked - returning to login screen');
            showLoginScreen();
        });
    }

    // Event listener para o menu Dashboard
    const menuDashboard = document.getElementById('menu-dashboard');
    if (menuDashboard) menuDashboard.addEventListener('click', () => carregarConteudo('Dashboard', true));

    // Event listener para o menu Modo Lote
    const menuModoLote = document.getElementById('menu-modo-lote');
    if (menuModoLote) menuModoLote.addEventListener('click', () => carregarConteudo('Modo Lote', true));

    // --- Funções de UI (Login/Logout) ---
    function showLoginScreen() {
        console.log("Mostrando login.");
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (appContainer) appContainer.classList.add('hidden');
        currentUser = null;
        if (loggedUserInfo) loggedUserInfo.textContent = 'Usuário: -';
        if (menuUsuarios) menuUsuarios.style.display = 'none';
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (loginErrorMessage) loginErrorMessage.style.display = 'none';
        
        // Limpar dados do modo lote ao fazer logout
        limparDadosModoLote();
    }

    function showAppScreen() {
        console.log("Mostrando app.");
        if (!currentUser) {
            showLoginScreen();
            return;
        }
        console.log('DEBUG: Usuario logado:', currentUser);

        if (loginScreen) loginScreen.classList.add('hidden');
        if (appContainer) appContainer.classList.remove('hidden');
        
        const userDisplayInfo = `${currentUser.name} (${currentUser.status || 'Status Desconhecido'})`;
        
        if (loggedUserInfo) loggedUserInfo.textContent = `Usuário: ${userDisplayInfo}`;
        if (menuUsuarios) menuUsuarios.style.display = (currentUser.role === 'admin' || currentUser.role === 'supervisor') ? 'flex' : 'none';
        carregarConteudo('Dashboard', true);
    }

    // --- Funções de Controle dos Modais ---
    function requestMainWindowFocus() { setTimeout(() => { try { if (window.electronAPI?.focusMainWindow) window.electronAPI.focusMainWindow(); } catch (error) { console.error('Erro focar janela:', error); } }, 50); }

    function fecharModalEncomenda() { console.log('Fechando Modal Encomenda.'); if (modalCadastroEncomenda) { modalCadastroEncomenda.classList.remove('active'); modalCadastroEncomenda.style.display = 'none'; modalCadastroEncomenda.style.zIndex = ''; if (suggestionsMoradorDiv) suggestionsMoradorDiv.classList.remove('visible'); if (suggestionsPorteiroDiv) suggestionsPorteiroDiv.classList.remove('visible'); } }
    async function abrirModalMorador(residentId = null) { console.log(`Abrindo Modal Morador. ID: ${residentId}`); if (modalCadastroEncomenda?.classList.contains('active')) fecharModalEncomenda(); if (modalCadastroUsuario?.classList.contains('active')) fecharModalCadastroUsuario(); if (modalCadastroEncomenda) { modalCadastroEncomenda.style.display = 'none'; modalCadastroEncomenda.style.zIndex = ''; } if (modalCadastroUsuario) { modalCadastroUsuario.style.display = 'none'; modalCadastroUsuario.style.zIndex = ''; } if (modalCadastroMorador) { if (formCadastroMorador) formCadastroMorador.reset(); const mid = document.getElementById('morador-id'); if (mid) mid.value = ''; const statusMsg = document.getElementById('status-message'); if (statusMsg) { statusMsg.style.display = 'none'; } modalCadastroMorador.style.display = 'flex'; modalCadastroMorador.style.zIndex = '1001'; modalCadastroMorador.classList.add('active'); const nomeInput = document.getElementById('morador-nome'); if (residentId) { console.log("Modo Edição Morador"); if (modalMoradorTitle) modalMoradorTitle.textContent = 'Editar Morador'; if (btnSalvarMorador) btnSalvarMorador.textContent = 'Salvar Alterações'; try { if (!window.electronAPI?.getResidentById) throw new Error('API getResidentById indisponível'); const m = await window.electronAPI.getResidentById(residentId); if (m) { if (mid) mid.value = m.id; if (nomeInput) nomeInput.value = m.nome || ''; document.getElementById('morador-telefone').value = m.telefone || ''; document.getElementById('morador-rua').value = m.rua || ''; document.getElementById('morador-numero').value = m.numero || ''; document.getElementById('morador-bloco').value = m.bloco || ''; document.getElementById('morador-apartamento').value = m.apartamento || ''; document.getElementById('morador-observacoes').value = m.observacoes || ''; setTimeout(() => nomeInput?.focus(), 50); } else { showStatusMessage(`Erro: Morador ID ${residentId} não encontrado.`, 'error'); fecharModalMorador(); } } catch (error) { showStatusMessage(`Erro: ${error.message}`, 'error'); fecharModalMorador(); } } else { console.log("Modo Cadastro Morador."); if (modalMoradorTitle) modalMoradorTitle.textContent = 'Cadastrar Morador'; if (btnSalvarMorador) btnSalvarMorador.textContent = 'Salvar Morador'; setTimeout(() => nomeInput?.focus(), 50); } } else { console.error('Falha abrir Modal Morador!'); } }
    function fecharModalMorador() { console.log('Fechando Modal Morador.'); if (modalCadastroMorador) { modalCadastroMorador.classList.remove('active'); modalCadastroMorador.style.display = 'none'; modalCadastroMorador.style.zIndex = ''; const mid = document.getElementById('morador-id'); if (mid) mid.value = ''; } }

    async function abrirModalCadastroUsuario(userId = null) {
        console.log(`DEBUG: Abrindo Modal Usuário. ID: ${userId || 'N/A'}`);
        if (modalCadastroEncomenda?.classList.contains('active')) fecharModalEncomenda();
        if (modalCadastroMorador?.classList.contains('active')) fecharModalMorador();
        if (modalCadastroEncomenda) { modalCadastroEncomenda.style.display = 'none'; modalCadastroEncomenda.style.zIndex = ''; }
        if (modalCadastroMorador) { modalCadastroMorador.style.display = 'none'; modalCadastroMorador.style.zIndex = ''; }

        if (modalCadastroUsuario) {
            if (formCadastroUsuario) formCadastroUsuario.reset();
            const usuarioIdInput = document.getElementById('usuario-id'); if (usuarioIdInput) usuarioIdInput.value = '';
            const statusMsgElement = document.getElementById('status-message'); if (statusMsgElement) statusMsgElement.style.display = 'none';

            modalCadastroUsuario.style.display = 'flex'; modalCadastroUsuario.style.zIndex = '1001'; modalCadastroUsuario.classList.add('active');

            const nomeUsuarioInput = document.getElementById('usuario-nome'); // Corrigido: este campo existe
            const emailInput = document.getElementById('usuario-email');
            const senhaInput = document.getElementById('usuario-senha');
            const senhaConfirmInput = document.getElementById('usuario-senha-confirm');
            const nivelAcessoSelect = document.getElementById('usuario-nivel-acesso');
            const statusSelect = usuarioStatusSelect;
            const nivelAcessoGroup = document.getElementById('grupo-nivel-acesso');
            const statusGroup = grupoStatusUsuario;

            if (senhaInput) senhaInput.placeholder = '';
            if (senhaConfirmInput) senhaConfirmInput.placeholder = '';

            if (userId) {
                console.log("Modo Edição Usuário - Buscando dados...");
                if (modalUsuarioTitle) modalUsuarioTitle.textContent = 'Editar Usuário';
                if (btnSalvarUsuario) btnSalvarUsuario.textContent = 'Salvar Alterações';
                if (usuarioIdInput) usuarioIdInput.value = userId;
                if (senhaInput) { senhaInput.required = false; senhaInput.placeholder = 'Deixe em branco para não alterar'; }
                if (senhaConfirmInput) { senhaConfirmInput.required = false; senhaConfirmInput.placeholder = 'Deixe em branco para não alterar'; }

                const isAdminEditing = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
                if (nivelAcessoGroup) nivelAcessoGroup.style.display = isAdminEditing ? 'block' : 'none';
                if (statusGroup) statusGroup.style.display = isAdminEditing ? 'block' : 'none';

                setTimeout(async () => {
                    try {
                        if (!window.electronAPI?.getUserById) throw new Error('API getUserById indisponível');
                        const userData = await window.electronAPI.getUserById(userId);
                        if (userData) {
                            if (nomeUsuarioInput) nomeUsuarioInput.value = userData.nome_usuario || '';
                            if (emailInput) emailInput.value = userData.email || '';
                            if (nivelAcessoSelect) nivelAcessoSelect.value = userData.nivel_acesso || 'porteiro';
                            if (statusSelect) statusSelect.value = userData.status || 'Ativo';
                            nomeUsuarioInput?.focus();
                        } else {
                            showStatusMessage(`Erro: Usuário ID ${userId} não encontrado.`, 'error');
                            fecharModalCadastroUsuario();
                        }
                    } catch (error) {
                        showStatusMessage(`Erro ao buscar dados: ${error.message}`, 'error');
                        fecharModalCadastroUsuario();
                    }
                }, 50);

            } else {
                console.log("Modo Cadastro Usuário.");
                if (modalUsuarioTitle) modalUsuarioTitle.textContent = 'Cadastrar usuário';
                if (btnSalvarUsuario) btnSalvarUsuario.textContent = 'Salvar usuário';
                if (senhaInput) senhaInput.required = true;
                if (senhaConfirmInput) senhaConfirmInput.required = true;
                if (nivelAcessoGroup) nivelAcessoGroup.style.display = 'none';
                if (statusGroup) statusGroup.style.display = 'none';
                setTimeout(() => nomeUsuarioInput?.focus(), 50);
            }
        } else { console.error('Falha ao abrir Modal Usuário!'); }
    }
    function fecharModalCadastroUsuario() { console.log('DEBUG: Fechando Modal Usuário.'); if (modalCadastroUsuario) { modalCadastroUsuario.classList.remove('active'); modalCadastroUsuario.style.display = 'none'; modalCadastroUsuario.style.zIndex = ''; const uid = document.getElementById('usuario-id'); if (uid) uid.value = ''; } }


    // --- Funções Auxiliares e Autocomplete ---


    // Event listeners para autocomplete do morador no modal de encomenda
    if (inputMorador) {
        console.log('DEBUG Autocomplete: Configurando event listeners para inputMorador');
        
        inputMorador.addEventListener('input', handleMoradorInput);
        inputMorador.addEventListener('blur', () => {
            setTimeout(() => {
                const focusedElement = document.activeElement;
                if (!focusedElement || !focusedElement.closest('#morador-suggestions')) {
                    if (suggestionsMoradorDiv) suggestionsMoradorDiv.classList.remove('visible');
                }
            }, 200);
        });
        
        // Navegação por teclado para sugestões de morador
        inputMorador.addEventListener('keydown', (e) => {
            const suggestions = suggestionsMoradorDiv?.querySelectorAll('.suggestion-item');
            if (!suggestions || suggestions.length === 0) return;
            
            let selectedIndex = -1;
            suggestions.forEach((item, index) => {
                if (item.classList.contains('selected')) {
                    selectedIndex = index;
                }
            });
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                updateMoradorSuggestionSelection(suggestions, selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
                updateMoradorSuggestionSelection(suggestions, selectedIndex);
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                suggestions[selectedIndex].click();
            } else if (e.key === 'Escape') {
                suggestionsMoradorDiv.classList.remove('visible');
            }
        });
    }

    // Event listeners para autocomplete do porteiro no modal de encomenda
    if (inputPorteiro) {
        console.log('DEBUG Autocomplete: Configurando event listeners para inputPorteiro');
        
        inputPorteiro.addEventListener('input', handlePorterInput);
        inputPorteiro.addEventListener('blur', () => {
            setTimeout(() => {
                const focusedElement = document.activeElement;
                if (!focusedElement || !focusedElement.closest('#porteiro-suggestions')) {
                    if (suggestionsPorteiroDiv) suggestionsPorteiroDiv.classList.remove('visible');
                }
            }, 200);
        });
        
        // Navegação por teclado para sugestões de porteiro
        inputPorteiro.addEventListener('keydown', (e) => {
            const suggestions = suggestionsPorteiroDiv?.querySelectorAll('.suggestion-item');
            if (!suggestions || suggestions.length === 0) return;
            
            let selectedIndex = -1;
            suggestions.forEach((item, index) => {
                if (item.classList.contains('selected')) {
                    selectedIndex = index;
                }
            });
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                updatePorteiroSuggestionSelection(suggestions, selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
                updatePorteiroSuggestionSelection(suggestions, selectedIndex);
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                suggestions[selectedIndex].click();
            } else if (e.key === 'Escape') {
                suggestionsPorteiroDiv.classList.remove('visible');
            }
        });
    }

    function displayMoradorSuggestions(suggestions) {
        if (!suggestionsMoradorDiv) {
            console.error("[DEBUG Autocomplete] Elemento suggestionsMoradorDiv não encontrado!");
            return;
        }
        console.log('[DEBUG Autocomplete] displayMoradorSuggestions received:', suggestions);
        suggestionsMoradorDiv.innerHTML = '';

        if (suggestions?.length > 0) {
            suggestions.forEach((r, index) => {
                try {
                    if (!r || typeof r.id === 'undefined' || typeof r.nome === 'undefined') {
                        console.warn("[DEBUG Autocomplete] Item de sugestão inválido recebido (Morador):", r);
                        return;
                    }
                    const div = document.createElement('div');
                    div.textContent = r.nome;
div.className = 'suggestion-item';
div.dataset.id = r.id;
div.dataset.name = r.nome;
                    
                    // Event listeners para mouse
                    div.addEventListener('mouseenter', () => {
                        updateMoradorSuggestionSelection(suggestionsMoradorDiv.querySelectorAll('.suggestion-item'), index);
                    });
                    
                    // Melhorar responsividade do clique
                    div.addEventListener('mousedown', (e) => {
                        e.preventDefault(); // Previne o blur do input
                    });
                    
                    div.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const target = document.getElementById('morador');
                        if (target) target.value = r.nome;
                        selectedMoradorId = r.id;
                        console.log(`Morador selecionado: ${r.nome} (ID: ${r.id})`);
                        suggestionsMoradorDiv.classList.remove('visible');
                        suggestionsMoradorDiv.innerHTML = '';
                        
                        // Mostrar ícone de validação
                        const formGroup = target.closest('.form-group');
                        if (formGroup) {
                            formGroup.classList.add('has-validation');
                            const validationIcon = formGroup.querySelector('.validation-icon');
                            if (validationIcon) {
                                validationIcon.classList.add('show');
                            }
                        }
                        
                        // Move foco para próximo campo
                        setTimeout(() => {
                            const nextField = document.getElementById('quantidade');
                            if (nextField) nextField.focus();
                        }, 50);
                    });
                    suggestionsMoradorDiv.appendChild(div);
                } catch (loopError) {
                    console.error("[DEBUG Autocomplete] Erro dentro do loop displayMoradorSuggestions:", loopError, "Item problemático:", r);
                }
            });

            if (suggestionsMoradorDiv.children.length > 0) {
                suggestionsMoradorDiv.classList.add('visible');
                console.log('[DEBUG Autocomplete] Morador suggestions displayed (com itens no DOM).');
            } else {
                suggestionsMoradorDiv.classList.remove('visible');
                console.log('[DEBUG Autocomplete] Nenhum item de sugestão de morador foi adicionado ao DOM, apesar de receber sugestões.');
            }
        } else {
            suggestionsMoradorDiv.classList.remove('visible');
            console.log('[DEBUG Autocomplete] No morador suggestions to display (array de sugestões vazio).');
        }
    }

    function displayPorterSuggestions(suggestions) {
        if (!suggestionsPorteiroDiv) {
            console.error("[DEBUG Autocomplete] Elemento suggestionsPorteiroDiv não encontrado!");
            return;
        }
        console.log('[DEBUG Autocomplete] displayPorterSuggestions received:', suggestions);
        suggestionsPorteiroDiv.innerHTML = '';

        if (suggestions?.length > 0) {
            suggestions.forEach((p, index) => {
                try {
                    if (!p || typeof p.id === 'undefined' || typeof p.nome === 'undefined') {
                        console.warn("[DEBUG Autocomplete] Item de sugestão inválido recebido (Porteiro):", p);
                        return;
                    }
                    const div = document.createElement('div');
                    div.textContent = p.nome;
                    div.className = 'suggestion-item';
                    div.dataset.id = p.id;
                    div.dataset.name = p.nome;
                    
                    // Event listeners para mouse
                    div.addEventListener('mouseenter', () => {
                        updatePorteiroSuggestionSelection(suggestionsPorteiroDiv.querySelectorAll('.suggestion-item'), index);
                    });
                    
                    // Melhorar responsividade do clique
                    div.addEventListener('mousedown', (e) => {
                        e.preventDefault(); // Previne o blur do input
                    });
                    
                    div.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const target = document.getElementById('porteiro');
                        if (target) target.value = p.nome;
                        selectedPorteiroUserId = p.id;
                        console.log(`Porteiro (Usuário) selecionado: ${p.nome} (User ID: ${p.id})`);
                        suggestionsPorteiroDiv.classList.remove('visible');
                        suggestionsPorteiroDiv.innerHTML = '';
                        
                        // Mostrar ícone de validação
                        const formGroup = target.closest('.form-group');
                        if (formGroup) {
                            formGroup.classList.add('has-validation');
                            const validationIcon = formGroup.querySelector('.validation-icon');
                            if (validationIcon) {
                                validationIcon.classList.add('show');
                            }
                        }
                        
                        // Move foco para próximo campo
                        setTimeout(() => {
                            const nextField = document.getElementById('observacoes');
                            if (nextField) nextField.focus();
                        }, 50);
                    });
                    suggestionsPorteiroDiv.appendChild(div);
                } catch (loopError) {
                    console.error("[DEBUG Autocomplete] Erro dentro do loop displayPorterSuggestions:", loopError, "Item problemático:", p);
                }
            });

            if (suggestionsPorteiroDiv.children.length > 0) {
                suggestionsPorteiroDiv.classList.add('visible');
                console.log('[DEBUG Autocomplete] Porter suggestions displayed (com itens no DOM).');
            } else {
                suggestionsPorteiroDiv.classList.remove('visible');
                console.log('[DEBUG Autocomplete] Nenhum item de sugestão de porteiro foi adicionado ao DOM, apesar de receber sugestões.');
            }
        } else {
            suggestionsPorteiroDiv.classList.remove('visible');
            console.log('[DEBUG Autocomplete] No porter suggestions to display (array de sugestões vazio).');
        }
    }

    // Funções para atualizar seleção com teclado
    function updateMoradorSuggestionSelection(suggestions, selectedIndex) {
        suggestions.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function updatePorteiroSuggestionSelection(suggestions, selectedIndex) {
        suggestions.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    // Mantém apenas esta função para busca padrão de moradores
    async function handleMoradorInput() {
        const input = document.getElementById('morador');
        if (!input || !window.electronAPI?.searchResidents) return;
        const term = input.value;
        selectedMoradorId = null;
        const formGroup = input.closest('.form-group');
        if (formGroup) {
            formGroup.classList.remove('has-validation');
            const validationIcon = formGroup.querySelector('.validation-icon');
            if (validationIcon) {
                validationIcon.classList.remove('show');
            }
        }
        if (term?.length >= 1) {
            try {
                const res = await window.electronAPI.searchResidents(term);
                displayMoradorSuggestions(res);
            } catch (err) {
                suggestionsMoradorDiv?.classList.remove('visible');
            }
        } else {
            suggestionsMoradorDiv?.classList.remove('visible');
            selectedMoradorId = null;
        }
    }

    async function handlePorterInput() {
        const input = document.getElementById('porteiro');
        if (!input || !window.electronAPI?.searchActivePorters) return;
        const term = input.value;
        console.log(`[DEBUG Autocomplete] handlePorterInput called. Term: "${term}"`);
        
        // Limpa seleção anterior
        selectedPorteiroUserId = null;
        
        // Remove ícone de validação quando campo é modificado
        const formGroup = input.closest('.form-group');
        if (formGroup) {
            formGroup.classList.remove('has-validation');
            const validationIcon = formGroup.querySelector('.validation-icon');
            if (validationIcon) {
                validationIcon.classList.remove('show');
            }
        }
        
        if (term?.length >= 1) {
            try {
                console.log('[DEBUG Autocomplete] Calling API searchActivePorters...');
                const res = await window.electronAPI.searchActivePorters(term, currentUser?.condominio_id);
                console.log('[DEBUG Autocomplete] API searchActivePorters response:', res);
                displayPorterSuggestions(res);
            } catch (err) {
                console.error('[DEBUG Autocomplete] Error calling searchActivePorters:', err);
                suggestionsPorteiroDiv?.classList.remove('visible');
            }
        } else {
            suggestionsPorteiroDiv?.classList.remove('visible');
            selectedPorteiroUserId = null;
        }
    }

    // --- Funções de Carregamento de Conteúdo e Listagem ---

    // Função para exibir erros de login
    function showLoginError(message) {
        const loginErrorElement = document.getElementById('login-error-message');
        if (loginErrorElement) {
            loginErrorElement.textContent = message;
            loginErrorElement.style.display = 'block';
            // Auto-ocultar após 5 segundos
            setTimeout(() => {
                if (loginErrorElement.textContent === message) {
                    loginErrorElement.style.display = 'none';
                }
            }, 5000);
        } else {
            // Fallback: usar console.error se o elemento não existir
            console.error('Erro de login:', message);
            // Tentar usar showStatusMessage como alternativa
            showStatusMessage(message, 'error');
        }
    }

    // Função para carregar a interface do Modo Lote
    function carregarModoLote(container) {
        container.innerHTML = `
            <div class="modo-lote-container-redesigned">
                <!-- Seção de Dados Comuns - Canto Esquerdo -->
                <div class="dados-comuns-card">
                    <h3>Dados comuns</h3>
                    
                    <div class="campo-dados-comuns">
                        <label>Usuário</label>
                        <div class="campo-input-container" style="position: relative;">
                            <input type="text" id="lote-porteiro" placeholder="Nome do usuário" required autocomplete="off">
                            <div id="lote-porteiro-suggestions" class="suggestions-list"></div>
                        </div>
                    </div>
                    
                    <div class="campo-dados-comuns">
                        <label>Data</label>
                        <div class="campo-input-container">
                            <input type="date" id="lote-data" required>
                        </div>
                    </div>
                    
                    <div class="campo-dados-comuns">
                        <label>Horário</label>
                        <div class="campo-input-container">
                            <input type="time" id="lote-hora" required>
                        </div>
                    </div>
                </div>

                <!-- Seção de Moradores Selecionados - Lado Direito -->
                <div class="moradores-selecionados-card">
                    <h3>Moradores Selecionados</h3>
                    <div class="busca-morador" style="position: relative; margin-bottom: 15px;">
                        <input type="text" id="busca-morador-lote" placeholder="Digite para buscar morador..." autocomplete="off">
                        <div id="lote-morador-suggestions" class="suggestions-list"></div>
                    </div>
                    <div class="lista-selecionados" id="lista-selecionados">
                        <p class="empty-message">Nenhum morador selecionado</p>
                    </div>
                    <div class="acoes-lote">
                        <button id="btn-finalizar-lote" class="btn-primary" disabled>Finalizar Lote</button>
                        <button id="btn-limpar-lote" class="btn-outline-rounded">Limpar Seleção</button>
                        <button id="btn-filtrar-lote" class="btn-outline-rounded">Filtrar Lote</button>
                    </div>
                </div>
            </div>
        `;

        // Preencher data e hora atuais usando utilitário padronizado
        const currentDateTime = window.DateUtilsClient.getCurrentDateTime();
        document.getElementById('lote-data').value = currentDateTime.date;
        document.getElementById('lote-hora').value = currentDateTime.time;

        // Garantir que os campos sejam editáveis desde o início
        setTimeout(() => {
            garantirCamposEditaveis();
            // Auto-preencher porteiro com usuário logado se ativo
            atualizarCampoUsuarioLote();
        }, 50);
        
        // Observar mudanças no currentUser para atualizar automaticamente o campo
        // Limpar observador anterior se existir
        if (window.currentUserObserver) {
            window.currentUserObserver = null;
        }
        
        // Criar um observador para mudanças no currentUser
        window.currentUserObserver = {
            update: function() {
                console.log('[DEBUG] currentUserObserver.update chamado');
                setTimeout(() => {
                    garantirCamposEditaveis();
                    atualizarCampoUsuarioLote();
                }, 100);
            }
        };

        // Inicializar array de moradores disponíveis vazio
        moradoresDisponiveis = [];

        // Event listeners
        document.getElementById('busca-morador-lote').addEventListener('input', handleMoradorLoteInput); // Mantém busca de moradores apenas no modo lote
        document.getElementById('lote-porteiro').addEventListener('input', handlePorteiroLoteInput);
        document.getElementById('btn-finalizar-lote').addEventListener('click', finalizarLote);
        document.getElementById('btn-limpar-lote').addEventListener('click', limparSelecaoLote);
        document.getElementById('btn-filtrar-lote').addEventListener('click', function() {
            // Funcionalidade do filtrar lote pode ser implementada conforme necessário
            console.log('Filtrar lote clicado');
        });
        
        // Event listeners para navegação por teclado nas sugestões
        document.getElementById('busca-morador-lote').addEventListener('keydown', (e) => {
            const suggestions = document.getElementById('lote-morador-suggestions')?.querySelectorAll('.suggestion-item');
            if (!suggestions || suggestions.length === 0) return;
            
            let selectedIndex = Array.from(suggestions).findIndex(item => item.classList.contains('highlighted'));
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                updateLoteMoradorSuggestionSelection(suggestions, selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
                updateLoteMoradorSuggestionSelection(suggestions, selectedIndex);
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                suggestions[selectedIndex].click();
            } else if (e.key === 'Escape') {
                document.getElementById('lote-morador-suggestions').classList.remove('visible');
            }
        });
        
        document.getElementById('lote-porteiro').addEventListener('keydown', (e) => {
            const suggestions = document.getElementById('lote-porteiro-suggestions')?.querySelectorAll('.suggestion-item');
            if (!suggestions || suggestions.length === 0) return;
            
            let selectedIndex = Array.from(suggestions).findIndex(item => item.classList.contains('highlighted'));
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                updateLotePorteiroSuggestionSelection(suggestions, selectedIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
                updateLotePorteiroSuggestionSelection(suggestions, selectedIndex);
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                suggestions[selectedIndex].click();
            } else if (e.key === 'Escape') {
                document.getElementById('lote-porteiro-suggestions').classList.remove('visible');
            }
        });
        
        // Event listeners para botões de seleção de moradores
         document.addEventListener('click', (e) => {
             if (e.target.classList.contains('btn-selecionar') && e.target.dataset.moradorId) {
                 const moradorId = parseInt(e.target.dataset.moradorId);
                 selecionarMorador(moradorId);
             }
             
             if (e.target.classList.contains('btn-remover') && e.target.dataset.moradorId) {
                 const moradorId = parseInt(e.target.dataset.moradorId);
                 removerMoradorSelecionado(moradorId);
             }
             
             // Event listeners para botões de quantidade
             if (e.target.classList.contains('quantidade-btn') || e.target.closest('.quantidade-btn')) {
                 e.preventDefault();
                 e.stopPropagation();
                 
                 const btn = e.target.classList.contains('quantidade-btn') ? e.target : e.target.closest('.quantidade-btn');
                 const moradorId = parseInt(btn.dataset.moradorId);
                 const incremento = parseInt(btn.dataset.incremento);
                 
                 console.log('Botão de quantidade clicado:', { moradorId, incremento });
                 
                 if (moradorId && !isNaN(incremento)) {
                     alterarQuantidadeBotao(moradorId, incremento);
                 }
             }
         });
         
         // Event listener para inputs de quantidade
         document.addEventListener('change', (e) => {
             if (e.target.classList.contains('quantidade-input') && e.target.dataset.moradorId) {
                 const moradorId = parseInt(e.target.dataset.moradorId);
                 const quantidade = parseInt(e.target.value);
                 alterarQuantidade(moradorId, quantidade);
             }
         });
         
         // Event listeners para fechar sugestões ao clicar fora (usando namespace para evitar conflitos)
         document.addEventListener('click', function closeSuggestionsHandler(e) {
             const moradorSuggestions = document.getElementById('lote-morador-suggestions');
             const porteiroSuggestions = document.getElementById('lote-porteiro-suggestions');
             
             if (!e.target.closest('.busca-morador') && moradorSuggestions) {
                 moradorSuggestions.classList.remove('visible');
             }
             
             if (!e.target.closest('[data-porteiro-container]') && porteiroSuggestions) {
                 porteiroSuggestions.classList.remove('visible');
             }
         });
         
         // Garantir que os campos de data e hora sejam sempre editáveis
         const dataInput = document.getElementById('lote-data');
         const horaInput = document.getElementById('lote-hora');
         const porteiroInput = document.getElementById('lote-porteiro');
         
         if (dataInput) {
             dataInput.addEventListener('focus', function() {
                 this.removeAttribute('readonly');
                 this.removeAttribute('disabled');
             });
         }
         
         if (horaInput) {
             horaInput.addEventListener('focus', function() {
                 this.removeAttribute('readonly');
                 this.removeAttribute('disabled');
             });
         }
         
         if (porteiroInput) {
             porteiroInput.addEventListener('focus', function() {
                 this.removeAttribute('readonly');
                 this.removeAttribute('disabled');
             });
         }
        
        // Marcar container do porteiro para identificação
        document.querySelector('#lote-porteiro').parentElement.setAttribute('data-porteiro-container', 'true');
    }

    // Variáveis globais para o modo lote
    let moradoresDisponiveis = [];
    let moradoresSelecionados = [];
    let selectedLotePorteiroId = null;
    let selectedLoteMoradorId = null;
    
    // Função para atualizar o campo de usuário no modo lote
    function atualizarCampoUsuarioLote() {
        const lotePorteiroInput = document.getElementById('lote-porteiro');
        console.log('[DEBUG] atualizarCampoUsuarioLote chamada:', {
            inputExists: !!lotePorteiroInput,
            currentUser: currentUser,
            currentUserName: currentUser?.name,
            currentUserStatus: currentUser?.status,
            currentInputValue: lotePorteiroInput?.value
        });
        
        if (lotePorteiroInput) {
            // Verificar se o usuário está ativo (status pode ser 'Ativo' ou 'ativo')
            const isUserActive = currentUser && currentUser.name && 
                (currentUser.status === 'Ativo' || currentUser.status === 'ativo');
            
            if (isUserActive) {
                // Sempre atualizar o campo com o usuário atual se estiver vazio ou diferente
                if (!lotePorteiroInput.value.trim() || lotePorteiroInput.value !== currentUser.name) {
                    lotePorteiroInput.value = currentUser.name;
                    selectedLotePorteiroId = currentUser.id;
                    console.log('[DEBUG] Campo de usuário atualizado:', currentUser.name);
                    
                    // Garantir que o campo permaneça editável
                    lotePorteiroInput.removeAttribute('readonly');
                    lotePorteiroInput.removeAttribute('disabled');
                }
            } else {
                // Se não há usuário ativo, limpar o campo apenas se não houver seleção manual
                if (!selectedLotePorteiroId) {
                    lotePorteiroInput.value = '';
                    console.log('[DEBUG] Campo de usuário limpo - sem usuário ativo');
                }
            }
        } else {
            console.log('[DEBUG] Campo lote-porteiro não encontrado');
        }
    }
    
    // Função para garantir que os campos de dados comuns sejam sempre editáveis
    function garantirCamposEditaveis() {
        const campos = ['lote-data', 'lote-hora', 'lote-porteiro'];
        
        console.log('[DEBUG] Executando garantirCamposEditaveis...');
        
        campos.forEach(campoId => {
            const campo = document.getElementById(campoId);
            if (campo) {
                console.log(`[DEBUG] Processando campo: ${campoId}`);
                
                // Remover todos os atributos que possam bloquear a edição
                campo.removeAttribute('readonly');
                campo.removeAttribute('disabled');
                campo.removeAttribute('inert');
                
                // Resetar estilos que possam interferir
                campo.style.pointerEvents = 'auto';
                campo.style.opacity = '1';
                campo.style.backgroundColor = '';
                campo.style.cursor = 'text';
                campo.style.userSelect = 'text';
                campo.style.webkitUserSelect = 'text';
                
                // Garantir que o campo seja focalizável
                campo.setAttribute('tabindex', '0');
                
                // Forçar reflow para garantir que as mudanças sejam aplicadas
                campo.offsetHeight;
                
                console.log(`[DEBUG] Campo ${campoId} configurado como editável`);
            } else {
                console.log(`[DEBUG] Campo ${campoId} não encontrado`);
            }
        });
        
        // Remover qualquer overlay ou elemento que possa estar bloqueando os campos
        const overlays = document.querySelectorAll('.modal-overlay, .loading-overlay');
        overlays.forEach(overlay => {
            if (overlay.style.display !== 'none') {
                console.log('[DEBUG] Removendo overlay que pode estar bloqueando campos');
                overlay.style.display = 'none';
            }
        });
        
        console.log('[DEBUG] Campos de dados comuns garantidos como editáveis');
    }
    
    // Função para limpar dados do modo lote
    function limparDadosModoLote() {
        console.log('Limpando dados do modo lote...');
        moradoresDisponiveis = [];
        moradoresSelecionados = [];
        selectedLotePorteiroId = null;
        selectedLoteMoradorId = null;
        
        // Limpar campos de input se existirem
        const buscaMoradorInput = document.getElementById('busca-morador-lote');
        if (buscaMoradorInput) buscaMoradorInput.value = '';
        
        // Repreencher porteiro com usuário logado se ativo
        const lotePorteiroInput = document.getElementById('lote-porteiro');
        if (lotePorteiroInput) {
            const isUserActive = currentUser && currentUser.name && 
                (currentUser.status === 'Ativo' || currentUser.status === 'ativo');
            if (isUserActive) {
                lotePorteiroInput.value = currentUser.name;
                selectedLotePorteiroId = currentUser.id;
            } else {
                lotePorteiroInput.value = '';
            }
        }
        
        // Repreencher data e hora atuais
        const dataLoteInput = document.getElementById('lote-data');
        const horaLoteInput = document.getElementById('lote-hora');
        if (dataLoteInput && horaLoteInput) {
            const currentDateTime = window.DateUtilsClient.getCurrentDateTime();
            dataLoteInput.value = currentDateTime.date;
            horaLoteInput.value = currentDateTime.time;
        }
        
        const quantidadeLoteInput = document.getElementById('lote-quantidade');
        if (quantidadeLoteInput) quantidadeLoteInput.value = '1';
        
        const observacoesLoteInput = document.getElementById('lote-observacoes');
        if (observacoesLoteInput) observacoesLoteInput.value = '';
        
        // Ocultar sugestões se estiverem visíveis
        const moradorSuggestions = document.getElementById('lote-morador-suggestions');
        if (moradorSuggestions) moradorSuggestions.classList.remove('visible');
        
        const porteiroSuggestions = document.getElementById('lote-porteiro-suggestions');
        if (porteiroSuggestions) porteiroSuggestions.classList.remove('visible');
        
        // Atualizar lista de selecionados (limpar)
        const listaSelecionados = document.getElementById('lista-selecionados');
        if (listaSelecionados) {
            listaSelecionados.innerHTML = '<p class="empty-message">Nenhum morador selecionado</p>';
        }
        
        // Desabilitar botão finalizar
        const btnFinalizar = document.getElementById('btn-finalizar-lote');
        if (btnFinalizar) btnFinalizar.disabled = true;
        
        console.log('Dados do modo lote limpos com sucesso.');
    }

    // Funções de autocomplete para o modo lote
    async function handleMoradorLoteInput() {
        const input = document.getElementById('busca-morador-lote');
        if (!input || !window.electronAPI?.searchResidents) return;
        const term = input.value;
        
        // Limpa seleção anterior
        selectedLoteMoradorId = null;
        
        if (term?.length >= 1) {
            try {
                const res = await window.electronAPI.searchResidents(term);
                displayLoteMoradorSuggestions(res);
            } catch (err) {
                console.error('Erro ao buscar moradores no lote:', err);
                const suggestionsDiv = document.getElementById('lote-morador-suggestions');
                if (suggestionsDiv) suggestionsDiv.classList.remove('visible');
            }
        } else {
            const suggestionsDiv = document.getElementById('lote-morador-suggestions');
            if (suggestionsDiv) suggestionsDiv.classList.remove('visible');
            selectedLoteMoradorId = null;
        }
    }

    async function handlePorteiroLoteInput() {
        const input = document.getElementById('lote-porteiro');
        if (!input || !window.electronAPI?.searchActivePorters) return;
        const term = input.value;
        
        // Limpa seleção anterior
        selectedLotePorteiroId = null;
        
        if (term?.length >= 1) {
            try {
                const res = await window.electronAPI.searchActivePorters(term, currentUser?.condominio_id);
                displayLotePorteiroSuggestions(res);
            } catch (err) {
                console.error('Erro ao buscar porteiros no lote:', err);
                const suggestionsDiv = document.getElementById('lote-porteiro-suggestions');
                if (suggestionsDiv) suggestionsDiv.classList.remove('visible');
            }
        } else {
            const suggestionsDiv = document.getElementById('lote-porteiro-suggestions');
            if (suggestionsDiv) suggestionsDiv.classList.remove('visible');
            selectedLotePorteiroId = null;
        }
    }

    function displayLoteMoradorSuggestions(suggestions) {
        const suggestionsDiv = document.getElementById('lote-morador-suggestions');
        if (!suggestionsDiv) return;
        
        suggestionsDiv.innerHTML = '';
        
        if (suggestions?.length > 0) {
            suggestions.forEach(morador => {
                if (!morador?.id || !morador?.nome) return;
                
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `
                    <strong>${morador.nome}</strong>
                `;
                
                div.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
                
                div.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectedLoteMoradorId = morador.id;
                    document.getElementById('busca-morador-lote').value = morador.nome;
                    suggestionsDiv.classList.remove('visible');
                    // Adicionar morador diretamente à seleção
                    selecionarMoradorPorSugestao(morador);
                    // Garantir que os campos de dados comuns permaneçam editáveis
                    setTimeout(() => {
                        garantirCamposEditaveis();
                    }, 100);
                });
                
                suggestionsDiv.appendChild(div);
            });
            
            suggestionsDiv.classList.add('visible');
        } else {
            suggestionsDiv.classList.remove('visible');
        }
    }

    function displayLotePorteiroSuggestions(suggestions) {
        const suggestionsDiv = document.getElementById('lote-porteiro-suggestions');
        if (!suggestionsDiv) return;
        
        suggestionsDiv.innerHTML = '';
        
        if (suggestions?.length > 0) {
            suggestions.forEach(porteiro => {
                if (!porteiro?.id || !porteiro?.nome) return;
                
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `
                    <strong>${porteiro.nome}</strong>
                    <span style="color: #666; font-size: 0.9em;">${porteiro.nivel_acesso || 'Porteiro'}</span>
                `;
                
                div.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
                
                div.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectedLotePorteiroId = porteiro.id;
                    document.getElementById('lote-porteiro').value = porteiro.nome;
                    suggestionsDiv.classList.remove('visible');
                    // Garantir que os campos de dados comuns permaneçam editáveis
                    setTimeout(() => {
                        garantirCamposEditaveis();
                    }, 100);
                });
                
                suggestionsDiv.appendChild(div);
            });
            
            suggestionsDiv.classList.add('visible');
        } else {
            suggestionsDiv.classList.remove('visible');
        }
    }

    function selecionarMoradorPorSugestao(morador) {
         // Verificar se já está selecionado
         if (moradoresSelecionados.find(m => m.id === morador.id)) {
             alert('Este morador já foi selecionado!');
             return;
         }

         // Adicionar à lista de selecionados com quantidade padrão 1
         moradoresSelecionados.push({
             ...morador,
             quantidade: 1
         });

         atualizarListaSelecionados();
         habilitarBotaoFinalizar();
         
         // Limpar campo de busca
         document.getElementById('busca-morador-lote').value = '';
         
         // Garantir que os campos de dados comuns permaneçam editáveis
         setTimeout(() => {
             garantirCamposEditaveis();
         }, 50);
     }

     function updateLoteMoradorSuggestionSelection(suggestions, selectedIndex) {
         suggestions.forEach((item, index) => {
             if (index === selectedIndex) {
                 item.classList.add('highlighted');
             } else {
                 item.classList.remove('highlighted');
             }
         });
     }

     function updateLotePorteiroSuggestionSelection(suggestions, selectedIndex) {
         suggestions.forEach((item, index) => {
             if (index === selectedIndex) {
                 item.classList.add('highlighted');
             } else {
                 item.classList.remove('highlighted');
             }
         });
     }

    // Funções removidas: carregarMoradoresLote, exibirMoradoresLote, filtrarMoradoresLote
    // Agora a seleção de moradores funciona apenas através do autocomplete

    // Função para selecionar morador
    window.selecionarMorador = function(moradorId) {
        const morador = moradoresDisponiveis.find(m => m.id === moradorId);
        if (!morador) return;

        // Verificar se já está selecionado
        if (moradoresSelecionados.find(m => m.id === moradorId)) {
            alert('Este morador já foi selecionado!');
            return;
        }

        // Adicionar à lista de selecionados com quantidade padrão 1
        moradoresSelecionados.push({
            ...morador,
            quantidade: 1
        });

        atualizarListaSelecionados();
        habilitarBotaoFinalizar();
    }

    // Função para atualizar lista de selecionados
    function atualizarListaSelecionados() {
        const container = document.getElementById('lista-selecionados');
        
        if (moradoresSelecionados.length === 0) {
            container.innerHTML = '<p class="empty-message">Nenhum morador selecionado</p>';
            return;
        }

        container.innerHTML = moradoresSelecionados.map(morador => `
            <div class="morador-selecionado" data-id="${morador.id}">
                <div class="morador-info">
                    <strong>${morador.nome}</strong>
                </div>
                <div class="quantidade-controls">
                    <label>Qtd:</label>
                    <button class="quantidade-btn quantidade-btn-minus" data-morador-id="${morador.id}" data-incremento="-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                    <input type="text" value="${morador.quantidade}" 
                           data-morador-id="${morador.id}" class="quantidade-input" 
                           pattern="[0-9]*" inputmode="numeric" maxlength="2">
                    <button class="quantidade-btn quantidade-btn-plus" data-morador-id="${morador.id}" data-incremento="1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <button class="btn-remover" data-morador-id="${morador.id}">×</button>
            </div>
        `).join('');
        
        // Adicionar validação para inputs de quantidade
        setTimeout(() => {
            const quantidadeInputs = document.querySelectorAll('.quantidade-input');
            quantidadeInputs.forEach(input => {
                // Permitir apenas números
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.replace(/[^0-9]/g, '');
                    if (e.target.value === '' || parseInt(e.target.value) < 1) {
                        e.target.value = '1';
                    }
                    if (parseInt(e.target.value) > 99) {
                        e.target.value = '99';
                    }
                });
            });
        }, 0);
    }
    


    // Função para alterar quantidade
    window.alterarQuantidade = function(moradorId, novaQuantidade) {
        const quantidade = parseInt(novaQuantidade) || 1;
        const morador = moradoresSelecionados.find(m => m.id === moradorId);
        if (morador) {
            morador.quantidade = Math.max(1, Math.min(99, quantidade));
            atualizarListaSelecionados();
        }
    }

    // Função para alterar quantidade usando botões + e -
    window.alterarQuantidadeBotao = function(moradorId, incremento) {
        const morador = moradoresSelecionados.find(m => m.id === moradorId);
        if (morador) {
            const novaQuantidade = Math.max(1, Math.min(99, morador.quantidade + incremento));
            morador.quantidade = novaQuantidade;
            atualizarListaSelecionados();
        }
    }

    // Função para remover morador selecionado
    window.removerMoradorSelecionado = function(moradorId) {
        moradoresSelecionados = moradoresSelecionados.filter(m => m.id !== moradorId);
        atualizarListaSelecionados();
        habilitarBotaoFinalizar();
    }

    // Função para habilitar/desabilitar botão finalizar
    function habilitarBotaoFinalizar() {
        const btn = document.getElementById('btn-finalizar-lote');
        btn.disabled = moradoresSelecionados.length === 0;
    }

    // Função para limpar seleção
    function limparSelecaoLote() {
        if (moradoresSelecionados.length === 0) return;
        
        if (confirm('Deseja limpar toda a seleção?')) {
            moradoresSelecionados = [];
            selectedLotePorteiroId = null;
            selectedLoteMoradorId = null;
            atualizarListaSelecionados();
            habilitarBotaoFinalizar();
            
            // Resetar dados comuns usando utilitário padronizado
            const currentDateTime = window.DateUtilsClient.getCurrentDateTime();
            document.getElementById('lote-data').value = currentDateTime.date;
            document.getElementById('lote-hora').value = currentDateTime.time;
            
            // Resetar porteiro com usuário logado se ativo
            selectedLotePorteiroId = null;
            atualizarCampoUsuarioLote();
            
            // Limpar campo de busca de morador
            document.getElementById('busca-morador-lote').value = '';
            
            // Fechar sugestões
            const moradorSuggestions = document.getElementById('lote-morador-suggestions');
            const porteiroSuggestions = document.getElementById('lote-porteiro-suggestions');
            if (moradorSuggestions) moradorSuggestions.classList.remove('visible');
            if (porteiroSuggestions) porteiroSuggestions.classList.remove('visible');
        }
    }

    // Função para finalizar lote
    async function finalizarLote() {
        const data = document.getElementById('lote-data').value;
        const hora = document.getElementById('lote-hora').value;
        const porteiroNome = document.getElementById('lote-porteiro').value;

        // Validações - verificar se os campos estão realmente vazios ou apenas com espaços
        const dataLimpa = data ? data.trim() : '';
        const horaLimpa = hora ? hora.trim() : '';
        const porteiroNomeLimpo = porteiroNome ? porteiroNome.trim() : '';
        
        console.log('Validando dados:', { data: dataLimpa, hora: horaLimpa, porteiro: porteiroNomeLimpo });
        
        if (!dataLimpa || !horaLimpa || !porteiroNomeLimpo) {
            alert('Por favor, preencha todos os dados comuns (data, hora e porteiro).');
            return;
        }
        
        // Verificar se um porteiro foi selecionado
        let porteiroId = selectedLotePorteiroId;
        
        // Se não há ID selecionado, tentar encontrar pelo nome (fallback para usuário logado)
        if (!porteiroId && porteiroNomeLimpo) {
            const isUserActive = currentUser && currentUser.name && 
                (currentUser.status === 'Ativo' || currentUser.status === 'ativo');
            if (isUserActive && currentUser.name === porteiroNomeLimpo) {
                porteiroId = currentUser.id;
            } else {
                alert('Por favor, selecione um porteiro válido da lista de sugestões.');
                return;
            }
        }
        
        if (!porteiroId) {
            alert('Por favor, selecione um porteiro válido.');
            return;
        }

        if (moradoresSelecionados.length === 0) {
            alert('Selecione pelo menos um morador.');
            return;
        }

        const totalEncomendas = moradoresSelecionados.reduce((total, m) => total + m.quantidade, 0);
        const confirmacao = confirm(
            `Confirma o cadastro em lote?\n\n` +
            `Data: ${new Date(dataLimpa + 'T' + horaLimpa).toLocaleString('pt-BR')}\n` +
            `Moradores: ${moradoresSelecionados.length}\n` +
            `Total de encomendas: ${totalEncomendas}`
        );

        if (!confirmacao) return;

        // Desabilitar botão durante processamento
        const btnFinalizar = document.getElementById('btn-finalizar-lote');
        btnFinalizar.disabled = true;
        btnFinalizar.textContent = 'Processando...';

        let sucessos = 0;
        let erros = 0;

        try {
            for (const morador of moradoresSelecionados) {
                try {
                    // Combinar data e hora em formato ISO para o banco usando utilitário padronizado
                    const dataRecebimento = window.DateUtilsClient.toSupabaseFormat(dataLimpa, horaLimpa);
                    
                    await window.electronAPI.cadastrarEncomenda({
                        moradorId: morador.id,
                        porteiroUserId: porteiroId,
                        quantidade: morador.quantidade,
                        dataRecebimento: dataRecebimento,
                        observacoes: `Cadastro em lote - ${morador.quantidade} encomenda${morador.quantidade > 1 ? 's' : ''} para ${morador.nome}`
                    });
                    sucessos++;
                } catch (error) {
                    console.error(`Erro ao cadastrar encomenda para ${morador.nome}:`, error);
                    erros++;
                }
            }

            // Calcular total de encomendas processadas
            const totalEncomendasCadastradas = moradoresSelecionados
                .slice(0, sucessos)
                .reduce((total, m) => total + m.quantidade, 0);
            
            // Mostrar resultado
            const mensagem = `Lote finalizado!\n\n` +
                           `Moradores processados: ${sucessos}\n` +
                           `Moradores com erro: ${erros}\n` +
                           `Total de encomendas cadastradas: ${totalEncomendasCadastradas}\n\n` +
                           (erros > 0 ? 'Verifique o console para detalhes dos erros.' : 'Todas as encomendas foram cadastradas com sucesso!');
            
            alert(mensagem);

            // Limpar formulário se tudo deu certo
             if (erros === 0) {
                 moradoresSelecionados = [];
                 selectedLotePorteiroId = null;
                 selectedLoteMoradorId = null;
                 atualizarListaSelecionados();
                 
                 // Limpar porteiro e recarregar com usuário logado se ativo
                 selectedLotePorteiroId = null;
                 atualizarCampoUsuarioLote();
                 
                 // Limpar campo de busca de morador
                 document.getElementById('busca-morador-lote').value = '';
                 
                 // Manter data e hora atuais usando utilitário padronizado
                 const currentDateTime = window.DateUtilsClient.getCurrentDateTime();
                 document.getElementById('lote-data').value = currentDateTime.date;
                 document.getElementById('lote-hora').value = currentDateTime.time;
                 
                 // Fechar sugestões
                 const moradorSuggestions = document.getElementById('lote-morador-suggestions');
                 const porteiroSuggestions = document.getElementById('lote-porteiro-suggestions');
                 if (moradorSuggestions) moradorSuggestions.classList.remove('visible');
                 if (porteiroSuggestions) porteiroSuggestions.classList.remove('visible');
             }
             
             // Garantir que os campos permaneçam editáveis após finalizar o lote
             // Usar timeout maior para aguardar o alert ser fechado
             setTimeout(() => {
                 garantirCamposEditaveis();
                 // Forçar foco no primeiro campo editável
                 const dataInput = document.getElementById('lote-data');
                 if (dataInput) {
                     dataInput.focus();
                     dataInput.blur(); // Remove o foco imediatamente para não interferir
                 }
             }, 300);

        } catch (error) {
            console.error('Erro geral no processamento do lote:', error);
            alert('Erro ao processar lote: ' + error.message);
        } finally {
            // Reabilitar botão
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = 'Finalizar Lote';
            habilitarBotaoFinalizar();
        }
    }

    function carregarConteudo(titulo, carregaDados = false) {
        console.log(`Carregando: ${titulo}`);
        mainContent.innerHTML = '';
        
        if (titulo !== 'Dashboard') {
            const h1 = document.createElement('h1');
            h1.textContent = titulo;
            h1.style.color = '#000';
            mainContent.appendChild(h1);
        }
        
        const statusMsgElement = document.createElement('div');
        statusMsgElement.id = 'status-message';
        statusMsgElement.className = 'status-message';
        statusMsgElement.style.display = 'none';
        mainContent.appendChild(statusMsgElement);
        
        const sectionContent = document.createElement('div');
        sectionContent.className = 'section-content-area';
        mainContent.appendChild(sectionContent);

        if (titulo === 'Dashboard') {
            carregarDashboard(sectionContent);
        } else if (titulo === 'Dashboard Encomendas') {
            // Adiciona ID para identificar a seção de encomendas
            sectionContent.id = 'encomendas-content';
            
            const btn = document.createElement('button');
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="plus" style="width: 16px; height: 16px; margin-right: 8px; fill: white;"><path fill="currentColor" d="M19.5,11.5h-7v-7C12.5,4.223877,12.276123,4,12,4s-0.5,0.223877-0.5,0.5v7h-7C4.223877,11.5,4,11.723877,4,12s0.223877,0.5,0.5,0.5h7v7.0005493C11.5001831,19.7765503,11.723999,20.0001831,12,20h0.0006104c0.2759399-0.0001831,0.4995728-0.223999,0.4993896-0.5v-7h7c0.276123,0,0.5-0.223877,0.5-0.5S19.776123,11.5,19.5,11.5z"></path></svg>Cadastrar encomenda';
            btn.className = 'btn-add';
            mainContent.insertBefore(btn, sectionContent);
            btn.addEventListener('click', () => abrirModalEncomenda());
            
            // Criar barra de pesquisa para filtrar encomendas por morador
            const searchContainer = document.createElement('div');
            searchContainer.className = 'search-container-encomendas';
            
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Pesquisar encomenda';
            searchInput.className = 'search-input-encomendas';
            searchInput.id = 'search-encomendas';
            
            const searchIcon = document.createElement('span');
            searchIcon.className = 'search-icon';
            searchIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="search"><path fill="currentColor" d="M21.8594971,21.1526489l-4.1618652-4.1618652C19.1226807,15.3989258,19.9974976,13.3041992,20,11c0-4.9705811-4.0294189-9-9-9s-9,4.0294189-9,9s4.0294189,9,9,9c2.3041382-0.0025024,4.3988647-0.8771973,5.9906616-2.3021851l4.1618042,4.1618042c0.1937866,0.1871948,0.5009766,0.1871948,0.6947632,0C22.0458374,21.6677856,22.0513306,21.3512573,21.8594971,21.1526489z M11,19c-4.4182739,0-8-3.5817261-8-8s3.5817261-8,8-8c4.4161987,0.0050659,7.9949341,3.5838013,8,8C19,15.4182739,15.4182739,19,11,19z"></path></svg>';
            
            searchContainer.appendChild(searchIcon);
            searchContainer.appendChild(searchInput);
            mainContent.insertBefore(searchContainer, sectionContent);
            
            // Container interno para a lista de encomendas
            const listContainer = document.createElement('div');
            listContainer.className = 'section-content';
            sectionContent.appendChild(listContainer);
            
            // Event listener para filtrar encomendas
            let allEncomendas = [];
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                filtrarEncomendas(searchTerm, allEncomendas, listContainer);
            });
            
            // Verifica se há necessidade de atualização pendente
            if (window.needsEncomendaListUpdate) {
                console.log('[Renderer] Detectada necessidade de atualização da lista de encomendas');
                window.needsEncomendaListUpdate = false;
            }
            
            buscarEExibirEncomendas(listContainer, (encomendas) => {
                allEncomendas = encomendas;
            });        } else if (titulo === 'Moradores') {
            // Container para os botões
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;';
            mainContent.insertBefore(buttonContainer, sectionContent);

            // Botão de cadastrar morador
            const btn = document.createElement('button');
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="plus" style="width: 16px; height: 16px; margin-right: 8px; fill: white;"><path fill="currentColor" d="M19.5,11.5h-7v-7C12.5,4.223877,12.276123,4,12,4s-0.5,0.223877-0.5,0.5v7h-7C4.223877,11.5,4,11.723877,4,12s0.223877,0.5,0.5,0.5h7v7.0005493C11.5001831,19.7765503,11.723999,20.0001831,12,20h0.0006104c0.2759399-0.0001831,0.4995728-0.223999,0.4993896-0.5v-7h7c0.276123,0,0.5-0.223877,0.5-0.5S19.776123,11.5,19.5,11.5z"></path></svg>Cadastrar morador';
            btn.className = 'btn-add';
            buttonContainer.appendChild(btn);
            btn.addEventListener('click', () => abrirModalMorador());            // Botão de importar moradores CSV
            const btnImportar = document.createElement('button');
            btnImportar.innerHTML = '<img src="assets/upload-botao.svg" alt="Upload" style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;"> Importar Moradores (CSV)';
            btnImportar.id = 'btnImportarMoradores';
            btnImportar.className = 'btn-importar-moradores';
            buttonContainer.appendChild(btnImportar);// Input oculto para upload
            const inputCsv = document.createElement('input');
            inputCsv.type = 'file';
            inputCsv.id = 'inputCsvMoradores';
            inputCsv.accept = '.csv';
            inputCsv.style.display = 'none';
            buttonContainer.appendChild(inputCsv);

            btnImportar.addEventListener('click', () => inputCsv.click());
            inputCsv.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (!file) return;
                const arrayBuffer = await file.arrayBuffer();
                const csvContent = new TextDecoder('utf-8').decode(arrayBuffer);
                window.electronAPI.importarMoradoresCSV(csvContent)
                    .then(res => {
                        alert(res.message);
                        // Atualiza a lista de moradores após importar
                        const div = mainContent.querySelector('#lista-moradores-container');
                        if (div) buscarEExibirMoradores(div);
                    })
                    .catch(err => alert('Erro ao importar: ' + err.message));
            });

            // Lista de moradores
            const div = document.createElement('div');
            div.id = 'lista-moradores-container';
            div.style.marginTop = '20px';
            sectionContent.appendChild(div);
            buscarEExibirMoradores(div);
        } else if (titulo === 'Usuários' && (currentUser?.role === 'admin' || currentUser?.role === 'supervisor')) {
            const btn = document.createElement('button'); btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="plus" style="width: 16px; height: 16px; margin-right: 8px; fill: white;"><path fill="currentColor" d="M19.5,11.5h-7v-7C12.5,4.223877,12.276123,4,12,4s-0.5,0.223877-0.5,0.5v7h-7C4.223877,11.5,4,11.723877,4,12s0.223877,0.5,0.5,0.5h7v7.0005493C11.5001831,19.7765503,11.723999,20.0001831,12,20h0.0006104c0.2759399-0.0001831,0.4995728-0.223999,0.4993896-0.5v-7h7c0.276123,0,0.5-0.223877,0.5-0.5S19.776123,11.5,19.5,11.5z"></path></svg>Cadastrar usuário'; btn.className = 'btn-add'; mainContent.insertBefore(btn, sectionContent);
            btn.addEventListener('click', () => abrirModalCadastroUsuario());
            carregarInterfaceUsuariosModerna(sectionContent);
        } else if (titulo === 'Modo Lote') {
            carregarModoLote(sectionContent);
        } else if (titulo === 'Relatórios') {
            // Remove a classe de scroll para layout mais compacto
            sectionContent.classList.remove('relatorios-scroll');
            // Interface de Relatórios com design compacto
            const formFiltros = document.createElement('form');
            formFiltros.id = 'form-filtros-relatorio';
            formFiltros.innerHTML = `
                <div class="filtros-container-compact" style="background: #ffffff; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #e0e0e0;">
                    <h4 style="margin: 0 0 8px 0; color: #333; font-size: 0.95rem; font-weight: 600;">Filtros</h4>
                    <div class="form-row-compact" style="display: grid; grid-template-columns: 0.8fr 0.8fr 1.2fr 0.8fr 1.4fr; gap: 8px; align-items: end;">
                        <div class="form-group-compact">
                            <label for="filtro-data-inicial" style="font-size: 0.8rem; color: #666; margin-bottom: 2px; display: block;">Data Inicial:</label>
                            <input type="date" id="filtro-data-inicial" name="dataInicial" style="padding: 6px; font-size: 0.85rem; border: 1px solid #ddd; border-radius: 4px; width: 100%;">
                        </div>
                        <div class="form-group-compact">
                            <label for="filtro-data-final" style="font-size: 0.8rem; color: #666; margin-bottom: 2px; display: block;">Data Final:</label>
                            <input type="date" id="filtro-data-final" name="dataFinal" style="padding: 6px; font-size: 0.85rem; border: 1px solid #ddd; border-radius: 4px; width: 100%;">
                        </div>
                        <div class="form-group-compact" style="position: relative;">
                            <label for="filtro-morador" style="font-size: 0.8rem; color: #666; margin-bottom: 2px; display: block;">Morador:</label>
                            <input type="text" id="filtro-morador" name="morador" placeholder="Digite para buscar..." autocomplete="off" style="padding: 6px; font-size: 0.85rem; border: 1px solid #ddd; border-radius: 4px; width: 100%;">
                            <div id="filtro-morador-suggestions" class="suggestions-dropdown" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none;"></div>
                        </div>
                        <div class="form-group-compact">
                            <label for="filtro-status" style="font-size: 0.8rem; color: #666; margin-bottom: 2px; display: block;">Status:</label>
                            <select id="filtro-status" name="status" style="padding: 6px; font-size: 0.85rem; border: 1px solid #ddd; border-radius: 4px; width: 100%;">
                                <option value="">Todos</option>
                                <option value="Recebida na portaria">Pendente</option>
                                <option value="Entregue">Entregue</option>
                            </select>
                        </div>
                        <div class="form-actions-compact" style="display: flex; gap: 12px;">
                            <button type="submit" class="btn-primary">Buscar</button>
                            <button type="button" id="btn-exportar-pdf" class="btn-secondary">Baixar</button>
                            <button type="button" id="btn-limpar-filtros" class="btn-secondary btn-limpar-relatorio">Limpar</button>
                        </div>
                    </div>
                </div>
            `;
            sectionContent.appendChild(formFiltros);

            // Container para resultados
            const resultadosContainer = document.createElement('div');
            resultadosContainer.id = 'resultados-relatorio';
            resultadosContainer.style.marginTop = '20px';
            sectionContent.appendChild(resultadosContainer);

            // Configuração do autocomplete para morador nos relatórios
            const filtroMoradorInput = document.getElementById('filtro-morador');
            const filtroMoradorSuggestions = document.getElementById('filtro-morador-suggestions');
            let selectedFiltroMoradorId = null;

            if (filtroMoradorInput && filtroMoradorSuggestions) {
                // Event listener para input
                filtroMoradorInput.addEventListener('input', async () => {
                    const term = filtroMoradorInput.value;
                    selectedFiltroMoradorId = null;
                    
                    if (term?.length >= 1) {
                        try {
                            const res = await window.electronAPI.searchResidents(term);
                            displayFiltroMoradorSuggestions(res);
                        } catch (err) {
                            filtroMoradorSuggestions.style.display = 'none';
                        }
                    } else {
                        filtroMoradorSuggestions.style.display = 'none';
                        selectedFiltroMoradorId = null;
                    }
                });

                // Event listener para blur
                filtroMoradorInput.addEventListener('blur', () => {
                    setTimeout(() => {
                        const focusedElement = document.activeElement;
                        if (!focusedElement || !focusedElement.closest('#filtro-morador-suggestions')) {
                            filtroMoradorSuggestions.style.display = 'none';
                        }
                    }, 200);
                });

                // Navegação por teclado
                filtroMoradorInput.addEventListener('keydown', (e) => {
                    const suggestions = filtroMoradorSuggestions.querySelectorAll('.suggestion-item');
                    if (!suggestions || suggestions.length === 0) return;
                    
                    let selectedIndex = -1;
                    suggestions.forEach((item, index) => {
                        if (item.classList.contains('selected')) {
                            selectedIndex = index;
                        }
                    });
                    
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        selectedIndex = (selectedIndex + 1) % suggestions.length;
                        updateFiltroMoradorSuggestionSelection(suggestions, selectedIndex);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
                        updateFiltroMoradorSuggestionSelection(suggestions, selectedIndex);
                    } else if (e.key === 'Enter' && selectedIndex >= 0) {
                        e.preventDefault();
                        suggestions[selectedIndex].click();
                    } else if (e.key === 'Escape') {
                        filtroMoradorSuggestions.style.display = 'none';
                    }
                });
            }

            // Função para exibir sugestões de morador no filtro
            function displayFiltroMoradorSuggestions(suggestions) {
                filtroMoradorSuggestions.innerHTML = '';

                if (suggestions?.length > 0) {
                    suggestions.forEach((r, index) => {
                        if (!r || typeof r.id === 'undefined' || typeof r.nome === 'undefined') {
                            return;
                        }
                        const div = document.createElement('div');
                        div.textContent = r.nome;
                        div.className = 'suggestion-item';
                        div.dataset.id = r.id;
                        div.dataset.name = r.nome;
                        div.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem;';
                        
                        // Event listeners para mouse
                        div.addEventListener('mouseenter', () => {
                            updateFiltroMoradorSuggestionSelection(filtroMoradorSuggestions.querySelectorAll('.suggestion-item'), index);
                        });
                        
                        div.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                        });
                        
                        div.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            filtroMoradorInput.value = r.nome;
                            selectedFiltroMoradorId = r.id;
                            console.log(`Morador selecionado no filtro: ${r.nome} (ID: ${r.id})`);
                            filtroMoradorSuggestions.style.display = 'none';
                            filtroMoradorSuggestions.innerHTML = '';
                        });
                        
                        filtroMoradorSuggestions.appendChild(div);
                    });

                    filtroMoradorSuggestions.style.display = 'block';
                } else {
                    filtroMoradorSuggestions.style.display = 'none';
                }
            }

            // Função para atualizar seleção com teclado no filtro
            function updateFiltroMoradorSuggestionSelection(suggestions, selectedIndex) {
                suggestions.forEach((item, index) => {
                    if (index === selectedIndex) {
                        item.classList.add('selected');
                        item.style.backgroundColor = '#e3f2fd';
                    } else {
                        item.classList.remove('selected');
                        item.style.backgroundColor = 'transparent';
                    }
                });
            }

            // Event listeners para o formulário de relatórios
            formFiltros.addEventListener('submit', async (e) => {
                e.preventDefault();
                await buscarRelatorio();
            });

            document.getElementById('btn-exportar-pdf').addEventListener('click', async () => {
                // Obtém os filtros do formulário
                const formData = new FormData(formFiltros);
                
                // Validação do morador selecionado
                const moradorNome = formData.get('morador') || '';
                if (moradorNome && !selectedFiltroMoradorId) {
                    alert('Por favor, selecione um morador válido da lista de sugestões.');
                    filtroMoradorInput.focus();
                    return;
                }
                
                const filtros = {
                    dataInicial: formData.get('dataInicial') || '',
                    dataFinal: formData.get('dataFinal') || '',
                    morador: moradorNome,
                    moradorId: selectedFiltroMoradorId || null,
                    porteiro: formData.get('porteiro') || '',
                    status: formData.get('status') || ''
                };
                try {
                    if (!window.electronAPI?.exportarRelatorioPDF) throw new Error('API de exportação indisponível');
                    // Chama a função e aguarda o retorno
                    const res = await window.electronAPI.exportarRelatorioPDF(filtros);
                    if (res.success) {
                        alert('PDF exportado com sucesso!\nArquivo salvo em:\n' + res.path);
                    } else {
                        alert('Erro ao exportar PDF: ' + (res.message || 'Erro desconhecido.'));
                    }
                } catch (err) {
                    alert('Erro ao exportar PDF: ' + err.message);
                }
            });

            document.getElementById('btn-limpar-filtros').addEventListener('click', () => {
                formFiltros.reset();
                selectedFiltroMoradorId = null;
                filtroMoradorSuggestions.style.display = 'none';
                filtroMoradorSuggestions.innerHTML = '';
                document.getElementById('resultados-relatorio').innerHTML = '';
            });

            // Função para buscar relatório
            async function buscarRelatorio() {
                const formData = new FormData(formFiltros);
                
                // Validação do morador selecionado
                const moradorNome = formData.get('morador') || '';
                if (moradorNome && !selectedFiltroMoradorId) {
                    alert('Por favor, selecione um morador válido da lista de sugestões.');
                    filtroMoradorInput.focus();
                    return;
                }
                
                const filtros = {
                    dataInicial: formData.get('dataInicial') || '',
                    dataFinal: formData.get('dataFinal') || '',
                    morador: moradorNome,
                    moradorId: selectedFiltroMoradorId || null,
                    porteiro: formData.get('porteiro') || '',
                    status: formData.get('status') || ''
                };

                console.log('Buscando relatório com filtros:', filtros);
                resultadosContainer.innerHTML = '<p>Carregando relatório...</p>';

                try {
                    if (!window.electronAPI?.buscarRelatorio) {
                        throw new Error('API de relatórios indisponível');
                    }

                    // Busca TODOS os resultados primeiro, sem filtro de status
                    const filtrosSemStatus = { ...filtros };
                    delete filtrosSemStatus.status; // Remove o filtro de status temporariamente
                    
                    const todosResultados = await window.electronAPI.buscarRelatorio(filtrosSemStatus);
                    console.log('=== DEBUG COMPLETO DOS DADOS ===');
                    console.log('Total de resultados recebidos:', todosResultados?.length || 0);
                    
                    // Log detalhado dos primeiros 3 itens para análise
                    if (Array.isArray(todosResultados) && todosResultados.length > 0) {
                        console.log('Primeiros 3 itens para análise:');
                        todosResultados.slice(0, 3).forEach((item, index) => {
                            console.log(`\n--- ITEM ${index + 1} (ID: ${item.id}) ---`);
                            console.log('Todos os campos disponíveis:', Object.keys(item));
                            console.log('Dados completos:', item);
                            
                            // Verifica especificamente campos relacionados a entrega
                            const camposEntrega = [
                                'data_entrega', 'entregue_em', 'delivered_at', 'entrega_data', 
                                'entrega_timestamp', 'data_entregue', 'porteiro_entregou_id', 
                                'porteiro_entregou_nome', 'entregue_por', 'delivered_by', 
                                'status', 'data_entrega_iso', 'entrega_porteiro_id'
                            ];
                            
                            console.log('Campos de entrega encontrados:');
                            camposEntrega.forEach(campo => {
                                if (item.hasOwnProperty(campo)) {
                                    console.log(`  ${campo}: ${item[campo]} (tipo: ${typeof item[campo]})`);
                                }
                            });
                        });
                    }
                    
                    // Agora aplica a lógica de determinação de status e filtra no frontend
                    let resultadosFiltrados = todosResultados;
                    
                    if (Array.isArray(todosResultados)) {
                        resultadosFiltrados = todosResultados.map(item => {
                            console.log(`\n=== PROCESSANDO ITEM ${item.id} ===`);
                            
                            // Agora usamos o campo 'status' que vem direto da query SQL
                            let statusReal = item.status || 'Recebida na portaria';
                            let motivoStatus = 'Status determinado pela query SQL';
                            
                            // Log dos campos importantes
                            console.log('Campos de entrega:');
                            console.log(`  status: ${item.status}`);
                            console.log(`  data_entrega: ${item.data_entrega}`);
                            console.log(`  porteiro_entregou_id: ${item.porteiro_entregou_id}`);
                            console.log(`  porteiro_entregou_nome: ${item.porteiro_entregou_nome}`);
                            
                            // Verificação adicional para casos especiais
                            if (!statusReal || statusReal === 'null') {
                                if (item.data_entrega) {
                                    statusReal = 'Entregue';
                                    motivoStatus = 'Data de entrega encontrada';
                                } else {
                                    statusReal = 'Recebida na portaria';
                                    motivoStatus = 'Sem data de entrega';
                                }
                            }
                            
                            console.log(`Status final: "${statusReal}" (motivo: ${motivoStatus})`);
                            
                            return { ...item, statusCalculado: statusReal, motivoStatus };
                        });
                        
                        // Agora aplica o filtro de status se especificado
                        if (filtros.status && filtros.status.trim()) {
                            console.log(`\n=== APLICANDO FILTRO DE STATUS: "${filtros.status}" ===`);
                            const antesDoFiltro = resultadosFiltrados.length;
                            
                            resultadosFiltrados = resultadosFiltrados.filter(item => {
                                const match = item.statusCalculado === filtros.status;
                                console.log(`Item ${item.id}: calculado="${item.statusCalculado}", filtro="${filtros.status}", match=${match}`);
                                return match;
                            });
                            
                            console.log(`Filtro aplicado: ${antesDoFiltro} itens -> ${resultadosFiltrados.length} itens`);
                        }
                    }

                    // Insere apenas os resultados
                    resultadosContainer.innerHTML = '';

                    exibirResultadosRelatorio(resultadosFiltrados, filtros);
                } catch (error) {
                    console.error('Erro ao buscar relatório:', error);
                    resultadosContainer.innerHTML = `
                        <div class="error-message" style="color: #d32f2f; background: #ffebee; padding: 16px; border-radius: 8px;">
                            Erro ao buscar relatório: ${error.message}
                        </div>
                    `;
                }
            }

            // Função para exibir resultados do relatório com layout compacto
            function exibirResultadosRelatorio(resultados, filtros) {
                console.log('=== EXIBINDO RESULTADOS ===');
                console.log('Número de resultados a exibir:', resultados?.length || 0);
                
                if (!Array.isArray(resultados) || resultados.length === 0) {
                    const emptyDiv = document.createElement('div');
                    emptyDiv.innerHTML = `
                        <div class="empty-message-compact" style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e0e0e0;">
                            <h4 style="margin: 0 0 4px 0; color: #666; font-size: 0.9rem;">Nenhum resultado encontrado</h4>
                            <p style="margin: 0; font-size: 0.8rem; color: #888;">Ajuste os filtros para encontrar encomendas.</p>
                        </div>
                    `;
                    resultadosContainer.appendChild(emptyDiv);
                    return;
                }

                const headerDiv = document.createElement('div');
                headerDiv.innerHTML = `
                    <div class="relatorio-header-compact" style="background: #e8f4fd; padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #1976d2;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h4 style="margin: 0; color: #333; font-size: 0.9rem; font-weight: 600;">Resultados (${resultados.length} encomendas)</h4>
                            ${Object.values(filtros).some(f => f && f.trim()) ? `
                                <div style="font-size: 0.75rem; color: #666;">
                                    Filtros: ${filtros.dataInicial ? `${filtros.dataInicial}` : ''}${filtros.dataFinal ? ` até ${filtros.dataFinal}` : ''}${filtros.morador ? ` | ${filtros.morador}` : ''}${filtros.status ? ` | ${filtros.status}` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
                resultadosContainer.appendChild(headerDiv);

                const tableDiv = document.createElement('div');
                tableDiv.innerHTML = `
                    <div class="relatorio-table-container-compact" style="border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; max-height: 400px; overflow-y: auto;">
                        <table class="relatorio-table-compact" style="width: 100%; border-collapse: collapse; background: white; font-size: 0.85rem;">
                            <thead style="background: #1976d2; color: white; position: sticky; top: 0; z-index: 10;">
                                <tr>
                                    <th style="padding: 8px 6px; text-align: left; font-size: 0.8rem; font-weight: 600; width: 60px;">ID</th>
                                    <th style="padding: 8px 6px; text-align: left; font-size: 0.8rem; font-weight: 600; width: 120px;">Data</th>
                                    <th style="padding: 8px 6px; text-align: left; font-size: 0.8rem; font-weight: 600;">Morador</th>
                                    <th style="padding: 8px 6px; text-align: center; font-size: 0.8rem; font-weight: 600; width: 50px;">Qtd</th>
                                    <th style="padding: 8px 6px; text-align: left; font-size: 0.8rem; font-weight: 600; width: 90px;">Status</th>
                                    <th style="padding: 8px 6px; text-align: left; font-size: 0.8rem; font-weight: 600; width: 150px;">Observações</th>
                                </tr>
                            </thead>
                            <tbody id="relatorio-tbody">
                            </tbody>
                        </table>
                    </div>
                `;
                resultadosContainer.appendChild(tableDiv);

                const tbody = document.getElementById('relatorio-tbody');
                resultados.forEach((item, index) => {
                    console.log(`Exibindo item ${index}:`, item);
                    
                    const dataFormatada = item.data ? 
                        new Date(item.data).toLocaleString('pt-BR', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        }) : 'N/A';

                    // Usa o status já calculado na função buscarRelatorio
                    const statusValue = item.statusCalculado || 'Recebida na portaria';
                    
                    console.log(`Status final para exibição - Item ${item.id}: "${statusValue}"`);
                    
                    const statusClass = statusValue === 'Entregue' ? 'status-entregue-compact' : 'status-pendente-compact';
                    const rowClass = index % 2 === 0 ? 'even' : 'odd';

                    const row = document.createElement('tr');
                    row.className = rowClass;
                    row.style.borderBottom = '1px solid #f0f0f0';
                    row.style.fontSize = '0.85rem';
                    
                    row.innerHTML = `
                        <td style="padding: 6px; font-weight: 500; color: #666;">${item.id || 'N/A'}</td>
                        <td style="padding: 6px; font-size: 0.8rem;">${dataFormatada}</td>
                        <td style="padding: 6px; font-weight: 500; color: #333;">${item.morador || 'N/A'}</td>
                        <td style="padding: 6px; text-align: center; font-weight: 600;">${item.quantidade || 1}</td>
                        <td style="padding: 6px;">
                            <span class="${statusClass}" style="padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; font-weight: 500; ${
                                statusValue === 'Entregue' ? 'background: #c8e6c9; color: #2e7d32;' : 'background: #fff3e0; color: #f57c00;'
                            }">
                                ${statusValue === 'Entregue' ? 'Entregue' : 'Pendente'}
                            </span>
                        </td>
                        <td style="padding: 6px; max-width: 150px; word-wrap: break-word; font-size: 0.8rem; color: #666;">${item.observacoes ? (item.observacoes.length > 50 ? item.observacoes.substring(0, 50) + '...' : item.observacoes) : '-'}</td>
                    `;
                    
                    tbody.appendChild(row);
                });
            }
        } else if (titulo === 'Ajustes') {
            // Estrutura simples para futuras funcionalidades
            const ajustesContainer = document.createElement('div');
            ajustesContainer.className = 'ajustes-container';
            ajustesContainer.innerHTML = `
                <div class="ajustes-header">
                    <h2>Configurações do Sistema</h2>
                    <p>Esta área está sendo preparada para novas funcionalidades.</p>
                </div>
                <div class="ajustes-sections">
                    <div class="ajustes-section-placeholder">
                        <h3>🔧 Configurações Gerais</h3>
                        <p>Em breve: Configurações básicas do sistema</p>
                    </div>
                    <div class="ajustes-section-placeholder">
                        <h3>🎨 Personalização</h3>
                        <p>Em breve: Temas e personalização da interface</p>
                    </div>
                    <div class="ajustes-section-placeholder">
                        <h3>📊 Relatórios</h3>
                        <p>Em breve: Configurações de relatórios e exportação</p>
                    </div>
                    <div class="ajustes-section-placeholder">
                        <h3>🔔 Notificações</h3>
                        <p>Em breve: Configurações de alertas e notificações</p>
                    </div>
                </div>
            `;
            sectionContent.appendChild(ajustesContainer);

        } else {
            const p = document.createElement('p'); p.textContent = `Conteúdo ${titulo}...`; sectionContent.appendChild(p);
        }
    }
    async function buscarEExibirEncomendas(container, callback) {
        console.log('Buscando encomendas...');
        container.innerHTML = '<p>Carregando...</p>';
        try {
            if (!window.electronAPI?.getPendingPackages) throw new Error('API getPendingPackages indisponível');
            const pacotes = await window.electronAPI.getPendingPackages();
            container.innerHTML = '';
            if (Array.isArray(pacotes)) {
                // Usa a função auxiliar para exibir as encomendas
                exibirListaEncomendas(pacotes, container);
                // Chama o callback se fornecido, passando os dados das encomendas
                if (typeof callback === 'function') {
                    callback(pacotes);
                }
            } else {
                throw new Error('Resposta inesperada do backend (pacotes).');
            }
        } catch (error) {
            console.error('Erro ao buscar/exibir encomendas:', error);
            container.innerHTML = ''; // Limpa o "Carregando..."
            const err = document.createElement('p');
            err.textContent = `Erro ao carregar encomendas: ${error.message}`;
            err.className = 'error-message';
            container.appendChild(err);
        }
    }
    async function buscarEExibirMoradores(container) {
        console.log('Buscando moradores...');
        container.innerHTML = '<p>Carregando...</p>';
        
        try {
            if (!window.electronAPI?.getResidents) throw new Error('API indisponível');
            const moradores = await window.electronAPI.getResidents(currentUser?.condominio_id);
            container.innerHTML = '';
            
            if (Array.isArray(moradores)) {
                if (moradores.length > 0) {
                    // Criar barra de pesquisa
                    const searchContainer = document.createElement('div');
                    searchContainer.className = 'search-container-moradores';
                    
                    const searchInput = document.createElement('input');
                    searchInput.type = 'text';
                    searchInput.placeholder = 'Pesquisar morador por nome...';
                    searchInput.className = 'search-input-moradores';
                    searchInput.id = 'search-moradores';
                    
                    const searchIcon = document.createElement('span');
                    searchIcon.className = 'search-icon';
                    searchIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="search"><path fill="currentColor" d="M21.8594971,21.1526489l-4.1618652-4.1618652C19.1226807,15.3989258,19.9974976,13.3041992,20,11c0-4.9705811-4.0294189-9-9-9s-9,4.0294189-9,9s4.0294189,9,9,9c2.3041382-0.0025024,4.3988647-0.8771973,5.9906616-2.3021851l4.1618042,4.1618042c0.1937866,0.1871948,0.5009766,0.1871948,0.6947632,0C22.0458374,21.6677856,22.0513306,21.3512573,21.8594971,21.1526489z M11,19c-4.4182739,0-8-3.5817261-8-8s3.5817261-8,8-8c4.4161987,0.0050659,7.9949341,3.5838013,8,8C19,15.4182739,15.4182739,19,11,19z"></path></svg>';
                    
                    const suggestionsList = document.createElement('ul');
                    suggestionsList.className = 'suggestions-list';
                    suggestionsList.id = 'suggestions-moradores';
                    
                    searchContainer.appendChild(searchIcon);
                    searchContainer.appendChild(searchInput);
                    searchContainer.appendChild(suggestionsList);
                    container.appendChild(searchContainer);
                    
                    // Criar tabela
                    const table = document.createElement('table');
                    table.className = 'moradores-table';
                    table.id = 'moradores-table';
                    const thead = table.createTHead();
                    const hr = thead.insertRow();
                    ['Nome', 'AP/LT', 'BL/QD', 'Telefone', 'Ações'].forEach(t => {
                        const th = document.createElement('th');
                        th.textContent = t;
                        hr.appendChild(th);
                    });
                    
                    const tbody = table.createTBody();
                    moradores.forEach(m => {
                        const row = tbody.insertRow();
                        row.dataset.residentId = m.id;
                        row.dataset.residentName = (m.nome || '').toLowerCase();
                        row.insertCell().textContent = m.nome || 'N/A';
                        row.insertCell().textContent = m.apartamento || 'N/A';
                        row.insertCell().textContent = m.bloco || 'N/A';
                        row.insertCell().textContent = m.telefone || 'N/A';
                        
                        const actionsCell = row.insertCell();
                        actionsCell.className = 'morador-actions';
                        
                        const btnEdit = document.createElement('button');
                        btnEdit.className = 'morador-action-icon btn-editar-morador';
                        btnEdit.dataset.id = m.id;
                        btnEdit.title = 'Editar morador';
                        btnEdit.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="edit"><path fill="currentColor" d="M7,12.2578125V16.5c0,0.0001831,0,0.0003662,0,0.0005493C7.0001831,16.7765503,7.223999,17.0001831,7.5,17h4.2421875c0.1326294,0,0.2597656-0.0526733,0.3535156-0.1464844l6.9262085-6.9276733c0.0012817-0.0012207,0.0031128-0.0016479,0.0043335-0.0028687c0.0012817-0.0012817,0.0015869-0.0029907,0.0028076-0.0042725l2.8244629-2.8250122c0,0,0.000061-0.000061,0.0001221-0.0001221c0.1951294-0.1952515,0.1950684-0.5117188-0.0001221-0.7068481l-4.2402344-4.2402344c-0.000061-0.000061-0.0001221-0.0001221-0.0001831-0.0001831c-0.1952515-0.1951294-0.5117188-0.1950684-0.7068481,0.0001831l-9.7597656,9.7578125C7.0526733,11.9980469,7,12.1251831,7,12.2578125z M17.2597656,3.2069702l3.5332642,3.5332642l-2.1209106,2.1213379l-3.5336914-3.5336914L17.2597656,3.2069702z M8,12.4648438l6.4313354-6.4299927l3.5338135,3.5338135L11.5351562,16H8V12.4648438z M21.5,12c-0.276123,0-0.5,0.223877-0.5,0.5V19c-0.0014038,1.1040039-0.8959961,1.9985962-2,2H5c-1.1040039-0.0014038-1.9985962-0.8959961-2-2V5c0.0014038-1.1040039,0.8959961-1.9985962,2-2h6.5C11.776123,3,12,2.776123,12,2.5S11.776123,2,11.5,2H5C3.3438721,2.0018311,2.0018311,3.3438721,2,5v14c0.0018311,1.6561279,1.3438721,2.9981689,3,3h14c1.6561279-0.0018311,2.9981689-1.3438721,3-3v-6.5C22,12.223877,21.776123,12,21.5,12z"></path></svg>';
                        btnEdit.addEventListener('click', () => abrirModalMorador(m.id));
                        actionsCell.appendChild(btnEdit);
                        
                        if (currentUser?.role === 'admin' || currentUser?.role === 'supervisor') {
                            const btnDel = document.createElement('button');
                            btnDel.className = 'morador-action-icon btn-excluir-morador';
                            btnDel.dataset.id = m.id;
                            btnDel.title = 'Excluir morador';
                            btnDel.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="user-times"><path fill="currentColor" d="M14.3792725,13.3696899C15.9318237,12.5210571,16.9978027,10.8936157,17,9c0-2.7614136-2.2385864-5-5-5S7,6.2385864,7,9c0,1.8936157,1.0650635,3.5214233,2.6171265,4.3700562c-3.0588379,0.9574585-5.3679199,3.706665-5.5907593,7.0967407c-0.0181885,0.2755737,0.1903076,0.5137329,0.4658203,0.5322266c0.0112305,0.0011597,0.0224609,0.0018921,0.0336914,0.0022583c0.2669067,0.0084229,0.4901123-0.2011719,0.4985352-0.4680786c0.2295532-3.5004272,3.0177612-6.2886963,6.5181885-6.5181885c3.8525391-0.2526245,7.1804199,2.6656494,7.4329834,6.5181885C18.9933472,20.7957764,19.2114258,20.9998169,19.4746094,21c0.0107422,0,0.0214844,0,0.0332031-0.0009766c0.2755737-0.0184937,0.4840088-0.2566528,0.4658203-0.5322266C19.7530518,17.1099243,17.4705811,14.3337402,14.3792725,13.3696899z M12,13c-2.2091675,0-4-1.7908325-4-4s1.7908325-4,4-4c2.208252,0.0021973,3.9978027,1.791748,4,4C16,11.2091675,14.2091675,13,12,13z M23.3534546,13.6465454L22.2069092,12.5l1.1465454-1.1465454c0.1871948-0.1937256,0.1871948-0.5009155,0-0.6947021c-0.1918335-0.1986084-0.5083618-0.2041016-0.7069702-0.0122681l-1.1465454,1.1465454l-1.1464844-1.1464844c-0.1937256-0.1871948-0.5009155-0.1871948-0.6947021,0c-0.1986084,0.1918335-0.2041016,0.5083618-0.0122681,0.7069702L20.7929688,12.5l-1.1464844,1.1464844c-0.09375,0.09375-0.1464233,0.2208862-0.1464233,0.3534546c0,0.276123,0.2238159,0.5,0.499939,0.500061c0.1326294,0.0001221,0.2598267-0.0526123,0.3534546-0.1465454l1.1464844-1.1464844l1.1465454,1.1465454C22.7401123,14.4474487,22.8673706,14.5001831,23,14.5c0.1325073-0.000061,0.2595825-0.0526733,0.3533325-0.1463623C23.548645,14.1583862,23.5487061,13.8417969,23.3534546,13.6465454z"></path></svg>';
                            btnDel.addEventListener('click', async () => {
                                const mid = btnDel.dataset.id;
                                const mNome = m.nome;
                                if (confirm(`Excluir ${mNome}? Esta ação não pode ser desfeita.`)) {
                                    try {
                                        if (!window.electronAPI?.deleteResident) throw new Error('API indisponível');
                                        const res = await window.electronAPI.deleteResident(mid);
                                        if (res?.success) {
                                            showStatusMessage(res.message || 'Excluído!', 'success');
                                            container.querySelector(`tr[data-resident-id="${mid}"]`)?.remove();
                                        } else {
                                            showStatusMessage(`Erro: ${res?.message || 'Erro desconhecido.'}`, 'error');
                                        }
                                    } catch (err) {
                                        showStatusMessage(`Erro: ${err.message}`, 'error');
                                    }
                                }
                            });
                            actionsCell.appendChild(btnDel);
                        }
                    });
                    
                    container.appendChild(table);
                    
                    // Implementar funcionalidade de pesquisa
                    let currentSuggestionIndex = -1;
                    
                    searchInput.addEventListener('input', (e) => {
                        const searchTerm = e.target.value.toLowerCase().trim();
                        const rows = table.querySelectorAll('tbody tr');
                        const suggestions = suggestionsList;
                        
                        // Limpar sugestões
                        suggestions.innerHTML = '';
                        currentSuggestionIndex = -1;
                        
                        if (searchTerm === '') {
                            // Mostrar todas as linhas
                            rows.forEach(row => row.style.display = '');
                            suggestions.style.display = 'none';
                            return;
                        }
                        
                        // Filtrar e mostrar sugestões
                        const matches = [];
                        rows.forEach(row => {
                            const name = row.dataset.residentName;
                            if (name.includes(searchTerm)) {
                                row.style.display = '';
                                matches.push({
                                    name: row.cells[0].textContent,
                                    apartamento: row.cells[1].textContent,
                                    bloco: row.cells[2].textContent
                                });
                            } else {
                                row.style.display = 'none';
                            }
                        });
                        
                        // Mostrar sugestões (máximo 5)
                        if (matches.length > 0 && searchTerm.length > 0) {
                            suggestions.style.display = 'block';
                            matches.slice(0, 5).forEach((match, index) => {
                                const li = document.createElement('li');
                                li.innerHTML = `<strong>${match.name}</strong> - ${match.apartamento}/${match.bloco}`;
                                li.addEventListener('click', () => {
                                    searchInput.value = match.name;
                                    suggestions.style.display = 'none';
                                    // Filtrar apenas este morador
                                    rows.forEach(row => {
                                        if (row.cells[0].textContent === match.name) {
                                            row.style.display = '';
                                        } else {
                                            row.style.display = 'none';
                                        }
                                    });
                                });
                                suggestions.appendChild(li);
                            });
                        } else {
                            suggestions.style.display = 'none';
                        }
                    });
                    
                    // Navegação por teclado
                    searchInput.addEventListener('keydown', (e) => {
                        const suggestions = suggestionsList.querySelectorAll('li');
                        
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            currentSuggestionIndex = Math.min(currentSuggestionIndex + 1, suggestions.length - 1);
                            updateSuggestionHighlight(suggestions);
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            currentSuggestionIndex = Math.max(currentSuggestionIndex - 1, -1);
                            updateSuggestionHighlight(suggestions);
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (currentSuggestionIndex >= 0 && suggestions[currentSuggestionIndex]) {
                                suggestions[currentSuggestionIndex].click();
                            }
                        } else if (e.key === 'Escape') {
                            suggestionsList.style.display = 'none';
                            currentSuggestionIndex = -1;
                        }
                    });
                    
                    function updateSuggestionHighlight(suggestions) {
                        suggestions.forEach((li, index) => {
                            if (index === currentSuggestionIndex) {
                                li.classList.add('highlighted');
                            } else {
                                li.classList.remove('highlighted');
                            }
                        });
                    }
                    
                    // Fechar sugestões ao clicar fora
                    document.addEventListener('click', (e) => {
                        if (!searchContainer.contains(e.target)) {
                            suggestionsList.style.display = 'none';
                        }
                    });
                    
                } else {
                    const msg = document.createElement('p');
                    msg.textContent = 'Nenhum morador cadastrado.';
                    msg.className = 'empty-list-message';
                    container.appendChild(msg);
                }
            } else {
                throw new Error('Resposta inesperada.');
            }
        } catch (error) {
            console.error('Erro moradores:', error);
            container.innerHTML = '';
            const err = document.createElement('p');
            err.textContent = `Erro ao carregar moradores: ${error.message}`;
            err.className = 'error-message';
            container.appendChild(err);
        }
    }    // Nova interface modernizada para usuários
    async function carregarInterfaceUsuariosModerna(containerElement) {
        console.log('Carregando interface moderna de usuários...');
        containerElement.innerHTML = '<p>Carregando usuários...</p>';
        
        try {
            if (!window.electronAPI?.getUsers) throw new Error('API getUsers indisponível.');
            // Filtra usuários pelo condomínio do usuário logado
            const condominioId = currentUser?.condominio_id || null;
            const usuarios = await window.electronAPI.getUsers(condominioId);
            containerElement.innerHTML = '';

            if (Array.isArray(usuarios) && usuarios.length > 0) {
                // Container principal com layout flexível
                const mainContainer = document.createElement('div');
                mainContainer.className = 'usuarios-modern-container';
                mainContainer.style.cssText = `
                    display: flex;
                    gap: 20px;
                    height: calc(100vh - 200px);
                    min-height: 500px;
                `;

                // Lista de usuários à esquerda
                const listaContainer = document.createElement('div');
                listaContainer.className = 'usuarios-lista-container';
                listaContainer.style.cssText = `
                    flex: 0 0 300px;
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e1e8ed;
                    overflow-y: auto;
                `;

                // Cabeçalho da lista
                const listaHeader = document.createElement('div');
                listaHeader.style.cssText = `
                    padding: 16px 20px;
                    border-bottom: 1px solid #e1e8ed;
                    background: #f8f9fa;
                    border-radius: 12px 12px 0 0;
                `;
                listaHeader.innerHTML = '<h3 style="margin: 0; color: #000; font-size: 16px;">Usuários</h3>';
                listaContainer.appendChild(listaHeader);

                // Lista de usuários
                const listaUsuarios = document.createElement('div');
                listaUsuarios.className = 'usuarios-lista';
                listaContainer.appendChild(listaUsuarios);

                // Container de detalhes à direita
                const detalhesContainer = document.createElement('div');
                detalhesContainer.className = 'usuarios-detalhes-container';
                detalhesContainer.style.cssText = `
                    flex: auto;
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e1e8ed;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                `;

                // Estado inicial dos detalhes
                detalhesContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6c757d; text-align: center;">
                        <div>
                            <svg style="width: 64px; height: 64px; margin-bottom: 16px; opacity: 0.5;" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" />
                            </svg>
                            <p style="margin: 0; font-size: 16px;">Selecione um usuário para ver os detalhes</p>
                        </div>
                    </div>
                `;

                // Renderizar lista de usuários
                usuarios.forEach((user, index) => {
                    const userItem = document.createElement('div');
                    userItem.className = 'usuario-item';
                    userItem.dataset.userId = user.id;
                    userItem.style.cssText = `
                        padding: 16px 20px;
                        border-bottom: 1px solid #f0f0f0;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                    `;

                    // Informações do usuário
                    const userInfo = document.createElement('div');
                    userInfo.style.cssText = 'flex: 1; min-width: 0;';
                    userInfo.innerHTML = `
                        <div style="font-weight: 600; color: #2c3e50; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${user.nome_completo || user.nome_usuario || 'N/A'}
                        </div>
                        <div style="font-size: 12px; color: #6c757d; display: flex; align-items: center; gap: 8px;">
                            <span class="status-badge status-${(user.status || '').toLowerCase()}" style="
                                padding: 2px 8px;
                                border-radius: 12px;
                                font-size: 10px;
                                font-weight: 500;
                                text-transform: uppercase;
                                ${user.status === 'Ativo' ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}
                            ">${user.status || 'N/A'}</span>
                            <span>${user.nivel_acesso || 'N/A'}</span>
                        </div>
                    `;

                    userItem.appendChild(userInfo);

                    // Eventos de hover e clique
                    userItem.addEventListener('mouseenter', () => {
                        userItem.style.backgroundColor = '#f8f9fa';
                    });
                    userItem.addEventListener('mouseleave', () => {
                        if (!userItem.classList.contains('selected')) {
                            userItem.style.backgroundColor = 'transparent';
                        }
                    });
                    userItem.addEventListener('click', () => {
                        // Remove seleção anterior
                        listaUsuarios.querySelectorAll('.usuario-item').forEach(item => {
                            item.classList.remove('selected');
                            item.style.backgroundColor = 'transparent';
                            item.style.borderLeft = 'none';
                        });
                        
                        // Adiciona seleção atual
                        userItem.classList.add('selected');
                        userItem.style.backgroundColor = '#e3f2fd';
                        userItem.style.borderLeft = '4px solid #1976d2';
                        
                        // Carrega detalhes do usuário
                        carregarDetalhesUsuario(user, detalhesContainer);
                    });

                    listaUsuarios.appendChild(userItem);

                    // Seleciona o primeiro usuário por padrão
                    if (index === 0) {
                        setTimeout(() => userItem.click(), 100);
                    }
                });

                mainContainer.appendChild(listaContainer);
                mainContainer.appendChild(detalhesContainer);
                containerElement.appendChild(mainContainer);
            } else {
                const msg = document.createElement('p');
                msg.textContent = 'Nenhum usuário cadastrado.';
                msg.className = 'empty-list-message';
                containerElement.appendChild(msg);
            }
        } catch (error) {
            console.error('Erro ao carregar interface de usuários:', error);
            containerElement.innerHTML = '';
            const err = document.createElement('p');
            err.textContent = `Erro ao carregar usuários: ${error.message}`;
            err.className = 'error-message';
            containerElement.appendChild(err);
        }
    }

    // Função para carregar detalhes do usuário no container à direita
    function carregarDetalhesUsuario(user, container) {
        container.innerHTML = `
            <div style="height: 100%; display: flex; flex-direction: row;">
                <!-- Cabeçalho -->
                <div style="padding: 24px 24px 20px 24px; border-bottom: 1px solid #e1e8ed; flex-shrink: 0;">
                    <h2 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 18px;">${user.nome_completo || user.nome_usuario || 'N/A'}</h2>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="status-badge" style="
                            padding: 4px 12px;
                            border-radius: 16px;
                            font-size: 12px;
                            font-weight: 600;
                            text-transform: uppercase;
                            ${user.status === 'Ativo' ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}
                        ">${user.status || 'N/A'}</span>
                        <span style="
                            padding: 4px 12px;
                            border-radius: 16px;
                            font-size: 12px;
                            font-weight: 600;
                            background: #e3f2fd;
                            color: #000;
                            text-transform: uppercase;
                        ">${user.nivel_acesso || 'N/A'}</span>
                    </div>
                </div>

                <!-- Conteúdo Principal -->
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <!-- Informações do usuário -->
                    <div style="flex: 1; overflow-y: auto; padding: 24px;">
                    <div style="display: grid; gap: 20px;">
                        <div class="info-card" style="
                            padding: 20px;
                            border-left: 4px solid #1976d2;
                        ">
                            <h3 style="margin: 0 0 16px 0; color: #000; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" />
                                </svg>
                                Informações Pessoais
                            </h3>
                            <div style="display: grid; gap: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #6c757d; font-weight: 500; font-size: 14px;">Nome Completo:</span>
                                    <span style="color: #2c3e50; font-weight: 600; font-size: 14px;">${user.nome_completo || 'Não informado'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #6c757d; font-weight: 500; font-size: 14px;">Nome de Usuário:</span>
                                    <span style="color: #2c3e50; font-weight: 600; font-size: 14px;">${user.nome_usuario || 'N/A'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #6c757d; font-weight: 500; font-size: 14px;">Email:</span>
                                    <span style="color: #2c3e50; font-weight: 600; font-size: 14px;">${user.email || 'Não informado'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="color: #6c757d; font-weight: 500; font-size: 14px;">ID do Sistema:</span>
                                    <span style="color: #6c757d; font-family: monospace; font-size: 14px;">#${user.id}</span>
                                </div>
                            </div>
                        </div>


                    </div>
                </div>

                <!-- Ações -->
                <div style="width: 200px; padding: 24px; border-left: 1px solid #e1e8ed; display: flex; flex-direction: column; gap: 12px;">
                        <button class="btn-editar-usuario" data-user-id="${user.id}" style="
                            padding: 10px 20px;
                            border: 1px solid #000;
                            background: white;
                            color: #000;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 500;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            transition: all 0.2s ease;
                        ">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
                            </svg>
                            Editar
                        </button>
                        ${(currentUser?.role === 'admin' || currentUser?.role === 'supervisor') && currentUser.id !== user.id ? `
                            <button class="btn-toggle-status" data-user-id="${user.id}" data-current-status="${user.status}" style="
                                padding: 10px 20px;
                                border: 1px solid ${user.status === 'Ativo' ? '#dc3545' : '#28a745'};
                                background: white;
                                color: ${user.status === 'Ativo' ? '#dc3545' : '#28a745'};
                                border-radius: 8px;
                                cursor: pointer;
                                font-weight: 500;
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                transition: all 0.2s ease;
                            ">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="${user.status === 'Ativo' ? 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6Z' : 'M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6Z'}" />
                                </svg>
                                ${user.status === 'Ativo' ? 'Inativar' : 'Ativar'}
                            </button>
                            <button class="btn-excluir-usuario" data-user-id="${user.id}" style="
                                padding: 10px 20px;
                                border: 1px solid #dc3545;
                                background: white;
                                color: #dc3545;
                                border-radius: 8px;
                                cursor: pointer;
                                font-weight: 500;
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                transition: all 0.2s ease;
                            ">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                                </svg>
                                Excluir
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        // Adicionar event listeners para os botões
        const btnEditar = container.querySelector('.btn-editar-usuario');
        if (btnEditar) {
            btnEditar.addEventListener('click', () => {
                abrirModalCadastroUsuario(user.id);
            });
            btnEditar.addEventListener('mouseenter', () => {
                btnEditar.style.background = '#000';
                btnEditar.style.color = 'white';
            });
            btnEditar.addEventListener('mouseleave', () => {
                btnEditar.style.background = 'white';
                btnEditar.style.color = '#000';
            });
        }

        const btnToggleStatus = container.querySelector('.btn-toggle-status');
        if (btnToggleStatus) {
            btnToggleStatus.addEventListener('click', async () => {
                const userId = btnToggleStatus.dataset.userId;
                const currentStatus = btnToggleStatus.dataset.currentStatus;
                const newStatus = currentStatus === 'Ativo' ? 'Inativo' : 'Ativo';
                const userName = user.nome_completo || user.nome_usuario;
                
                if (confirm(`${newStatus === 'Ativo' ? 'Ativar' : 'Inativar'} usuário ${userName}?`)) {
                    btnToggleStatus.disabled = true;
                    try {
                        const currentUserDataFromDB = await window.electronAPI.getUserById(userId);
                        if (!currentUserDataFromDB) throw new Error("Usuário não encontrado para atualizar status.");

                        const updateData = {
                            nomeUsuario: currentUserDataFromDB.nome_usuario,
                            nivelAcesso: currentUserDataFromDB.nivel_acesso,
                            nomeCompleto: currentUserDataFromDB.nome_completo,
                            email: currentUserDataFromDB.email,
                            status: newStatus
                        };

                        if (!window.electronAPI?.updateUser) throw new Error('API updateUser indisponível');
                        const res = await window.electronAPI.updateUser(userId, updateData);

                        if (res?.success) {
                            showStatusMessage(res.message || `Status atualizado!`, 'success');
                            // Recarregar a interface
                            const mainContainer = container.closest('.usuarios-modern-container');
                            if (mainContainer) {
                                carregarInterfaceUsuariosModerna(mainContainer.parentElement);
                            }
                        } else {
                            showStatusMessage(`Erro: ${res?.message || 'Erro desconhecido.'}`, 'error');
                        }
                    } catch (err) {
                        showStatusMessage(`Erro ao alterar status: ${err.message}`, 'error');
                    } finally {
                        btnToggleStatus.disabled = false;
                    }
                }
            });
            
            const isActive = user.status === 'Ativo';
            btnToggleStatus.addEventListener('mouseenter', () => {
                btnToggleStatus.style.background = isActive ? '#dc3545' : '#28a745';
                btnToggleStatus.style.color = 'white';
            });
            btnToggleStatus.addEventListener('mouseleave', () => {
                btnToggleStatus.style.background = 'white';
                btnToggleStatus.style.color = isActive ? '#dc3545' : '#28a745';
            });
        }

        const btnExcluir = container.querySelector('.btn-excluir-usuario');
        if (btnExcluir) {
            btnExcluir.addEventListener('click', async () => {
                const userId = btnExcluir.dataset.userId;
                const userName = user.nome_completo || user.nome_usuario;
                
                if (confirm(`Excluir usuário ${userName}? Esta ação não pode ser desfeita.`)) {
                    try {
                        if (!window.electronAPI?.deleteUser) throw new Error('API deleteUser indisponível');
                        const res = await window.electronAPI.deleteUser(userId);
                        
                        if (res?.success) {
                            showStatusMessage(res.message || 'Usuário excluído!', 'success');
                            // Recarregar a interface
                            const mainContainer = container.closest('.usuarios-modern-container');
                            if (mainContainer) {
                                carregarInterfaceUsuariosModerna(mainContainer.parentElement);
                            }
                        } else {
                            showStatusMessage(`Erro: ${res?.message || 'Erro desconhecido.'}`, 'error');
                        }
                    } catch (err) {
                        showStatusMessage(`Erro: ${err.message}`, 'error');
                    }
                }
            });
            btnExcluir.addEventListener('mouseenter', () => {
                btnExcluir.style.background = '#dc3545';
                btnExcluir.style.color = 'white';
            });
            btnExcluir.addEventListener('mouseleave', () => {
                btnExcluir.style.background = 'white';
                btnExcluir.style.color = '#dc3545';
            });
        }
    }

    async function buscarEExibirUsuarios(containerElement) {
        console.log('Renderer: Chamando electronAPI.getUsers() com condominio_id:', currentUser?.condominio_id);
        containerElement.innerHTML = '<p>Carregando usuários...</p>';
               try {
            if (!window.electronAPI?.getUsers) throw new Error('API getUsers indisponível.');
            const usuarios = await window.electronAPI.getUsers(currentUser?.condominio_id);
            containerElement.innerHTML = '';

            if (Array.isArray(usuarios)) {
                if (usuarios.length > 0) {
                    const table = document.createElement('table');
                    table.className = 'porteiros-table';
                    const thead = table.createTHead();
                    const headerRow = thead.insertRow();
                    const headers = ['Nome Completo', 'Usuário (Login)', 'Email', 'Nível', 'Status', 'Ações'];
                    headers.forEach(text => { const th = document.createElement('th'); th.textContent = text; headerRow.appendChild(th); });

                    const tbody = table.createTBody();
                    usuarios.forEach(user => {
                        const row = tbody.insertRow();
                        row.dataset.userId = user.id;
                        row.insertCell().textContent = user.nome_completo || 'N/A';
                        row.insertCell().textContent = user.nome_usuario || 'N/A';
                        row.insertCell().textContent = user.email || 'N/A';
                        row.insertCell().textContent = user.nivel_acesso || 'N/A';
                        const statusCell = row.insertCell();
                        statusCell.textContent = user.status || 'N/A';
                        statusCell.className = `status-${(user.status || '').toLowerCase()}`;

                        const actionsCell = row.insertCell();
                        actionsCell.className = 'porteiro-actions';

                        // Ícone de Editar
                        const btnEditar = document.createElement('button');
                        btnEditar.className = 'user-action-icon';
                        btnEditar.title = 'Editar usuário';
                        btnEditar.dataset.id = user.id;
                        btnEditar.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="edit"><path fill="currentColor" d="M7,12.2578125V16.5c0,0.0001831,0,0.0003662,0,0.0005493C7.0001831,16.7765503,7.223999,17.0001831,7.5,17h4.2421875c0.1326294,0,0.2597656-0.0526733,0.3535156-0.1464844l6.9262085-6.9276733c0.0012817-0.0012207,0.0031128-0.0016479,0.0043335-0.0028687c0.0012817-0.0012817,0.0015869-0.0029907,0.0028076-0.0042725l2.8244629-2.8250122c0,0,0.000061-0.000061,0.0001221-0.0001221c0.1951294-0.1952515,0.1950684-0.5117188-0.0001221-0.7068481l-4.2402344-4.2402344c-0.000061-0.000061-0.0001221-0.0001221-0.0001831-0.0001831c-0.1952515-0.1951294-0.5117188-0.1950684-0.7068481,0.0001831l-9.7597656,9.7578125C7.0526733,11.9980469,7,12.1251831,7,12.2578125z M17.2597656,3.2069702l3.5332642,3.5332642l-2.1209106,2.1213379l-3.5336914-3.5336914L17.2597656,3.2069702z M8,12.4648438l6.4313354-6.4299927l3.5338135,3.5338135L11.5351562,16H8V12.4648438z M21.5,12c-0.276123,0-0.5,0.223877-0.5,0.5V19c-0.0014038,1.1040039-0.8959961,1.9985962-2,2H5c-1.1040039-0.0014038-1.9985962-0.8959961-2-2V5c0.0014038-1.1040039,0.8959961-1.9985962,2-2h6.5C11.776123,3,12,2.776123,12,2.5S11.776123,2,11.5,2H5C3.3438721,2.0018311,2.0018311,3.3438721,2,5v14c0.0018311,1.6561279,1.3438721,2.9981689,3,3h14c1.6561279-0.0018311,2.9981689-1.3438721,3-3v-6.5C22,12.223877,21.776123,12,21.5,12z"></path></svg>';
                        btnEditar.addEventListener('click', () => {
                            abrirModalCadastroUsuario(user.id);
                        });
                        actionsCell.appendChild(btnEditar);

                        if ((currentUser?.role === 'admin' || currentUser?.role === 'supervisor') && currentUser.id !== user.id) {
                            // Toggle Switch para Status
                            const toggleContainer = document.createElement('label');
                            toggleContainer.className = 'toggle-switch';
                            toggleContainer.title = user.status === 'Ativo' ? 'Inativar usuário' : 'Ativar usuário';
                            
                            const toggleInput = document.createElement('input');
                            toggleInput.type = 'checkbox';
                            toggleInput.checked = user.status === 'Ativo';
                            toggleInput.dataset.id = user.id;
                            
                            const toggleSlider = document.createElement('span');
                            toggleSlider.className = 'toggle-slider';
                            
                            toggleContainer.appendChild(toggleInput);
                            toggleContainer.appendChild(toggleSlider);
                            
                            toggleInput.addEventListener('change', async (e) => {
                                const checkbox = e.target;
                                const userIdToToggle = checkbox.dataset.id;
                                const statusToGo = checkbox.checked ? 'Ativo' : 'Inativo';
                                const userName = user.nome_completo || user.nome_usuario;
                                
                                if (confirm(`${checkbox.checked ? 'Ativar' : 'Inativar'} usuário ${userName}?`)) {
                                    checkbox.disabled = true;
                                    try {
                                        const currentUserDataFromDB = await window.electronAPI.getUserById(userIdToToggle);
                                        if (!currentUserDataFromDB) throw new Error("Usuário não encontrado para atualizar status.");

                                        const updateData = {
                                            nomeUsuario: currentUserDataFromDB.nome_usuario,
                                            nivelAcesso: currentUserDataFromDB.nivel_acesso,
                                            nomeCompleto: currentUserDataFromDB.nome_completo,
                                            email: currentUserDataFromDB.email,
                                            status: statusToGo
                                        };

                                        if (!window.electronAPI?.updateUser) throw new Error('API updateUser indisponível');
                                        const res = await window.electronAPI.updateUser(userIdToToggle, updateData);

                                        if (res?.success) {
                                            showStatusMessage(res.message || `Status atualizado!`, 'success');
                                            statusCell.textContent = statusToGo;
                                            statusCell.className = `status-${statusToGo.toLowerCase()}`;
                                            toggleContainer.title = statusToGo === 'Ativo' ? 'Inativar usuário' : 'Ativar usuário';
                                            user.status = statusToGo;
                                        } else {
                                            showStatusMessage(`Erro: ${res?.message || 'Erro desconhecido.'}`, 'error');
                                            checkbox.checked = !checkbox.checked; // Reverte o estado
                                        }
                                    } catch (err) {
                                        showStatusMessage(`Erro ao alterar status: ${err.message}`, 'error');
                                        checkbox.checked = !checkbox.checked; // Reverte o estado
                                    } finally {
                                        checkbox.disabled = false;
                                    }
                                } else {
                                    checkbox.checked = !checkbox.checked; // Reverte o estado se cancelar
                                }
                            });
                            actionsCell.appendChild(toggleContainer);
                        }

                        if ((currentUser?.role === 'admin' || currentUser?.role === 'supervisor') && currentUser.id !== user.id) {
                            // Ícone de Excluir
                            const btnDel = document.createElement('button');
                            btnDel.className = 'user-action-icon';
                            btnDel.title = 'Excluir usuário';
                            btnDel.dataset.id = user.id;
                            btnDel.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="user-times"><path fill="currentColor" d="M14.3792725,13.3696899C15.9318237,12.5210571,16.9978027,10.8936157,17,9c0-2.7614136-2.2385864-5-5-5S7,6.2385864,7,9c0,1.8936157,1.0650635,3.5214233,2.6171265,4.3700562c-3.0588379,0.9574585-5.3679199,3.706665-5.5907593,7.0967407c-0.0181885,0.2755737,0.1903076,0.5137329,0.4658203,0.5322266c0.0112305,0.0011597,0.0224609,0.0018921,0.0336914,0.0022583c0.2669067,0.0084229,0.4901123-0.2011719,0.4985352-0.4680786c0.2295532-3.5004272,3.0177612-6.2886963,6.5181885-6.5181885c3.8525391-0.2526245,7.1804199,2.6656494,7.4329834,6.5181885C18.9933472,20.7957764,19.2114258,20.9998169,19.4746094,21c0.0107422,0,0.0214844,0,0.0332031-0.0009766c0.2755737-0.0184937,0.4840088-0.2566528,0.4658203-0.5322266C19.7530518,17.1099243,17.4705811,14.3337402,14.3792725,13.3696899z M12,13c-2.2091675,0-4-1.7908325-4-4s1.7908325-4,4-4c2.208252,0.0021973,3.9978027,1.791748,4,4C16,11.2091675,14.2091675,13,12,13z M23.3534546,13.6465454L22.2069092,12.5l1.1465454-1.1465454c0.1871948-0.1937256,0.1871948-0.5009155,0-0.6947021c-0.1918335-0.1986084-0.5083618-0.2041016-0.7069702-0.0122681l-1.1465454,1.1465454l-1.1464844-1.1464844c-0.1937256-0.1871948-0.5009155-0.1871948-0.6947021,0c-0.1986084,0.1918335-0.2041016,0.5083618-0.0122681,0.7069702L20.7929688,12.5l-1.1464844,1.1464844c-0.09375,0.09375-0.1464233,0.2208862-0.1464233,0.3534546c0,0.276123,0.2238159,0.5,0.499939,0.500061c0.1326294,0.0001221,0.2598267-0.0526123,0.3534546-0.1465454l1.1464844-1.1464844l1.1465454,1.1465454C22.7401123,14.4474487,22.8673706,14.5001831,23,14.5c0.1325073-0.000061,0.2595825-0.0526733,0.3533325-0.1463623C23.548645,14.1583862,23.5487061,13.8417969,23.3534546,13.6465454z"></path></svg>';
                            btnDel.addEventListener('click', async (e) => {
                                const userIdToDelete = e.currentTarget.dataset.id;
                                const userName = user.nome_completo || user.nome_usuario;
                                if (confirm(`Excluir usuário ${userName}? Esta ação não pode ser desfeita.`)) {
                                    try {
                                        if (!window.electronAPI?.deleteUser) throw new Error('API deleteUser indisponível');
                                        const res = await window.electronAPI.deleteUser(userIdToDelete);
                                        if (res?.success) { showStatusMessage(res.message || 'Excluído!', 'success'); containerElement.querySelector(`tr[data-user-id="${userIdToDelete}"]`)?.remove(); }
                                        else { showStatusMessage(`Erro: ${res?.message || 'Erro desconhecido.'}`, 'error'); }
                                    } catch (err) { showStatusMessage(`Erro: ${err.message}`, 'error'); }
                                }
                            });
                            actionsCell.appendChild(btnDel);
                        }
                    });
                    containerElement.appendChild(table);
                } else { const msg = document.createElement('p'); msg.textContent = 'Nenhum usuário cadastrado.'; msg.className = 'empty-list-message'; containerElement.appendChild(msg); }
            } else { throw new Error('Resposta inesperada (usuários).'); }
        } catch (error) { console.error('Erro buscar/exibir usuários:', error); containerElement.innerHTML = ''; const err = document.createElement('p'); err.textContent = `Erro ao carregar usuários: ${error.message}`; err.className = 'error-message'; containerElement.appendChild(err); }
    }
// --- Funções duplicadas removidas - agora estão no início do arquivo ---

function abrirModalEntrega(packageId, moradorNome) {
        // Verifica se é entrega em lote (packageId é array) ou individual
        const isMultiple = Array.isArray(packageId);
        const packageIds = isMultiple ? packageId : [packageId];
        
        console.log(`[Renderer] Abrindo modal de entrega para ${isMultiple ? 'múltiplas' : 'única'} encomenda(s):`, packageIds, `Morador: ${moradorNome}`);
        
        if (!modalEntregaEncomenda || !formEntregaEncomenda || !entregaEncomendaIdInput || !entregaMoradorInfoInput || !entregaDataInput || !entregaHoraInput || !inputEntregaPorteiro) {
            console.error("Elementos do modal de entrega não encontrados!");
            showStatusMessage("Erro ao abrir modal de entrega.", "error");
            return;
        }

        // Garante que outros modais estejam fechados (código mantido)
        if (modalCadastroEncomenda?.classList.contains('active')) fecharModalEncomenda();
        if (modalCadastroMorador?.classList.contains('active')) fecharModalMorador();
        if (modalCadastroUsuario?.classList.contains('active')) fecharModalCadastroUsuario();
        if (modalCadastroEncomenda) modalCadastroEncomenda.style.display = 'none';
        if (modalCadastroMorador) modalCadastroMorador.style.display = 'none';
        if (modalCadastroUsuario) modalCadastroUsuario.style.display = 'none';
        
        formEntregaEncomenda.reset();
        selectedEntregaPorteiroId = null;
        if (suggestionsEntregaPorteiroDiv) suggestionsEntregaPorteiroDiv.classList.remove('visible');
        
        // Remove ícones de validação
        const validationGroups = modalEntregaEncomenda.querySelectorAll('.form-group.has-validation');
        validationGroups.forEach(group => {
            group.classList.remove('has-validation');
            const validationIcon = group.querySelector('.validation-icon');
            if (validationIcon) {
                validationIcon.classList.remove('show');
            }
        });
        
        // Armazena os IDs das encomendas (array JSON ou ID único)
        // Garante que os IDs sejam números inteiros
        if (isMultiple) {
            const numericIds = packageIds.map(id => parseInt(id, 10));
            entregaEncomendaIdInput.value = JSON.stringify(numericIds);
        } else {
            const numericId = parseInt(packageId, 10);
            entregaEncomendaIdInput.value = numericId.toString();
        }
        
        // Atualiza o título do modal para refletir se é entrega individual ou em lote
        const modalTitle = document.getElementById('modal-entrega-title');
        if (modalTitle) {
            modalTitle.textContent = isMultiple 
                ? `Registrar entrega em lote (${packageIds.length} encomendas)`
                : 'Registrar entrega de encomenda';
        }
        
        entregaMoradorInfoInput.value = isMultiple 
            ? `${moradorNome} (${packageIds.length} encomendas)`
            : moradorNome || 'N/A';

        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        entregaDataInput.value = `${ano}-${mes}-${dia}`;
        const hora = String(agora.getHours()).padStart(2, '0');
        const minuto = String(agora.getMinutes()).padStart(2, '0');
       
        entregaHoraInput.value = `${hora}:${minuto}`;

        if (currentUser && inputEntregaPorteiro) {
            // Corrigido: usar o nome correto do campo do usuário
            inputEntregaPorteiro.value = currentUser.nome_completo || currentUser.name || '';
            selectedEntregaPorteiroId = currentUser.id;
        } else if (inputEntregaPorteiro) {
            inputEntregaPorteiro.value = '';
        }
        
        modalEntregaEncomenda.style.display = 'flex';
        modalEntregaEncomenda.classList.add('active');

        // Força o reflow do navegador e garante que o modal seja renderizado
        void modalEntregaEncomenda.offsetWidth;
        
        // Pequeno delay para garantir que o modal esteja totalmente visível antes de focar
        setTimeout(() => {
            // Foca na janela principal primeiro
            if (window.electronAPI?.focusMainWindow) {
                window.electronAPI.focusMainWindow();
            }
            
            // Depois foca no campo de input
            setTimeout(() => {
                if (inputEntregaPorteiro) {
                    inputEntregaPorteiro.focus();
                    inputEntregaPorteiro.click(); // Força o cursor no campo
                    console.log("[Renderer] Foco aplicado no inputEntregaPorteiro");
                }
            }, 100);
        }, 150);
    }

function fecharModalEntrega() {
    if (modalEntregaEncomenda) {
        modalEntregaEncomenda.classList.remove('active');
        modalEntregaEncomenda.style.display = 'none';
       

        if (suggestionsEntregaPorteiroDiv) suggestionsEntregaPorteiroDiv.classList.remove('visible');
        const statusMsg = document.getElementById('status-message'); // Pega msg de status global
        if (statusMsg) statusMsg.style.display = 'none'; // Esconde msg ao fechar modal
    }
}

async function handleEntregaPorterInput() {
    if (!inputEntregaPorteiro || !window.electronAPI?.searchActivePorters) return;
    const term = inputEntregaPorteiro.value;
    console.log(`[DEBUG Autocomplete Entrega] handleEntregaPorterInput called. Term: "${term}"`);
    
    // Limpa seleção anterior e remove ícone de validação
    selectedEntregaPorteiroId = null;
    const formGroup = inputEntregaPorteiro.closest('.form-group');
    if (formGroup) {
        formGroup.classList.remove('has-validation');
        const validationIcon = formGroup.querySelector('.validation-icon');
        if (validationIcon) {
            validationIcon.classList.remove('show');
        }
    }
    
    if (term?.length >= 1) {
        try {
            console.log('[DEBUG Autocomplete Entrega] Calling API searchActivePorters...');
            const res = await window.electronAPI.searchActivePorters(term, currentUser?.condominio_id);
            console.log('[DEBUG Autocomplete Entrega] API searchActivePorters response:', res);
            displayEntregaPorterSuggestions(res);
        } catch (err) {
            console.error('[DEBUG Autocomplete Entrega] Error calling searchActivePorters:', err);
            if (suggestionsEntregaPorteiroDiv) suggestionsEntregaPorteiroDiv.classList.remove('visible');
        }
    } else {
        if (suggestionsEntregaPorteiroDiv) suggestionsEntregaPorteiroDiv.classList.remove('visible');
        selectedEntregaPorteiroId = null; // Limpa se o campo estiver vazio
    }
}

function displayEntregaPorterSuggestions(suggestions) {
    if (!suggestionsEntregaPorteiroDiv) {
        console.error("[DEBUG Autocomplete Entrega] Elemento suggestionsEntregaPorteiroDiv não encontrado!");
        return;
    }
    console.log('[DEBUG Autocomplete Entrega] displayEntregaPorterSuggestions received:', suggestions);
    suggestionsEntregaPorteiroDiv.innerHTML = '';

    if (suggestions?.length > 0) {
        suggestions.forEach(user => { // 'user' em vez de 'p' para clareza
            try {
                if (!user || typeof user.id === 'undefined' || typeof user.nome === 'undefined') {
                    console.warn("[DEBUG Autocomplete Entrega] Item de sugestão inválido recebido (Porteiro):", user);
                    return;
                }
                const div = document.createElement('div');
                div.textContent = user.nome;
                div.className = 'suggestion-item';
                div.dataset.id = user.id;
                div.dataset.name = user.nome;
                // Event listeners para mouse
                div.addEventListener('mouseenter', () => {
                    updateEntregaPorteiroSuggestionSelection(suggestionsEntregaPorteiroDiv.querySelectorAll('.suggestion-item'), Array.from(suggestionsEntregaPorteiroDiv.children).indexOf(div));
                });
                
                div.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
                
                div.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (inputEntregaPorteiro) inputEntregaPorteiro.value = user.nome;
                    selectedEntregaPorteiroId = user.id;
                    console.log(`Porteiro da Entrega selecionado: ${user.nome} (User ID: ${user.id})`);
                    suggestionsEntregaPorteiroDiv.classList.remove('visible');
                    suggestionsEntregaPorteiroDiv.innerHTML = '';
                    
                    // Mostrar ícone de validação
                    const formGroup = inputEntregaPorteiro.closest('.form-group');
                    if (formGroup) {
                        formGroup.classList.add('has-validation');
                        const validationIcon = formGroup.querySelector('.validation-icon');
                        if (validationIcon) {
                            validationIcon.classList.add('show');
                        }
                    }
                });
                suggestionsEntregaPorteiroDiv.appendChild(div);
            } catch (loopError) {
                console.error("[DEBUG Autocomplete Entrega] Erro dentro do loop displayEntregaPorterSuggestions:", loopError, "Item:", user);
            }
        });

        if (suggestionsEntregaPorteiroDiv.children.length > 0) {
            suggestionsEntregaPorteiroDiv.classList.add('visible');
            console.log('[DEBUG Autocomplete Entrega] Entrega Porter suggestions displayed (com itens no DOM).');
        } else {
            suggestionsEntregaPorteiroDiv.classList.remove('visible');
            console.log('[DEBUG Autocomplete Entrega] Nenhum item de sugestão de porteiro (entrega) foi adicionado ao DOM.');
        }
    } else {
        suggestionsEntregaPorteiroDiv.classList.remove('visible');
        console.log('[DEBUG Autocomplete Entrega] No Entrega Porter suggestions to display.');
    }
}

function updateEntregaPorteiroSuggestionSelection(suggestions, selectedIndex) {
    suggestions.forEach((item, index) => {
        if (index === selectedIndex) {
            item.classList.add('highlighted');
        } else {
            item.classList.remove('highlighted');
        }
    });
}

// Adicione estes listeners na seção "Ouvintes de Evento Globais",
// perto dos outros listeners de autocomplete
if (inputEntregaPorteiro) {
    inputEntregaPorteiro.addEventListener('input', handleEntregaPorterInput);
    inputEntregaPorteiro.addEventListener('blur', () => {
        setTimeout(() => {
            // Apenas esconde se o foco não foi para um item da própria lista.
            // A seleção do item já esconde a lista.
            const focusedElement = document.activeElement;
            if (!focusedElement || !focusedElement.closest('#entrega-porteiro-suggestions .suggestion-item')) {
                if (suggestionsEntregaPorteiroDiv) suggestionsEntregaPorteiroDiv.classList.remove('visible');
            }
        }, 200);
    });
    
    // Navegação por teclado para sugestões de entrega de porteiro
    inputEntregaPorteiro.addEventListener('keydown', (e) => {
        const suggestions = suggestionsEntregaPorteiroDiv?.querySelectorAll('.suggestion-item');
        if (!suggestions || suggestions.length === 0) return;
        
        let selectedIndex = -1;
        suggestions.forEach((item, index) => {
            if (item.classList.contains('highlighted')) {
                selectedIndex = index;
            }
        });
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % suggestions.length;
            updateEntregaPorteiroSuggestionSelection(suggestions, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
            updateEntregaPorteiroSuggestionSelection(suggestions, selectedIndex);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            suggestions[selectedIndex].click();
        } else if (e.key === 'Escape') {
            suggestionsEntregaPorteiroDiv.classList.remove('visible');
        }
    });
}
    // --- Ouvintes de Evento Globais ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = usernameInput?.value?.trim();
            const password = passwordInput?.value;

            if (!username || !password) {
                showLoginError('Por favor, preencha todos os campos.');
                return;
            }

            try {
                if (!window.electronAPI?.loginUser) {
                    showLoginError('Erro: API de login não disponível.');
                    return;
                }

                const result = await window.electronAPI.loginUser({ username, password });
                
                if (result.success && result.user) {
                    console.log('[Renderer] Login bem-sucedido:', result.user);
                    currentUser = result.user;
                    if (window.setUserSession) {
                        window.setUserSession(result.user);
                    }
                    if (window.setCurrentCondominio && result.user.condominio_id) {
                        window.setCurrentCondominio(result.user.condominio_id);
                    }
                    // Atualizar campo de usuário no modo lote se estiver carregado
                    atualizarCampoUsuarioLote();
                    // Notificar observador se existir
                    if (window.currentUserObserver && window.currentUserObserver.update) {
                        window.currentUserObserver.update();
                    }
                    showAppScreen();
                    showStatusMessage(`Bem-vindo, ${result.user.name}!`, 'success');
                } else {
                    showLoginError(result.message || 'Erro ao fazer login.');
                }
            } catch (error) {
                console.error('[Renderer] Erro no login:', error);
                showLoginError('Erro interno. Verifique a configuração do banco.');
            }
        });    }

    // Event listener para o formulário de encomendas
    if (formCadastroEncomenda) {
        formCadastroEncomenda.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('[Form Submit] Formulário de encomenda enviado');
            
            // Verificar se estamos em modo de edição ou cadastro
            const hiddenEncomendaIdInput = document.getElementById('encomenda-id');
            const encomendaId = hiddenEncomendaIdInput?.value?.trim();
            const isEditMode = encomendaId && encomendaId !== '';
            
            console.log(`[Form Submit] Modo: ${isEditMode ? 'Edição' : 'Cadastro'}, ID: ${encomendaId || 'N/A'}`);
            
            // Coletar dados do formulário
            const formData = new FormData(formCadastroEncomenda);
            const moradorValue = formData.get('morador')?.toString().trim();
            const porteiroValue = formData.get('porteiro')?.toString().trim();
            const quantidade = parseInt(formData.get('quantidade')?.toString() || '1', 10);
            const data = formData.get('data')?.toString();
            const hora = formData.get('hora')?.toString();
            const observacoes = formData.get('observacoes')?.toString().trim();
            
            // Validação básica
            if (!moradorValue || !porteiroValue || !data || !hora || quantidade < 1) {
                showStatusMessage('Por favor, preencha todos os campos obrigatórios.', 'error');
                return;
            }
            
            if (!selectedMoradorId) {
                showStatusMessage('Por favor, selecione um morador válido da lista de sugestões.', 'error');
                if (inputMorador) {
                    inputMorador.focus();
                    inputMorador.style.borderColor = '#f44336';
                    setTimeout(() => {
                        inputMorador.style.borderColor = '';
                    }, 3000);
                }
                return;
            }
            
            if (!selectedPorteiroUserId) {
                showStatusMessage('Por favor, selecione um porteiro válido da lista de sugestões.', 'error');
                if (inputPorteiro) {
                    inputPorteiro.focus();
                    inputPorteiro.style.borderColor = '#f44336';
                    setTimeout(() => {
                        inputPorteiro.style.borderColor = '';
                    }, 3000);
                }
                return;
            }
            
            // Montar objeto de dados
            const packageData = {
                moradorId: selectedMoradorId,
                porteiroUserId: selectedPorteiroUserId,
                quantidade: quantidade,
                dataRecebimento: window.DateUtilsClient.toSupabaseFormat(data, hora),
                observacoes: observacoes || null
            };
            
            console.log('[Form Submit] Dados coletados:', packageData);
            
            try {
                let result;
                
                if (isEditMode) {
                    // Modo edição - chama updatePackage
                    console.log('[Form Submit] Chamando updatePackage...');
                    if (!window.electronAPI?.updatePackage) {
                        throw new Error('API updatePackage não disponível');
                    }
                    result = await window.electronAPI.updatePackage(encomendaId, packageData);
                } else {
                    // Modo cadastro - chama savePackage
                    console.log('[Form Submit] Chamando savePackage...');
                    if (!window.electronAPI?.savePackage) {
                        throw new Error('API savePackage não disponível');
                    }
                    result = await window.electronAPI.savePackage(packageData);
                }
                
                console.log('[Form Submit] Resultado:', result);
                
                if (result?.success) {
                    const message = isEditMode ? 'Encomenda atualizada com sucesso!' : 'Encomenda cadastrada com sucesso!';
                    showStatusMessage(message, 'success');
                    fecharModalEncomenda();
                    
                    // Atualizar automaticamente a lista de encomendas
                    atualizarListaEncomendas();
                } else {
                    const errorMessage = result?.message || 'Erro desconhecido ao processar encomenda';
                    showStatusMessage(errorMessage, 'error');
                }
                
            } catch (error) {
                console.error('[Form Submit] Erro:', error);
                showStatusMessage(`Erro ao processar encomenda: ${error.message}`, 'error');
            }        });
    }    // Event listener para o formulário de entrega
    if (formEntregaEncomenda) {
        formEntregaEncomenda.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('[Form Submit] Formulário de entrega enviado');
            
            try {
                // Coletar dados do formulário
                const formData = new FormData(formEntregaEncomenda);
                const packageIds = entregaEncomendaIdInput?.value?.trim();
                const porteiroEntrega = formData.get('entregaPorteiro')?.toString().trim();
                const dataEntrega = formData.get('entregaData')?.toString();
                const horaEntrega = formData.get('entregaHora')?.toString();
                const retiradoPor = formData.get('entregaRetiradoPor')?.toString().trim();
                const observacoesEntrega = formData.get('entregaObservacoes')?.toString().trim();
                
                console.log('[Form Submit] Dados coletados:', {
                    packageIds,
                    porteiroEntrega,
                    dataEntrega,
                    horaEntrega,
                    retiradoPor,
                    observacoesEntrega,
                    selectedEntregaPorteiroId
                });
                
                // Validação básica
                if (!packageIds || !porteiroEntrega || !dataEntrega || !horaEntrega) {
                    showStatusMessage('Por favor, preencha todos os campos obrigatórios.', 'error');
                    return;
                }
                
                // Se não há selectedEntregaPorteiroId, tentar buscar o porteiro pelo nome
                let porteiroId = selectedEntregaPorteiroId;
                if (!porteiroId && porteiroEntrega) {
                    console.log('[Form Submit] Tentando buscar porteiro pelo nome:', porteiroEntrega);
                    try {
                        const searchResult = await window.electronAPI.searchActivePorters(porteiroEntrega, currentUser?.condominio_id);
                        const porteiroEncontrado = searchResult?.find(p => 
                            p.nome?.toLowerCase() === porteiroEntrega.toLowerCase()
                        );
                        if (porteiroEncontrado) {
                            porteiroId = porteiroEncontrado.id;
                            console.log('[Form Submit] Porteiro encontrado pelo nome:', porteiroEncontrado);
                        }
                    } catch (error) {
                        console.error('[Form Submit] Erro ao buscar porteiro:', error);
                    }
                }
                  if (!porteiroId) {
                    showStatusMessage('Por favor, selecione um porteiro válido da lista ou verifique se o nome está correto.', 'error');
                    return;
                }
                
                // Montar objeto de dados para entrega com o porteiroId validado
                const deliveryData = {
                    porteiroEntregouId: porteiroId,
                    dataEntrega: window.DateUtilsClient.toSupabaseFormat(dataEntrega, horaEntrega),
                    retiradoPorNome: retiradoPor || null,
                    observacoesEntrega: observacoesEntrega || null
                };
                
                console.log('[Form Submit] Dados de entrega montados:', deliveryData);
                  // Verificar se é entrega múltipla ou individual
                let isMultiple = false;
                let packageIdsList = [];
                try {
                    packageIdsList = JSON.parse(packageIds);
                    isMultiple = Array.isArray(packageIdsList);
                    // Garante que os IDs sejam números inteiros
                    packageIdsList = packageIdsList.map(id => parseInt(id, 10));
                } catch {
                    // Se não é JSON, é um ID único - converte para número
                    const singleId = parseInt(packageIds, 10);
                    if (isNaN(singleId)) {
                        throw new Error('ID da encomenda inválido');
                    }
                    packageIdsList = [singleId];
                    isMultiple = false;
                }
                
                console.log('[Form Submit] PackageIds processados:', {
                    original: packageIds,
                    processed: packageIdsList,
                    isMultiple
                });
                
                let result;
                  if (isMultiple) {
                    // Entrega em lote - processar cada encomenda individualmente
                    console.log('[Form Submit] Processando entrega em lote...');
                    console.log('[Form Submit] IDs para entrega em lote:', packageIdsList);
                    
                    const deliveryPromises = packageIdsList.map((packageId, index) => {
                        console.log(`[Form Submit] Enviando entrega ${index + 1}: ID ${packageId}, tipo: ${typeof packageId}`);
                        return window.electronAPI.deliverPackage(packageId, deliveryData);
                    });
                    
                    const results = await Promise.all(deliveryPromises);
                    console.log('[Form Submit] Resultados da entrega em lote:', results);
                    
                    const allSuccessful = results.every(res => res?.success);
                    
                    if (allSuccessful) {
                        result = { success: true, message: `${packageIdsList.length} encomendas entregues com sucesso!` };
                    } else {
                        const failedCount = results.filter(res => !res?.success).length;
                        const failedMessages = results.filter(res => !res?.success).map(res => res?.message).join('; ');
                        result = { 
                            success: false, 
                            message: `Erro: ${failedCount} de ${packageIdsList.length} entregas falharam. Detalhes: ${failedMessages}` 
                        };
                    }
                } else {
                    // Entrega individual
                    console.log('[Form Submit] Processando entrega individual...');
                    console.log('[Form Submit] ID para entrega individual:', packageIdsList[0], 'tipo:', typeof packageIdsList[0]);
                    
                    if (!window.electronAPI?.deliverPackage) {
                        throw new Error('API de entrega não disponível.');
                    }
                    result = await window.electronAPI.deliverPackage(packageIdsList[0], deliveryData);
                    console.log('[Form Submit] Resultado da entrega individual:', result);
                }
                  if (result?.success) {
                    showStatusMessage(result.message || 'Entrega registrada com sucesso!', 'success');
                    fecharModalEntrega();
                    
                    // Limpar seleção em lote se existir
                    if (isMultiple) {
                        clearPackageSelection();
                    }
                    
                    // Atualizar automaticamente a lista de encomendas
                    atualizarListaEncomendas();
                } else {
                    const errorMessage = result?.message || 'Erro desconhecido ao registrar entrega';
                    showStatusMessage(errorMessage, 'error');
                }
                
            } catch (error) {
                console.error('[Form Submit] Erro na entrega:', error);
                showStatusMessage(`Erro ao registrar entrega: ${error.message}`, 'error');
            }        });
    }

    // Event listener para o formulário de cadastro de morador
    if (formCadastroMorador) {
        formCadastroMorador.addEventListener('submit', async (e) => {
            e.preventDefault();
            const moradorId = document.getElementById('morador-id')?.value?.trim();
            const nome = document.getElementById('morador-nome')?.value?.trim();
            const telefone = document.getElementById('morador-telefone')?.value?.trim();
            const rua = document.getElementById('morador-rua')?.value?.trim();
            const numero = document.getElementById('morador-numero')?.value?.trim();
            const bloco = document.getElementById('morador-bloco')?.value?.trim();
            const apartamento = document.getElementById('morador-apartamento')?.value?.trim();
            const observacoes = document.getElementById('morador-observacoes')?.value?.trim();

            if (!nome || !rua || !numero || !apartamento) {
                showStatusMessage('Preencha todos os campos obrigatórios.', 'error');
                return;
            }

            try {
                let result;
                if (moradorId) {
                    // Edição
                    if (!window.electronAPI?.updateResident) throw new Error('API updateResident não disponível');
                    result = await window.electronAPI.updateResident(moradorId, { nome, telefone, rua, numero, bloco, apartamento, observacoes });
                } else {
                    // Cadastro
                    if (!window.electronAPI?.saveResident) throw new Error('API saveResident não disponível');
                    result = await window.electronAPI.saveResident({ nome, telefone, rua, numero, bloco, apartamento, observacoes });
                }
                if (result?.success) {
                    showStatusMessage(result.message || 'Morador salvo com sucesso!', 'success');
                    fecharModalMorador();
                    // Atualiza lista de moradores se estiver visível
                    const moradoresContent = document.getElementById('moradores-content');
                    if (moradoresContent && moradoresContent.style.display !== 'none') {
                        buscarEExibirMoradores(moradoresContent);
                    }
                } else {
                    showStatusMessage(result?.message || 'Erro ao salvar morador.', 'error');
                }
            } catch (error) {
                console.error('[Form Submit] Erro ao salvar morador:', error);
                showStatusMessage('Erro ao salvar morador: ' + error.message, 'error');
            }        });
    }

    // Event listeners para botões cancelar dos modais
    if (btnCancelarEncomendaModal) {
        btnCancelarEncomendaModal.addEventListener('click', () => {
            fecharModalEncomenda();
        });
    }
    
    if (btnCancelarMoradorModal) {
        btnCancelarMoradorModal.addEventListener('click', () => {
            fecharModalMorador();
        });
    }
    
    if (btnCancelarUsuarioModal) {
        btnCancelarUsuarioModal.addEventListener('click', () => {
            fecharModalCadastroUsuario();
        });
    }
    
    if (btnCancelarEntregaModal) {
        btnCancelarEntregaModal.addEventListener('click', () => {
            fecharModalEntrega();
        });
    }

    // Event listener para o formulário de cadastro de usuário
    if (formCadastroUsuario) {
        formCadastroUsuario.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('[Form Submit] Formulário de usuário enviado');
            
            const usuarioId = document.getElementById('usuario-id')?.value?.trim();
            const nome = document.getElementById('usuario-nome')?.value?.trim();
            const email = document.getElementById('usuario-email')?.value?.trim();
            const senha = document.getElementById('usuario-senha')?.value;
            const senhaConfirm = document.getElementById('usuario-senha-confirm')?.value;
            const nivelAcesso = document.getElementById('usuario-nivel-acesso')?.value || 'porteiro';
            const status = document.getElementById('usuario-status')?.value || 'Ativo';            // Validação básica
            if (!nome) {
                showStatusMessage('Por favor, preencha o nome de usuário.', 'error');
                return;
            }

            // Validação de senha para novo usuário ou quando senha é fornecida
            if (!usuarioId || senha) { // Novo usuário ou alteração de senha
                if (!senha || senha.length < 6) {
                    showStatusMessage('A senha deve ter pelo menos 6 caracteres.', 'error');
                    return;
                }
                if (senha !== senhaConfirm) {
                    showStatusMessage('As senhas não coincidem.', 'error');
                    return;
                }
            }

            try {
                let result;
                  if (usuarioId) {
                    // Edição
                    console.log('[Form Submit] Editando usuário ID:', usuarioId);
                    if (!window.electronAPI?.updateUser) throw new Error('API updateUser não disponível');
                    
                    const updateData = { 
                        nomeUsuario: nome, 
                        nomeCompleto: nome, 
                        email, 
                        nivelAcesso, 
                        status 
                    };
                    if (senha) { // Só inclui senha se foi fornecida
                        updateData.senha = senha;
                    }
                    
                    result = await window.electronAPI.updateUser(usuarioId, updateData);
                } else {                    // Cadastro
                    console.log('[Form Submit] Cadastrando novo usuário');
                    if (!window.electronAPI?.saveUser) throw new Error('API saveUser não disponível');
                    result = await window.electronAPI.saveUser({ 
                        nomeUsuario: nome, 
                        nomeCompleto: nome, 
                        email, 
                        senha, 
                        nivelAcesso 
                    });
                }
                
                console.log('[Form Submit] Resultado do salvamento:', result);
                
                if (result?.success) {
                    const message = usuarioId ? 'Usuário atualizado com sucesso!' : 'Usuário cadastrado com sucesso!';
                    showStatusMessage(message, 'success');
                    fecharModalCadastroUsuario();
                    
                    // Atualiza lista de usuários se estiver visível
                    const usuariosContent = document.getElementById('lista-usuarios-container');
                    if (usuariosContent) {
                        buscarEExibirUsuarios(usuariosContent);
                    }
                } else {
                    showStatusMessage(result?.message || 'Erro ao salvar usuário.', 'error');
                }
            } catch (error) {
                console.error('[Form Submit] Erro ao salvar usuário:', error);
                showStatusMessage('Erro ao salvar usuário: ' + error.message, 'error');
            }
        });
    }

        // Fechar popup ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#topbar-search-bar')) {
                document.getElementById('popup-encomendas')?.remove();
            }
        });
        
        console.log('[Renderer] Event listeners da pesquisa configurados');
    }),
    error => {
        console.warn('[Renderer] Campo de pesquisa não encontrado');                               
    }

    // --- Inicialização dos Gráficos do Dashboard ---
    // Apenas para garantir que a função existe antes de chamar
    if (typeof inicializarGraficos === 'function') 
        {
        inicializarGraficos();
    } else {
        console.warn('Função inicializarGraficos não encontrada');
    }


// Função para inicializar os gráficos do dashboard com dados reais
async function inicializarGraficos() {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js não está carregado. Certifique-se de incluir Chart.js no seu index.html.');
        return;
    }

    // Busca dados raw do backend que agora já vêm filtrados apenas com encomendas pendentes
    let rawData = null;
    if (window.electronAPI?.getDashboardChartRawData) {
        try {
            console.log('[RENDERER] Buscando dados raw dos gráficos...');
            rawData = await window.electronAPI.getDashboardChartRawData();
            console.log('[RENDERER] Dados raw recebidos (APENAS PENDENTES):', rawData);
        } catch (err) {
            console.error('Erro ao buscar dados raw dos gráficos:', err);
        }
    } else {
        console.warn('[RENDERER] API getDashboardChartRawData não disponível');
    }    // --- GRÁFICO DE ENCOMENDAS POR DIA (ÚLTIMOS 15 DIAS) ---
    const ctxDia = document.getElementById('chartEncomendasPorDia');
    if (ctxDia) {
        if (window.chartEncomendasPorDiaInstance) window.chartEncomendasPorDiaInstance.destroy();

        // Gera os últimos 15 dias (YYYY-MM-DD) usando data local
        const hoje = new Date();
        const dias = [];
        for (let i = 14; i >= 0; i--) {
            const d = new Date(hoje);
            d.setDate(hoje.getDate() - i);
            // Usa data local para evitar problemas de timezone
            const ano = d.getFullYear();
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const dia = String(d.getDate()).padStart(2, '0');
            dias.push(`${ano}-${mes}-${dia}`);
        }
        // Labels para o gráfico - CORREÇÃO: adiciona 1 dia para corrigir problema de timezone
        const labels = dias.map(d => {
            const dt = new Date(d);
            // Adiciona 1 dia para corrigir o problema de exibição de datas
            dt.setDate(dt.getDate() + 1);
            return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });
        // Inicializa contagem zerada
        const data = dias.map(() => 0);
        // Preenche com dados reais (que já vêm do backend com quantidade de encomendas somada)
        if (rawData && Array.isArray(rawData.encomendasPorDia)) {
            rawData.encomendasPorDia.forEach(e => {
                // Os dados já vêm do backend com a quantidade total de encomendas por dia
                const dia = e.dia;
                const idx = dias.indexOf(dia);
                if (idx !== -1) {
                    data[idx] = e.total; // Usa o total já calculado no backend (soma das quantidades)
                }
            });
        }
        window.chartEncomendasPorDiaInstance = new Chart(ctxDia, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Pendentes',
                    data,
                    borderColor: '#4070f4',
                    backgroundColor: 'rgba(64, 112, 244, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: 'Dia' } },
                    y: { title: { display: true, text: 'Encomendas Pendentes' }, beginAtZero: true }
                }
            }
        });
    }

    // --- GRÁFICO DE ENCOMENDAS POR MÊS (ÚLTIMOS 12 MESES) ---
    const ctxMes = document.getElementById('chartEncomendasPorMes');
    if (ctxMes) {
        if (window.chartEncomendasPorMesInstance) window.chartEncomendasPorMesInstance.destroy();

        // Gera os últimos 12 meses (YYYY-MM) usando data local
        const hoje = new Date();
        const meses = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(hoje);
            d.setMonth(hoje.getMonth() - i);
            // Usa data local para evitar problemas de timezone
            const ano = d.getFullYear();
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            meses.push(`${ano}-${mes}`);
        }
        // Labels para o gráfico
        const labels = meses.map(m => {
            const [ano, mes] = m.split('-');
            return `${mes}/${ano.slice(2)}`;
        });
        // Inicializa contagem zerada
        const data = meses.map(() => 0);
        // Preenche com dados reais (que já vêm do backend com quantidade de encomendas somada)
        if (rawData && Array.isArray(rawData.encomendasPorMes)) {
            rawData.encomendasPorMes.forEach(e => {
                // Os dados já vêm do backend com a quantidade total de encomendas por mês
                const mes = e.mes;
                const idx = meses.indexOf(mes);
                if (idx !== -1) {
                    data[idx] = e.total; // Usa o total já calculado no backend (soma das quantidades)
                }
            });
        }
        window.chartEncomendasPorMesInstance = new Chart(ctxMes, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Pendentes por mês',
                    data,
                    backgroundColor: '#4070f4',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: 'Mês' } },
                    y: { title: { display: true, text: 'Encomendas Pendentes' }, beginAtZero: true }
                }
            }
        });
    }
}

// Funções auxiliares para gerar dados fictícios
function gerarUltimosDiasLabels(qtd) {
    const labels = [];
    const hoje = new Date();
    for (let i = qtd - 1; i >= 0; i--) {
        const d = new Date(hoje);
        d.setDate(hoje.getDate() - i);
        labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    }
    return labels;
}
function gerarUltimosMesesLabels(qtd) {
    const labels = [];
    const hoje = new Date();
    for (let i = qtd - 1; i >= 0; i--) {
        const d = new Date(hoje);
        d.setMonth(hoje.getMonth() - i);
        labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));
    }
    return labels;
}
function gerarDadosAleatorios(qtd, min, max) {
    return Array.from({ length: qtd }, () => Math.floor(Math.random() * (max - min + 1)) + min);
}

// Função para carregar o Dashboard - RESTAURADA
async function carregarDashboard(container) {
    console.log('[Dashboard] Carregando dashboard...');
    
    // Header do Dashboard
    const headerSection = document.createElement('div');
    headerSection.className = 'dashboard-header-section';
    headerSection.innerHTML = `
        <h1 class="dashboard-title">Dashboard</h1>
        <p class="dashboard-subtitle">Visão geral do sistema de controle de encomendas</p>
    `;
    container.appendChild(headerSection);

    // Grid de cards
    const gridContainer = document.createElement('div');
    gridContainer.className = 'dashboard-grid';
    container.appendChild(gridContainer);

    // Cards iniciais (serão atualizados com dados reais)
    const cardsData = [
        { 
            id: 'moradores', 
            title: 'Total de', 
            subtitle: 'Moradores', 
            number: '0', 
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" id="users-alt"><path fill="#D0D0D4" d="M12.3,12.22A4.92,4.92,0,0,0,14,8.5a5,5,0,0,0-10,0,4.92,4.92,0,0,0,1.7,3.72A8,8,0,0,0,1,19.5a1,1,0,0,0,2,0,6,6,0,0,1,12,0,1,1,0,0,0,2,0A8,8,0,0,0,12.3,12.22ZM9,11.5a3,3,0,1,1,3-3A3,3,0,0,1,9,11.5Zm9.74.32A5,5,0,0,0,15,3.5a1,1,0,0,0,0,2,3,3,0,0,1,3,3,3,3,0,0,1-1.5,2.59,1,1,0,0,0-.5.84,1,1,0,0,0,.45.86l.39.26.13.07a7,7,0,0,1,4,6.38,1,1,0,0,0,2,0A9,9,0,0,0,18.74,11.82Z"></path></svg>' 
        },
        { 
            id: 'pendentes', 
            title: 'Encomendas', 
            subtitle: 'Pendentes', 
            number: '0', 
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" id="box"><path fill="#D0D0D4" d="M20.49,7.52a.19.19,0,0,1,0-.08.17.17,0,0,1,0-.07l0-.09-.06-.15,0,0h0l0,0,0,0a.48.48,0,0,0-.09-.11l-.09-.08h0l-.05,0,0,0L16.26,4.45h0l-3.72-2.3A.85.85,0,0,0,12.25,2h-.08a.82.82,0,0,0-.27,0h-.1a1.13,1.13,0,0,0-.33.13L4,6.78l-.09.07-.09.08L3.72,7l-.05.06,0,0-.06.15,0,.09v.06a.69.69,0,0,0,0,.2v8.73a1,1,0,0,0,.47.85l7.5,4.64h0l0,0,.15.06.08,0a.86.86,0,0,0,.52,0l.08,0,.15-.06,0,0h0L20,17.21a1,1,0,0,0,.47-.85V7.63S20.49,7.56,20.49,7.52ZM12,4.17l1.78,1.1L8.19,8.73,6.4,7.63Zm-1,15L5.5,15.81V9.42l5.5,3.4Zm1-8.11L10.09,9.91l5.59-3.47L17.6,7.63Zm6.5,4.72L13,19.2V12.82l5.5-3.4Z"></path></svg>' 
        },
        { 
            id: 'antigas', 
            title: 'Encomendas', 
            subtitle: 'Antigas (7+ dias)', 
            number: '0', 
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" id="clock-eight"><path fill="#D0D0D4" d="M12,6a.99974.99974,0,0,0-1,1v4.38379L8.56934,12.60693a.99968.99968,0,1,0,.89843,1.78614l2.98145-1.5A.99874.99874,0,0,0,13,12V7A.99974.99974,0,0,0,12,6Zm0-4A10,10,0,1,0,22,12,10.01146,10.01146,0,0,0,12,2Zm0,18a8,8,0,1,1,8-8A8.00917,8.00917,0,0,1,12,20Z"></path></svg>' 
        },
        { 
            id: 'criticas', 
            title: 'Encomendas', 
            subtitle: 'Críticas (15+ dias)', 
            number: '0', 
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" id="exclamation-triangle"><path fill="#D0D0D4" d="M12,16a1,1,0,1,0,1,1A1,1,0,0,0,12,16Zm10.67,1.47-8.05-14a3,3,0,0,0-5.24,0l-8,14A3,3,0,0,0,3.94,22H20.06a3,3,0,0,0,2.61-4.53Zm-1.73,2a1,1,0,0,1-.88.51H3.94a1,1,0,0,1-.88-.51,1,1,0,0,1,0-1l8-14a1,1,0,0,1,1.78,0l8.05,14A1,1,0,0,1,20.94,19.49ZM12,8a1,1,0,0,0-1,1v4a1,1,0,0,0,2,0V9A1,1,0,0,0,12,8Z"></path></svg>' 
        }
    ];

    cardsData.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = `dashboard-card card-${card.id}`;
        cardElement.innerHTML = `
            <div class="card-content">
                <div class="card-icon">
                    ${card.icon}
                </div>
                <div class="card-info">
                    <div class="card-number" id="card-${card.id}-number">${card.number}</div>
                    <div class="card-title">${card.title}</div>
                    <div class="card-subtitle">${card.subtitle}</div>
                </div>
            </div>
        `;
        gridContainer.appendChild(cardElement);
    });

    // Seção de gráficos
    const chartsSection = document.createElement('div');
    chartsSection.className = 'dashboard-charts-section';
    chartsSection.innerHTML = `
        <div class="charts-grid">
            <div class="chart-container">
                <h3 class="chart-title">Encomendas Pendentes (Últimos 15 dias)</h3>
                <div class="chart-wrapper">
                    <canvas id="chartEncomendasPorDia"></canvas>
                </div>
            </div>
            <div class="chart-container">
                <h3 class="chart-title">Encomendas Pendentes por Mês (Últimos 12 meses)</h3>
                <div class="chart-wrapper">
                    <canvas id="chartEncomendasPorMes"></canvas>
                </div>
            </div>
        </div>
    `;
    container.appendChild(chartsSection);

    // Carregar dados
    await carregarDadosDashboard();
    await inicializarGraficos(); // Usar a função que já existia
}

// Função para carregar dados dos cards do dashboard - SIMPLIFICADA
async function carregarDadosDashboard() {
    console.log('[Dashboard] Carregando dados dos cards...');
    
    try {
        // Buscar estatísticas do dashboard usando a API otimizada
        if (window.electronAPI?.getDashboardStats) {
            const stats = await window.electronAPI.getDashboardStats();
            console.log('[Dashboard] Estatísticas recebidas:', stats);
            
            // Atualizar cards com os dados recebidos
            const totalMoradoresEl = document.getElementById('card-moradores-number');
            const encomendasPendentesEl = document.getElementById('card-pendentes-number');
            const encomendasAntigasEl = document.getElementById('card-antigas-number');
            const encomendasCriticasEl = document.getElementById('card-criticas-number');
            
            if (totalMoradoresEl) totalMoradoresEl.textContent = stats.totalMoradores || '0';
            if (encomendasPendentesEl) encomendasPendentesEl.textContent = stats.encomendasPendentes || '0';
            if (encomendasAntigasEl) encomendasAntigasEl.textContent = stats.encomendasAntigas || '0';
            if (encomendasCriticasEl) encomendasCriticasEl.textContent = stats.encomendasCriticas || '0';
        }
    } catch (error) {
        console.error('[Dashboard] Erro ao carregar dados:', error);
    }
}

// TrueFocus Animation Implementation
class TrueFocus {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`TrueFocus: Container with id '${containerId}' not found`);
            return;
        }
        
        this.words = Array.from(this.container.querySelectorAll('.focus-word'));
        this.frame = this.container.querySelector('.focus-frame');
        this.currentIndex = 0;
        this.animationDuration = options.animationDuration || 0.5;
        this.pauseBetweenAnimations = options.pauseBetweenAnimations || 1;
        this.manualMode = options.manualMode || false;
        this.intervalId = null;
        
        this.init();
    }
    
    init() {
        if (this.words.length === 0) return;
        
        // Set initial state - all words blurred except first
        this.words.forEach((word, index) => {
            if (index === 0) {
                word.classList.add('active');
            }
            
            if (this.manualMode) {
                word.addEventListener('mouseenter', () => this.setActiveWord(index));
                word.addEventListener('mouseleave', () => this.setActiveWord(this.currentIndex));
            }
        });
        
        // Position frame on first word
        this.updateFrame();
        
        // Start animation if not in manual mode
        if (!this.manualMode) {
            this.startAnimation();
        }
    }
    
    setActiveWord(index) {
        if (index < 0 || index >= this.words.length) return;
        
        // Remove active class from all words
        this.words.forEach(word => word.classList.remove('active'));
        
        // Add active class to current word
        this.words[index].classList.add('active');
        
        this.currentIndex = index;
        this.updateFrame();
    }
    
    updateFrame() {
        if (!this.frame || !this.words[this.currentIndex]) return;
        
        const containerRect = this.container.getBoundingClientRect();
        const wordRect = this.words[this.currentIndex].getBoundingClientRect();
        
        const x = wordRect.left - containerRect.left;
        const y = wordRect.top - containerRect.top;
        const width = wordRect.width;
        const height = wordRect.height;
        
        this.frame.style.transform = `translate(${x}px, ${y}px)`;
        this.frame.style.width = `${width}px`;
        this.frame.style.height = `${height}px`;
        this.frame.classList.add('show');
    }
    
    startAnimation() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.intervalId = setInterval(() => {
            const nextIndex = (this.currentIndex + 1) % this.words.length;
            this.setActiveWord(nextIndex);
        }, (this.animationDuration + this.pauseBetweenAnimations) * 1000);
    }
    
    stopAnimation() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    
    destroy() {
        this.stopAnimation();
        this.words.forEach(word => {
            word.classList.remove('active');
            word.removeEventListener('mouseenter', () => {});
            word.removeEventListener('mouseleave', () => {});
        });
        if (this.frame) {
            this.frame.classList.remove('show');
        }
    }
}

// Initialize TrueFocus when DOM is loaded
let trueFocusInstance = null;

function initializeTrueFocus() {
    // Wait a bit to ensure the login screen is visible
    setTimeout(() => {
        const container = document.getElementById('true-focus-container');
        if (container && container.offsetParent !== null) {
            trueFocusInstance = new TrueFocus('true-focus-container', {
                animationDuration: 0.5,
                pauseBetweenAnimations: 1.5,
                manualMode: false
            });
            console.log('TrueFocus initialized successfully');
        }
    }, 100);
}

// Initialize TrueFocus when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTrueFocus);
} else {
    initializeTrueFocus();
}

// Função para filtrar encomendas por nome de morador
function filtrarEncomendas(searchTerm, allEncomendas, listContainer) {
    console.log('[Filtro] Filtrando encomendas por:', searchTerm);
    
    if (!Array.isArray(allEncomendas)) {
        console.warn('[Filtro] allEncomendas não é um array válido');
        return;
    }
    
    let encomendasFiltradas;
    
    if (!searchTerm || searchTerm.trim() === '') {
        // Se não há termo de busca, mostra todas as encomendas
        encomendasFiltradas = allEncomendas;
    } else {
        // Filtra encomendas que contenham o termo de busca no nome do morador
        encomendasFiltradas = allEncomendas.filter(encomenda => {
            // Tenta diferentes campos possíveis para o nome do morador
            const nomeModador = encomenda.moradores?.nome || 
                               encomenda.morador_nome || 
                               encomenda.nome_morador || 
                               '';
            return nomeModador.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }
    
    console.log(`[Filtro] ${allEncomendas.length} encomendas -> ${encomendasFiltradas.length} filtradas`);
    
    // Limpa o container e exibe as encomendas filtradas
    listContainer.innerHTML = '';
    
    if (encomendasFiltradas.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-message';
        emptyDiv.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <h3>Nenhuma encomenda encontrada</h3>
                <p>Não há encomendas que correspondam ao filtro "${searchTerm}".</p>
            </div>
        `;
        listContainer.appendChild(emptyDiv);
        return;
    }
    
    // Exibe as encomendas filtradas usando a mesma lógica da função buscarEExibirEncomendas
    exibirListaEncomendas(encomendasFiltradas, listContainer);
}

// Função auxiliar para exibir lista de encomendas (extraída da lógica de buscarEExibirEncomendas)
function exibirListaEncomendas(pacotes, container) {
    if (!Array.isArray(pacotes) || pacotes.length === 0) {
        const msg = document.createElement('p');
        msg.textContent = 'Nenhuma encomenda encontrada.';
        msg.className = 'empty-list-message';
        container.appendChild(msg);
        return;
    }
    
    const title = document.createElement('h3');
    title.textContent = 'Aguardando Entrega:';
    title.style.marginTop = '0';
    container.appendChild(title);
    
    // Adiciona container para botão de entrega em lote
    const batchContainer = document.createElement('div');
    batchContainer.id = 'batch-delivery-container';
    batchContainer.className = 'batch-delivery-container';
    batchContainer.style.display = 'none';
    batchContainer.innerHTML = `
        <button id="btn-entregar-selecionadas" class="btn-primary btn-batch-delivery">
            Entregar Selecionadas (<span id="selected-count">0</span>)
        </button>
        <span id="selected-resident-name" class="selected-resident-info"></span>
    `;
    container.appendChild(batchContainer);
    
    const ul = document.createElement('ul');
    ul.className = 'encomendas-list';
    
    pacotes.forEach(p => {
        const li = document.createElement('li');
        li.className = 'encomenda-item';
        li.dataset.residentId = p.morador_id || '';
        li.dataset.residentName = p.moradores?.nome || p.morador_nome || '';
        li.dataset.packageId = p.id;
        
        let dataReceb = 'Inválida';
        try {
            // Usar horário local para exibição correta ao usuário
            const date = new Date(p.data_recebimento);
            if (!isNaN(date.getTime())) {
                // Formatar usando horário local para mostrar o horário correto
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                dataReceb = `${day}/${month}/${year} ${hours}:${minutes}`;
            }
        } catch (e) {
            // dataReceb continua 'Inválida'
        }
        
        li.innerHTML = `
            <div class="encomenda-checkbox">
                <input type="checkbox" 
                       class="package-checkbox" 
                       data-package-id="${p.id}" 
                       data-resident-id="${p.morador_id || ''}" 
                       data-resident-name="${p.moradores?.nome || p.morador_nome || 'N/A'}">
            </div>
            <div class="encomenda-info">
                <span><strong>Morador:</strong> ${p.moradores?.nome || p.morador_nome || 'N/A'}</span>
                <span><strong>Recebido:</strong> ${dataReceb}</span>
                <span><strong>Quantidade:</strong> ${p.quantidade || 1}</span>
                <span><strong>Porteiro que recebeu:</strong> ${p.porteiro_nome || 'N/A'}</span>
                ${p.observacoes ? `<span><strong>Obs:</strong> ${p.observacoes}</span>` : ''}
            </div>
            <div class="encomenda-actions">
                <button class="btn-editar-encomenda" data-id="${p.id}"><svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" viewBox="0 0 24 24" id="edit"><path fill="currentColor" d="M7,12.2578125V16.5c0,0.0001831,0,0.0003662,0,0.0005493C7.0001831,16.7765503,7.223999,17.0001831,7.5,17h4.2421875c0.1326294,0,0.2597656-0.0526733,0.3535156-0.1464844l6.9262085-6.9276733c0.0012817-0.0012207,0.0031128-0.0016479,0.0043335-0.0028687c0.0012817-0.0012817,0.0015869-0.0029907,0.0028076-0.0042725l2.8244629-2.8250122c0,0,0.000061-0.000061,0.0001221-0.0001221c0.1951294-0.1952515,0.1950684-0.5117188-0.0001221-0.7068481l-4.2402344-4.2402344c-0.000061-0.000061-0.0001221-0.0001221-0.0001831-0.0001831c-0.1952515-0.1951294-0.5117188-0.1950684-0.7068481,0.0001831l-9.7597656,9.7578125C7.0526733,11.9980469,7,12.1251831,7,12.2578125z M17.2597656,3.2069702l3.5332642,3.5332642l-2.1209106,2.1213379l-3.5336914-3.5336914L17.2597656,3.2069702z M8,12.4648438l6.4313354-6.4299927l3.5338135,3.5338135L11.5351562,16H8V12.4648438z M21.5,12c-0.276123,0-0.5,0.223877-0.5,0.5V19c-0.0014038,1.1040039-0.8959961,1.9985962-2,2H5c-1.1040039-0.0014038-1.9985962-0.8959961-2-2V5c0.0014038-1.1040039,0.8959961-1.9985962,2-2h6.5C11.776123,3,12,2.776123,12,2.5S11.776123,2,11.5,2H5C3.3438721,2.0018311,2.0018311,3.3438721,2,5v14c0.0018311,1.6561279,1.3438721,2.9981689,3,3h14c1.6561279-0.0018311,2.9981689-1.3438721,3-3v-6.5C22,12.223877,21.776123,12,21.5,12z"></path></svg></button>
                <button class="btn-entregar-encomenda" data-id="${p.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" id="package-delivered"><path fill="currentColor" d="M20.4896851,7.2872925c-0.0048828-0.0623169-0.0209351-0.1206665-0.0482178-0.177063c-0.0082397-0.0169678-0.0123291-0.0340576-0.0224609-0.0499878c-0.0391846-0.0621948-0.0886841-0.1184692-0.1553345-0.1598511l-8-4.9589844c-0.1616821-0.0996094-0.3656616-0.0996094-0.5273438,0l-8,4.9589844c-0.0136108,0.0084229-0.020813,0.0238647-0.0335083,0.0335083C3.6665649,6.9614258,3.6358643,6.9922485,3.6083374,7.0285034C3.5986328,7.0412598,3.5831909,7.0485229,3.574707,7.0621948c-0.006958,0.0112915-0.0072632,0.024231-0.0132446,0.0358276C3.5462036,7.1271973,3.5366821,7.1576538,3.5274048,7.1898193c-0.0094604,0.0332031-0.0176392,0.0651245-0.0200195,0.098938C3.5064087,7.3014526,3.5,7.3122559,3.5,7.3251953v9.3496094c-0.000061,0.1729736,0.0893555,0.3336182,0.2363281,0.4248047l8,4.9589844c0.0036011,0.0022583,0.0083618,0.0012817,0.0120239,0.003418c0.00354,0.0020752,0.0048828,0.0062866,0.0084839,0.0083008C11.8309937,22.1121826,11.9147949,22.1340332,12,22.1337891c0.0852051,0.0002441,0.1690063-0.0216064,0.2431641-0.0634766c0.0036011-0.0020142,0.0049438-0.0062256,0.0084839-0.0083008c0.0036621-0.0021362,0.0084229-0.0011597,0.0120239-0.003418l8-4.9589844c0.1468506-0.0913086,0.2362061-0.2518921,0.2363281-0.4248047V7.3251953C20.5,7.3116455,20.4907837,7.3006592,20.4896851,7.2872925z M11.5,20.7353516l-7-4.3388672V8.2236328l7,4.3378906V20.7353516z M12,11.6953125l-0.4055176-0.2513428L4.9492188,7.3251953L12,2.9541016l7.0507812,4.3710938l-5.1820679,3.211853L12,11.6953125z M19.5,16.3964844l-7,4.3388672v-8.1738281l7-4.3378906V16.3964844z"></path><circle cx="18" cy="18" r="3" fill="currentColor"></circle><path fill="white" d="M16.5,18l1,1l2-2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
            </div>
        `;
        ul.appendChild(li);
        
        const btnEditEnc = li.querySelector('.btn-editar-encomenda');
        const btnDeliverEnc = li.querySelector('.btn-entregar-encomenda');
        const checkbox = li.querySelector('.package-checkbox');
        
        // Event listener para checkbox
        if (checkbox) {
            checkbox.addEventListener('change', handlePackageSelection);
        }
        
        if (btnDeliverEnc) {
            btnDeliverEnc.addEventListener('click', (e) => {
                const packageId = e.currentTarget.dataset.id;
                const moradorNome = p.moradores?.nome || p.morador_nome || 'N/A';
                abrirModalEntrega(packageId, moradorNome);
            });
        }
        
        if (btnEditEnc) {
            btnEditEnc.addEventListener('click', (e) => {
                const packageId = e.currentTarget.dataset.id;
                if (packageId) {
                    iniciarEdicaoEncomenda(packageId);
                } else {
                    console.error("ID da encomenda não encontrado no botão editar.");
                    showStatusMessage("Erro: ID da encomenda não encontrado.", "error");
                }
            });
        }
    });
    
    container.appendChild(ul);
    
    // Event listener para botão de entrega em lote
    const btnEntregarSelecionadas = document.getElementById('btn-entregar-selecionadas');
    if (btnEntregarSelecionadas) {
        btnEntregarSelecionadas.addEventListener('click', abrirModalEntregaLote);
    }
}
