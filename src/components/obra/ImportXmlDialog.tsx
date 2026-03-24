import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileUp, Loader2, Check, Package } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface XmlItem {
  nome: string;
  quantidade: number;
}

interface FiscalLine {
  cfop: string;
  vBC: number;
  pICMS: number;
  vICMS: number;
  cst: string;
  codigoA: string;
}

interface NfMetadata {
  nNF: string;
  serie: string;
  dhEmi: string;
  fornecedor: string;
  cnpj: string;
  uf: string;
  vNF: number;
  lines: FiscalLine[];
}

interface Props {
  obraId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseNFeXml(xmlText: string): { items: XmlItem[], meta: NfMetadata | null } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const items: XmlItem[] = [];

  // Metadata (C100 equivalent)
  const ide = doc.getElementsByTagName('ide')[0];
  const nNF = ide?.getElementsByTagName('nNF')[0]?.textContent?.trim() || '';
  const serie = ide?.getElementsByTagName('serie')[0]?.textContent?.trim() || '1';
  const dhEmi = ide?.getElementsByTagName('dhEmi')[0]?.textContent || ide?.getElementsByTagName('dEmi')[0]?.textContent || '';

  const emit = doc.getElementsByTagName('emit')[0];
  const fornecedor = emit?.getElementsByTagName('xNome')[0]?.textContent?.trim() || '';
  const cnpj = emit?.getElementsByTagName('CNPJ')[0]?.textContent?.trim() || '';
  const uf = emit?.getElementsByTagName('UF')[0]?.textContent?.trim() || '';

  const total = doc.getElementsByTagName('ICMSTot')[0];
  const vNF = parseFloat(total?.getElementsByTagName('vNF')[0]?.textContent || '0');

  // Multi-line analysis (C170 equivalent)
  const fiscalLinesMap = new Map<string, FiscalLine>();

  const dets = doc.getElementsByTagName('det');
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i];
    const prod = det.getElementsByTagName('prod')[0];
    const imposto = det.getElementsByTagName('imposto')[0];
    const icms = imposto?.getElementsByTagName('ICMS')[0];
    
    // Extract CST/CSOSN and ICMS values
    let cst = '00';
    let vBC = 0;
    let pICMS = 0;
    let vICMS = 0;

    if (icms) {
      const icmsNode = icms.children[0]; // e.g., ICMS00, ICMS40, ICMSSN101
      if (icmsNode) {
        cst = icmsNode.getElementsByTagName('CST')[0]?.textContent || 
              icmsNode.getElementsByTagName('CSOSN')[0]?.textContent || '00';
        vBC = parseFloat(icmsNode.getElementsByTagName('vBC')[0]?.textContent || '0');
        pICMS = parseFloat(icmsNode.getElementsByTagName('pICMS')[0]?.textContent || '0');
        vICMS = parseFloat(icmsNode.getElementsByTagName('vICMS')[0]?.textContent || '0');
      }
    }

    const xProd = prod?.getElementsByTagName('xProd')[0]?.textContent?.trim();
    const qCom = parseFloat(prod?.getElementsByTagName('qCom')[0]?.textContent || '0');
    const cfop = prod?.getElementsByTagName('CFOP')[0]?.textContent?.trim() || '1556';
    const vProd = parseFloat(prod?.getElementsByTagName('vProd')[0]?.textContent || '0');

    if (xProd && qCom > 0) {
      items.push({ nome: xProd, quantidade: qCom });
    }

    // Determine fiscal code (1: credit, 2: exempt, 3: other)
    // Simplified: if there is vICMS, it's 1. Otherwise 3.
    const codigoA = vICMS > 0 ? '1' : '3';
    
    const key = `${cfop}-${codigoA}-${vICMS > 0 ? pICMS : 0}`;
    if (!fiscalLinesMap.has(key)) {
      fiscalLinesMap.set(key, { cfop, vBC: 0, pICMS, vICMS: 0, cst, codigoA });
    }
    
    const line = fiscalLinesMap.get(key)!;
    line.vBC += (codigoA === '1' ? vBC : vProd); // If no credit, base is the product value
    line.vICMS += vICMS;
  }

  const meta: NfMetadata = { 
    nNF, serie, dhEmi, fornecedor, cnpj, uf, vNF, 
    lines: Array.from(fiscalLinesMap.values()) 
  };

  return { items, meta };
}

export default function ImportXmlDialog({ obraId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<XmlItem[]>([]);
  const [meta, setMeta] = useState<NfMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  const reset = () => {
    setItems([]);
    setStep('upload');
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { items: parsedItems, meta: parsedMeta } = parseNFeXml(text);
      if (parsedItems.length === 0) {
        toast.error('Nenhum item encontrado no XML');
        return;
      }
      setItems(parsedItems);
      setMeta(parsedMeta);
      setStep('review');
    };
    reader.readAsText(file);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get existing products for this obra
      const { data: existingProducts } = await supabase
        .from('produtos')
        .select('id, nome')
        .eq('obra_id', obraId);

      const productMap = new Map<string, string>();
      (existingProducts || []).forEach(p => {
        productMap.set(p.nome.toLowerCase().trim(), p.id);
      });

      for (const item of items) {
        const key = item.nome.toLowerCase().trim();
        let produtoId = productMap.get(key);

        // Create product if it doesn't exist
        if (!produtoId) {
          const { data: newProd, error: prodErr } = await supabase
            .from('produtos')
            .insert({
              obra_id: obraId,
              nome: item.nome.trim(),
              unidade: 'un',
              estoque_atual: 0,
              estoque_minimo: 0,
            })
            .select('id')
            .single();

          if (prodErr) throw prodErr;
          produtoId = newProd.id;
          productMap.set(key, produtoId);

          await supabase.from('logs_atividades').insert({
            obra_id: obraId,
            user_id: user?.id,
            user_email: user?.email,
            acao: 'CADASTRAR',
            entidade: 'PRODUTO',
            detalhes: `Cadastrou o produto via XML: ${item.nome.trim()}`
          });
        }

        // Create entrada
        const { error: entErr } = await supabase.from('entradas').insert({
          obra_id: obraId,
          produto_id: produtoId,
          quantidade: item.quantidade,
        });
        if (entErr) throw entErr;

        await supabase.from('logs_atividades').insert({
          obra_id: obraId,
          user_id: user?.id,
          user_email: user?.email,
          acao: 'ENTRADA',
          entidade: 'ESTOQUE',
          detalhes: `Entrada via XML: ${item.quantidade} un de ${item.nome.trim()}`
        });
      }

      // Save XML import record with metadata
      const { error: xmlErr } = await supabase.from('importacoes_xml' as any).insert({
        obra_id: obraId,
        total_itens: items.length,
        fornecedor_nome: meta?.fornecedor,
        nf_numero: meta?.nNF,
        serie: meta?.serie,
        data_emissao: meta?.dhEmi || null,
        cnpj_emitente: meta?.cnpj,
        uf_emitente: meta?.uf,
        valor_total: meta?.vNF,
        cfop: meta?.lines[0]?.cfop || '1556',
        linhas_fiscais: meta?.lines || []
      });

      if (xmlErr) {
        console.error("Error saving XML record:", xmlErr);
      }

      queryClient.invalidateQueries({ queryKey: ['entradas', obraId] });
      queryClient.invalidateQueries({ queryKey: ['produtos', obraId] });
      queryClient.invalidateQueries({ queryKey: ['logs-atividades', obraId] });
      queryClient.invalidateQueries({ queryKey: ['importacoes-xml', obraId] });
      toast.success(`${items.length} item(ns) importado(s) com sucesso!`);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar XML');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar XML de Nota Fiscal</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileUp className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Selecione o arquivo XML da nota fiscal para importar os itens automaticamente.
            </p>
            <Button variant="outline" className="h-12" onClick={() => fileRef.current?.click()}>
              Selecionar arquivo XML
            </Button>
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {items.length} item(ns) encontrado(s). Confira e confirme a entrada:
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.nome}</p>
                  </div>
                  <span className="text-sm font-bold text-primary whitespace-nowrap">
                    +{item.quantidade}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-12" onClick={reset} disabled={loading}>
                Cancelar
              </Button>
              <Button className="flex-1 h-12" onClick={handleConfirm} disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</> : <><Check className="h-4 w-4 mr-2" /> Confirmar Entrada</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
