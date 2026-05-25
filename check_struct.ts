import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing config");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("\n====== TESTE: CONTROLE DE FERRAMENTAS COM QR CODE ======\n");

  // 1. Testar novas colunas na tabela ferramentas
  console.log("1. Testando novas colunas em 'ferramentas'...");
  const { data: colTest, error: colError } = await supabase
    .from('ferramentas')
    .select('id, nome, qr_code, status, ultima_movimentacao')
    .limit(1);

  if (colError) {
    console.error("   ❌ ERRO ao acessar novas colunas:", colError.message);
    console.error("   ⚠️  A migração SQL precisa ser aplicada manualmente no Supabase!");
  } else {
    console.log("   ✅ Colunas 'qr_code', 'status', 'ultima_movimentacao' existem na tabela ferramentas!");
  }

  // 2. Testar tabela movimentacoes_ferramentas
  console.log("\n2. Testando tabela 'movimentacoes_ferramentas'...");
  const { data: movData, error: movError } = await supabase
    .from('movimentacoes_ferramentas' as any)
    .select('id, ferramenta_id, usuario_id, tipo, data_hora, observacao, obra_id')
    .limit(1);

  if (movError) {
    console.error("   ❌ ERRO ao acessar 'movimentacoes_ferramentas':", movError.message);
    console.error("   ⚠️  A tabela não existe ou a migração SQL não foi aplicada!");
  } else {
    console.log("   ✅ Tabela 'movimentacoes_ferramentas' existe e está acessível!");
  }

  // 3. Testar tabela historico_ferramentas (tabela existente)
  console.log("\n3. Testando tabela 'historico_ferramentas'...");
  const { data: histData, error: histError } = await supabase
    .from('historico_ferramentas' as any)
    .select('id')
    .limit(1);

  if (histError) {
    console.error("   ❌ ERRO em 'historico_ferramentas':", histError.message);
  } else {
    console.log("   ✅ Tabela 'historico_ferramentas' acessível!");
  }

  // 4. Testar inserção de ferramenta com QR code
  console.log("\n4. Testando inserção de ferramenta com qr_code...");
  // Primeiro busca uma obra para usar
  const { data: obras } = await supabase.from('obras').select('id').limit(1);
  
  if (!obras || obras.length === 0) {
    console.log("   ⚠️  Nenhuma obra encontrada para testar inserção. Pulando...");
  } else {
    const obraId = obras[0].id;
    const testQr = `TEST-${Date.now()}`;
    
    const { data: inserted, error: insertError } = await supabase
      .from('ferramentas')
      .insert({
        obra_id: obraId,
        nome: 'FERRAMENTA_TESTE_QR',
        estado: 'disponivel',
        status: 'DISPONIVEL',
        qr_code: testQr,
        ultima_movimentacao: new Date().toISOString(),
        observacoes: '[CAT:OUTROS] Teste de QR Code'
      })
      .select()
      .single();

    if (insertError) {
      console.error("   ❌ ERRO ao inserir ferramenta com qr_code:", insertError.message);
    } else {
      console.log("   ✅ Ferramenta com qr_code inserida com sucesso!");
      console.log(`      ID: ${inserted.id}`);
      console.log(`      QR Code: ${inserted.qr_code}`);
      console.log(`      Status: ${inserted.status}`);
      
      // 5. Testar inserção em movimentacoes_ferramentas
      console.log("\n5. Testando inserção em 'movimentacoes_ferramentas'...");
      const { error: movInsertError } = await supabase
        .from('movimentacoes_ferramentas' as any)
        .insert({
          ferramenta_id: inserted.id,
          obra_id: obraId,
          tipo: 'RETIRADA',
          data_hora: new Date().toISOString(),
          observacao: 'Teste de movimentação via QR Code'
        });

      if (movInsertError) {
        console.error("   ❌ ERRO ao inserir em movimentacoes_ferramentas:", movInsertError.message);
      } else {
        console.log("   ✅ Movimentação registrada com sucesso!");
      }

      // Limpar dados de teste
      await supabase.from('movimentacoes_ferramentas' as any).delete().eq('ferramenta_id', inserted.id);
      await supabase.from('ferramentas').delete().eq('id', inserted.id);
      console.log("\n   🧹 Dados de teste removidos.");
    }
  }

  // 6. Verificar geração de QR Code (qrcode lib)
  console.log("\n6. Testando biblioteca qrcode...");
  try {
    const QRCode = await import('qrcode');
    const url = await QRCode.default.toDataURL('TEST-F01', { width: 200 });
    if (url.startsWith('data:image/png')) {
      console.log("   ✅ Biblioteca 'qrcode' funcionando corretamente!");
    }
  } catch (e: any) {
    console.error("   ❌ ERRO na biblioteca qrcode:", e.message);
  }

  // 7. Verificar html5-qrcode
  console.log("\n7. Verificando biblioteca 'html5-qrcode' nos node_modules...");
  try {
    const fs = await import('fs');
    const exists = fs.existsSync('./node_modules/html5-qrcode');
    if (exists) {
      console.log("   ✅ Biblioteca 'html5-qrcode' instalada!");
    } else {
      console.error("   ❌ 'html5-qrcode' não encontrada. Execute: npm install html5-qrcode");
    }
  } catch(e: any) {
    console.error("   ❌ Erro ao verificar:", e.message);
  }

  console.log("\n====== FIM DOS TESTES ======\n");
}

run().catch(console.error);
