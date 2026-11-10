# Manual de Execução e Configuração
## Sistema Integrado "Hotel & Day Use" (Consumo Digital)

---

### 1. Visão Geral da Arquitetura

O sistema **Hotel & Day Use** foi projetado para digitalizar o ciclo completo de consumo e conferência de hóspedes e visitantes (*Day Use*), eliminando comandas em papel, fraudes em lançamentos de garçons e filas de conferência no check-out.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vanilla JS)                           │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   PDV Atendente  │    │   Cliente Mobile │    │ Caixa / Checkout │  │
│  │ (atendente.html) │    │  (cliente.html)  │    │   (caixa.html)   │  │
│  └─────────┬────────┘    └────────┬─────────┘    └────────┬─────────┘  │
└────────────┼──────────────────────┼───────────────────────┼────────────┘
             │                      │                       │
             ▼                      ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│             CAMADA DE INTEGRAÇÃO SUPABASE & REALTIME                   │
│   • BroadcastChannel / WebSockets (Sincronização reativa entre telas)  │
│   • window.hotelSupabase & window.supabase                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   BACKEND POSTGRESQL (Supabase)                        │
│   • Tabelas: perfis, hospedes, permanencias, produtos, caixas,         │
│              consumos, itens_consumo, movimentacoes_caixa, pagamentos, │
│              auditoria_operacoes_sensiveis                             │
│   • PL/pgSQL: Travas ACID, Row-Level Locks (RN07, RN09, RN10, RN15)   │
└────────────────────────────────────────────────────────────────────────┘
```

#### Principais Componentes:
- **Frontend**: Desenvolvido em HTML5 semântico, Tailwind CSS moderno (paleta hoteleira nobre) e **JavaScript Vanilla puro**, com arquitetura modularizada em `assets/js/`.
- **Backend & Persistência**: Supabase / PostgreSQL relacional, com regras de negócio em funções PL/pgSQL transacionais (`SECURITY DEFINER`), garantindo consistência atômica incondicional.
- **Tabelas Oficiais em Português**:
  - `perfis`: Cadastro de operadores e gerentes com papéis (`atendente`, `caixa`, `gerente`, `admin`).
  - `hospedes`: Dados cadastrais dos clientes (nome, documento CPF/passaporte, telefone, e-mail).
  - `permanencias`: Registro de contas de estadias (distinguindo **Hospedagem** com quarto e **Day Use** sem quarto), saldo devedor e credenciais (PIN).
  - `produtos`: Catálogo de itens com código de barras (Code 128 / EAN), categoria, preço vigente e estoque.
  - `consumos`: Propostas de consumo com validade de 5 minutos (`aguardando`, `confirmado`, `recusado`, `expirado`, `estornado`).
  - `itens_consumo`: Itens vinculados à proposta com congelamento do preço unitário no ato da geração.
  - `caixas`: Sessões de controle financeiro do turno dos operadores.
  - `movimentacoes_caixa`: Livro-caixa com suprimentos, sangrias, recebimentos e estornos.
  - `pagamentos`: Registro discriminado de pagamentos (PIX, Cartão Débito/Crédito, Dinheiro).
  - `auditoria_operacoes_sensiveis`: Trilha inviolável (*append-only*) das operações de risco (RN27, RN28).

---

### 2. Pré-requisitos de Ambiente (Compatível com Xubuntu Linux)

O projeto foi validado para execução nativa em distribuições Linux baseadas em Debian/Ubuntu, incluindo **Xubuntu 20.04 LTS / 22.04 LTS / 24.04 LTS**, bem como macOS e Windows (via WSL2).

#### Ferramentas Necessárias:
- **Node.js**: Versão 18.x, 20.x ou superior (LTS recomendada).
- **npm**: Versão 9.x ou superior (ou **bun** / **yarn** / **pnpm**).
- **Git**: Para clonagem e versionamento.
- **Navegadores Modernos**: Google Chrome, Chromium ou Mozilla Firefox com suporte à API WebRTC e `BroadcastChannel`.

#### Passo a Passo de Preparação no Xubuntu Linux:
Abra o terminal do Xubuntu (`Ctrl + Alt + T`) e instale os pacotes básicos:

```bash
# Atualizar repositórios
sudo apt update && sudo apt upgrade -y

# Instalar Node.js LTS, npm e Git
sudo apt install -y nodejs npm git curl

# Verificar versões instaladas
node -v   # Deve retornar v18.x ou superior
npm -v    # Deve retornar v9.x ou superior
git --version
```

---

### 3. Configuração do Servidor e HTTPS (RNF02)

#### Por que o HTTPS é Obrigatório?
A especificação do consórcio W3C e os mecanismos de segurança dos navegadores móveis (Android Chrome e iOS Safari) exigem **Contexto Seguro (*Secure Context*)** para liberar a API de mídia física do dispositivo:
$$\text{navigator.mediaDevices.getUserMedia()}$$

Se a aplicação for acessada por celulares através de `http://192.168.x.x` (HTTP simples), o navegador **bloqueia sumariamente a câmera**, impedindo a leitura dos QR Codes e códigos de barras. O acesso só é liberado em:
1. `http://localhost` (na própria máquina local de desenvolvimento).
2. `https://*` (qualquer domínio com conexão criptografada SSL/TLS válida).

---

#### Como Executar em HTTPS:

##### Método A: Ambiente AI Studio / Cloud Run (Já Configurado e Ativo)
O ambiente em nuvem já provê automaticamente certificado SSL válido:
- **URL HTTPS de Desenvolvimento**: `https://ais-dev-j6canidz63uajraiaqydqi-327212251621.us-east1.run.app`
- **URL HTTPS Pública de Avaliação**: `https://ais-pre-j6canidz63uajraiaqydqi-327212251621.us-east1.run.app`

Ao abrir essas URLs no smartphone ou tablet conectado ao 4G/Wi-Fi, a câmera funcionará imediatamente sem nenhum aviso de segurança.

---

##### Método B: Ambiente Local no Xubuntu com Certificado Válido (`mkcert`)
Para testar na rede Wi-Fi local sem alertas de certificado:

1. Instale o utilitário `mkcert`:
```bash
sudo apt install -y libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

# Instala a autoridade certificadora raiz local
mkcert -install
```

2. Gere o certificado SSL para seu endereço IP local (exemplo `192.168.1.100`):
```bash
# Descubra seu IP na rede local
hostname -I

# Gere as chaves para localhost e para o IP do seu computador na rede
mkcert localhost 127.0.0.1 192.168.1.100
# Isto gerará dois arquivos: localhost+2.pem e localhost+2-key.pem
```

3. Inicie o Vite com os certificados:
```bash
npx vite --host 0.0.0.0 --port 3000 --https
```

---

##### Método C: Túnel Reverso Seguro Imediato (Ideal para Apresentações)
Caso queira expor o `localhost:3000` do Xubuntu diretamente para celulares de avaliadores via internet:

```bash
# Terminal 1: Iniciar aplicação
npm run dev

# Terminal 2: Gerar túnel HTTPS público temporário
npx localtunnel --port 3000
# ou
npx ngrok http 3000
```
O terminal fornecerá uma URL pública segura `https://xxxx.loca.lt` que pode ser aberta em qualquer celular para ler QR Codes pela câmera sem complicação.

---

### 4. Passo a Passo de Execução

#### 1. Clonar e Instalar
No terminal, entre no diretório do projeto:

```bash
cd /caminho/do/projeto

# Instalar dependências declaradas no package.json
npm install
```

#### 2. Configurar Variáveis de Ambiente e Supabase
As credenciais já vêm configuradas em `assets/js/config.js`. Caso deseje conectar a uma instância remota dedicada do Supabase, edite o arquivo:

```javascript
// assets/js/config.js
window.SUPABASE_CONFIG = {
  url: 'https://seu-projeto.supabase.co',
  anonKey: 'sua-chave-anon-aqui',
  enableRealtimeBroadcast: true,
  proposalExpiryMinutes: 5
};
```

> **Nota:** Se as chaves remotas não forem preenchidas, a aplicação roda em modo **Mock Reativo Local**, sincronizando 100% dos dados entre abas através da API `BroadcastChannel`.

#### 3. Executar o Servidor de Desenvolvimento
```bash
npm run dev
```
O console exibirá:
```
  VITE v8.3.0  ready in 250 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://0.0.0.0:3000/
```

#### 4. Mapeamento de Rotas e Navegação

| Rota / Arquivo | Perfil / Destinatário | Finalidade Principal |
| :--- | :--- | :--- |
| `http://localhost:3000/login.html` | **Funcionários & Admin** | Login unificado com e-mail corporativo e botões de atalho. |
| `http://localhost:3000/atendente.html` | **Atendente (Garçom / Bar)** | Terminal de PDV com catálogo, carrinho, câmera e envio com 5 min. |
| `http://localhost:3000/cliente.html` | **Hóspede / Visitante** | Visualização *mobile-first* (360px) com PIN, conferência e extrato. |
| `http://localhost:3000/caixa.html` | **Operador de Caixa** | Gestão de contas, pagamentos (PIX/Cartão/Dinheiro) e checkout RN15. |
| `http://localhost:3000/index.html` | **Avaliadores / Gerentes** | **Simulador Split-Screen** integrado (PDV + Celular 360px lado a lado). |

---

### 5. Credenciais e Dados de Teste

Para agilizar testes de homologação e apresentações da banca examinadora, o sistema já possui carga inicial de dados (*seed*) pronta para uso.

#### A. Contas de Funcionários (`login.html`):

| Nome do Funcionário | E-mail de Acesso | Senha Padrão | Cargo / Função | Módulo de Destino |
| :--- | :--- | :--- | :--- | :--- |
| **Mariana Silva** | `mariana.atendente@hotel.com.br` | `hotel123` | `atendente` | Redireciona para `atendente.html` |
| **Carlos Oliveira** | `carlos.atendente@hotel.com.br` | `hotel123` | `atendente` | Redireciona para `atendente.html` |
| **Fernanda Rocha** | `fernanda.caixa@hotel.com.br` | `hotel123` | `caixa` | Redireciona para `caixa.html` |
| **Roberto Albuquerque** | `roberto.gerente@hotel.com.br` | `hotel123` | `gerente` | Acesso pleno / Central do Gerente |

---

#### B. Contas de Hóspedes e Permanências (`cliente.html` e `caixa.html`):

| Tipo de Estadia | Identificação | Nome do Hóspede | Documento (CPF) | PIN do Celular | Saldo Devedor Inicial |
| :--- | :--- | :--- | :--- | :---: | :---: |
| 🏨 **Hospedagem** | **Quarto 204** | Lucas Vinícius Mendes | `042.891.332-15` | **`4821`** | **R$ 0,00** (Pronto p/ novos pedidos) |
| 🏨 **Hospedagem** | **Quarto 312** | Beatriz Vasconcelos | `284.119.554-82` | **`1975`** | **R$ 64,00** (Itens anteriores) |
| ☀️ **Day Use** | **Day Use #3308** | Gustavo Pinheiro Duarte | `158.742.663-90` | **`3308`** | **R$ 0,00** (Pulseira Lazer) |
| ☀️ **Day Use** | **Day Use #7741** | Camila Nogueira Ribeiro | `331.625.998-04` | **`7741`** | **R$ 35,00** (Pulseira Lazer) |

---

#### C. Catálogo de Produtos e Códigos de Barras (Leitor USB e Câmera):

| Código de Barras (Code 128 / EAN) | Nome do Produto | Categoria | Preço Vigente (R$) |
| :---: | :--- | :--- | :---: |
| `78910001001` | Caipirinha Tradicional de Limão | Bebidas | R$ 28,00 |
| `78910001002` | Água de Coco Gelada (500ml) | Bebidas | R$ 12,00 |
| `78910001003` | Cerveja Artesanal IPA (600ml) | Bebidas | R$ 32,00 |
| `78910001004` | Porção de Camarão Crocante | Petiscos | R$ 88,00 |
| `78910001005` | Iscas de Peixe com Molho Golf | Petiscos | R$ 58,00 |
| `78910001006` | Batata Rústica com Alecrim e Parmesão | Petiscos | R$ 36,00 |
| `78910001007` | Filé Mignon ao Molho Madeira | Restaurante | R$ 94,00 |
| `78910001008` | Salada Tropical com Queijo Brie | Restaurante | R$ 46,00 |
| `78910001009` | Protetor Solar FPS 50 (120ml) | Conveniência | R$ 45,00 |
| `78910001010` | Toalha de Praia Extra / Day Use | Piscina | R$ 15,00 |

---

### 6. Roteiro de Demonstração Rápida para Avaliação

1. Acesse o **Simulador Split-Screen** em `http://localhost:3000/`.
2. No lado esquerdo (**Terminal do Atendente**):
   - Selecione o **Quarto 204 (Lucas Mendes)**.
   - Adicione 1x *Caipirinha Tradicional* (R$ 28,00) e 1x *Batata Rústica* (R$ 36,00).
   - Clique em **"Gerar e Enviar Proposta ao Hóspede"**.
3. No lado direito (**Celular do Hóspede 360px**):
   - Veja a proposta aparecer instantaneamente com som suave e cronômetro de 5 minutos regressivo.
   - Digite o PIN **`4821`** e clique em **"✓ Confirmar Consumo"**.
4. Observe no Atendente o status mudar imediatamente para **"✓ Confirmado pelo Cliente"**.
5. Acesse a aba **Caixa & Fechamento** (`/caixa.html`):
   - Localize o Quarto 204.
   - Tente clicar em "Encerrar Permanência" e observe a trava da **RN15** bloquear por saldo devedor.
   - Clique em "Quitar Saldo Total", escolha **PIX** e registre o pagamento.
   - Com o saldo zerado e nenhuma pendência, clique no botão agora liberado para encerrar e emitir o **Recibo Oficial de Check-out**.
