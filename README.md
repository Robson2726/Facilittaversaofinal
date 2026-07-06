# FacilittaPortaria

## Sistema de Controle de Encomendas para Condomínios

### 📦 Sobre o Projeto

O **FacilittaPortaria** é um sistema desktop desenvolvido em Electron para gerenciamento completo de encomendas em portarias de condomínios. O sistema oferece controle total do fluxo de recebimento e entrega de encomendas, com interface moderna e funcionalidades avançadas.

### ✨ Funcionalidades Principais

#### 🏠 **Gestão de Encomendas**
- ✅ Cadastro de encomendas com dados completos
- ✅ Controle de status (Recebida → Entregue)
- ✅ Entrega individual e em lote
- ✅ Edição de encomendas pendentes
- ✅ Sistema de busca e filtros

#### 👥 **Gestão de Moradores**
- ✅ Cadastro completo com endereço detalhado
- ✅ Busca inteligente com autocomplete
- ✅ Importação em massa via CSV
- ✅ Edição e exclusão de registros

#### 👤 **Gestão de Usuários**
- ✅ Níveis de acesso (Porteiro/Admin)
- ✅ Controle de permissões
- ✅ Autenticação segura

#### 📊 **Relatórios e Dashboard**
- ✅ Dashboard com gráficos interativos
- ✅ Relatórios filtrados por período, morador, porteiro
- ✅ Exportação em PDF
- ✅ Análise estatística de volume

#### 🔧 **Recursos Técnicos**
- ✅ QR Code API para integração
- ✅ Interface responsiva e moderna
- ✅ Sidebar colapsável
- ✅ Banco de dados PostgreSQL

### 🚀 Tecnologias Utilizadas

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Electron
- **Banco de Dados**: PostgreSQL
- **Bibliotecas**: Chart.js, QRCode.js
- **Build**: Electron Forge

### 📋 Pré-requisitos

- Node.js (versão 16 ou superior)
- PostgreSQL
- Git

### 🛠️ Instalação

1. **Clone o repositório**
   ```bash
   git clone <url-do-repositorio>
   cd desktop
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure o banco de dados**
   - Crie um banco PostgreSQL
   - Configure as variáveis de ambiente

4. **Execute o projeto**
   ```bash
   npm start
   ```

### 📦 Build e Distribuição

```bash
# Gerar executável
npm run make

# Empacotar aplicação
npm run package
```

### 🎯 Estrutura do Projeto

```
src/
├── assets/          # Ícones e imagens
├── scripts/         # Scripts de debug e teste
├── utils/           # Utilitários (QR Code, etc.)
├── index.html       # Interface principal
├── index.js         # Processo principal do Electron
├── renderer.js      # Lógica da interface
├── preload.js       # Bridge entre main e renderer
├── styles.css       # Estilos da aplicação
└── api-server.js    # Servidor API interno
```

### 🔐 Segurança

- Autenticação de usuários
- Controle de acesso por níveis
- Validação de dados
- Logs de auditoria

### 📈 Roadmap

- [ ] App mobile para moradores
- [ ] Notificações push
- [ ] Integração com WhatsApp
- [ ] Scanner de código de barras
- [ ] Assinatura digital
- [ ] Backup automático na nuvem

### 🤝 Contribuição

Contribuições são bem-vindas! Por favor:

1. Faça um fork do projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

### 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

### 📞 Suporte

Para suporte técnico ou dúvidas sobre o sistema, entre em contato através dos issues do GitHub.

---

**Desenvolvido com ❤️ para facilitar a gestão de encomendas em condomínios**