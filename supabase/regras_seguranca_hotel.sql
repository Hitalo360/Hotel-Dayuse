-- =====================================================================================
-- HOTEL & DAY USE - NÚCLEO DE REGRAS CRÍTICAS DE SEGURANÇA E INTEGRIDADE
-- Banco de Dados: PostgreSQL / Supabase
--
-- Cobertura das Regras de Negócio:
-- RN07  - Expiração estrita de propostas em 5 minutos no servidor.
-- RN09  - Proibição de atendente confirmar propostas pelo cliente.
-- RN10  - Lançamento atômico e unicidade de débito por proposta (anti-concorrência).
-- RN15  - Validação estrita de fechamento (saldo zero + propostas pendentes resolvidas).
-- RN27  - Registro e auditoria de operações sensíveis (estornos, pagamentos e bloqueios).
-- RN28  - Inviolabilidade e rastreabilidade da trilha de auditoria.
-- RNF11 - Transações ACID com bloqueio pessimista (FOR UPDATE) e isolamento rigoroso.
-- =====================================================================================

-- Extensão para geração de UUIDv4 criptográfico
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================================
-- 1. TABELA DE AUDITORIA DE OPERAÇÕES SENSÍVEIS (RN27, RN28)
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.auditoria_operacoes_sensiveis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tabela_afetada VARCHAR(60) NOT NULL,
    registro_id UUID NOT NULL,
    tipo_operacao VARCHAR(60) NOT NULL, -- 'ESTORNO_CONSUMO', 'PAGAMENTO_RECEBIDO', 'BLOQUEIO_CREDENCIAIS', 'CHECKOUT_PERMANENCIA', 'CANCELAMENTO_PROPOSTA'
    autor_id UUID REFERENCES public.perfis(id),
    autor_email VARCHAR(255),
    ip_origem INET,
    dados_anteriores JSONB,
    dados_novos JSONB,
    justificativa TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices otimizados para consultas de auditoria
CREATE INDEX IF NOT EXISTS idx_auditoria_registro ON public.auditoria_operacoes_sensiveis(registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON public.auditoria_operacoes_sensiveis(tabela_afetada);
CREATE INDEX IF NOT EXISTS idx_auditoria_data ON public.auditoria_operacoes_sensiveis(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_autor ON public.auditoria_operacoes_sensiveis(autor_id);

-- Regra RN28: Tabela de auditoria é estritamente append-only (proibido UPDATE ou DELETE)
CREATE OR REPLACE FUNCTION public.fn_proibir_modificacao_auditoria()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'RN28: Violação de Segurança. Registros da trilha de auditoria são imutáveis e invioláveis.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_proibir_modificacao_auditoria ON public.auditoria_operacoes_sensiveis;
CREATE TRIGGER tg_proibir_modificacao_auditoria
BEFORE UPDATE OR DELETE ON public.auditoria_operacoes_sensiveis
FOR EACH ROW EXECUTE FUNCTION public.fn_proibir_modificacao_auditoria();


-- =====================================================================================
-- 2. RN07: EXPIRAÇÃO ESTRITA DE 5 MINUTOS NO SERVIDOR
-- =====================================================================================

-- Trigger para garantir que toda nova proposta receba estritamente 5 minutos de validade a partir do servidor
CREATE OR REPLACE FUNCTION public.fn_definir_validade_estrita_proposta()
RETURNS TRIGGER AS $$
BEGIN
    -- Força data do servidor e calcula expiração inegociável de 5 minutos
    NEW.criado_em := NOW();
    NEW.expira_em := NEW.criado_em + INTERVAL '5 minutes';
    NEW.status    := 'aguardando';
    NEW.confirmado_em := NULL;
    NEW.recusado_em   := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_definir_validade_proposta ON public.consumos;
CREATE TRIGGER tg_definir_validade_proposta
BEFORE INSERT ON public.consumos
FOR EACH ROW EXECUTE FUNCTION public.fn_definir_validade_estrita_proposta();


-- =====================================================================================
-- 3. RN09, RN10 E RNF11: CONFIRMAÇÃO ATÔMICA PELO CLIENTE (ANTI-CONCORRÊNCIA E ANTI-FRAUDE)
-- =====================================================================================

/**
 * Função transacional atômica de confirmação de proposta pelo cliente.
 * 
 * Regras aplicadas:
 * - RN07: Rejeita se NOW() >= expira_em e marca proposta como 'expirado'.
 * - RN09: Impede confirmação por atendente; exige validação estrita do PIN de acesso do cliente.
 * - RN10 / RNF11: Bloqueio pessimista (SELECT ... FOR UPDATE) impedindo débitos duplicados sob requisições concorrentes.
 */
CREATE OR REPLACE FUNCTION public.confirmar_proposta_cliente(
    p_consumo_id UUID,
    p_pin_informado VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_consumo RECORD;
    v_permanencia RECORD;
    v_agora TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Bloqueio pessimista da linha de consumo para prevenir requisições concorrentes ou duplo-clique
    SELECT * INTO v_consumo
    FROM public.consumos
    WHERE id = p_consumo_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Consumo / Proposta não encontrada (ID: %)', p_consumo_id;
    END IF;

    -- 2. RN10: Validação de unicidade de débito - status precisa ser estritamente 'aguardando'
    IF v_consumo.status = 'confirmado' THEN
        RAISE EXCEPTION 'RN10: Esta proposta já foi confirmada anteriormente em % e debitada na conta.', v_consumo.confirmado_em;
    END IF;

    IF v_consumo.status <> 'aguardando' THEN
        RAISE EXCEPTION 'Esta proposta não pode ser confirmada pois seu status atual é "%".', v_consumo.status;
    END IF;

    -- 3. RN07: Validação estrita da janela de 5 minutos no servidor
    IF v_agora >= v_consumo.expira_em THEN
        -- Atualiza o status para expirado de forma atômica
        UPDATE public.consumos
        SET status = 'expirado'
        WHERE id = p_consumo_id;

        RAISE EXCEPTION 'RN07: Proposta expirada! O prazo de 5 minutos encerrou em %. A confirmação foi rejeitada pelo servidor.', v_consumo.expira_em;
    END IF;

    -- 4. RN09: Bloqueio pessimista da permanência e validação do PIN do cliente
    SELECT * INTO v_permanencia
    FROM public.permanencias
    WHERE id = v_consumo.permanencia_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permanência associada não encontrada.';
    END IF;

    IF v_permanencia.status <> 'aberta' THEN
        RAISE EXCEPTION 'A permanência vinculada a esta comanda já se encontra fechada.';
    END IF;

    -- Validação do PIN de 4 dígitos cadastrado na permanência (garantia de autenticidade do cliente)
    IF v_permanencia.pin_acesso IS NULL OR TRIM(v_permanencia.pin_acesso) = '' OR TRIM(v_permanencia.pin_acesso) <> TRIM(p_pin_informado) THEN
        RAISE EXCEPTION 'RN09: PIN de segurança do cliente incorreto ou inválido. A confirmação é exclusiva do hóspede.';
    END IF;

    -- 5. Execução do Débito Atômico (Transação ACID)
    -- Atualiza proposta para 'confirmado'
    UPDATE public.consumos
    SET status = 'confirmado',
        confirmado_em = v_agora
    WHERE id = p_consumo_id;

    -- Atualiza saldo devedor da permanência garantindo consistência
    UPDATE public.permanencias
    SET saldo_devedor = ROUND((saldo_devedor + v_consumo.valor_total)::numeric, 2)
    WHERE id = v_consumo.permanencia_id;

    -- Retorna estado consolidado
    RETURN jsonb_build_object(
        'sucesso', true,
        'mensagem', 'Consumo confirmado e debitado com sucesso.',
        'consumo_id', p_consumo_id,
        'codigo_proposta', v_consumo.codigo_proposta,
        'valor_debitado', v_consumo.valor_total,
        'confirmado_em', v_agora,
        'novo_saldo_devedor', ROUND((v_permanencia.saldo_devedor + v_consumo.valor_total)::numeric, 2)
    );
END;
$$;


-- =====================================================================================
-- 4. RN09 (TRIGGER DE SEGURANÇA): PROIBIR ATENDENTE DE CONFIRMAR PROPOSTAS VIA UPDATE DIRETO
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.fn_bloquear_confirmacao_atendente()
RETURNS TRIGGER AS $$
DECLARE
    v_funcao_usuario VARCHAR;
    v_perfil_id UUID;
BEGIN
    -- Se estiver tentando alterar o status de 'aguardando' para 'confirmado' diretamente na tabela
    IF OLD.status = 'aguardando' AND NEW.status = 'confirmado' THEN
        -- Verifica se a função foi invocada por RPC do cliente ou por tentativa direta
        IF current_setting('hotel.auth_client_mode', true) IS DISTINCT FROM 'CLIENTE_PIN_VALIDADO' THEN
            -- Se for chamada direta via REST/Supabase Client, verifica o perfil do usuário logado
            v_perfil_id := auth.uid();
            IF v_perfil_id IS NOT NULL THEN
                SELECT funcao INTO v_funcao_usuario FROM public.perfis WHERE id = v_perfil_id;
                IF v_funcao_usuario = 'atendente' THEN
                    RAISE EXCEPTION 'RN09: Violação de Segurança. Atendentes não possuem permissão para confirmar propostas em nome do cliente. A confirmação deve ser realizada exclusivamente pelo hóspede via aplicativo.';
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tg_bloquear_confirmacao_atendente ON public.consumos;
CREATE TRIGGER tg_bloquear_confirmacao_atendente
BEFORE UPDATE OF status ON public.consumos
FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_confirmacao_atendente();


-- =====================================================================================
-- 5. RN15: FECHAMENTO ESTRITO DE PERMANÊNCIA (CHECK-OUT DO CAIXA)
-- =====================================================================================

/**
 * Função transacional para encerramento de permanência no caixa.
 * 
 * Regras aplicadas:
 * - RN15.1: Exige inexistência de propostas com status 'aguardando'.
 * - RN15.2: Exige saldo rigorosamente quitado (saldo_devedor <= 0.00).
 * - RN15.3: Invalida imediatamente as credenciais (PIN e pulseira) e define checkout.
 * - RN27: Registra evento na trilha de auditoria.
 */
CREATE OR REPLACE FUNCTION public.encerrar_permanencia_caixa(
    p_permanencia_id UUID,
    p_funcionario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_perm RECORD;
    v_propostas_pendentes_qtd INTEGER;
    v_propostas_codigos TEXT;
    v_agora TIMESTAMPTZ := NOW();
    v_operador RECORD;
BEGIN
    -- 1. Bloqueio pessimista da linha de permanência
    SELECT * INTO v_perm
    FROM public.permanencias
    WHERE id = p_permanencia_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permanência não encontrada (ID: %)', p_permanencia_id;
    END IF;

    IF v_perm.status = 'fechada' THEN
        RAISE EXCEPTION 'Esta permanência já se encontra encerrada desde %.', v_perm.checkout;
    END IF;

    -- Valida perfil do operador
    SELECT * INTO v_operador FROM public.perfis WHERE id = p_funcionario_id;
    IF NOT FOUND OR v_operador.funcao NOT IN ('caixa', 'gerente', 'admin') THEN
        RAISE EXCEPTION 'Apenas operadores com perfil de caixa ou gerência podem realizar o encerramento da conta.';
    END IF;

    -- 2. RN15 (Critério 1): Verificação de propostas pendentes (aguardando)
    SELECT COUNT(*), string_agg(codigo_proposta, ', ')
    INTO v_propostas_pendentes_qtd, v_propostas_codigos
    FROM public.consumos
    WHERE permanencia_id = p_permanencia_id
      AND status = 'aguardando';

    IF v_propostas_pendentes_qtd > 0 THEN
        RAISE EXCEPTION 'RN15: Bloqueio de Fechamento! Existem % proposta(s) aguardando confirmação do hóspede (%). Cancele-as ou aguarde a confirmação antes de encerrar.', v_propostas_pendentes_qtd, v_propostas_codigos;
    END IF;

    -- 3. RN15 (Critério 2): Verificação de saldo devedor zerado
    IF v_perm.saldo_devedor > 0.001 THEN
        RAISE EXCEPTION 'RN15: Bloqueio de Fechamento! A permanência possui saldo devedor em aberto de R$ %. Realize o pagamento integral para zerar a conta antes do check-out.', ROUND(v_perm.saldo_devedor::numeric, 2);
    END IF;

    -- 4. RN15 (Critério 3): Fechamento Definitivo e Invalidação de Credenciais
    UPDATE public.permanencias
    SET status = 'fechada',
        checkout = v_agora,
        pin_acesso = 'INVALIDADO',
        credenciais_ativas = false
    WHERE id = p_permanencia_id;

    -- 5. RN27: Registro na Trilha de Auditoria
    INSERT INTO public.auditoria_operacoes_sensiveis (
        tabela_afetada,
        registro_id,
        tipo_operacao,
        autor_id,
        autor_email,
        dados_anteriores,
        dados_novos,
        justificativa
    ) VALUES (
        'permanencias',
        p_permanencia_id,
        'CHECKOUT_PERMANENCIA',
        p_funcionario_id,
        v_operador.email,
        jsonb_build_object('status', v_perm.status, 'saldo_devedor', v_perm.saldo_devedor, 'pin_acesso', v_perm.pin_acesso),
        jsonb_build_object('status', 'fechada', 'saldo_devedor', 0.00, 'checkout', v_agora, 'credenciais_ativas', false),
        'Check-out e quitação integral com validação estrita RN15'
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'mensagem', 'Permanência encerrada com sucesso e credenciais invalidadas.',
        'permanencia_id', p_permanencia_id,
        'checkout', v_agora,
        'operador', v_operador.nome_completo
    );
END;
$$;


-- =====================================================================================
-- 6. RN27: REGISTRO DE PAGAMENTOS COM VINCULAÇÃO E AUDITORIA
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.registrar_pagamento_caixa(
    p_permanencia_id UUID,
    p_caixa_id UUID,
    p_valor NUMERIC,
    p_forma_pagamento VARCHAR,
    p_funcionario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_perm RECORD;
    v_operador RECORD;
    v_caixa RECORD;
    v_pagamento_id UUID := gen_random_uuid();
    v_agora TIMESTAMPTZ := NOW();
    v_novo_saldo NUMERIC;
BEGIN
    IF p_valor <= 0 THEN
        RAISE EXCEPTION 'O valor do pagamento deve ser estritamente superior a R$ 0,00.';
    END IF;

    -- Valida e bloqueia permanência
    SELECT * INTO v_perm FROM public.permanencias WHERE id = p_permanencia_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permanência não encontrada.';
    END IF;
    IF v_perm.status = 'fechada' THEN
        RAISE EXCEPTION 'Não é permitido lançar pagamentos em contas já encerradas.';
    END IF;

    -- Valida operador
    SELECT * INTO v_operador FROM public.perfis WHERE id = p_funcionario_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Operador do caixa não identificado.';
    END IF;

    -- Valida caixa aberto
    SELECT * INTO v_caixa FROM public.caixas WHERE id = p_caixa_id AND status = 'aberto';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'O caixa informado não se encontra aberto.';
    END IF;

    -- 1. Insere na tabela 'pagamentos'
    INSERT INTO public.pagamentos (
        id,
        permanencia_id,
        caixa_id,
        valor,
        forma_pagamento,
        funcionario_id,
        criado_em
    ) VALUES (
        v_pagamento_id,
        p_permanencia_id,
        p_caixa_id,
        ROUND(p_valor::numeric, 2),
        p_forma_pagamento,
        p_funcionario_id,
        v_agora
    );

    -- 2. Insere na tabela 'movimentacoes_caixa'
    INSERT INTO public.movimentacoes_caixa (
        id,
        caixa_id,
        tipo,
        valor,
        descricao,
        criado_em
    ) VALUES (
        gen_random_uuid(),
        p_caixa_id,
        'pagamento_recebido',
        ROUND(p_valor::numeric, 2),
        format('Recebimento Ref. %s - Forma: %s - Operador: %s',
            CASE WHEN v_perm.tipo = 'hospedagem' THEN 'Quarto ' || v_perm.quarto_numero ELSE 'Day Use #' || substr(v_perm.id::text, 1, 4) END,
            upper(p_forma_pagamento),
            v_operador.nome_completo
        ),
        v_agora
    );

    -- 3. Abate do saldo devedor da permanência (sem ficar negativo)
    v_novo_saldo := GREATEST(0.00, ROUND((v_perm.saldo_devedor - p_valor)::numeric, 2));
    UPDATE public.permanencias
    SET saldo_devedor = v_novo_saldo
    WHERE id = p_permanencia_id;

    -- 4. RN27: Gravação na Trilha de Auditoria
    INSERT INTO public.auditoria_operacoes_sensiveis (
        tabela_afetada,
        registro_id,
        tipo_operacao,
        autor_id,
        autor_email,
        dados_novos,
        justificativa
    ) VALUES (
        'pagamentos',
        v_pagamento_id,
        'PAGAMENTO_RECEBIDO',
        p_funcionario_id,
        v_operador.email,
        jsonb_build_object(
            'pagamento_id', v_pagamento_id,
            'permanencia_id', p_permanencia_id,
            'valor', p_valor,
            'forma_pagamento', p_forma_pagamento,
            'saldo_anterior', v_perm.saldo_devedor,
            'saldo_atual', v_novo_saldo
        ),
        format('Recebimento registrado no caixa #%s', p_caixa_id)
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'pagamento_id', v_pagamento_id,
        'valor_pago', p_valor,
        'saldo_restante', v_novo_saldo
    );
END;
$$;


-- =====================================================================================
-- 7. RN27: ESTORNO DE CONSUMO COM JUSTIFICATIVA OBRIGATÓRIA E AUDITORIA
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.estornar_consumo_caixa(
    p_consumo_id UUID,
    p_motivo TEXT,
    p_funcionario_id UUID,
    p_caixa_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_csm RECORD;
    v_perm RECORD;
    v_operador RECORD;
    v_agora TIMESTAMPTZ := NOW();
    v_novo_saldo NUMERIC;
BEGIN
    IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
        RAISE EXCEPTION 'RN27: Justificativa obrigatória ausente. É necessário informar o motivo detalhado do estorno para auditoria.';
    END IF;

    -- Bloqueio do consumo
    SELECT * INTO v_csm FROM public.consumos WHERE id = p_consumo_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Consumo não encontrado.';
    END IF;
    IF v_csm.status <> 'confirmado' THEN
        RAISE EXCEPTION 'Apenas consumos confirmados podem ser estornados (status atual: %)', v_csm.status;
    END IF;

    -- Bloqueio da permanência
    SELECT * INTO v_perm FROM public.permanencias WHERE id = v_csm.permanencia_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permanência não encontrada.';
    END IF;

    -- Validação do operador
    SELECT * INTO v_operador FROM public.perfis WHERE id = p_funcionario_id;
    IF NOT FOUND OR v_operador.funcao NOT IN ('caixa', 'gerente', 'admin') THEN
        RAISE EXCEPTION 'Apenas operadores autorizados podem estornar consumos.';
    END IF;

    -- 1. Atualiza status do consumo
    UPDATE public.consumos
    SET status = 'estornado',
        recusado_em = v_agora,
        observacoes = COALESCE(observacoes || ' | ', '') || 'ESTORNO: ' || p_motivo
    WHERE id = p_consumo_id;

    -- 2. Abate do saldo devedor da permanência
    v_novo_saldo := GREATEST(0.00, ROUND((v_perm.saldo_devedor - v_csm.valor_total)::numeric, 2));
    UPDATE public.permanencias
    SET saldo_devedor = v_novo_saldo
    WHERE id = v_csm.permanencia_id;

    -- 3. Movimentação de estorno no caixa
    INSERT INTO public.movimentacoes_caixa (
        id,
        caixa_id,
        tipo,
        valor,
        descricao,
        criado_em
    ) VALUES (
        gen_random_uuid(),
        p_caixa_id,
        'estorno_consumo',
        v_csm.valor_total,
        format('Estorno Ref. Consumo %s: %s (Operador: %s)', v_csm.codigo_proposta, p_motivo, v_operador.nome_completo),
        v_agora
    );

    -- 4. RN27: Registro Obrigatório na Trilha de Auditoria
    INSERT INTO public.auditoria_operacoes_sensiveis (
        tabela_afetada,
        registro_id,
        tipo_operacao,
        autor_id,
        autor_email,
        dados_anteriores,
        dados_novos,
        justificativa
    ) VALUES (
        'consumos',
        p_consumo_id,
        'ESTORNO_CONSUMO',
        p_funcionario_id,
        v_operador.email,
        jsonb_build_object('status', 'confirmado', 'valor_total', v_csm.valor_total),
        jsonb_build_object('status', 'estornado', 'saldo_permanencia_resultante', v_novo_saldo),
        p_motivo
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'mensagem', 'Consumo estornado com sucesso e auditado.',
        'consumo_id', p_consumo_id,
        'valor_estornado', v_csm.valor_total,
        'novo_saldo_permanencia', v_novo_saldo
    );
END;
$$;
