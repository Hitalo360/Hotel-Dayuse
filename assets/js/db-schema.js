/**
 * Hotel & Day Use - Esquema Oficial de Banco de Dados e Carga Inicial
 * Todas as tabelas e colunas em português estrito conforme análise de requisitos.
 */

window.HOTEL_SEED_DATA = {
  perfis: [
    {
      id: 'perf-001',
      nome_completo: 'Mariana Silva Santos',
      email: 'mariana.atendente@hotel.com.br',
      funcao: 'atendente',
      ativo: true
    },
    {
      id: 'perf-002',
      nome_completo: 'Carlos Eduardo Oliveira',
      email: 'carlos.atendente@hotel.com.br',
      funcao: 'atendente',
      ativo: true
    },
    {
      id: 'perf-003',
      nome_completo: 'Fernanda Rocha Lima',
      email: 'fernanda.caixa@hotel.com.br',
      funcao: 'caixa',
      ativo: true
    },
    {
      id: 'perf-004',
      nome_completo: 'Roberto Albuquerque',
      email: 'roberto.gerente@hotel.com.br',
      funcao: 'gerente',
      ativo: true
    }
  ],

  hospedes: [
    {
      id: 'hosp-101',
      nome: 'Lucas Vinícius Mendes',
      documento: '042.891.332-15',
      telefone: '(11) 98765-4321',
      email: 'lucas.mendes@email.com'
    },
    {
      id: 'hosp-102',
      nome: 'Beatriz Vasconcelos',
      documento: '284.119.554-82',
      telefone: '(21) 99123-8877',
      email: 'beatriz.vasc@email.com'
    },
    {
      id: 'hosp-103',
      nome: 'Gustavo Pinheiro Duarte',
      documento: '158.742.663-90',
      telefone: '(31) 99882-1100',
      email: 'gustavo.duarte@email.com'
    },
    {
      id: 'hosp-104',
      nome: 'Camila Nogueira Ribeiro',
      documento: '331.625.998-04',
      telefone: '(41) 98455-6677',
      email: 'camila.dayuse@email.com'
    }
  ],

  permanencias: [
    {
      id: 'perm-201',
      hospede_id: 'hosp-101',
      tipo: 'hospedagem',
      quarto_numero: '204',
      status: 'aberta',
      checkin: new Date(Date.now() - 24 * 3600000).toISOString(),
      checkout: null,
      pin_acesso: '4821',
      saldo_devedor: 0.00
    },
    {
      id: 'perm-202',
      hospede_id: 'hosp-102',
      tipo: 'hospedagem',
      quarto_numero: '312',
      status: 'aberta',
      checkin: new Date(Date.now() - 18 * 3600000).toISOString(),
      checkout: null,
      pin_acesso: '1975',
      saldo_devedor: 64.00
    },
    {
      id: 'perm-203',
      hospede_id: 'hosp-103',
      tipo: 'day_use',
      quarto_numero: null,
      status: 'aberta',
      checkin: new Date(Date.now() - 4 * 3600000).toISOString(),
      checkout: null,
      pin_acesso: '3308',
      saldo_devedor: 0.00
    },
    {
      id: 'perm-204',
      hospede_id: 'hosp-104',
      tipo: 'day_use',
      quarto_numero: null,
      status: 'aberta',
      checkin: new Date(Date.now() - 3 * 3600000).toISOString(),
      checkout: null,
      pin_acesso: '7741',
      saldo_devedor: 35.00
    }
  ],

  produtos: [
    {
      id: 'prod-001',
      codigo_barras: '78910001001',
      nome: 'Caipirinha Tradicional de Limão',
      categoria: 'Bebidas',
      preco: 28.00,
      ativo: true,
      estoque: 150,
      imagem_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=60',
      descricao: 'Cachaça artesanal, limão taiti fresco e açúcar orgânico'
    },
    {
      id: 'prod-002',
      codigo_barras: '78910001002',
      nome: 'Água de Coco Gelada (500ml)',
      categoria: 'Bebidas',
      preco: 12.00,
      ativo: true,
      estoque: 95,
      imagem_url: 'https://images.unsplash.com/photo-1544003484-3cd181d17917?w=500&auto=format&fit=crop&q=60',
      descricao: 'Servida no próprio coco ou na taça com pedras de gelo'
    },
    {
      id: 'prod-003',
      codigo_barras: '78910001003',
      nome: 'Cerveja Artesanal IPA (600ml)',
      categoria: 'Bebidas',
      preco: 32.00,
      ativo: true,
      estoque: 80,
      imagem_url: 'https://images.unsplash.com/photo-1608270119330-8ec4a873551d?w=500&auto=format&fit=crop&q=60',
      descricao: 'Cerveja puro malte com notas cítricas e amargor equilibrado'
    },
    {
      id: 'prod-004',
      codigo_barras: '78910001004',
      nome: 'Porção de Camarão Crocante',
      categoria: 'Petiscos',
      preco: 88.00,
      ativo: true,
      estoque: 40,
      imagem_url: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=500&auto=format&fit=crop&q=60',
      descricao: 'Camarões rosa empanados no panko, acompanha molho tártaro'
    },
    {
      id: 'prod-005',
      codigo_barras: '78910001005',
      nome: 'Iscas de Peixe com Molho Golf',
      categoria: 'Petiscos',
      preco: 58.00,
      ativo: true,
      estoque: 35,
      imagem_url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=500&auto=format&fit=crop&q=60',
      descricao: 'Filé de peixe branco fresco temperado com ervas e limão siciliano'
    },
    {
      id: 'prod-006',
      codigo_barras: '78910001006',
      nome: 'Batata Rústica com Alecrim e Parmesão',
      categoria: 'Petiscos',
      preco: 36.00,
      ativo: true,
      estoque: 70,
      imagem_url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500&auto=format&fit=crop&q=60',
      descricao: 'Batatas douradas ao forno com flor de sal, alecrim fresco e parmesão'
    },
    {
      id: 'prod-007',
      codigo_barras: '78910001007',
      nome: 'Filé Mignon ao Molho Madeira',
      categoria: 'Restaurante',
      preco: 94.00,
      ativo: true,
      estoque: 25,
      imagem_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=60',
      descricao: 'Medalhão grelhado, arroz biro-biro e purê de batata artesanal'
    },
    {
      id: 'prod-008',
      codigo_barras: '78910001008',
      nome: 'Salada Tropical com Queijo Brie',
      categoria: 'Restaurante',
      preco: 46.00,
      ativo: true,
      estoque: 30,
      imagem_url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=60',
      descricao: 'Mix de folhas nobres, morangos, castanhas caramelizadas e vinagrete de mel'
    },
    {
      id: 'prod-009',
      codigo_barras: '78910001009',
      nome: 'Protetor Solar FPS 50 (120ml)',
      categoria: 'Conveniência',
      preco: 45.00,
      ativo: true,
      estoque: 50,
      imagem_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=60',
      descricao: 'Resistente à água e toque seco para uso na praia ou piscina'
    },
    {
      id: 'prod-010',
      codigo_barras: '78910001010',
      nome: 'Toalha de Praia Extra / Day Use',
      categoria: 'Piscina',
      preco: 15.00,
      ativo: true,
      estoque: 100,
      imagem_url: 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=500&auto=format&fit=crop&q=60',
      descricao: 'Locação de toalha de banho felpuda e higienizada'
    }
  ],

  caixas: [
    {
      id: 'cx-001',
      funcionario_id: 'perf-003',
      status: 'aberto',
      data_abertura: new Date(Date.now() - 8 * 3600000).toISOString(),
      data_fechamento: null,
      saldo_inicial: 250.00,
      saldo_final: null
    }
  ],

  consumos: [
    {
      id: 'csm-001',
      permanencia_id: 'perm-202',
      funcionario_id: 'perf-001',
      codigo_proposta: 'PROP-7102',
      valor_total: 64.00,
      status: 'confirmado',
      criado_em: new Date(Date.now() - 2 * 3600000).toISOString(),
      expira_em: new Date(Date.now() - 2 * 3600000 + 5 * 60000).toISOString(),
      confirmado_em: new Date(Date.now() - 2 * 3600000 + 72000).toISOString(),
      recusado_em: null,
      observacoes: 'Entregue no quiosque da piscina'
    },
    {
      id: 'csm-002',
      permanencia_id: 'perm-204',
      funcionario_id: 'perf-002',
      codigo_proposta: 'PROP-5541',
      valor_total: 35.00,
      status: 'confirmado',
      criado_em: new Date(Date.now() - 1 * 3600000).toISOString(),
      expira_em: new Date(Date.now() - 1 * 3600000 + 5 * 60000).toISOString(),
      confirmado_em: new Date(Date.now() - 1 * 3600000 + 85000).toISOString(),
      recusado_em: null,
      observacoes: 'Day Use pulseira #4'
    }
  ],

  itens_consumo: [
    {
      id: 'item-001',
      consumo_id: 'csm-001',
      produto_id: 'prod-003',
      quantidade: 2,
      preco_unitario: 32.00,
      subtotal: 64.00,
      observacao: 'Bem geladas'
    },
    {
      id: 'item-002',
      consumo_id: 'csm-002',
      produto_id: 'prod-006',
      quantidade: 1,
      preco_unitario: 35.00,
      subtotal: 35.00,
      observacao: 'Sem alecrim'
    }
  ],

  movimentacoes_caixa: [
    {
      id: 'mov-001',
      caixa_id: 'cx-001',
      tipo: 'suprimento',
      valor: 250.00,
      descricao: 'Fundo de troco inicial do turno',
      criado_em: new Date(Date.now() - 8 * 3600000).toISOString()
    }
  ],

  pagamentos: [],

  auditoria_operacoes_sensiveis: [
    {
      id: 'aud-001',
      tabela_afetada: 'caixas',
      registro_id: 'cx-001',
      tipo_operacao: 'ABERTURA_CAIXA',
      autor_id: 'perf-003',
      autor_email: 'fernanda.caixa@hotel.com.br',
      dados_anteriores: null,
      dados_novos: { status: 'aberto', saldo_inicial: 250.00 },
      justificativa: 'Abertura oficial do turno do caixa #01',
    }
  ],

  quartos: [
    {
      id: 'qto-101',
      numero: '101',
      tipo: 'Standard',
      capacidade: 2,
      diaria_base: 220.00,
      status: 'disponivel',
      descricao: 'Cama casal, ar-condicionado Split, Wi-Fi e frigobar'
    },
    {
      id: 'qto-102',
      numero: '102',
      tipo: 'Standard',
      capacidade: 2,
      diaria_base: 220.00,
      status: 'disponivel',
      descricao: 'Duas camas solteiro, ar-condicionado, Wi-Fi e frigobar'
    },
    {
      id: 'qto-103',
      numero: '103',
      tipo: 'Standard',
      capacidade: 2,
      diaria_base: 220.00,
      status: 'disponivel',
      descricao: 'Cama casal, vista interna e frigobar'
    },
    {
      id: 'qto-201',
      numero: '201',
      tipo: 'Luxo',
      capacidade: 3,
      diaria_base: 360.00,
      status: 'disponivel',
      descricao: 'Varanda com vista piscina/jardim, cama king e cafeteira'
    },
    {
      id: 'qto-202',
      numero: '202',
      tipo: 'Luxo',
      capacidade: 3,
      diaria_base: 360.00,
      status: 'disponivel',
      descricao: 'Varanda privativa, cama queen e banheira de hidromassagem'
    },
    {
      id: 'qto-204',
      numero: '204',
      tipo: 'Luxo',
      capacidade: 3,
      diaria_base: 380.00,
      status: 'ocupado',
      descricao: 'Suíte master com varanda panorâmica (Hóspede Lucas Vinícius)'
    },
    {
      id: 'qto-205',
      numero: '205',
      tipo: 'Standard',
      capacidade: 2,
      diaria_base: 240.00,
      status: 'disponivel',
      descricao: 'Cama queen, frigobar e ducha com aquecimento solar'
    },
    {
      id: 'qto-301',
      numero: '301',
      tipo: 'Suíte Master',
      capacidade: 4,
      diaria_base: 580.00,
      status: 'disponivel',
      descricao: 'Vista mar panorâmica, dois ambientes integrados e hidro'
    },
    {
      id: 'qto-312',
      numero: '312',
      tipo: 'Suíte Master',
      capacidade: 4,
      diaria_base: 580.00,
      status: 'ocupado',
      descricao: 'Vista mar e varanda privativa (Hóspede Beatriz Vasconcelos)'
    },
    {
      id: 'qto-315',
      numero: '315',
      tipo: 'Standard',
      capacidade: 2,
      diaria_base: 210.00,
      status: 'manutencao',
      descricao: 'Manutenção preventiva no sistema de ar-condicionado'
    }
  ]
};
