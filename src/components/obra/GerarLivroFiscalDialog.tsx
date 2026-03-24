import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileUp, Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FiscalRow {
  filename: string;
  dataEntrada: string;
  nNF: string;
  serie: string;
  dataEmissao: string;
  cnpj: string;
  uf: string;
  vNF: string;
  cfop: string;
  imposto: string;
  codigo: string;
}

export default function GerarLivroFiscalDialog({ open, onOpenChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FiscalRow[]>([]);

  const formatDataEmissao = (isoDate: string) => {
    if (!isoDate) return '--/--/--';
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '--/--/--';
    return format(d, 'dd/MM/yy');
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newRows: FiscalRow[] = [];
    const todayStr = format(new Date(), 'dd/MM/yy');

    for (const file of files) {
      try {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');

        const nNF = doc.getElementsByTagName('nNF')[0]?.textContent?.trim() || '-';
        const serie = doc.getElementsByTagName('serie')[0]?.textContent?.trim() || '1';
        const dhEmi = formatDataEmissao(doc.getElementsByTagName('dhEmi')[0]?.textContent || '');
        
        const emit = doc.getElementsByTagName('emit')[0];
        const cnpjRaw = emit?.getElementsByTagName('CNPJ')[0]?.textContent?.trim() || '-';
        const uf = emit?.getElementsByTagName('UF')[0]?.textContent?.trim() || '-';
        
        const vNF = doc.getElementsByTagName('ICMSTot')[0]?.getElementsByTagName('vNF')[0]?.textContent?.trim() || '0.00';
        
        const formattedVal = Number(vNF).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const cfop = doc.getElementsByTagName('det')[0]?.getElementsByTagName('CFOP')[0]?.textContent?.trim() || '-';

        const cnpj = cnpjRaw.length === 14 
          ? cnpjRaw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
          : cnpjRaw;

        newRows.push({
          filename: file.name,
          dataEntrada: todayStr,
          nNF,
          serie,
          dataEmissao: dhEmi,
          cnpj,
          uf,
          vNF: formattedVal,
          cfop,
          imposto: 'ICMS',
          codigo: '3'
        });

      } catch (err) {
        console.error("Erro lendo ", file.name, err);
      }
    }
    
    setRows(prev => [...prev, ...newRows]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleGenerate = () => {
    if (rows.length === 0) {
      toast.error('Nenhum XML carregado para gerar o livro.');
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    doc.setFont("courier", "normal");
    doc.setFontSize(10);

    const marginLeft = 10;
    let y = 15;
    
    doc.setFont("courier", "bold");
    doc.text("LIVRO FISCAL DE ENTRADAS", marginLeft, y);
    y += 10;
    
    // Header format EXACTLY as requested:
    // DATA ENTRADA | DOC | SERIE | DATA EMISSÃO | CNPJ | UF | VALOR | CFOP | IMPOSTO | COD | VALOR
    // Exemplo: 03/12/25 783 1 24/11/25 28.568.446/0001-36 CE 128.000,00 1556 ICMS 3 128.000,00
    
    const printHeader = (docLevelY: number) => {
      doc.setFont("courier", "bold");
      const headerStr = `DATA_ENTR DOC SERIE DATA_EMISA CNPJ/CPF           UF VALOR      CFOP IMP  CD VALOR`;
      doc.text(headerStr, marginLeft, docLevelY);
      doc.setFont("courier", "normal");
    };

    printHeader(y);
    y += 5;

    rows.forEach((row) => {
      if (y > 180) {
         doc.addPage();
         y = 15;
         printHeader(y);
         y += 5;
      }

      // Format line based strictly on spacing rules
      const line = `${row.dataEntrada.padEnd(9)} ` +
                   `${row.nNF.padEnd(3).substring(0,3)} ` +
                   `${row.serie.padEnd(5).substring(0,5)} ` +
                   `${row.dataEmissao.padEnd(10)} ` +
                   `${row.cnpj.padEnd(18)} ` +
                   `${row.uf.padEnd(2)} ` +
                   `${row.vNF.padEnd(10)} ` +
                   `${row.cfop.padEnd(4)} ` +
                   `${row.imposto.padEnd(3).substring(0,3)} ` +
                   `${row.codigo.padEnd(2)} ` +
                   `${row.vNF}`;
      
      doc.text(line, marginLeft, y);
      y += 5;
    });

    // Footer context
    y += 10;
    if (y > 170) { doc.addPage(); y = 15; }
    
    doc.text("Códigos de valores fiscais:", marginLeft, y); y += 5;
    doc.text("1 - Op. c/ crédito de imposto", marginLeft, y); y += 5;
    doc.text("2 - Op. s/ crédito de imposto - isentas/não trib.", marginLeft, y); y += 5;
    doc.text("3 - Op. s/ crédito de imposto - outras", marginLeft, y);

    doc.save(`livro-fiscal-entradas-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
    toast.success('Livro Fiscal gerado com sucesso!');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if(!v) setRows([]); onOpenChange(v); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerador de Livro Fiscal (Layout Contábil)</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-primary/20 rounded-2xl bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-10 w-10 text-primary mb-3" />
            <p className="text-sm font-medium text-center">Clique e selecione 1 ou múltiplos XMLs</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-sm text-center font-medium leading-relaxed">
              O sistema irá ler o cabeçalho (Capa C100) desses XMLs e formatar o livro fiscal. 
              <br/>Isso **não** criará inventário no sistema principal.
            </p>
            <input ref={fileRef} type="file" accept=".xml" multiple className="hidden" onChange={handleFiles} />
          </div>

          {rows.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">{rows.length} XML(s) preparado(s):</h4>
                <Button variant="destructive" size="sm" onClick={() => setRows([])} className="h-8 text-xs"> Limpar Arquivos </Button>
              </div>

              <div className="bg-muted/50 p-2 text-xs font-mono space-y-1 rounded-xl max-h-[140px] overflow-y-auto border border-border/50">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 hover:bg-muted/80 rounded">
                    <FileText className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate flex-1 font-medium">{r.filename}</span>
                    <span className="text-muted-foreground shrink-0 pl-2 border-l border-border font-bold">R$ {r.vNF}</span>
                  </div>
                ))}
              </div>

              <Button onClick={handleGenerate} className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">
                <Download className="h-5 w-5 mr-2" />
                Gerar Livro Fiscal (PDF)
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
